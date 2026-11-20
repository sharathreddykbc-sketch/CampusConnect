/**
 * S3 Uploader (Pure Node.js - Zero External Dependencies)
 * 
 * Uses standard Node.js crypto and https to sign requests with AWS Signature Version 4
 * and upload files directly to an Amazon S3 bucket.
 */

const crypto = require('crypto');
const https = require('https');

function hmac(key, string, encoding) {
  return crypto.createHmac('sha256', key).update(string, 'utf8').digest(encoding);
}

function hash(string) {
  return crypto.createHash('sha256').update(string).digest('hex');
}

/**
 * Upload a Buffer directly to Amazon S3 using AWS SigV4
 * 
 * @param {Object} params
 * @param {string} params.bucket           - S3 Bucket name
 * @param {string} params.region           - AWS Region (e.g. ap-southeast-2)
 * @param {string} params.accessKeyId      - AWS Access Key ID
 * @param {string} params.secretAccessKey  - AWS Secret Access Key
 * @param {string} params.key              - Object Key (e.g. uploads/sample-wallet.jpg)
 * @param {Buffer} params.body             - File content Buffer
 * @param {string} params.contentType      - MIME type (e.g. image/jpeg)
 * @returns {Promise<string>} The public S3 URL of the uploaded object
 */
function uploadBufferToS3({
  bucket = process.env.AWS_S3_BUCKET,
  region = process.env.AWS_REGION || 'ap-southeast-2',
  accessKeyId = process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY,
  key,
  body,
  contentType = 'image/jpeg'
}) {
  return new Promise((resolve, reject) => {
    if (!bucket || !accessKeyId || !secretAccessKey) {
      return reject(new Error('Missing required S3 credentials or bucket name in environment.'));
    }

    // Clean key (remove leading slash)
    const cleanKey = key.replace(/^\/+/, '');
    const host = `${bucket}.s3.${region}.amazonaws.com`;
    const canonicalUri = `/${cleanKey.split('/').map(encodeURIComponent).join('/')}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8); // YYYYMMDD

    const payloadHash = hash(body);

    const canonicalHeaders =
      `content-length:${body.length}\n` +
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;

    const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest =
      `PUT\n` +
      `${canonicalUri}\n` +
      `\n` +
      `${canonicalHeaders}\n` +
      `${signedHeaders}\n` +
      `${payloadHash}`;

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign =
      `AWS4-HMAC-SHA256\n` +
      `${amzDate}\n` +
      `${credentialScope}\n` +
      `${hash(canonicalRequest)}`;

    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, 's3');
    const kSigning = hmac(kService, 'aws4_request');
    const signature = hmac(kSigning, stringToSign, 'hex');

    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options = {
      hostname: host,
      port: 443,
      path: canonicalUri,
      method: 'PUT',
      headers: {
        'Host': host,
        'Content-Type': contentType,
        'Content-Length': body.length,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Authorization': authHeader
      }
    };

    const req = https.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const s3Url = `https://${host}/${cleanKey}`;
          resolve(s3Url);
        } else {
          reject(new Error(`S3 upload failed (${res.statusCode}): ${responseBody}`));
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

module.exports = {
  uploadBufferToS3
};

