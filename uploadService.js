/**
 * Upload Service — Local File & AWS S3 Upload Handler
 * 
 * Uses multer to accept multipart/form-data file uploads.
 * In production/cloud mode with AWS credentials, automatically streams files to Amazon S3.
 * In local mode, stores files to `backend/uploads/` and returns the local path as an imageKey.
 * 
 * Validates:
 *   - File type: jpeg, png, or webp only
 *   - File size: max 5 MB
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { ApiError } = require('../middleware/errorHandler');
const { uploadBufferToS3 } = require('../utils/s3Uploader');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_SIZE = (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 5) * 1024 * 1024; // bytes

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Ensure local uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Multer storage config ──
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});

// ── Multer file filter ──
const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError('Invalid file type. Only JPEG, PNG, and WebP images are allowed.', 400), false);
  }
};

// Configured multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE }
});

/**
 * Process the uploaded file and return its public S3 or local path.
 * 
 * @param {Object} file - The file object populated by multer (req.file)
 * @returns {Promise<Object>} { imageKey, originalName, size, mimeType }
 */
const processUpload = async (file) => {
  if (!file) {
    throw new ApiError('No file uploaded.', 400);
  }

  const s3Bucket = process.env.AWS_S3_BUCKET;
  const hasS3Config = Boolean(s3Bucket && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

  let imageKey = `/uploads/${file.filename}`;

  // If AWS S3 credentials exist, upload directly to S3
  if (hasS3Config) {
    try {
      const fileBuffer = fs.readFileSync(file.path);
      const s3Url = await uploadBufferToS3({
        key: `uploads/${file.filename}`,
        body: fileBuffer,
        contentType: file.mimetype
      });
      imageKey = s3Url;
      console.log(`[AWS S3] Uploaded object successfully: ${s3Url}`);
    } catch (s3Err) {
      console.warn(`[AWS S3] Warning: S3 upload failed (${s3Err.message}), falling back to local file.`);
    }
  }

  return {
    imageKey,
    originalName: file.originalname,
    size: file.size,
    mimeType: file.mimetype
  };
};

/**
 * Generate a pre-signed URL response.
 */
const getPresignedUrl = (fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const key = `${uuidv4()}${ext}`;

  return {
    uploadUrl: '/api/uploads/upload',
    key: `/uploads/${key}`,
    expiresIn: 3600,
    method: 'POST',
    fields: {}
  };
};

module.exports = {
  upload,
  processUpload,
  getPresignedUrl
};
