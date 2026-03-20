import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { SsrfFilter } from 'ssrf-req-filter';
import https from 'https';
import http from 'http';
import { sanitizeHtml } from './sanitize';

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; AkAna/1.0)';

export interface ArticleContent {
  content: string;
  title: string;
  byline: string | null;
}

/**
 * Fetch raw HTML from a URL with SSRF protection and a timeout.
 * Returns null on any network or HTTP error.
 */
function fetchHtml(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';

    const ssrfFilter = new SsrfFilter();
    const agent = isHttps ? ssrfFilter.buildHttpsAgent() : ssrfFilter.buildHttpAgent();
    const transport = isHttps ? https : http;

    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      agent,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    };

    const timer = setTimeout(() => {
      req.destroy();
      resolve(null);
    }, FETCH_TIMEOUT_MS);

    const req = transport.request(options, (res) => {
      // Follow a single redirect (3xx)
      if (
        res.statusCode &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        clearTimeout(timer);
        fetchHtml(res.headers.location).then(resolve);
        return;
      }

      if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
        clearTimeout(timer);
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      });
      res.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    });

    req.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });

    req.end();
  });
}

/**
 * Fetch and extract the main readable content from an article URL.
 *
 * - SSRF-safe: rejects private IPs and localhost.
 * - 10 second timeout.
 * - Parsed with @mozilla/readability (same engine as Firefox Reader Mode).
 * - Output is sanitized with DOMPurify via sanitizeHtml.
 * - Returns null if the fetch fails or Readability cannot extract content.
 * - Caching is NOT done here — it happens at the API route level.
 */
export async function fetchArticleContent(url: string): Promise<ArticleContent | null> {
  let html: string | null;

  try {
    html = await fetchHtml(url);
  } catch {
    return null;
  }

  if (!html) return null;

  try {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) return null;

    const sanitized = sanitizeHtml(article.content ?? '');

    return {
      content: sanitized,
      title: article.title ?? '',
      byline: article.byline ?? null,
    };
  } catch {
    return null;
  }
}
