# Architecture

## Data flow

```
User adds RSS source via /admin
        │
        ▼
  sources table (Supabase)
        │
        ▼
Vercel Cron fires every 30 min
        │
        ▼
/api/cron/refresh
  ├── Fetch each active source URL
  ├── Parse RSS with rss-parser
  ├── Sanitize HTML descriptions (DOMPurify)
  ├── Filter out links already in DB
  ├── Deduplicate: skip if similar title exists (pg_trgm similarity > 0.8)
  ├── Generate GPT summary if description is long/missing
  └── Upsert new articles into articles table
        │
        ▼
  articles table (Supabase)
        │
        ▼
User clicks "Read →"  →  POST /api/clicks  →  click_events table
        │
        (click counts roll up into source scores nightly)
        ▼
/api/feed?cursor=...&tag=...&mode=foryou|chronological
  ├── JOIN articles + sources
  ├── Filter by source.custom_tags if tag param present
  ├── Deduplicate: exclude articles flagged as duplicates
  ├── Chronological: ORDER BY published_at DESC
  └── For You: ORDER BY score DESC (recency decay × source click weight)
        │
        ▼
FeedScroller (client)
  ├── Two tabs: "For You" / "Chronological"
  ├── IntersectionObserver detects bottom sentinel → fetch next page
  └── useReadingPoints hook tracks scroll position
```

---

## Database schema

Run this in the Supabase SQL editor to set up the database.

```sql
-- RSS feed sources
create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  custom_tags text[] default '{}',   -- e.g. '{Games,Indie}'
  active boolean default true,
  last_fetched_at timestamptz,        -- rate-limit cron; show last fetch time in admin
  last_error text,                    -- last fetch error message (null = healthy)
  consecutive_errors int default 0,   -- health indicator: 3+ = flag as broken in admin
  created_at timestamptz default now()
);

-- Fetched articles cached from RSS feeds
create table articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  title text not null,
  description text,                   -- sanitized HTML snippet from RSS
  summary text,                       -- GPT-generated 1-2 sentence summary (shown in card)
  content text,                       -- full parsed article HTML from @mozilla/readability (lazy, populated on first read)
  content_fetched_at timestamptz,     -- null = not yet fetched; populated when user first opens article
  link text not null unique,          -- original article URL (dedup key)
  published_at timestamptz,
  image_url text,                     -- og:image or media:thumbnail from RSS
  is_duplicate boolean default false, -- flagged by pg_trgm dedup check; hidden from feed
  search_vector tsvector,             -- full-text search index (auto-updated via trigger)
  fetched_at timestamptz default now()
);

-- Click tracking for implicit source weighting
create table click_events (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  source_id uuid not null references sources(id) on delete cascade,
  clicked_at timestamptz default now()
);

create index on click_events (source_id, clicked_at desc);

-- Indexes
create index on articles (published_at desc);
create index on articles (source_id);
create index on sources using gin (custom_tags);
create index on articles using gin (search_vector);  -- full-text search

-- Auto-update search_vector when title or description changes
create function articles_search_vector_update() returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'B');
  return new;
end;
$$ language plpgsql;

create trigger articles_search_vector_trigger
before insert or update on articles
for each row execute function articles_search_vector_update();

-- Reading points (synced across devices)
create table reading_points (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('auto', 'manual')),
  article_id uuid not null references articles(id) on delete cascade,
  article_title text not null,         -- denormalized for display without a join
  label text not null,                 -- "Auto — Mar 19, 9:14pm" or user-set name
  saved_at timestamptz default now()
);

-- Only keep last 3 autosaves and last 5 manual saves (enforced in API)
create index on reading_points (type, saved_at desc);

-- Bookmarks (saved articles to read later)
create table bookmarks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references articles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (article_id)
);

-- Row Level Security
alter table sources enable row level security;
alter table articles enable row level security;
alter table reading_points enable row level security;
alter table bookmarks enable row level security;

-- Allow public read (personal app, protected at route level not row level)
create policy "public read sources" on sources for select using (true);
create policy "public read articles" on articles for select using (true);
create policy "public read reading_points" on reading_points for select using (true);
create policy "public read bookmarks" on bookmarks for select using (true);

-- Only service role can write (all mutations go through server-side API routes)
-- Service role bypasses RLS by default — no insert policy needed for anon
```

---

## API routes

### `GET /api/feed`

Returns paginated articles, newest first.

**Query params:**
| Param | Type | Description |
|---|---|---|
| `cursor` | ISO timestamp string | Return articles older than this timestamp |
| `tag` | string | Filter by source tag (e.g. `Games`) |
| `limit` | number | Items per page (default: 20, max: 50) |

**Response:**
```json
{
  "articles": [
    {
      "id": "uuid",
      "title": "Article title",
      "description": "Sanitized HTML snippet",
      "link": "https://...",
      "published_at": "2026-03-19T21:00:00Z",
      "image_url": "https://...",
      "source": {
        "name": "Rock Paper Shotgun",
        "tags": ["Games", "Indie"]
      }
    }
  ],
  "nextCursor": "2026-03-19T18:00:00Z"  // null if no more pages
}
```

---

### `GET /api/sources`

Returns all sources. Requires admin cookie.

### `POST /api/sources`

Adds a new source. Requires admin cookie.

**Body:**
```json
{
  "name": "Rock Paper Shotgun",
  "url": "https://feeds.feedburner.com/RockPaperShotgun",
  "tags": ["Games", "Indie"]
}
```

**Validation:**
- `url` must be `http://` or `https://` — rejects `javascript:`, `data:`, file paths
- `url` must not already exist in the sources table

### `DELETE /api/sources/:id`

Deletes a source and all its articles (cascade). Requires admin cookie.

---

### `GET /api/reader/[id]`

Fetches and parses the full article for the in-app reader. Content is cached in the DB so the URL is only fetched once.

**Flow:**
1. Look up `articles` row by `id`
2. If `content` is already populated → return it immediately (cache hit)
3. If `content` is null → fetch `article.link` server-side, parse with `@mozilla/readability` + `jsdom`, sanitize output with `DOMPurify`, store in `articles.content` + `content_fetched_at`, return result

**Response:**
```json
{
  "title": "Full article headline",
  "byline": "Author name (if available)",
  "content": "<p>Clean article HTML...</p>",
  "heroImage": "https://...",
  "siteName": "Rock Paper Shotgun",
  "link": "https://original-url..."
}
```

**Libraries:**
- `@mozilla/readability` — article extraction (same as Firefox Reader Mode)
- `jsdom` — DOM environment required by readability to parse HTML
- `isomorphic-dompurify` — sanitize the extracted HTML before storing/rendering

**Allowed HTML tags in content** (DOMPurify allowlist):
`p`, `h1`–`h3`, `br`, `b`, `i`, `em`, `strong`, `a`, `ul`, `ol`, `li`, `blockquote`, `img`, `figure`, `figcaption`, `pre`, `code`

Strip: `script`, `style`, `iframe`, `form`, `input`, anything with `on*` event attributes.

**Failure handling:**
- Network error or non-200 → return `{ error: "Could not fetch article" }` with 502
- Readability fails to extract content (JS-heavy site) → return `{ error: "Could not parse article — try opening the original" }` with 422
- In both cases the reader page shows an error state with an "Open original site →" button

---

### `POST /api/cron/refresh`

Fetches all active RSS sources and stores new articles. Called by Vercel Cron.

**Auth:** `Authorization: Bearer CRON_SECRET` header required. Returns `401` otherwise.

**Rate limiting:** Checks `sources.last_fetched_at` — if any source was fetched less than 25 minutes ago, skips it. Prevents hammering if cron fires unexpectedly.

**Process per source:**
1. Fetch RSS URL with `rss-parser`
2. For each item: extract title, description, link, pubDate, image
3. Sanitize description HTML
4. `INSERT INTO articles ... ON CONFLICT (link) DO NOTHING`
5. Update `sources.last_fetched_at`

---

## Security model

### Auth guard — all mutation routes

The admin login sets a **signed `iron-session` cookie** (httpOnly, Secure, SameSite=Lax). Every mutation API route (`POST`/`DELETE`) — sources, reading-points, bookmarks — validates this cookie server-side before touching the DB. Read-only routes (`GET /api/feed`, `GET /api/bookmarks`, `GET /api/reading-points`) are public.

```
Admin logs in at /admin  →  POST /api/auth/login  →  validates ADMIN_PASSWORD
→  iron-session signs + sets httpOnly cookie  →  redirects to /admin

Any mutation route  →  reads cookie  →  verifies signature  →  proceeds or 401
```

`iron-session` is used instead of a plain cookie value because the signature prevents forgery even if someone reads the cookie name.

| Route | Method | Auth required |
|---|---|---|
| `/api/auth/login` | POST | — (validates ADMIN_PASSWORD) |
| `/api/auth/logout` | POST | cookie |
| `/api/feed` | GET | none |
| `/api/sources` | GET | none |
| `/api/sources` | POST | cookie |
| `/api/sources/:id` | DELETE | cookie |
| `/api/cron/refresh` | POST | `Authorization: Bearer CRON_SECRET` |
| `/api/reading-points` | GET | none |
| `/api/reading-points` | POST | cookie |
| `/api/reading-points/:id` | DELETE | cookie |
| `/api/bookmarks` | GET | none |
| `/api/bookmarks` | POST | cookie |
| `/api/bookmarks/:articleId` | DELETE | cookie |

### SSRF protection

When an RSS URL is submitted via `POST /api/sources`, validate it before saving or fetching:

1. Parse the URL — must be `http:` or `https:` scheme only
2. Resolve the hostname — reject if it resolves to:
   - `localhost` / `127.0.0.1` / `::1`
   - Private ranges: `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`
   - Link-local: `169.254.x.x`
3. Reject hostnames that are bare IP addresses (not domain names) — reduces attack surface

Use the `is-ip` + manual range check, or the `ssrf-req-filter` npm package.

### Signed admin cookie

Use `iron-session` (npm: `iron-session`). Config:

```ts
// lib/session.ts
export const sessionOptions = {
  password: process.env.SESSION_SECRET!, // min 32 chars, random string
  cookieName: 'akana_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
  },
}
```

Add `SESSION_SECRET` to env vars (separate from `ADMIN_PASSWORD`).

### Next.js image domains

Article images are loaded from external sources. Lock down which domains Next.js Image will proxy:

```ts
// next.config.js
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '**' },  // allow any HTTPS image source
  ],
}
```

Without this, `<Image>` from external URLs throws at runtime or falls back to an `<img>` tag (bypassing optimization).

### RSS HTML sanitization

All `description` content from RSS is passed through `isomorphic-dompurify` in `lib/sanitize.ts` **before storing in the DB**. Never pass RSS HTML directly to `dangerouslySetInnerHTML`.

Allowed tags: `p`, `br`, `b`, `i`, `em`, `strong`, `a`, `ul`, `ol`, `li`. Strip everything else including `script`, `style`, `iframe`, `img` (images come from the RSS `media:` fields separately).

### CSP headers (set in `next.config.js`)

```
default-src 'self'
script-src 'self'
img-src 'self' data: https:
style-src 'self' 'unsafe-inline'
connect-src 'self' https://*.supabase.co
frame-ancestors 'none'
```

### Updated environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server-only
OPENAI_API_KEY=                # server-only, used for article summaries in cron
CRON_SECRET=                   # protects /api/cron/refresh
ADMIN_PASSWORD=                # checked at login
SESSION_SECRET=                # iron-session signing key (min 32 chars)
```

---

## Reading points system

Reading points are stored in Supabase (`reading_points` table) so they **sync across mobile and desktop**. `localStorage` is used only as a write-through cache to avoid DB calls on every scroll tick.

```typescript
interface ReadingPoint {
  id: string;           // UUID from DB
  type: 'auto' | 'manual';
  articleId: string;    // UUID of the article at that position
  articleTitle: string; // Denormalized for display
  label: string;        // "Auto — Mar 19, 9:14pm" or user-set name
  savedAt: string;      // ISO timestamp
}
```

**Autosave trigger:** `document.addEventListener('visibilitychange', ...)` — fires when tab is hidden or navigated away. Saves the lowest article currently visible in the viewport. Debounced — won't fire more than once per 60 seconds. Maintains max 3; deletes oldest when 4th is added.

**Manual save:** User taps the floating "Save point" button. Saves the top-most article currently in view. Max 5; if at limit, prompt user to remove one first.

**Write-through cache flow:**
1. On save: write to `localStorage` immediately (optimistic), then POST to `/api/reading-points`
2. On load: fetch from `/api/reading-points`, update `localStorage` with fresh DB data

**Resume flow:**
1. User opens `ReadingPointsPanel`
2. Selects a point
3. `FeedScroller` loads articles up to that `published_at` timestamp if not already loaded
4. `scrollIntoView({ behavior: 'smooth' })` on the target article
5. Articles with `published_at` newer than the point's `savedAt` show a "New" dot indicator

### API routes for reading points

- `GET /api/reading-points` — returns all points (3 auto + up to 5 manual), sorted by `saved_at desc`
- `POST /api/reading-points` — creates a new point; enforces limits (deletes oldest auto if > 3)
- `DELETE /api/reading-points/:id` — removes a manual point

---

## Bookmarks

Bookmarks save a **specific article** to revisit later — distinct from reading points which mark a position in the feed's timeline.

- `GET /api/bookmarks` — returns all bookmarked articles (full article data via JOIN), newest first
- `POST /api/bookmarks` — bookmarks an article; body: `{ articleId: string }`; returns 409 if already bookmarked
- `DELETE /api/bookmarks/:articleId` — removes a bookmark

### UI
- Each `ArticleCard` has a bookmark toggle button (bookmark icon, top-right of card)
- Filled icon = bookmarked; outline = not bookmarked
- Optimistic UI: toggle immediately, sync to DB in background
- Dedicated `/bookmarks` page: same card layout as main feed, but no infinite scroll (load all)

---

## In-app reader

Tapping an article card navigates to `/article/[id]` — a clean, full-text reading view inside AkAna. No ads, no popups, no site chrome.

### How it works

```
User taps card
      ↓
Navigate to /article/[id]  (Next.js page)
      ↓
Server calls GET /api/reader/[id]
      ↓
  articles.content already cached?
  ├── YES → return immediately
  └── NO  → fetch article.link (raw HTML)
              ↓
            @mozilla/readability + jsdom
            extracts: title, byline, body HTML, hero image
              ↓
            DOMPurify sanitizes extracted HTML
              ↓
            Store in articles.content + content_fetched_at
              ↓
            Return to client
      ↓
Render clean article in AkAna typography
```

### Content caching

Article content is fetched **lazily** — only when a user first opens that article. It is then cached in `articles.content` forever (or until the article is deleted by the 30-day retention job). On subsequent opens the cached version is served instantly.

This means:
- No cron overhead — content fetching only happens when needed
- Fast repeat reads
- Bookmarked articles get their content cached and kept indefinitely

### Page layout (`/article/[id]`)

```
┌─────────────────────────────────┐
│ ← Back          [★] [Open ↗]   │  ← sticky header
├─────────────────────────────────┤
│                                 │
│  [Hero image — full width]      │
│                                 │
│  Source · Author · Time ago     │  ← text-xs, text-secondary
│                                 │
│  Full article headline          │  ← text-xl, font-semibold
│                                 │
│  Article body text renders      │
│  here with clean typography.    │
│  Paragraphs, headings, lists,   │
│  blockquotes all styled.        │
│                                 │
│  [Inline images preserved]      │
│                                 │
│  More article text...           │
│                                 │
└─────────────────────────────────┘
```

- `← Back` returns to feed at the correct scroll position (browser history, no scroll loss)
- `[★]` bookmark toggle (same as card bookmark button)
- `[Open ↗]` opens original URL in browser tab — always available as escape hatch
- Max content width: `max-w-[680px] mx-auto` — slightly wider than feed for comfortable reading
- Body text: `text-[17px] leading-[1.7]` — optimised for reading, not scanning
- Dark mode fully supported

### What gets preserved vs stripped

| Preserved | Stripped |
|---|---|
| Paragraphs, headings | Navigation bars |
| Article images (inline) | Ads (`<div class="ad-...">`) |
| Blockquotes | Sidebars |
| Code blocks | Cookie banners |
| Ordered/unordered lists | Comment sections |
| Author byline | Social share buttons |
| Figcaptions | Newsletter signup modals |

### Caveats

- **Paywalled articles** — only the publicly visible portion is returned (same as what an anonymous visitor sees)
- **JS-rendered sites** — `jsdom` does not execute JavaScript; sites that render content via client-side JS may return empty or incomplete content. Most editorial game/film sites (RPS, Kotaku, IndieWire, Variety) are server-rendered and work correctly
- **Failure state** — if parsing fails, the reader page shows the GPT summary + an "Open original site →" button so the user is never stranded

---

## Feed modes

The main feed has two tabs:

| Tab | Behaviour |
|---|---|
| **For You** | Articles scored by recency decay × source click weight, newest-first within score bands |
| **Chronological** | Strict `published_at DESC` — pure timeline |

Both tabs apply duplicate filtering (`is_duplicate = false`). The active tab is persisted in `localStorage` as `akana_feed_mode`.

**API:** `GET /api/feed?mode=foryou` or `?mode=chronological` (default: `foryou`)

---

## Scoring algorithm ("For You")

Entirely computed in SQL — no external API, no extra cost.

```sql
-- For You score formula
score =
  exp(-extract(epoch from (now() - published_at)) / 86400.0)  -- recency decay (24h half-life)
  *
  (1 + coalesce(source_score.click_weight, 0) * 2)             -- source boost: 1x → 3x
```

**Recency decay:** exponential decay with a 24-hour half-life. An article 6 hours old scores ~0.78; one 48 hours old scores ~0.14. Keeps the feed feeling fresh without hiding older good content entirely.

**Source click weight:** computed from the `click_events` table.

```sql
-- click_weight per source (recomputed in cron run)
select
  source_id,
  count(*) filter (where clicked_at > now() - interval '30 days')::float
    / nullif(max(count(*)) over (), 0)  -- normalize 0→1
  as click_weight
from click_events
group by source_id
```

The result is cached back onto `sources.click_weight float default 0` (updated each cron run — not per click to avoid write contention).

**Click tracking:** `POST /api/clicks` — called client-side when user taps "Read →". Body: `{ articleId, sourceId }`. No auth required (personal app, trust the client).

---

## Duplicate detection

Uses PostgreSQL `pg_trgm` extension (free, built into Supabase).

**At fetch time** (in `/api/cron/refresh`): for each new article, check if any existing article from a *different source* has a title with similarity > `0.8`:

```sql
select id from articles
where source_id != $sourceId
  and published_at > now() - interval '48 hours'  -- only compare recent articles
  and similarity(title, $newTitle) > 0.8
limit 1;
```

If a match is found, set `is_duplicate = true` on the incoming article (the later-fetched one). The original article remains visible; duplicates are silently hidden from the feed.

**Enable the extension** (once, in Supabase SQL editor):
```sql
create extension if not exists pg_trgm;
create index on articles using gin (title gin_trgm_ops);
```

---

## GPT summaries

During each cron fetch, new articles are summarized using OpenAI's API. The summary is stored in `articles.summary` and displayed in the card instead of the raw description.

**When to generate a summary:**
- RSS `description` is missing → always summarize from `title` alone
- RSS `description` is longer than 400 characters → summarize it
- RSS `description` is ≤ 400 characters → use description as-is (skip GPT call, saves credits)

**Model:** `gpt-5.4-mini` — fast, cheap, adequate for 1–2 sentence summaries.

**Prompt:**
```
Summarize this article in 1-2 short sentences for a news feed card.
Be factual and concise. No fluff, no "In this article...".

Title: {{title}}
Content: {{description}}
```

**Batching:** send up to 20 articles per API call using a single prompt with numbered entries. Parse the numbered response back to match summaries to articles. This reduces API round-trips significantly.

**Cost estimate:** ~100 tokens per article (input + output). At gpt-5.4-mini rates, 50 new articles/day ≈ 5,000 tokens/day — negligible against 2.5M daily credits.

**Fallback:** if the GPT call fails, store `summary = null` and fall back to truncated description in the UI.

---

## Full-text search

PostgreSQL native full-text search — no external service, no extra cost.

**DB:** `articles.search_vector` (tsvector) auto-updated by trigger on insert/update. Title gets weight `A` (higher relevance), description gets weight `B`.

**API:** `GET /api/search?q=indie+game&tag=Games&limit=20`
- Uses `search_vector @@ plainto_tsquery('english', $1)` for matching
- Results ordered by `ts_rank(search_vector, query) DESC`
- Optional `tag` filter same as `/api/feed`
- No cursor pagination — returns top 20 matches

**UI:** Search icon in the header. Tapping opens a search bar that slides in below the header. Debounced 300ms — queries as you type. Results replace the feed view while search is active; clearing the query returns to the feed.

---

## Source health

The cron job tracks feed reliability. On each fetch attempt for a source:

- **Success**: reset `consecutive_errors = 0`, clear `last_error`, update `last_fetched_at`
- **Failure** (network error, invalid XML, non-200 response): increment `consecutive_errors`, set `last_error` to the error message

**Admin UI indicators:**

| State | Condition | Display |
|---|---|---|
| Healthy | `consecutive_errors = 0` | Green dot |
| Warning | `consecutive_errors` 1–2 | Yellow dot + "Last error: [message]" |
| Broken | `consecutive_errors >= 3` | Red dot + "Feed broken — check URL" |
| Never fetched | `last_fetched_at` is null | Grey dot + "Not yet fetched" |

Broken feeds are not automatically disabled — the admin decides whether to fix the URL or delete the source.

---

## Article retention

Articles older than 30 days are automatically deleted by the cron job at the end of each run.

```sql
-- Run at end of /api/cron/refresh
delete from articles
where fetched_at < now() - interval '30 days';
```

**Effect on reading points and bookmarks:**
- `reading_points` reference `article_id` with `on delete cascade` — a reading point whose article was deleted will also be deleted
- `bookmarks` also cascade-delete — **bookmarked articles are exempt from deletion**

To exempt bookmarks, the deletion query becomes:

```sql
delete from articles
where fetched_at < now() - interval '30 days'
  and id not in (select article_id from bookmarks);
```

This means bookmarked articles persist indefinitely in the DB. Acceptable for a personal app.

---

## Initial RSS sources

### Video games
| Source | Tags | URL |
|---|---|---|
| Rock Paper Shotgun | `Games`, `Indie` | `https://feeds.feedburner.com/RockPaperShotgun` |
| Kotaku | `Games` | `https://kotaku.com/rss` |
| Eurogamer | `Games`, `Reviews` | `https://www.eurogamer.net/feed` |
| PC Gamer | `Games` | `https://www.pcgamer.com/rss/` |
| Game Developer | `Games`, `Indie`, `Dev` | `https://www.gamedeveloper.com/rss.xml` |

### Movies & TV
| Source | Tags | URL |
|---|---|---|
| IndieWire | `Film`, `Indie` | `https://www.indiewire.com/feed/` |
| Variety | `Film`, `TV` | `https://variety.com/feed/` |
| Roger Ebert | `Film`, `Reviews` | `https://www.rogerebert.com/feed` |
| Collider | `Film`, `TV` | `https://collider.com/feed/` |
| AV Club | `Film`, `TV`, `Culture` | `https://www.avclub.com/rss` |

> Seed these via the `/admin` page after deploying. Eurogamer's feed URL is unverified (server blocks crawlers) — test manually.
