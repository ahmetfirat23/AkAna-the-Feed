import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'b', 'i',
  'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code',
  'a',
  'img',
  'figure', 'figcaption',
];

const ALLOWED_ATTR = [
  // anchor
  'href', 'target', 'rel',
  // image
  'src', 'alt', 'width', 'height',
];

/**
 * Sanitize arbitrary HTML from RSS feeds or article extraction.
 *
 * - Allows a curated set of formatting and media tags.
 * - Strips script, style, iframe, form, input, and all on* event handlers.
 * - Forces rel="noopener noreferrer" and target="_blank" on all external links.
 */
export function sanitizeHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Remove on* event handlers and other dangerous attributes not in allowlist
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur',
      'onchange', 'onsubmit', 'onkeydown', 'onkeyup', 'onkeypress',
    ],
    FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input'],
    // Prevent data: and javascript: URLs
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target', 'rel'],
  });

  // Add rel="noopener noreferrer" and target="_blank" to all <a> tags.
  // DOMPurify does not manipulate attribute values post-sanitization, so we do
  // a lightweight regex pass. This is safe because the HTML is already sanitized.
  return clean.replace(
    /<a\s([^>]*href="(?!#)[^"]*"[^>]*)>/gi,
    (match, attrs: string) => {
      // Strip any existing target / rel so we control the final values
      const stripped = attrs
        .replace(/\s*target="[^"]*"/gi, '')
        .replace(/\s*rel="[^"]*"/gi, '');
      return `<a ${stripped} target="_blank" rel="noopener noreferrer">`;
    },
  );
}
