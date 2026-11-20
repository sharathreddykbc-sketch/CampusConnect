/**
 * Express-Validator Validation Chains
 * 
 * Reusable validation rule sets for each API endpoint.
 * Import the desired chain and pass it as route-level middleware.
 * Validation errors are collected and returned by the controller layer.
 */

const { body } = require('express-validator');

// ───────────────── Registration ─────────────────
const registrationRules = [
  body('name')
    .trim()
    .notEmpty().withMessage('Name is required.')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters.'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters.')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.')
    .matches(/[0-9]/).withMessage('Password must contain at least one number.')
    .matches(/[@$!%*?&#]/).withMessage('Password must contain at least one special character.'),

  body('collegeId')
    .trim()
    .notEmpty().withMessage('College ID is required.')
    .isLength({ min: 3, max: 20 }).withMessage('College ID must be between 3 and 20 characters.')
];

// ───────────────── Login ─────────────────
const loginRules = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required.')
    .isEmail().withMessage('Please provide a valid email address.')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required.')
];

// ───────────────── Lost Item Report ─────────────────
const lostItemRules = [
  body('itemName')
    .trim()
    .notEmpty().withMessage('Item name is required.')
    .isLength({ min: 2, max: 150 }).withMessage('Item name must be between 2 and 150 characters.'),

  body('category')
    .trim()
    .notEmpty().withMessage('Category is required.'),

  body('description')
    .trim()
    .notEmpty().withMessage('Description is required.')
    .isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters.'),

  body('dateLost')
    .notEmpty().withMessage('Date lost is required.')
    .isISO8601({ strict: false }).withMessage('Date lost must be a valid date (YYYY-MM-DD).'),

  body('locationLost')
    .trim()
    .notEmpty().withMessage('Location lost is required.')
    .isLength({ min: 3, max: 200 }).withMessage('Location must be between 3 and 200 characters.')
];

// ───────────────── Found Item Report ─────────────────
const foundItemRules = [
  body('itemName')
    .trim()
    .notEmpty().withMessage('Item name is required.')
    .isLength({ min: 2, max: 150 }).withMessage('Item name must be between 2 and 150 characters.'),

  body('category')
    .trim()
    .notEmpty().withMessage('Category is required.'),

  body('description')
    .trim()
    .notEmpty().withMessage('Description is required.')
    .isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters.'),

  body('dateFound')
    .notEmpty().withMessage('Date found is required.')
    .isISO8601({ strict: false }).withMessage('Date found must be a valid date (YYYY-MM-DD).'),

  body('locationFound')
    .trim()
    .notEmpty().withMessage('Location found is required.')
    .isLength({ min: 3, max: 200 }).withMessage('Location must be between 3 and 200 characters.'),

  body('pickupLocation')
    .trim()
    .notEmpty().withMessage('Pickup location is required.')
    .isLength({ min: 3, max: 200 }).withMessage('Pickup location must be between 3 and 200 characters.'),

  body('imageKey')
    .notEmpty().withMessage('Image is required for found item reports.')
];

// ───────────────── Claim ─────────────────
const claimRules = [
  body('reportId')
    .trim()
    .notEmpty().withMessage('Report ID is required.'),

  body('ownershipDescription')
    .trim()
    .notEmpty().withMessage('Ownership description is required.')
    .isLength({ min: 20, max: 2000 }).withMessage('Ownership description must be between 20 and 2000 characters.')
];

// ───────────────── Item Update ─────────────────
const itemUpdateRules = [
  body('itemName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 150 }).withMessage('Item name must be between 2 and 150 characters.'),

  body('category')
    .optional()
    .trim(),

  body('description')
    .optional()
    .trim()
    .isLength({ min: 10, max: 1000 }).withMessage('Description must be between 10 and 1000 characters.'),

  body('dateLost')
    .optional()
    .isISO8601({ strict: false }).withMessage('Date lost must be a valid date.'),

  body('dateFound')
    .optional()
    .isISO8601({ strict: false }).withMessage('Date found must be a valid date.'),

  body('locationLost')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('Location must be between 3 and 200 characters.'),

  body('locationFound')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('Location must be between 3 and 200 characters.'),

  body('pickupLocation')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('Pickup location must be between 3 and 200 characters.'),

  body('status')
    .optional()
    .isIn(['ACTIVE', 'CLAIMED', 'RESOLVED', 'EXPIRED']).withMessage('Invalid status value.')
];

module.exports = {
  registrationRules,
  loginRules,
  lostItemRules,
  foundItemRules,
  claimRules,
  itemUpdateRules
};
