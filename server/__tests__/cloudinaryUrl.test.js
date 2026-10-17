/**
 * utils/cloudinaryUrl.js is the allowlist for URLs a client hands back after
 * an upload. It is only as good as its edge cases, so they are listed here.
 */

const { isOwnCloudinaryUrl } = require('../utils/cloudinaryUrl');

const ORIGINAL = process.env.CLOUDINARY_CLOUD_NAME;
beforeAll(() => { process.env.CLOUDINARY_CLOUD_NAME = 'veraawell'; });
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = ORIGINAL;
});

describe('isOwnCloudinaryUrl', () => {
  test.each([
    'https://res.cloudinary.com/veraawell/image/upload/v1/veerawell/profiles/user_1.jpg',
    'https://res.cloudinary.com/veraawell/raw/upload/v1/veerawell/doctor-documents/doc_1',
    'https://RES.cloudinary.com/veraawell/image/upload/x.png'
  ])('accepts %s', (url) => {
    expect(isOwnCloudinaryUrl(url)).toBe(true);
  });

  test.each([
    ['another cloud', 'https://res.cloudinary.com/someoneelse/image/upload/x.jpg'],
    ['a cloud whose name starts with ours', 'https://res.cloudinary.com/veraawell-evil/image/upload/x.jpg'],
    ['plain http', 'http://res.cloudinary.com/veraawell/image/upload/x.jpg'],
    ['a lookalike host', 'https://res.cloudinary.com.evil.test/veraawell/x.jpg'],
    ['a subdomain of another host', 'https://res-cloudinary.com/veraawell/x.jpg'],
    ['userinfo smuggling', 'https://res.cloudinary.com@evil.test/veraawell/x.jpg'],
    ['credentials on the right host', 'https://u:p@res.cloudinary.com/veraawell/x.jpg'],
    ['a non-default port', 'https://res.cloudinary.com:8443/veraawell/x.jpg'],
    ['dot-segments out of our folder', 'https://res.cloudinary.com/veraawell/../other/x.jpg'],
    ['an encoded slash', 'https://res.cloudinary.com/veraawell%2F..%2Fother/x.jpg'],
    ['javascript:', 'javascript:alert(1)'],
    ['a data URI', 'data:image/png;base64,AAAA'],
    ['a relative path', '/veraawell/x.jpg'],
    ['garbage', 'not a url']
  ])('refuses %s', (_label, url) => {
    expect(isOwnCloudinaryUrl(url)).toBe(false);
  });

  test('refuses non-strings and absurd lengths', () => {
    for (const v of [undefined, null, 42, {}, ['https://res.cloudinary.com/veraawell/x']]) {
      expect(isOwnCloudinaryUrl(v)).toBe(false);
    }
    expect(isOwnCloudinaryUrl(`https://res.cloudinary.com/veraawell/${'a'.repeat(3000)}`)).toBe(false);
  });

  test('refuses everything when no cloud is configured, rather than everything matching', () => {
    process.env.CLOUDINARY_CLOUD_NAME = '';
    try {
      expect(isOwnCloudinaryUrl('https://res.cloudinary.com//x.jpg')).toBe(false);
      expect(isOwnCloudinaryUrl('https://res.cloudinary.com/veraawell/x.jpg')).toBe(false);
    } finally {
      process.env.CLOUDINARY_CLOUD_NAME = 'veraawell';
    }
  });
});
