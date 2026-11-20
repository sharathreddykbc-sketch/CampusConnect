/**
 * Search Service — Keyword Search & Smart Matching Algorithm
 * 
 * Provides two main capabilities:
 * 1. Keyword-based search with filtering (used by the general items listing).
 * 2. `findMatches` — the core smart-matching algorithm that pairs LOST
 *    reports with FOUND reports based on a weighted scoring system.
 */

const { items } = require('../models/mockData');
const { ApiError } = require('../middleware/errorHandler');

// ──────────────────────────────────────────────
//  Public: keyword search with filters
// ──────────────────────────────────────────────

/**
 * Search items by keyword and optional filters.
 * 
 * @param {Object} opts
 * @param {string}  opts.keyword   - Matches against itemName + description
 * @param {string}  [opts.category]
 * @param {string}  [opts.location]
 * @param {string}  [opts.dateFrom]  - ISO date string (inclusive)
 * @param {string}  [opts.dateTo]    - ISO date string (inclusive)
 * @returns {Array} Matching items sorted by relevance (newest first)
 */
const searchItems = ({ keyword, category, location, dateFrom, dateTo }) => {
  let results = Array.from(items.values());

  // Keyword filter (name + description)
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results.filter(i =>
      i.itemName.toLowerCase().includes(kw) ||
      i.description.toLowerCase().includes(kw)
    );
  }

  // Category filter
  if (category) {
    results = results.filter(i => i.category === category);
  }

  // Location filter (keyword match against both lost and found location fields)
  if (location) {
    const loc = location.toLowerCase();
    results = results.filter(i => {
      const itemLoc = (i.locationLost || i.locationFound || '').toLowerCase();
      return itemLoc.includes(loc);
    });
  }

  // Date range filter — uses the relevant date field for each report type
  if (dateFrom) {
    const from = new Date(dateFrom);
    results = results.filter(i => {
      const d = new Date(i.dateLost || i.dateFound);
      return d >= from;
    });
  }
  if (dateTo) {
    const to = new Date(dateTo);
    results = results.filter(i => {
      const d = new Date(i.dateLost || i.dateFound);
      return d <= to;
    });
  }

  // Sort newest first
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return results;
};

// ──────────────────────────────────────────────
//  Public: Smart Matching Algorithm
// ──────────────────────────────────────────────

/**
 * Find potential matches for a given report.
 * 
 * For a LOST item → searches all FOUND items.
 * For a FOUND item → searches all LOST items.
 * 
 * Scoring weights (max 100 points):
 *   - Category match:        30 pts  (exact match)
 *   - Keyword overlap (name): 25 pts  (Jaccard-like overlap of words)
 *   - Description similarity: 20 pts  (word overlap ratio)
 *   - Location proximity:     15 pts  (keyword match between location strings)
 *   - Date proximity:         10 pts  (within 7 days = full score, linear decay)
 * 
 * Confidence labels:
 *   HIGH   ≥ 70
 *   MEDIUM ≥ 40
 *   LOW    ≥ 20
 *   (Below 20 the match is dropped.)
 * 
 * @param {string} reportId - The report to find matches for
 * @returns {Array} Sorted array of { item, score, confidence }
 */
const findMatches = (reportId) => {
  const sourceItem = items.get(reportId);
  if (!sourceItem) {
    throw new ApiError('Item report not found.', 404);
  }

  // Determine which pool to search (opposite report type)
  const targetType = sourceItem.reportType === 'LOST' ? 'FOUND' : 'LOST';

  // Only consider ACTIVE items
  const candidates = Array.from(items.values()).filter(
    i => i.reportType === targetType && i.status === 'ACTIVE'
  );

  const scored = candidates.map(candidate => {
    const score = _calculateMatchScore(sourceItem, candidate);
    return { item: candidate, score };
  });

  // Filter out very low scores (< 20) and sort descending
  const matches = scored
    .filter(m => m.score >= 20)
    .sort((a, b) => b.score - a.score)
    .map(m => ({
      item: m.item,
      score: m.score,
      confidence: _getConfidenceLabel(m.score)
    }));

  return matches;
};

// ──────────────────────────────────────────────
//  Internal scoring helpers
// ──────────────────────────────────────────────

/**
 * Calculate the total match score between a source and a candidate item.
 */
const _calculateMatchScore = (source, candidate) => {
  let total = 0;

  total += _scoreCategoryMatch(source, candidate);       // max 30
  total += _scoreNameOverlap(source, candidate);          // max 25
  total += _scoreDescriptionSimilarity(source, candidate); // max 20
  total += _scoreLocationProximity(source, candidate);    // max 15
  total += _scoreDateProximity(source, candidate);        // max 10

  return Math.round(total);
};

/**
 * Category match — 30 points for exact match, 0 otherwise.
 */
const _scoreCategoryMatch = (source, candidate) => {
  return source.category === candidate.category ? 30 : 0;
};

/**
 * Keyword overlap in item name — up to 25 points.
 * 
 * Uses Jaccard-like overlap: |intersection| / |union| of significant words
 * (words longer than 2 chars to ignore articles/prepositions).
 */
const _scoreNameOverlap = (source, candidate) => {
  const sourceWords = _extractWords(source.itemName);
  const candidateWords = _extractWords(candidate.itemName);

  if (sourceWords.size === 0 || candidateWords.size === 0) return 0;

  const intersection = new Set([...sourceWords].filter(w => candidateWords.has(w)));
  const union = new Set([...sourceWords, ...candidateWords]);

  // Jaccard similarity × max points
  return (intersection.size / union.size) * 25;
};

/**
 * Description similarity — up to 20 points.
 * 
 * Counts overlapping significant words and calculates a ratio against
 * the smaller description's word count (so a short query still matches
 * a long description well).
 */
const _scoreDescriptionSimilarity = (source, candidate) => {
  const sourceWords = _extractWords(source.description);
  const candidateWords = _extractWords(candidate.description);

  if (sourceWords.size === 0 || candidateWords.size === 0) return 0;

  const intersection = new Set([...sourceWords].filter(w => candidateWords.has(w)));
  const minSize = Math.min(sourceWords.size, candidateWords.size);

  // Ratio of shared words to the smaller set × max points
  return (intersection.size / minSize) * 20;
};

/**
 * Location proximity — up to 15 points.
 * 
 * Compares location strings by word overlap. Even partial keyword matches
 * (e.g., "Library" appearing in both) earn proportional points.
 */
const _scoreLocationProximity = (source, candidate) => {
  // Pick the relevant location field for each report type
  const sourceLoc = source.reportType === 'LOST' ? source.locationLost : source.locationFound;
  const candidateLoc = candidate.reportType === 'LOST' ? candidate.locationLost : candidate.locationFound;

  if (!sourceLoc || !candidateLoc) return 0;

  const sourceWords = _extractWords(sourceLoc);
  const candidateWords = _extractWords(candidateLoc);

  if (sourceWords.size === 0 || candidateWords.size === 0) return 0;

  const intersection = new Set([...sourceWords].filter(w => candidateWords.has(w)));
  const union = new Set([...sourceWords, ...candidateWords]);

  return (intersection.size / union.size) * 15;
};

/**
 * Date proximity — up to 10 points.
 * 
 * Full score if the dates are on the same day. Linear decay over 7 days;
 * 0 points if more than 7 days apart.
 */
const _scoreDateProximity = (source, candidate) => {
  const sourceDate = new Date(source.dateLost || source.dateFound);
  const candidateDate = new Date(candidate.dateLost || candidate.dateFound);

  if (isNaN(sourceDate) || isNaN(candidateDate)) return 0;

  const diffMs = Math.abs(sourceDate - candidateDate);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays > 7) return 0;

  // Linear decay: 10 points at 0 days, 0 points at 7 days
  return ((7 - diffDays) / 7) * 10;
};

/**
 * Extract a Set of lowercased significant words (length > 2) from a string.
 * Strips punctuation so "wallet," and "wallet" are treated identically.
 */
const _extractWords = (text) => {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')  // strip punctuation
    .split(/\s+/)
    .filter(w => w.length > 2);   // ignore tiny words
  return new Set(words);
};

/**
 * Map a numeric score to a human-readable confidence label.
 */
const _getConfidenceLabel = (score) => {
  if (score >= 70) return 'HIGH';
  if (score >= 40) return 'MEDIUM';
  return 'LOW';
};

module.exports = {
  searchItems,
  findMatches
};
