/**
 * Plain text from user input: every tag removed, and the text left as text.
 *
 * DOMPurify with no allowed tags returns SERIALISED HTML, so "Smith & Co <3"
 * came back as "Smith &amp; Co &lt;3" and was stored that way — and React,
 * which escapes on render, then showed the entities literally in article
 * titles and every enquiry field. Decoding the handful of entities the
 * serialiser produces gives back what was typed. It is safe because the value
 * is only ever rendered as text, never as HTML.
 */

const DOMPurify = require('isomorphic-dompurify');

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

function plainText(value) {
  if (value === undefined || value === null) return value;
  return DOMPurify.sanitize(String(value), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
    .replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity])
    .trim();
}

module.exports = { plainText };
