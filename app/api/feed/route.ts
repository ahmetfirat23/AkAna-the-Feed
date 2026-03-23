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
const DAY_MS = 1000 * 60 * 60 * 24
const USER_INTEREST_ALPHA = 0.5 // blend weight for user interest signal
const USER_INTEREST_SCALE = 10  // normalises raw dot product to ~[0,1]

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
    // Single query: fetch up to 300 unseen articles from the last 30 days,
    // score them, apply tag-proportional selection and desequencing.
    //
    // Scoring formula:
    //   score = recency × click_weight × (1 + α × user_interest) × jitter / freq_penalty
    //
    // Client sends seen article IDs via ?seen=id1,id2,... so the server
    // excludes them before scoring — no wasted bandwidth on hidden articles.

    const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS).toISOString()

    // Parse client-provided seen IDs and mark them in DB
    const seenParam = searchParams.get('seen') ?? ''
    const clientSeenIds = seenParam ? seenParam.split(',').filter(Boolean) : []

    // Fetch sources, user interest, 7d article counts, and mark seen — all in parallel
    const markSeenPromise = clientSeenIds.length > 0
      ? serviceRoleClient.from('articles').update({ is_seen: true } as never).in('id', clientSeenIds)
      : Promise.resolve()

    const [
      { data: activeSources },
      { data: userInterestRows },
      { data: source7dRows },
    ] = await Promise.all([
      supabase.from('sources').select('id, custom_tags').eq('active', true),
      serviceRoleClient.from('user_interest').select('term, score'),
      supabase
        .from('articles')
        .select('source_id')
        .gte('published_at', new Date(Date.now() - 7 * DAY_MS).toISOString())
        .eq('is_duplicate', false),
      markSeenPromise,
    ])

    const activeSourceRows = (activeSources ?? []) as { id: string; custom_tags: string[] }[]
    const sourceIds = activeSourceRows.map(s => s.id)

    if (sourceIds.length === 0) {
      return Response.json({ articles: [], nextCursor: null })
    }

    // Build tag → source count for proportional tag selection
    const tagSourceCount = new Map<string, number>()
    for (const s of activeSourceRows) {
      for (const tag of s.custom_tags ?? []) {
        tagSourceCount.set(tag, (tagSourceCount.get(tag) ?? 0) + 1)
      }
    }

    // Build user interest map: term → score
    const userInterestMap = new Map<string, number>(
      ((userInterestRows ?? []) as { term: string; score: number }[]).map(r => [r.term, r.score]),
    )

    // Build 7-day article count per source for freq_penalty
    const source7dCount = new Map<string, number>()
    for (const row of (source7dRows ?? []) as { source_id: string }[]) {
      source7dCount.set(row.source_id, (source7dCount.get(row.source_id) ?? 0) + 1)
    }

    // Single articles query — filter unseen via index, cap at 30 days (1 query)
    const { data: articlesRaw } = await supabase
      .from('articles')
      .select(ARTICLE_SELECT)
      .eq('is_duplicate', false)
      .eq('is_seen', false)
      .gte('published_at', thirtyDaysAgo)
      .order('published_at', { ascending: false })
      .limit(300)
    const allRows = (articlesRaw ?? []) as unknown as ArticleRow[]

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
    const selected = tagProportionalSelect(viable, tagSourceCount, sourceIds.length, limit)
    const pageItems = desequence(selected, 2)

    return Response.json({
      articles: pageItems.map(({ row, userInterest }) => toArticleShape(row, userInterest)),
      nextCursor: pageItems.length === limit ? 'more' : null,
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

// Proportionally allocate page slots across tags based on source count per tag.
// Tags with more sources get more slots; every tag gets at least 1 slot.
// Articles not matching any quota-needing tag fill remaining slots in score order.
function tagProportionalSelect<T extends { row: ArticleRow }>(
  items: T[],
  tagSourceCount: Map<string, number>,
  totalSources: number,
  limit: number,
): T[] {
  if (tagSourceCount.size === 0) return items.slice(0, limit)

  // Compute target slots per tag (min 1 each)
  const target = new Map<string, number>()
  for (const [tag, count] of tagSourceCount) {
    target.set(tag, Math.max(1, Math.round((count / totalSources) * limit)))
  }

  const used = new Map<string, number>()
  const result: T[] = []
  const overflow: T[] = []

  for (const item of items) {
    if (result.length >= limit) break
    const tags = item.row.sources?.custom_tags ?? []
    const needsMore = tags.some(t => (used.get(t) ?? 0) < (target.get(t) ?? 0))
    if (needsMore || tags.length === 0) {
      result.push(item)
      for (const t of tags) used.set(t, (used.get(t) ?? 0) + 1)
    } else {
      overflow.push(item)
    }
  }

  // Fill remaining slots with highest-scored overflow
  for (const item of overflow) {
    if (result.length >= limit) break
    result.push(item)
  }

  return result
}

// Reorder items so no source appears more than `maxConsecutive` times in a row.
// Works on the already-scored sorted list — score order is preserved as much as possible.
function desequence<T extends { row: ArticleRow }>(items: T[], maxConsecutive: number): T[] {
  const result: T[] = []
  const pool = [...items]

  while (pool.length > 0) {
    const tail = result.slice(-maxConsecutive)
    const blocked =
      tail.length === maxConsecutive && tail.every(i => i.row.source_id === tail[0].row.source_id)
        ? tail[0].row.source_id
        : null

    if (!blocked) {
      result.push(pool.shift()!)
    } else {
      const idx = pool.findIndex(i => i.row.source_id !== blocked)
      if (idx === -1) {
        result.push(...pool.splice(0)) // only one source left, just append
        break
      }
      result.push(pool.splice(idx, 1)[0])
    }
  }

  return result
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
