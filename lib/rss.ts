import Parser from 'rss-parser';
import { requestFilterHandler } from 'ssrf-req-filter';
import http from 'http';
import https from 'https';

export interface ParsedArticle {
  title: string;
  url: string;
  description: string;
  imageUrl: string | null;
  publishedAt: Date | null;
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Extract an image URL from an RSS feed item.
 * Priority: enclosure → media:content → itunes:image → first <img> in content/description.
 */
function extractImageUrl(item: Parser.Item & Record<string, unknown>): string | null {
  // 1. enclosure (e.g. podcast art, some blogs)
  if (item.enclosure?.url) {
    const url = item.enclosure.url;
    if (/\.(jpe?g|png|gif|webp|avif)/i.test(url)) {
      return url;
    }
  }

  // 2. media:content
  const mediaContent = item['media:content'] as { $?: { url?: string } } | undefined;
  if (mediaContent?.$?.url) {
    return mediaContent.$.url;
  }

  // 3. media:thumbnail
  const mediaThumbnail = item['media:thumbnail'] as { $?: { url?: string } } | undefined;
  if (mediaThumbnail?.$?.url) {
    return mediaThumbnail.$.url;
  }

  // 4. itunes:image
  const itunesImage = item['itunes:image'] as { href?: string } | string | undefined;
  if (typeof itunesImage === 'object' && itunesImage?.href) {
    return itunesImage.href;
  }

  // 5. First <img src="..."> in content or description
  const rawHtml = (item.content ?? item.contentSnippet ?? item.summary ?? '') as string;
  const imgMatch = rawHtml.match(/<img[^>]+src="([^"]+)"/i);
  if (imgMatch?.[1]) {
    return imgMatch[1];
  }

  return null;
}

/**
 * Strip all HTML tags and collapse whitespace.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build custom HTTP/HTTPS agents that enforce SSRF protection.
 * ssrf-req-filter wraps the built-in agents so that connections to private IPs
 * and localhost are rejected at socket level.
 */
function buildSsrfAgents(): { httpAgent: http.Agent; httpsAgent: https.Agent } {
  return {
    httpAgent: requestFilterHandler(new http.Agent()) as http.Agent,
    httpsAgent: requestFilterHandler(new https.Agent()) as https.Agent,
  };
}

/**
 * Fetch and parse an RSS/Atom feed URL.
 *
 * - Blocks SSRF via ssrf-req-filter (private IPs, localhost).
 * - Times out after 15 seconds.
 * - Returns an empty array on any failure — callers must not throw.
 */
export async function fetchAndParseFeed(url: string): Promise<ParsedArticle[]> {
  try {
    const { httpAgent, httpsAgent } = buildSsrfAgents();

    const parser = new Parser({
      timeout: FETCH_TIMEOUT_MS,
      requestOptions: {
        // Pass SSRF-safe agents so rss-parser uses them for its underlying request
        agent: url.startsWith('https://') ? httpsAgent : httpAgent,
      },
      customFields: {
        item: [
          ['media:content', 'media:content'],
          ['media:thumbnail', 'media:thumbnail'],
          ['itunes:image', 'itunes:image'],
        ],
      },
    });

    const feed = await parser.parseURL(url);

    const articles: ParsedArticle[] = [];

    for (const item of feed.items) {
      const title = (item.title ?? '').trim();
      const link = item.link ?? item.guid ?? '';

      if (!title || !link) continue;

      const rawDescription = item.contentSnippet ?? item.summary ?? item.content ?? '';
      const stripped = stripHtml(rawDescription);
      const description = stripped.length > 500 ? stripped.slice(0, 497) + '…' : stripped;

      const imageUrl = extractImageUrl(item as unknown as Parser.Item & Record<string, unknown>);

      let publishedAt: Date | null = null;
      if (item.pubDate) {
        const d = new Date(item.pubDate);
        if (!isNaN(d.getTime())) publishedAt = d;
      } else if (item.isoDate) {
        const d = new Date(item.isoDate);
        if (!isNaN(d.getTime())) publishedAt = d;
      }

      articles.push({ title, url: link, description, imageUrl, publishedAt });
    }

    return articles;
  } catch {
    // Graceful degradation — cron caller will record the error separately
    return [];
  }
}
