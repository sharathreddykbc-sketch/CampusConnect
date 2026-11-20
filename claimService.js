/**
 * Claim Service
 * 
 * Manages ownership claims against found items.
 * Persists claims in Amazon DynamoDB (CampusConnect_Claims)
 * and keeps an in-memory cache for fast querying.
 */

const { v4: uuidv4 } = require('uuid');
const { claims, items } = require('../models/mockData');
const { ApiError } = require('../middleware/errorHandler');
const notificationService = require('./notificationService');
const awsAuth = require('../utils/awsAuth');

/**
 * Create a new claim on an item.
 */
const createClaim = async ({ reportId, claimantId, claimantName, ownershipDescription }) => {
  const item = items.get(reportId);
  if (!item) {
    throw new ApiError('Item report not found.', 404);
  }

  // Prevent claiming your own item
  if (item.reporterId === claimantId) {
    throw new ApiError('You cannot claim your own item.', 400);
  }

  // Prevent claiming an already-claimed item
  if (item.status === 'CLAIMED' || item.status === 'RESOLVED') {
    throw new ApiError('This item has already been claimed or resolved.', 400);
  }

  // Prevent duplicate pending claims from the same user
  for (const claim of claims.values()) {
    if (claim.reportId === reportId && claim.claimantId === claimantId && claim.claimStatus === 'PENDING') {
      throw new ApiError('You already have a pending claim on this item.', 400);
    }
  }

  const now = new Date().toISOString();

  const claim = {
    claimId: uuidv4(),
    reportId,
    claimantId,
    claimantName,
    ownershipDescription,
    claimStatus: 'PENDING',
    reviewedBy: null,
    reviewNote: null,
    createdAt: now,
    updatedAt: now
  };

  claims.set(claim.claimId, claim);
  try {
    await awsAuth.putClaimInDynamoDB(claim);
  } catch (err) {
    console.warn('[DynamoDB Warning] Failed to put claim:', err.message);
  }

  // Notify the item reporter (finder) that a claim was received
  notificationService.createNotification({
    userId: item.reporterId,
    message: `A student (${claimantName}) has submitted a claim for the item "${item.itemName}" that you reported. Please review the claim.`,
    notificationType: 'CLAIM_RECEIVED',
    relatedItemId: reportId
  });

  return claim;
};

/**
 * Get claims, optionally filtered by userId (claimant) or reportId.
 */
const getClaims = ({ userId, reportId }) => {
  let result = Array.from(claims.values());

  if (userId) {
    result = result.filter(c => c.claimantId === userId);
  }

  if (reportId) {
    result = result.filter(c => c.reportId === reportId);
  }

  result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return result;
};

/**
 * Get a single claim by ID.
 */
const getClaimById = (claimId) => {
  const claim = claims.get(claimId);
  if (!claim) {
    throw new ApiError('Claim not found.', 404);
  }
  return claim;
};

/**
 * Review (approve or reject) a pending claim.
 */
const reviewClaim = async ({ claimId, reviewerId, reviewerRole, decision, reviewNote }) => {
  const claim = claims.get(claimId);
  if (!claim) {
    throw new ApiError('Claim not found.', 404);
  }

  if (claim.claimStatus !== 'PENDING') {
    throw new ApiError('This claim has already been reviewed.', 400);
  }

  const item = items.get(claim.reportId);
  if (!item) {
    throw new ApiError('Associated item report not found.', 404);
  }

  if (item.reporterId !== reviewerId && reviewerRole !== 'admin') {
    throw new ApiError('You do not have permission to review this claim.', 403);
  }

  const validDecisions = ['APPROVED', 'REJECTED'];
  if (!validDecisions.includes(decision)) {
    throw new ApiError('Decision must be either APPROVED or REJECTED.', 400);
  }

  const now = new Date().toISOString();

  claim.claimStatus = decision;
  claim.reviewedBy = reviewerId;
  claim.reviewNote = reviewNote || null;
  claim.updatedAt = now;

  try {
    await awsAuth.updateClaimInDynamoDB(claimId, claim);
  } catch (err) {
    console.warn('[DynamoDB Warning] Failed to update reviewed claim:', err.message);
  }

  if (decision === 'APPROVED') {
    // Mark item as claimed
    item.status = 'CLAIMED';
    item.updatedAt = now;
    try {
      await awsAuth.updateItemInDynamoDB(item.reportId, item);
    } catch (err) {
      console.warn('[DynamoDB Warning] Failed to update item status to CLAIMED:', err.message);
    }

    // Auto-reject any other pending claims on this item
    for (const otherClaim of claims.values()) {
      if (otherClaim.reportId === claim.reportId &&
          otherClaim.claimId !== claimId &&
          otherClaim.claimStatus === 'PENDING') {
        otherClaim.claimStatus = 'REJECTED';
        otherClaim.reviewedBy = reviewerId;
        otherClaim.reviewNote = 'Another claim was approved for this item.';
        otherClaim.updatedAt = now;

        awsAuth.updateClaimInDynamoDB(otherClaim.claimId, otherClaim).catch(() => {});

        notificationService.createNotification({
          userId: otherClaim.claimantId,
          message: `Your claim for "${item.itemName}" has been rejected because another claim was approved.`,
          notificationType: 'CLAIM_REJECTED',
          relatedItemId: claim.reportId
        });
      }
    }

    // Notify claimant of approval
    notificationService.createNotification({
      userId: claim.claimantId,
      message: `Your claim for "${item.itemName}" has been approved! You can now view the pickup details.`,
      notificationType: 'CLAIM_APPROVED',
      relatedItemId: claim.reportId
    });

    // Notify finder that the claim was approved
    notificationService.createNotification({
      userId: item.reporterId,
      message: `You have approved the claim by ${claim.claimantName} for "${item.itemName}".`,
      notificationType: 'CLAIM_APPROVED',
      relatedItemId: claim.reportId
    });
  } else {
    // REJECTED — notify claimant
    notificationService.createNotification({
      userId: claim.claimantId,
      message: `Your claim for "${item.itemName}" has been rejected.${reviewNote ? ' Reason: ' + reviewNote : ''}`,
      notificationType: 'CLAIM_REJECTED',
      relatedItemId: claim.reportId
    });
  }

  return claim;
};

/**
 * Reveal the pickup location for an approved claim.
 */
const revealPickup = (claimId, userId) => {
  const claim = claims.get(claimId);
  if (!claim) {
    throw new ApiError('Claim not found.', 404);
  }

  if (claim.claimStatus !== 'APPROVED') {
    throw new ApiError('Pickup details are only available for approved claims.', 400);
  }

  const item = items.get(claim.reportId);

  if (claim.claimantId !== userId && item?.reporterId !== userId) {
    throw new ApiError('You do not have permission to view pickup details.', 403);
  }

  return {
    claimId: claim.claimId,
    itemName: item?.itemName,
    pickupLocation: item?.pickupLocation || 'Contact the finder for pickup details.',
    finderName: item?.reporterName,
    claimantName: claim.claimantName,
    approvedAt: claim.updatedAt
  };
};

module.exports = {
  createClaim,
  getClaims,
  getClaimById,
  reviewClaim,
  revealPickup
};
