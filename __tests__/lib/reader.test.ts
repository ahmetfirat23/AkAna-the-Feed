import { EventEmitter } from 'events';

// Mock ssrf-req-filter before importing reader
jest.mock('ssrf-req-filter', () => {
  const mockAgent = {};
  return {
    SsrfFilter: jest.fn().mockImplementation(() => ({
      buildHttpAgent: jest.fn().mockReturnValue(mockAgent),
      buildHttpsAgent: jest.fn().mockReturnValue(mockAgent),
    })),
  };
});

// jest.mock factories are hoisted — cannot reference outer variables.
jest.mock('https', () => ({
  request: jest.fn(),
}));

jest.mock('http', () => ({
  request: jest.fn(),
}));

// Mock @mozilla/readability — each test configures Readability.parse
jest.mock('@mozilla/readability', () => ({
  Readability: jest.fn(),
}));

// Mock jsdom to avoid ESM dependency issues in test environment.
// reader.ts uses JSDOM only to build a DOM for Readability, so we just
// need to return a window.document stub.
jest.mock('jsdom', () => ({
  JSDOM: jest.fn().mockImplementation(() => ({
    window: { document: { createElement: jest.fn(), body: {} } },
  })),
}));

// Mock lib/sanitize so it's a simple pass-through (avoids DOMPurify needing
// a real DOM environment while jsdom is mocked).
jest.mock('../../lib/sanitize', () => ({
  sanitizeHtml: jest.fn((html: string): string => {
    // Strip script tags so the "sanitizes content" test can verify
    return html.replace(/<script[\s\S]*?<\/script>/gi, '');
  }),
}));

// Imports come AFTER mock declarations
import https from 'https';
import { fetchArticleContent } from '../../lib/reader';

// Typed alias for the https.request mock
const mockHttpsRequest = https.request as jest.Mock;

// Helper to create a mock HTTP response/request pair
interface MockPair {
  req: NodeJS.EventEmitter & { destroy: jest.Mock; end: jest.Mock };
  res: NodeJS.EventEmitter & { statusCode: number; headers: Record<string, string> };
  sendBody: (body: string) => void;
}

function makeMockPair(statusCode: number): MockPair {
  const res = new EventEmitter() as MockPair['res'];
  res.statusCode = statusCode;
  res.headers = {};

  const req = new EventEmitter() as MockPair['req'];
  req.destroy = jest.fn();
  req.end = jest.fn();

  return {
    req,
    res,
    sendBody: (body: string) => {
      res.emit('data', Buffer.from(body));
      res.emit('end');
    },
  };
}

// Helper: configure mockHttpsRequest to deliver a successful 200 response
function setupSuccessResponse(body: string): void {
  const pair = makeMockPair(200);
  mockHttpsRequest.mockImplementationOnce(
    (_opts: unknown, cb: (res: unknown) => void) => {
      setTimeout(() => {
        cb(pair.res);
        pair.sendBody(body);
      }, 0);
      return pair.req;
    },
  );
}

describe('fetchArticleContent', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const readabilityMod = require('@mozilla/readability');

  beforeEach(() => {
    jest.clearAllMocks();
    // After clearAllMocks(), we need to re-establish the JSDOM default mock
    // implementation because clearAllMocks() clears mockImplementation too
    // when the mock was created with jest.fn() + no explicit mockReturnValue.
    // Re-set it here to be safe.
    const { JSDOM } = require('jsdom') as { JSDOM: jest.Mock };
    JSDOM.mockImplementation(() => ({
      window: { document: { createElement: jest.fn(), body: {} } },
    }));
  });

  it('returns null on fetch error (request emits error)', async () => {
    const pair = makeMockPair(200);
    mockHttpsRequest.mockImplementationOnce((_opts: unknown, _cb: unknown) => {
      setTimeout(() => pair.req.emit('error', new Error('ECONNREFUSED')), 0);
      return pair.req;
    });

    const result = await fetchArticleContent('https://example.com/article');
    expect(result).toBeNull();
  });

  it('returns null when HTTP response status is 404', async () => {
    const pair = makeMockPair(404);
    mockHttpsRequest.mockImplementationOnce((_opts: unknown, cb: (res: unknown) => void) => {
      setTimeout(() => { cb(pair.res); pair.sendBody(''); }, 0);
      return pair.req;
    });

    const result = await fetchArticleContent('https://example.com/article');
    expect(result).toBeNull();
  });

  it('returns null when Readability fails to parse (returns null)', async () => {
    setupSuccessResponse('<html><body><p>Content</p></body></html>');

    readabilityMod.Readability.mockImplementation(() => ({
      parse: jest.fn().mockReturnValue(null),
    }));

    const result = await fetchArticleContent('https://example.com/article');
    expect(result).toBeNull();
  });

  it('returns { content, title, byline } on success', async () => {
    setupSuccessResponse('<html><body><article><p>Article content here.</p></article></body></html>');

    readabilityMod.Readability.mockImplementation(() => ({
      parse: jest.fn().mockReturnValue({
        content: '<p>Article content here.</p>',
        title: 'Test Article Title',
        byline: 'Jane Doe',
      }),
    }));

    const result = await fetchArticleContent('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.title).toBe('Test Article Title');
    expect(result!.byline).toBe('Jane Doe');
    expect(result!.content).toContain('Article content here');
  });

  it('sanitizes content so script tags are removed', async () => {
    setupSuccessResponse('<html><body><p>Safe</p></body></html>');

    readabilityMod.Readability.mockImplementation(() => ({
      parse: jest.fn().mockReturnValue({
        content: '<p>Safe</p><script>evil()</script>',
        title: 'Script Test',
        byline: null,
      }),
    }));

    const result = await fetchArticleContent('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.content).not.toContain('<script');
    expect(result!.content).not.toContain('evil()');
    expect(result!.content).toContain('Safe');
  });

  it('sets byline to null when Readability returns no byline', async () => {
    setupSuccessResponse('<html><body><p>Content</p></body></html>');

    readabilityMod.Readability.mockImplementation(() => ({
      parse: jest.fn().mockReturnValue({
        content: '<p>Content</p>',
        title: 'No Byline Article',
        byline: null,
      }),
    }));

    const result = await fetchArticleContent('https://example.com/article');

    expect(result).not.toBeNull();
    expect(result!.byline).toBeNull();
  });
});
