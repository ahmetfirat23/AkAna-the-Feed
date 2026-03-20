# AkAna

A personal, calm content feed. Pull from the websites you care about instead of doomscrolling social media.

**AkAna** (*ak ana* — Turkish for "white mother") is named after the goddess of creative emergence and deity of water. The app reflects that: clean, flowing, purposeful.

---

## What it does

- Aggregates RSS/Atom feeds from sites you choose (games, film, TV, whatever)
- Refreshes automatically every 30 minutes in the background
- **Two feed modes**: "For You" (learns from what you click) and "Chronological" — both deduplicated
- **AI summaries**: each article card shows a 1–2 sentence GPT summary, not a wall of text
- Duplicate stories from different sources are automatically hidden
- **In-app reader**: tap any article to read the full text, clean, no ads — same engine as Firefox Reader Mode
- **Full-text search** across all article titles and descriptions
- **Reading points**: saves your position in the feed (3 autosaves + 5 manual), synced across phone and desktop
- **Bookmarks**: save specific articles to revisit later — never auto-deleted
- **Source health**: admin panel shows which feeds are working and which are broken
- Articles older than 30 days are automatically cleaned up (bookmarked articles kept forever)
- Works on your phone (installable as a PWA) and on desktop via browser
- No engagement metrics, no algorithmic manipulation, no noise

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS + @tailwindcss/typography |
| Database | Supabase (PostgreSQL) |
| RSS parsing | `rss-parser` |
| Article reader | `@mozilla/readability` + `jsdom` |
| AI summaries | OpenAI `gpt-5.4-mini` |
| Auth | `iron-session` |
| Deployment | Vercel + GitHub |
| Cron | Vercel Cron Jobs |

---

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) account (free tier)
- A [Vercel](https://vercel.com) account (free tier)
- An [OpenAI](https://platform.openai.com) API key

---

## Local development

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/akana-feed.git
cd akana-feed
npm install
```

### 2. Set up Supabase

1. Create a new Supabase project
2. Run the schema from `docs/architecture.md#database-schema` in the Supabase SQL editor
3. Copy your project URL and keys from **Project Settings → API**

### 3. Configure environment variables

Create a `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENAI_API_KEY=your-openai-api-key
CRON_SECRET=pick-a-long-random-string
ADMIN_PASSWORD=pick-a-password
SESSION_SECRET=pick-a-random-string-of-at-least-32-characters
```

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

To test the cron job locally:

```bash
curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/refresh
```

---

## Adding RSS feeds

1. Go to `/admin` and log in with your `ADMIN_PASSWORD`
2. Paste an RSS/Atom feed URL and give it a name
3. Assign topic tags (e.g. `Games`, `Film`, `Indie`)
4. Click Add — the feed will be picked up on the next cron run

---

## Deploying to Vercel

1. Push to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Add all env vars in Vercel project settings
4. `vercel.json` configures the cron job automatically

---

## Installing as a PWA

- **iPhone**: Safari → Share → "Add to Home Screen"
- **Android**: Chrome → menu → "Add to Home Screen"

---

## Project structure

```
app/                    Pages and API routes
components/             UI components
hooks/                  React hooks
lib/                    Server-side utilities
docs/
  architecture.md       DB schema, API routes, security, feature specs
  design-system.md      Colors, typography, anti-AI-slop rules
public/
  manifest.json         PWA manifest
```

---

## Design

See `docs/design-system.md`. The anti-AI-slop checklist is there — run it before shipping any component.
