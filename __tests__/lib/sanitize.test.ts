import { sanitizeHtml } from '../../lib/sanitize';

describe('sanitizeHtml', () => {
  it('strips script tags', () => {
    const result = sanitizeHtml('<p>Hello</p><script>alert("xss")</script>');
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
    expect(result).toContain('<p>Hello</p>');
  });

  it('strips onclick and other event handlers', () => {
    const result = sanitizeHtml('<p onclick="evil()">Click me</p>');
    expect(result).not.toContain('onclick');
    expect(result).toContain('Click me');
  });

  it('strips onmouseover event handlers', () => {
    const result = sanitizeHtml('<a href="https://example.com" onmouseover="evil()">link</a>');
    expect(result).not.toContain('onmouseover');
  });

  it('strips iframe tags', () => {
    const result = sanitizeHtml('<p>Content</p><iframe src="https://evil.com"></iframe>');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('Content');
  });

  it('strips form tags', () => {
    const result = sanitizeHtml('<form action="/evil"><input type="text" /></form>');
    expect(result).not.toContain('<form');
    expect(result).not.toContain('<input');
  });

  it('strips input tags', () => {
    const result = sanitizeHtml('<p>Text <input type="text" value="data" /> more</p>');
    expect(result).not.toContain('<input');
  });

  it('keeps allowed tag: p', () => {
    const result = sanitizeHtml('<p>Paragraph</p>');
    expect(result).toContain('<p>Paragraph</p>');
  });

  it('keeps allowed tag: strong', () => {
    const result = sanitizeHtml('<p><strong>Bold</strong></p>');
    expect(result).toContain('<strong>Bold</strong>');
  });

  it('keeps allowed tag: em', () => {
    const result = sanitizeHtml('<p><em>Italic</em></p>');
    expect(result).toContain('<em>Italic</em>');
  });

  it('keeps allowed tag: a', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('<a');
    expect(result).toContain('href="https://example.com"');
  });

  it('keeps allowed tag: img with valid src', () => {
    const result = sanitizeHtml('<img src="https://example.com/img.png" alt="photo">');
    expect(result).toContain('<img');
    expect(result).toContain('src="https://example.com/img.png"');
  });

  it('keeps allowed tags: ul, ol, li', () => {
    const result = sanitizeHtml('<ul><li>item 1</li><li>item 2</li></ul>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });

  it('keeps allowed tag: blockquote', () => {
    const result = sanitizeHtml('<blockquote>Quote text</blockquote>');
    expect(result).toContain('<blockquote>');
  });

  it('keeps allowed tags: code and pre', () => {
    const result = sanitizeHtml('<pre><code>const x = 1;</code></pre>');
    expect(result).toContain('<pre>');
    expect(result).toContain('<code>');
  });

  it('adds target="_blank" and rel="noopener noreferrer" to external links', () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  it('keeps href, src, alt on allowed tags', () => {
    const result = sanitizeHtml(
      '<a href="https://example.com">link</a><img src="https://example.com/img.jpg" alt="desc">',
    );
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain('src="https://example.com/img.jpg"');
    expect(result).toContain('alt="desc"');
  });

  it('handles empty string', () => {
    const result = sanitizeHtml('');
    expect(result).toBe('');
  });

  it('handles passing empty string in place of null/undefined gracefully', () => {
    expect(() => sanitizeHtml('')).not.toThrow();
    const result = sanitizeHtml('');
    expect(typeof result).toBe('string');
  });

  it('does not strip images with valid src', () => {
    const result = sanitizeHtml(
      '<img src="https://cdn.example.com/photo.jpg" alt="A photo" width="800" height="600">',
    );
    expect(result).toContain('src="https://cdn.example.com/photo.jpg"');
    expect(result).toContain('alt="A photo"');
  });

  it('replaces existing target/rel on links with safe values', () => {
    const result = sanitizeHtml(
      '<a href="https://example.com" target="_self" rel="nofollow">link</a>',
    );
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).not.toContain('target="_self"');
    expect(result).not.toContain('rel="nofollow"');
  });

  it('does not add target/rel to hash-only anchor links', () => {
    const result = sanitizeHtml('<a href="#section">Jump</a>');
    // Hash-only links (href="#...") are excluded from the regex
    expect(result).toContain('href="#section"');
    // target/_blank should NOT be added to fragment-only links
    expect(result).not.toContain('target="_blank"');
  });
});
