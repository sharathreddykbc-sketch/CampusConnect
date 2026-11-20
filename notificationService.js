/**
 * Notification Service
 * 
 * Manages in-memory notifications stored in mockData.notifications.
 * Supports creation, retrieval, read-status toggling, and unread counts.
 */

const { v4: uuidv4 } = require('uuid');
const { notifications } = require('../models/mockData');
const { ApiError } = require('../middleware/errorHandler');

/**
 * Create a new notification for a user.
 * 
 * @param {Object} opts
 * @param {string} opts.userId           - Recipient user ID
 * @param {string} opts.message          - Human-readable message body
 * @param {string} opts.notificationType - e.g. MATCH_FOUND, CLAIM_RECEIVED, CLAIM_APPROVED, CLAIM_REJECTED
 * @param {string} [opts.relatedItemId]  - Optional linked report ID
 * @returns {Object} The created notification
 */
const createNotification = ({ userId, message, notificationType, relatedItemId = null }) => {
  const notification = {
    notificationId: uuidv4(),
    userId,
    message,
    notificationType,
    relatedItemId,
    readStatus: false,
    createdAt: new Date().toISOString()
  };

  notifications.set(notification.notificationId, notification);
  return notification;
};

/**
 * Get all notifications for a specific user, newest first.
 */
const getNotifications = (userId) => {
  const userNotifs = Array.from(notifications.values())
    .filter(n => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return userNotifs;
};

/**
 * Mark a single notification as read.
 * Only the notification's owner may do this.
 */
const markAsRead = (notificationId, userId) => {
  const notif = notifications.get(notificationId);

  if (!notif) {
    throw new ApiError('Notification not found.', 404);
  }

  if (notif.userId !== userId) {
    throw new ApiError('You do not have permission to modify this notification.', 403);
  }

  notif.readStatus = true;
  return notif;
};

/**
 * Get the count of unread notifications for a user.
 */
const getUnreadCount = (userId) => {
  let count = 0;
  for (const n of notifications.values()) {
    if (n.userId === userId && !n.readStatus) {
      count++;
    }
  }
  return { unreadCount: count };
};

/**
 * Create notifications for potential matches.
 * Called after a new item is created or when matches are explicitly requested.
 * 
 * @param {string} reportId     - The newly created report's ID
 * @param {Array}  matches      - Array of { item, score, confidence }
 * @param {Object} sourceItem   - The source item report
 */
const notifyMatches = (reportId, matches, sourceItem) => {
  if (!matches || matches.length === 0) return;

  // Notify the source item's reporter about each match
  matches.forEach(match => {
    createNotification({
      userId: sourceItem.reporterId,
      message: `A potential match has been found for your ${sourceItem.reportType.toLowerCase()} item "${sourceItem.itemName}". ` +
               `A similar item "${match.item.itemName}" was reported ${match.item.reportType.toLowerCase()} near ${match.item.locationFound || match.item.locationLost || 'campus'}. ` +
               `Confidence: ${match.confidence}.`,
      notificationType: 'MATCH_FOUND',
      relatedItemId: match.item.reportId
    });

    // Also notify the matched item's reporter
    createNotification({
      userId: match.item.reporterId,
      message: `A potential match has been found for your ${match.item.reportType.toLowerCase()} item "${match.item.itemName}". ` +
               `A similar item "${sourceItem.itemName}" was reported ${sourceItem.reportType.toLowerCase()} near ${sourceItem.locationLost || sourceItem.locationFound || 'campus'}. ` +
               `Confidence: ${match.confidence}.`,
      notificationType: 'MATCH_FOUND',
      relatedItemId: sourceItem.reportId
    });
  });
};

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  getUnreadCount,
  notifyMatches
};
