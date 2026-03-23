# Feed Algorithm

This document describes how articles are selected and ranked in AkAna's two feed modes.
Update it before changing the ranking logic in `app/api/feed/route.ts`.

---

## Chronological mode

**Goal:** Show every article in the database, newest first, with no ranking or filtering beyond recency.

**Implementation** (`app/api/feed/route.ts` — chronological branch):
1. Query all non-duplicate articles, ordered by `(published_at DESC, id DESC)`.
2. Apply keyset pagination via a composite cursor `"published_at|id"` to avoid skipping articles that share the same timestamp.
3. Filter by tag in JS after the join (Supabase SDK can't filter on related-table columns).
4. Return 20 articles per page.

**Notable properties:**
- No score, no engagement signal. Pure date order.
- High-volume sources naturally dominate because they publish more.
- Scroll position persisted to `localStorage` (`akana_chrono_last`) and restored on back-navigation.

---

## For You mode

**Goal:** Surface articles the user is likely to care about, balanced across topics and sources, without burying slow publishers or over-representing high-volume ones.

### Step 0 — Seen article exclusion (client → server)

Before scoring, the client sends its seen article IDs with the request:

```
GET /api/feed?mode=foryou&seen=id1,id2,...
```

The client caps the list at 150 IDs (most recent). The server excludes these from the query entirely, so articles the user has already scrolled past never consume bandwidth or scoring budget.

Seen IDs are tracked client-side in `localStorage` (`akana_seen`) via `hooks/useSeenArticles.ts`. An article is marked seen when it enters the viewport (50% visible), not when it's fetched.

### Step 1 — Candidate pool (single query)

A single Supabase query fetches up to **300 unseen articles from the last 30 days**, ordered by `published_at DESC`:

```sql
SELECT ... FROM articles
WHERE is_duplicate = false
  AND published_at >= now() - interval '30 days'
  AND id NOT IN (<seen_ids>)
ORDER BY published_at DESC
LIMIT 300
```

This runs in parallel with two metadata queries:
- `user_interest` — all term→score rows for the user's keyword interest profile
- `articles` (7-day counts per source) — used for frequency penalty

### Step 2 — Scoring

Each article is scored:

```
score = recency × clickWeight × (1 + α × userInterest) × jitter / freqPenalty
```

**`recency`** (slow-publisher normalized age decay):
```
normalizedAge = ageInDays                         if source's newest article ≤ 7 days old
              = 7 + (ageInDays - sourceNewestAge)  if source's newest article > 7 days old

recency = exp(−max(0, normalizedAge) × 0.3)
```

If a source's newest article is 33 days old, it's scored *as if* 7 days old — preventing slow publishers from being permanently buried by the recency penalty.

**`clickWeight`** (`sources.click_weight`):
Updated each cron run as `1.0 + log(1 + likes_in_7d) × 0.4`.
Log-scale caps the boost: 49 likes → `2.46×` (was `5.9×` with linear formula, which caused source domination).

**`userInterest`** (TF-IDF keyword profile, normalized 0–1):
```
dot   = Σ (article_term_score × user_term_score)  for each term in article.tfidf_terms
userInterest = min(1.0, dot / 10)
```
Article TF-IDF terms are computed at cron time and stored in `articles.tfidf_terms`.
User interest scores are updated via `user_interest` table:
- Like → `+1.0 / term_count` per term
- Dislike → `-2.0 / term_count` per term
- Article open → `+0.2 / term_count` per term
- Scores decay by `0.95^days_since_updated` each cron run; rows below 0.001 are deleted.

`α = 0.5` blend weight (constant).

**`jitter`** (random per-load variety):
```
jitter = 0.7 + Math.random() × 0.6   → range [0.7, 1.3]
```
Generated fresh each request so the feed order varies on every reload.

**`freqPenalty`** (dampens high-volume sources):
```
freqPenalty = max(1, log(1 + source_7d_article_count))
```
A source posting 50 articles/week is penalized by `log(51) ≈ 3.9×`; a source posting 2/week by `log(3) ≈ 1.1×`.

Articles scoring below `0.01` are discarded (stale content, no signal).

### Step 3 — Tag-proportional selection

After sorting by score, slots are allocated **proportionally to the number of sources per tag**:

```
target_slots[tag] = max(1, round((sources_with_tag / total_sources) × limit))
```

Example: 4 TV sources + 1 AI source → TV gets ~16 slots, AI gets ~4 slots out of 20.

The algorithm iterates the sorted list in order, accepting each article if its tag still has quota remaining. Articles that overflow their tag quota are held and fill any remaining slots after the quota pass.

### Step 4 — Desequencing

After tag selection, a final pass ensures **no source appears more than 2 times consecutively**:

- Walk the sorted list; if the last 2 items are from the same source, skip ahead to the next different-source article.
- Score order is preserved as much as possible — only the minimum displacement needed.

### Step 5 — Pagination

The cursor is a simple string `"more"` when the current page is full (20 articles), or `null` at end of feed. The client passes `?seen=` on every request so the server always works from a fresh unseen pool — there is no offset.

**End of feed** is reached when fewer than 20 unseen articles remain in the 30-day window.

---

## Seen article persistence (`hooks/useSeenArticles.ts`)

Articles are tracked in `localStorage` as `Record<articleId, sessionId[]>`.

A **session ID** is a random UUID generated once per page load (module-level variable). Each browser tab load is a new session — articles accumulate session counts over multiple visits.

Hide thresholds scale with `user_interest_score`:

| Score range | Hide after N other sessions |
|---|---|
| > 0.6 | 3 sessions (high-value, keep re-showing) |
| 0.2 – 0.6 | 2 sessions (default) |
| ≤ 0.2 | 1 session (low-interest, discard fast) |

The current session's views never cause hiding. Chronological mode ignores seen status entirely.

---

## Duplicate detection (cron)

During RSS fetch (`app/api/cron/refresh/route.ts`), each new article is compared against the 100 most recent non-duplicate articles from *other* sources in the last 48 h.

Similarity uses `contentSimilarity()`:
1. Compute token overlap on titles (lowercase, punctuation stripped, stop words removed).
2. If title similarity is 0.15–0.30 and both articles have summaries, blend in summary similarity: `0.7 × title_sim + 0.3 × summary_sim`.
3. If combined similarity > 0.3 → `is_duplicate = true`.

---

## TF-IDF extraction (cron)

For each new article, `lib/tfidf.ts` tokenizes `title + summary/description` into unigrams and bigrams (stop words excluded). Top-15 terms by TF-IDF score are stored in `articles.tfidf_terms` as `"term:score"` strings.

Global document frequencies are maintained in `tfidf_stats(term, doc_freq)` and updated each cron run.
