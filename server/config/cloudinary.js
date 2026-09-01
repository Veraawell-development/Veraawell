const cloudinary = require('cloudinary').v2;
const { getEnv, isProduction } = require('./environment');
const { createLogger } = require('../utils/logger');

const logger = createLogger('CLOUDINARY');

// This previously read process.env directly with no guard at all, so an unset
// credential produced a config of `undefined` values and the failure surfaced
// as an opaque Cloudinary auth error on a real user's first upload — a doctor
// submitting verification documents, or a patient setting a profile photo.
// validateEnvironment() now requires all three in production; this is the
// second line of defence and the place that reports *which* one is missing.
const cloudName = getEnv('CLOUDINARY_CLOUD_NAME');
const apiKey = getEnv('CLOUDINARY_API_KEY');
const apiSecret = getEnv('CLOUDINARY_API_SECRET');

const missing = [
  ['CLOUDINARY_CLOUD_NAME', cloudName],
  ['CLOUDINARY_API_KEY', apiKey],
  ['CLOUDINARY_API_SECRET', apiSecret]
].filter(([, value]) => !value).map(([name]) => name);

if (missing.length > 0) {
  // Not fatal here — validateEnvironment() already exits in production, so
  // reaching this branch means development, where uploads simply won't work.
  logger.warn('Cloudinary is not fully configured — uploads will fail', { missing });
} else if (!isProduction()) {
  logger.debug('Cloudinary configured', { cloudName });
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret
});

/** Whether uploads can actually succeed. Callers should 503 rather than 500. */
cloudinary.isConfigured = () => missing.length === 0;

module.exports = cloudinary;
