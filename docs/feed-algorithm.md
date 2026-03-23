# Feed Algorithm

This document describes how articles are selected and ranked in AkAna's two feed modes.
It is intended as a living spec — update it before changing the ranking logic in `app/api/feed/route.ts`.

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
- High-volume sources (Variety, AV Club) naturally dominate the top of the feed because they publish more.
- Slow-publishing sources (The Gradient) appear deep in the feed and require many scroll loads to reach.
- The chronological position is persisted to localStorage so returning to the feed restores your scroll position.

---

## For You mode

**Goal:** Surface articles the user is likely to care about, balanced across all sources, without burying slow publishers or over-representing high-volume ones.

### Step 1 — Per-source article pool

Instead of a global `ORDER BY published_at LIMIT N`, we fetch the **15 most recent articles from each active source in parallel**.

This guarantees every source — including slow publishers that post once a month — is represented in the scoring pool. A global date-ordered limit would exclude them entirely when high-volume sources fill the window.

### Step 2 — Scoring

Each article is scored:

```
score = clickWeight × recency × jitter
```

**`clickWeight`** (`sources.click_weight`):
Updated each cron run as `1.0 + (likes in last 7 days × 0.1)`.
Ranges from 1.0 (never liked) up to ~5–6 for well-liked sources.

**`recency`** (normalised age decay):
```
normalizedAge = ageInDays                         if source's newest article ≤ 7 days old
              = 7 + (ageInDays - sourceNewestAge)  if source's newest article > 7 days old

recency = exp(−normalizedAge × 0.3)
```

The normalization is key for slow publishers: if a source's newest article is 33 days old (e.g. The Gradient), that article is scored *as if* it were 7 days old. Articles older than that within the same source still decay normally from the 7-day baseline. This prevents slow publishers from being permanently buried by the recency penalty.

Without normalization, a 33-day-old article would score `exp(−9.9) ≈ 0.00005` — effectively invisible even with engagement boosts.

**`jitter`** (stable per-article randomness):
```
idByte = last 2 hex digits of article UUID → 0–255
jitter = 0.7 + (idByte / 255) × 0.6        → range 0.7–1.3
```

Derived from the article ID (not random), so the order is stable across page loads and doesn't flicker when the feed is re-rendered. Breaks strict score ties and gives the feed a less mechanical feel.

Articles scoring below `0.01` are discarded (stale content with no engagement signal).

### Step 3 — Source diversity cap

After sorting by score, apply a **max-3-per-source cap**:
- Iterate through the sorted list in order.
- Accept each article only if its source has fewer than 3 articles already accepted.
- Skip (don't discard permanently — they're just not shown this session) if the cap is reached.

This prevents a single high-engagement source from filling every slot on page 1.

### Step 4 — Pagination

The diversified pool (up to `17 sources × 3 = 51 articles` with default settings) is sliced by a numeric offset cursor:
- Page 1: offset 0–19 (`nextCursor = "20"`)
- Page 2: offset 20–39 (`nextCursor = "40"`)
- Page 3: offset 40+ (`nextCursor = null`)

The cursor is a plain integer string, distinct from the ISO-date cursor used in chronological mode.

---

## Duplicate detection (cron, not feed)

During RSS fetch (`app/api/cron/refresh/route.ts`), each new article is checked against the 100 most recent articles from *other* sources published in the last 48 h.

Similarity is computed as word-overlap ratio **after stripping stop words**:

```
tokens(title) = words longer than 1 char, lowercased, with punctuation removed, stop words excluded
similarity    = |tokens(A) ∩ tokens(B)| / max(|tokens(A)|, |tokens(B)|)
```

If `similarity > 0.3`, the article is stored with `is_duplicate = true` and filtered from all feed queries.

Threshold of 0.3 (down from original 0.6) combined with stop-word removal targets genuine cross-post duplicates (same story, different outlets) while allowing different articles about the same topic.

---

## Ideas for future improvements

> Update this section when you want to try something new before implementing it.

### TF-IDF article embeddings + collaborative filtering

**Idea:** Replace or augment the `clickWeight × recency × jitter` scorer with a proper recommendation signal:

1. **Offline (cron):** For each article, compute a TF-IDF vector over its title + description across the corpus. Store the top-N term weights in a new `articles.tfidf_vector` column (sparse, JSON or Postgres array).
2. **User profile:** Maintain a per-user interest vector — the centroid of TF-IDF vectors for articles the user has liked/opened. Store in `user_profiles` table (or accumulate in a Supabase Edge Function).
3. **Online scoring:** At feed request time, compute cosine similarity between the user profile vector and each candidate article vector. Blend with the recency signal: `score = α × cosine_sim + (1−α) × recency`.
4. **Cold start:** For new users (no interaction history), fall back to the current `clickWeight × recency × jitter` scorer.

**Open questions before implementing:**
- How large is the vocabulary? TF-IDF on short RSS titles/descriptions may be noisy.
- Where does the user profile update happen — cron, or edge function on like/click?
- What `α` blending factor feels right? Start at 0.5 and tune.
- Consider BM25 instead of TF-IDF for better IDF normalization on short texts.
- Consider using a lightweight embedding model (e.g. Hugging Face `all-MiniLM-L6-v2`) for semantic similarity instead of token overlap. Could run at cron time, stored as `pgvector` column.

### Source-diversity improvement

Current cap is a hard per-source limit (max 3 per page). A softer approach: penalize score by `1 / (1 + count_already_accepted_from_source)` instead of cutting off at 3. This lets high-quality sources still dominate if their content is genuinely better.

### Seen-article memory

The current `useSeenArticles` hook hides articles seen in 2+ prior sessions, client-side. A server-side seen-article table would enable cross-device deduplication and richer "don't show me this again" signals for the recommender.
