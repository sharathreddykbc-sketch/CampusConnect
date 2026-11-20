/**
 * Item Service — CRUD for Lost & Found Reports
 * 
 * Persists reports in Amazon DynamoDB (CampusConnect_Items)
 * and keeps an in-memory cache for fast querying.
 */

const { v4: uuidv4 } = require('uuid');
const { items } = require('../models/mockData');
const { ApiError } = require('../middleware/errorHandler');
const awsAuth = require('../utils/awsAuth');

/**
 * Create a LOST item report.
 */
const createLostItem = async ({ reporterId, reporterName, itemName, category, description, dateLost, locationLost, imageKey }) => {
  const now = new Date().toISOString();

  const item = {
    reportId: uuidv4(),
    reporterId,
    reporterName,
    reportType: 'LOST',
    itemName,
    category,
    description,
    imageKey: imageKey || null,
    dateLost,
    dateFound: null,
    locationLost,
    locationFound: null,
    pickupLocation: null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  };

  items.set(item.reportId, item);
  try {
    await awsAuth.putItemInDynamoDB(item);
  } catch (err) {
    console.warn('[DynamoDB Warning] Failed to put lost item:', err.message);
  }

  return item;
};

/**
 * Create a FOUND item report.
 */
const createFoundItem = async ({ reporterId, reporterName, itemName, category, description, dateFound, locationFound, pickupLocation, imageKey }) => {
  if (!imageKey) {
    throw new ApiError('An image is required when reporting a found item.', 400);
  }

  const now = new Date().toISOString();

  const item = {
    reportId: uuidv4(),
    reporterId,
    reporterName,
    reportType: 'FOUND',
    itemName,
    category,
    description,
    imageKey,
    dateLost: null,
    dateFound,
    locationLost: null,
    locationFound,
    pickupLocation,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  };

  items.set(item.reportId, item);
  try {
    await awsAuth.putItemInDynamoDB(item);
  } catch (err) {
    console.warn('[DynamoDB Warning] Failed to put found item:', err.message);
  }

  return item;
};

/**
 * List items with optional pagination and filtering.
 */
const getItems = ({ category, status, reportType, search, page = 1, limit = 10 }) => {
  let results = Array.from(items.values());

  // Filtering
  if (category) {
    results = results.filter(i => i.category === category);
  }
  if (status) {
    results = results.filter(i => i.status === status);
  }
  if (reportType) {
    results = results.filter(i => i.reportType === reportType.toUpperCase());
  }
  if (search) {
    const kw = search.toLowerCase();
    results = results.filter(i =>
      (i.itemName && i.itemName.toLowerCase().includes(kw)) ||
      (i.description && i.description.toLowerCase().includes(kw))
    );
  }

  // Sort newest first
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Pagination
  const totalItems = results.length;
  const totalPages = Math.ceil(totalItems / limit);
  const startIdx = (page - 1) * limit;
  const paginatedItems = results.slice(startIdx, startIdx + limit);

  return {
    items: paginatedItems,
    pagination: {
      currentPage: page,
      totalPages,
      totalItems,
      limit
    }
  };
};

/**
 * Get a single item by its reportId.
 */
const getItemById = (reportId) => {
  const item = items.get(reportId);
  if (!item) {
    throw new ApiError('Item report not found.', 404);
  }
  return item;
};

/**
 * Update an existing item report.
 */
const updateItem = async (reportId, updates, userId, userRole) => {
  const item = items.get(reportId);
  if (!item) {
    throw new ApiError('Item report not found.', 404);
  }

  // Ownership check
  if (item.reporterId !== userId && userRole !== 'admin') {
    throw new ApiError('You do not have permission to update this report.', 403);
  }

  // Apply allowed fields only
  const allowedFields = [
    'itemName', 'category', 'description', 'imageKey',
    'dateLost', 'dateFound', 'locationLost', 'locationFound',
    'pickupLocation', 'status'
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      item[field] = updates[field];
    }
  }

  item.updatedAt = new Date().toISOString();
  try {
    await awsAuth.updateItemInDynamoDB(reportId, item);
  } catch (err) {
    console.warn('[DynamoDB Warning] Failed to update item:', err.message);
  }

  return item;
};

/**
 * Delete an item report.
 */
const deleteItem = async (reportId, userId, userRole) => {
  const item = items.get(reportId);
  if (!item) {
    throw new ApiError('Item report not found.', 404);
  }

  if (item.reporterId !== userId && userRole !== 'admin') {
    throw new ApiError('You do not have permission to delete this report.', 403);
  }

  items.delete(reportId);
  try {
    await awsAuth.deleteItemFromDynamoDB(reportId);
  } catch (err) {
    console.warn('[DynamoDB Warning] Failed to delete item:', err.message);
  }

  return { message: 'Item report deleted successfully.' };
};

module.exports = {
  createLostItem,
  createFoundItem,
  getItems,
  getItemById,
  updateItem,
  deleteItem
};
