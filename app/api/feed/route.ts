import { NextRequest } from 'next/server'
import { getServerClient, serviceRoleClient } from '@/lib/supabase'
import { parseTfidfTerms, computeDotProduct } from '@/lib/tfidf'

interface ArticleRow {
  id: string
  title: string
  link: string
  description: string | null
  summary: string | null
  image_url: string | null
  published_at: string | null
  source_id: string
  tfidf_terms: string[]
  sources: {
    name: string
    custom_tags: string[]
    click_weight: number
  } | null
  bookmarks: { article_id: string }[]
}

const ARTICLE_SELECT = `
  id,
  title,
  link,
  description,
  summary,
  image_url,
  published_at,
  source_id,
  tfidf_terms,
  sources ( name, custom_tags, click_weight ),
  bookmarks ( article_id )
`

// foryou tuning constants
const BATCH_SIZE = 25           // articles fetched per source per page
const DAY_MS = 1000 * 60 * 60 * 24
const USER_INTEREST_ALPHA = 0.5 // blend weight for user interest signal
const USER_INTEREST_SCALE = 10  // normalises raw dot product to ~[0,1]
const P_DISCO_THRESHOLD = 5     // max 7d article count to qualify as "slow source"
const P_DISCO_PROB = 0.25       // probability of revival injection per slow source

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('mode') ?? 'chronological'
  const tag = searchParams.get('tag') ?? null
  const cursor = searchParams.get('cursor') ?? null
  const limitParam = parseInt(searchParams.get('limit') ?? '20', 10)
  const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 50)

  const supabase = await getServerClient()

  if (mode === 'foryou') {
    // ── For You ───────────────────────────────────────────────────────────────
    //
    // Cursor is a page number (0-indexed). Each page fetches the next window of
    // BATCH_SIZE articles per source, scores them, and returns the top `limit`.
    //
    // Scoring formula:
    //   score = recency × click_weight × (1 + α × user_interest) × jitter / freq_penalty
    //
    // Where:
    //   recency      = exp(−normalizedAge × 0.3), slow-publisher normalised
    //   click_weight = 1.0 + (7-day likes × 0.1) per source
    //   user_interest = normalised dot product of article TF-IDF vs user profile
    //   jitter       = deterministic per-article noise [0.7–1.3]
    //   freq_penalty = max(1, log(1 + articles_from_source_in_last_7d))
    //
    // P_disco: slow sources (< P_DISCO_THRESHOLD articles in 7d) get a 25% chance
    // of injecting one extra article from a deeper offset into the scoring pool.
    const pageNum = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0
    const sourceOffset = pageNum * BATCH_SIZE

    // Fetch active source IDs, user interest profile, and 7d article counts in parallel
    const [
      { data: activeSources },
      { data: userInterestRows },
      { data: source7dRows },
    ] = await Promise.all([
      supabase.from('sources').select('id').eq('active', true),
      serviceRoleClient.from('user_interest').select('term, score'),
      supabase
        .from('articles')
        .select('source_id')
        .gte('published_at', new Date(Date.now() - 7 * DAY_MS).toISOString())
        .eq('is_duplicate', false),
    ])

    const sourceIds = ((activeSources ?? []) as { id: string }[]).map(s => s.id)

    if (sourceIds.length === 0) {
      return Response.json({ articles: [], nextCursor: null })
    }

    // Build user interest map: term → score
    const userInterestMap = new Map<string, number>(
      ((userInterestRows ?? []) as { term: string; score: number }[]).map(r => [r.term, r.score]),
    )

    // Build 7-day article count per source for freq_penalty and P_disco detection
    const source7dCount = new Map<string, number>()
    for (const row of (source7dRows ?? []) as { source_id: string }[]) {
      source7dCount.set(row.source_id, (source7dCount.get(row.source_id) ?? 0) + 1)
    }

    // Fetch BATCH_SIZE articles at sourceOffset from every source in parallel.
    const perSourceResults = await Promise.all(
      sourceIds.map(sourceId =>
        supabase
          .from('articles')
          .select(ARTICLE_SELECT)
          .eq('source_id', sourceId)
          .eq('is_duplicate', false)
          .order('published_at', { ascending: false })
          .range(sourceOffset, sourceOffset + BATCH_SIZE - 1)
          .then(r => (r.data ?? []) as unknown as ArticleRow[])
      )
    )

    // P_disco: for slow sources, 25% chance to inject one article from a deeper offset
    const discoFetches = sourceIds
      .filter(sid => {
        const count7d = source7dCount.get(sid) ?? 0
        return count7d < P_DISCO_THRESHOLD && Math.random() < P_DISCO_PROB
      })
      .map(sid =>
        supabase
          .from('articles')
          .select(ARTICLE_SELECT)
          .eq('source_id', sid)
          .eq('is_duplicate', false)
          .order('published_at', { ascending: false })
          // Random deeper offset within the next 3 BATCH windows
          .range(
            sourceOffset + BATCH_SIZE + Math.floor(Math.random() * 3 * BATCH_SIZE),
            sourceOffset + BATCH_SIZE + Math.floor(Math.random() * 3 * BATCH_SIZE),
          )
          .limit(1)
          .then(r => (r.data ?? []) as unknown as ArticleRow[])
      )

    const discoResults = await Promise.all(discoFetches)

    // Merge all results, deduplicate by id
    const seenIds = new Set<string>()
    const allRows: ArticleRow[] = []
    for (const sourceArticles of [...perSourceResults, ...discoResults]) {
      for (const a of sourceArticles) {
        if (!seenIds.has(a.id)) {
          seenIds.add(a.id)
          allRows.push(a)
        }
      }
    }

    // Tag filter
    const rows = tag
      ? allRows.filter(row => row.sources?.custom_tags.includes(tag))
      : allRows

    if (rows.length === 0) {
      return Response.json({ articles: [], nextCursor: null })
    }

    const now = Date.now()

    // Find each source's newest article age for slow-publisher normalization
    const sourceNewestAge = new Map<string, number>()
    for (const row of rows) {
      const ageDays = row.published_at
        ? (now - new Date(row.published_at).getTime()) / DAY_MS
        : 0
      const current = sourceNewestAge.get(row.source_id) ?? Infinity
      if (ageDays < current) sourceNewestAge.set(row.source_id, ageDays)
    }

    // Score each article
    const scored = rows.map(row => {
      const publishedMs = row.published_at ? new Date(row.published_at).getTime() : now
      const ageInDays = (now - publishedMs) / DAY_MS
      const clickWeight = row.sources?.click_weight ?? 1

      // Recency with slow-publisher normalization
      const newestAgeDays = sourceNewestAge.get(row.source_id) ?? ageInDays
      const normalizedAge = newestAgeDays <= 7
        ? ageInDays
        : 7 + (ageInDays - newestAgeDays)
      const recency = Math.exp(-Math.max(0, normalizedAge) * 0.3)

      // Random jitter [0.7–1.3] so feed order varies each load
      const jitter = 0.7 + Math.random() * 0.6

      // User interest: normalised dot product between article TF-IDF and user profile
      const articleTerms = parseTfidfTerms(row.tfidf_terms ?? [])
      const dot = computeDotProduct(articleTerms, userInterestMap)
      const userInterest = Math.min(1.0, dot / USER_INTEREST_SCALE)

      // Frequency penalty: dampens high-volume sources (log scale, min 1)
      const count7d = source7dCount.get(row.source_id) ?? 0
      const freqPenalty = Math.max(1, Math.log(1 + count7d))

      const score = recency * clickWeight * (1 + USER_INTEREST_ALPHA * userInterest) * jitter / freqPenalty

      return { row, score, userInterest }
    })

    scored.sort((a, b) => b.score - a.score)

    // Drop stale articles (score < 0.01)
    const viable = scored.filter(item => item.score >= 0.01)
    const pageItems = viable.slice(0, limit)

    const anySourceHasMore = perSourceResults.some(r => r.length === BATCH_SIZE)

    return Response.json({
      articles: pageItems.map(({ row, userInterest }) => toArticleShape(row, userInterest)),
      nextCursor: anySourceHasMore ? String(pageNum + 1) : null,
    })
  }

  // ── Chronological ──────────────────────────────────────────────────────────
  //
  // Cursor is a composite "published_at|id" string (keyset pagination).
  // Using a composite key prevents articles sharing the same published_at from
  // being silently skipped when the cursor lands on that timestamp.
  // Legacy cursors (bare published_at without |id) are handled gracefully.
  let query = supabase
    .from('articles')
    .select(ARTICLE_SELECT)
    .eq('is_duplicate', false)

  if (cursor) {
    const pipeIdx = cursor.indexOf('|')
    if (pipeIdx !== -1) {
      // Composite cursor: skip rows where (date < cursorDate) OR (date = cursorDate AND id < cursorId)
      const cursorDate = cursor.slice(0, pipeIdx)
      const cursorId = cursor.slice(pipeIdx + 1)
      query = query.or(
        `published_at.lt.${cursorDate},and(published_at.eq.${cursorDate},id.lt.${cursorId})`
      )
    } else {
      // Legacy bare published_at cursor
      query = query.lt('published_at', cursor)
    }
  }

  // Secondary sort on id ensures a stable order when published_at ties exist.
  query = query
    .order('published_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  let rows = (data ?? []) as unknown as ArticleRow[]

  if (tag) {
    rows = rows.filter(row => row.sources?.custom_tags.includes(tag))
  }

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]

  return Response.json({
    articles: page.map(r => toArticleShape(r)),
    nextCursor: hasMore && last
      ? `${last.published_at ?? ''}|${last.id}`
      : null,
  })
}

function toArticleShape(row: ArticleRow, userInterestScore = 0) {
  return {
    id: row.id,
    title: row.title,
    url: row.link,
    description: row.description,
    summary: row.summary,
    image_url: row.image_url,
    published_at: row.published_at,
    source_id: row.source_id,
    source_name: row.sources?.name ?? null,
    tags: row.sources?.custom_tags ?? [],
    is_bookmarked: Array.isArray(row.bookmarks) && row.bookmarks.length > 0,
    user_interest_score: userInterestScore,
  }
}
