@AGENTS.md

# CLAUDE.md — AkAna

Instructions for Claude Code working on this project. Read this before touching any code.

> ⚠️ **Design rule:** Before shipping any screen or component, run the **Anti-AI-slop smell test** in `docs/design-system.md`. No gradients, no `rounded-lg` on everything, no `hover:scale-105`, no purple/blue accent defaults, no generic microcopy. The full checklist is there.

---

## What this project is

**AkAna** is a personal RSS feed reader with infinite scroll, topic filtering, and a reading points system. It's a PWA deployed on Vercel. See `README.md` for the full overview.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) — check `node_modules/next/dist/docs/` for current API |
| Styling | Tailwind CSS with custom design tokens |
| Database | Supabase (PostgreSQL) |
| RSS parsing | `rss-parser` npm package |
| HTML sanitization | `isomorphic-dompurify` |
| Article reader | `@mozilla/readability` + `jsdom` |
| AI summaries | OpenAI `gpt-5.4-mini` — **this model only, no substitutions** |
| Auth/session | `iron-session` |
| SSRF protection | `ssrf-req-filter` |
| Deployment | Vercel + GitHub auto-deploy |
| Cron | Vercel Cron → `/api/cron/refresh` every 30 min |

---

## Commands

```bash
npm run dev       # local dev at localhost:3000
npm run build     # production build
npm run lint      # ESLint

# Trigger cron manually:
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/refresh
```

---

## Key architectural decisions

### GPT model is gpt-5.4-mini — no substitutions
All OpenAI calls must use `gpt-5.4-mini`. Do not change this to gpt-4o, gpt-4.1-mini, or any other model.

### No AI article tagging
Tags are assigned manually to RSS **sources** in admin. Articles inherit source tags. Do not add per-article AI tagging.

### GPT summaries are intentional
GPT is used for 1–2 sentence summaries only, generated during cron fetch, stored in `articles.summary`. Only called when RSS description is missing or >400 chars. Batched 20 at a time.

### Scoring is pure SQL
"For You" feed scoring = recency decay × source click weight, computed in SQL. No ML, no external API. Click weights updated each cron run from `click_events` table cached on `sources.click_weight`.

### Reading points in Supabase (not just localStorage)
Reading points sync across devices. DB is source of truth; localStorage is write-through cache only.

### Auth via iron-session
Admin login → signed httpOnly cookie. All mutation routes (POST/DELETE) check this cookie. No NextAuth, no OAuth — personal app, plain password auth is intentional.

### SSRF protection on RSS URLs
All submitted RSS URLs must pass `ssrf-req-filter` check — rejects localhost, private IPs, non-http/https schemes.

---

## Security — never skip these

- All mutation routes (POST/DELETE) → validate `iron-session` cookie → 401 if missing
- `/api/cron/refresh` → `Authorization: Bearer CRON_SECRET` → 401 otherwise
- RSS descriptions → always sanitize with `lib/sanitize.ts` before storing or rendering
- RSS URLs → always validate with `ssrf-req-filter` before saving
- `SUPABASE_SERVICE_ROLE_KEY` → server-side only, never in client bundle
- External links → always `rel="noopener noreferrer" target="_blank"`

---

## File map

```
app/page.tsx                               Main feed (For You / Chronological tabs)
app/article/[id]/page.tsx                  In-app reader
app/bookmarks/page.tsx                     Saved articles
app/admin/page.tsx                         Source management
app/layout.tsx                             PWA, dark mode, theme provider
app/api/auth/login/route.ts                POST: set iron-session cookie
app/api/auth/logout/route.ts               POST: clear session
app/api/feed/route.ts                      GET: paginated feed
app/api/sources/route.ts                   GET/POST/DELETE: source management
app/api/cron/refresh/route.ts              POST: fetch RSS, dedup, summarise, store
app/api/reader/[id]/route.ts               GET: fetch + parse article (cached)
app/api/clicks/route.ts                    POST: record click
app/api/search/route.ts                    GET: full-text search
app/api/reading-points/route.ts            GET/POST: reading points
app/api/reading-points/[id]/route.ts       DELETE: manual point
app/api/bookmarks/route.ts                 GET/POST: bookmarks
app/api/bookmarks/[articleId]/route.ts     DELETE: bookmark
components/ArticleCard.tsx                 Feed card
components/FeedScroller.tsx                Infinite scroll + tab switcher
components/TopicFilter.tsx                 Tag chips
components/ReadingPointsPanel.tsx          Slide-in panel
components/BookmarkButton.tsx              Optimistic toggle
components/ReaderContent.tsx               Sanitized article HTML renderer
hooks/useReadingPoints.ts                  DB-synced, localStorage cache
hooks/useBookmarks.ts                      Optimistic UI
hooks/useReaderSettings.ts                 Font size, font family, theme (localStorage)
lib/rss.ts                                 Fetch + parse RSS
lib/sanitize.ts                            DOMPurify wrapper
lib/openai.ts                              Batched GPT summaries (gpt-5.4-mini)
lib/reader.ts                              @mozilla/readability + jsdom
lib/supabase.ts                            Server + browser Supabase clients
lib/session.ts                             iron-session config
```

---

## Design system

Full rulebook in `docs/design-system.md`. Before writing any component:
1. Check the color tokens (never introduce new colours)
2. Check border radius rules (not `rounded-lg` on everything)
3. Run the Anti-AI-slop smell test (bottom of the file)

**Short version:**
- Background: `#F7FAFA` light / `#0B1520` dark
- Accent: `#0A7E8C` teal — used sparingly (active tags, links, focus rings only)
- Font: Inter (UI) / Lora (reader option) — `font-weight: 400` minimum for body
- Mobile feed: Twitter-style full-width with `border-b` dividers, no floating cards
- Desktop: single centered column `max-w-[620px]`
- No gradients, no `hover:scale-105`, no purple/blue defaults, no stock illustrations

## What NOT to do

- Do not use any OpenAI model other than `gpt-5.4-mini`
- Do not add AI article tagging (removed by design)
- Do not use gradients anywhere
- Do not use `rounded-lg` as a default on all elements — check the radius table in design-system.md
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` client-side
- Do not skip `lib/sanitize.ts` before rendering RSS HTML
- Do not skip SSRF check before saving RSS URLs
- Do not skip `iron-session` check on mutation routes
- Do not add multi-column or grid layouts to the feed
- Do not add engagement metrics (likes, shares, view counts)
- Do not use `hover:scale-105` on cards
- Do not add staggered entrance animations on feed items
- Do not write microcopy containing "seamless", "powerful", "intuitive", "next-level"
