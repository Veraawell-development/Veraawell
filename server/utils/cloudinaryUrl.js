/**
 * Is this URL an asset in OUR Cloudinary account?
 *
 * Several flows upload a file first (POST /api/upload/*) and then send the
 * resulting URL back in a later request — registration documents, session
 * report attachments. The second request is just JSON, so nothing stopped a
 * client sending any URL at all: a link to an arbitrary host stored as a
 * "verification document" that an admin then opens, or a tracking pixel
 * attached to a clinical record. The upload endpoints only ever produce
 * https://res.cloudinary.com/<our cloud>/..., so that is the whole allowlist.
 *
 * The cloud name is read per call rather than captured at require time, so a
 * test (or a late-loaded environment) that sets it is honoured.
 */

function isOwnCloudinaryUrl(value) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName || typeof value !== 'string' || value.length > 2048) return false;

  let url;
  try {
    url = new URL(value);
  } catch (_) {
    return false;
  }

  // Exact host and an exact first path segment: `res.cloudinary.com.evil.test`
  // and `/<our cloud>-lookalike/` must both fail. URL() has already
  // normalised case, dot-segments and default ports by this point.
  return url.protocol === 'https:'
    && url.hostname === 'res.cloudinary.com'
    && url.port === ''
    && !url.username && !url.password
    && url.pathname.startsWith(`/${cloudName}/`);
}

module.exports = { isOwnCloudinaryUrl };
