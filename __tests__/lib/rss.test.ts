// Mock ssrf-req-filter so SSRF checks don't block test URLs
jest.mock('ssrf-req-filter', () => {
  const mockAgent = {};
  return {
    SsrfFilter: jest.fn().mockImplementation(() => ({
      buildHttpAgent: jest.fn().mockReturnValue(mockAgent),
      buildHttpsAgent: jest.fn().mockReturnValue(mockAgent),
    })),
  };
});

// Mock rss-parser so we control what parseURL returns
const mockParseURL = jest.fn();
jest.mock('rss-parser', () => {
  return jest.fn().mockImplementation(() => ({
    parseURL: mockParseURL,
  }));
});

import { fetchAndParseFeed, ParsedArticle } from '../../lib/rss';

describe('fetchAndParseFeed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns empty array on network error', async () => {
    mockParseURL.mockRejectedValueOnce(new Error('Network error'));
    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result).toEqual([]);
  });

  it('returns empty array on invalid XML / parse error', async () => {
    mockParseURL.mockRejectedValueOnce(new Error('Invalid XML'));
    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result).toEqual([]);
  });

  it('parses a valid RSS feed correctly', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'Test Article',
          link: 'https://example.com/article-1',
          contentSnippet: 'A short description.',
          pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Article');
    expect(result[0].url).toBe('https://example.com/article-1');
    expect(result[0].description).toBe('A short description.');
    expect(result[0].publishedAt).toBeInstanceOf(Date);
  });

  it('skips items with no title', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: '',
          link: 'https://example.com/article-1',
          contentSnippet: 'Description.',
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result).toEqual([]);
  });

  it('skips items with no link', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'No Link Article',
          link: '',
          contentSnippet: 'Description.',
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result).toEqual([]);
  });

  it('extracts imageUrl from enclosure', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'Article with Image',
          link: 'https://example.com/article',
          contentSnippet: 'Description.',
          enclosure: { url: 'https://example.com/image.jpg', type: 'image/jpeg' },
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result[0].imageUrl).toBe('https://example.com/image.jpg');
  });

  it('does not extract imageUrl from enclosure when URL is not an image', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'Podcast Episode',
          link: 'https://example.com/episode',
          contentSnippet: 'Description.',
          enclosure: { url: 'https://example.com/episode.mp3', type: 'audio/mpeg' },
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    // mp3 is not an image, so imageUrl should be null (no other image sources)
    expect(result[0].imageUrl).toBeNull();
  });

  it('truncates description to 500 chars', async () => {
    const longDescription = 'A'.repeat(600);
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'Long Article',
          link: 'https://example.com/long',
          contentSnippet: longDescription,
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    // Should be 497 chars + '…' = 498 chars total (single unicode char)
    expect(result[0].description.length).toBeLessThanOrEqual(500);
    expect(result[0].description.endsWith('…')).toBe(true);
  });

  it('strips HTML from description', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'HTML Article',
          link: 'https://example.com/html',
          // rss-parser puts plain text in contentSnippet — use content for HTML
          content: '<p>This is <strong>bold</strong> and <em>italic</em> text.</p>',
          contentSnippet: undefined,
          summary: undefined,
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result[0].description).not.toContain('<p>');
    expect(result[0].description).not.toContain('<strong>');
    expect(result[0].description).toContain('bold');
    expect(result[0].description).toContain('italic');
  });

  it('parses publishedAt from isoDate when pubDate is absent', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'ISO Date Article',
          link: 'https://example.com/iso',
          contentSnippet: 'Desc.',
          isoDate: '2024-06-15T12:00:00.000Z',
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result[0].publishedAt).toBeInstanceOf(Date);
    expect(result[0].publishedAt?.toISOString()).toBe('2024-06-15T12:00:00.000Z');
  });

  it('sets publishedAt to null when no date fields are present', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: 'No Date Article',
          link: 'https://example.com/nodate',
          contentSnippet: 'Desc.',
        },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result[0].publishedAt).toBeNull();
  });

  it('returns multiple parsed articles', async () => {
    mockParseURL.mockResolvedValueOnce({
      items: [
        { title: 'Article 1', link: 'https://example.com/1', contentSnippet: 'Desc 1.' },
        { title: 'Article 2', link: 'https://example.com/2', contentSnippet: 'Desc 2.' },
        { title: 'Article 3', link: 'https://example.com/3', contentSnippet: 'Desc 3.' },
      ],
    });

    const result = await fetchAndParseFeed('https://example.com/feed.xml');
    expect(result).toHaveLength(3);
    expect(result.map((a: ParsedArticle) => a.title)).toEqual([
      'Article 1',
      'Article 2',
      'Article 3',
    ]);
  });
});
