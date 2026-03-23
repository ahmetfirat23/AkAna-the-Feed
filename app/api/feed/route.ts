import { NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase'

interface ArticleRow {
  id: string
  title: string
  link: string
  description: string | null
  summary: string | null
  image_url: string | null
  published_at: string | null
  source_id: string
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
  sources ( name, custom_tags, click_weight ),
  bookmarks ( article_id )
`

// foryou tuning constants
const PER_SOURCE_LIMIT = 15 // articles fetched per source
const SOURCE_CAP = 3        // max articles per source in a single scored page
const DAY_MS = 1000 * 60 * 60 * 24

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
    // Cursor is a numeric page offset (not a published_at timestamp).
    // This lets us serve stable, scored pages without re-querying from scratch.
    const offset = cursor ? Math.max(0, parseInt(cursor, 10) || 0) : 0

    // Fetch all active source IDs
    const { data: activeSources } = await supabase
      .from('sources')
      .select('id')
      .eq('active', true)

    const sourceIds = ((activeSources ?? []) as { id: string }[]).map(s => s.id)

    if (sourceIds.length === 0) {
      return Response.json({ articles: [], nextCursor: null })
    }

    // Fetch PER_SOURCE_LIMIT most recent articles from every source in parallel.
    // This guarantees all sources — including slow publishers like The Gradient —
    // are represented in the scoring pool, regardless of global publish volume.
    const perSourceResults = await Promise.all(
      sourceIds.map(sourceId =>
        supabase
          .from('articles')
          .select(ARTICLE_SELECT)
          .eq('source_id', sourceId)
          .eq('is_duplicate', false)
          .order('published_at', { ascending: false })
          .limit(PER_SOURCE_LIMIT)
          .then(r => (r.data ?? []) as unknown as ArticleRow[])
      )
    )

    // Merge, deduplicate by id
    const seenIds = new Set<string>()
    const allRows: ArticleRow[] = []
    for (const sourceArticles of perSourceResults) {
      for (const a of sourceArticles) {
        if (!seenIds.has(a.id)) {
          seenIds.add(a.id)
          allRows.push(a)
        }
      }
    }

    // Tag filter (applied in JS — can't filter on joined columns via Supabase SDK)
    const rows = tag
      ? allRows.filter(row => row.sources?.custom_tags.includes(tag))
      : allRows

    if (rows.length === 0) {
      return Response.json({ articles: [], nextCursor: null })
    }

    const now = Date.now()

    // Find each source's newest article age in days.
    // Used below to normalize recency for slow publishers.
    const sourceNewestAge = new Map<string, number>()
    for (const row of rows) {
      const ageDays = row.published_at
        ? (now - new Date(row.published_at).getTime()) / DAY_MS
        : 0
      const current = sourceNewestAge.get(row.source_id) ?? Infinity
      if (ageDays < current) sourceNewestAge.set(row.source_id, ageDays)
    }

    // Score each article.
    // Age normalization: if a source's newest article is older than 7 days
    // (slow publisher), we treat that article as if it were 7 days old so it
    // can still compete with articles from active sources. Older articles within
    // the same slow source decay normally from that baseline.
    const scored = rows.map(row => {
      const publishedMs = row.published_at ? new Date(row.published_at).getTime() : now
      const ageInDays = (now - publishedMs) / DAY_MS
      const clickWeight = row.sources?.click_weight ?? 1

      const newestAgeDays = sourceNewestAge.get(row.source_id) ?? ageInDays
      const normalizedAge = newestAgeDays <= 7
        ? ageInDays
        : 7 + (ageInDays - newestAgeDays)

      const recency = Math.exp(-Math.max(0, normalizedAge) * 0.3)
      const idByte = parseInt(row.id.replace(/-/g, '').slice(-2), 16) // 0–255
      const jitter = 0.7 + (idByte / 255) * 0.6
      const score = clickWeight * recency * jitter
      return { row, score }
    })

    scored.sort((a, b) => b.score - a.score)

    // Per-source diversity cap: no single source takes more than SOURCE_CAP
    // slots in the *first* portion of the feed, so high-volume sources can't
    // crowd out every slot on page 1–2.
    // Articles scoring below 0.01 are dropped (stale, no signal).
    // After the capped pool is exhausted, the remaining scored articles follow
    // (no cap) so the feed keeps going rather than hitting "end of feed" early.
    const sourceCounts = new Map<string, number>()
    const diversified: typeof scored = []
    const diversifiedIds = new Set<string>()

    for (const item of scored) {
      if (item.score < 0.01) continue
      const count = sourceCounts.get(item.row.source_id) ?? 0
      if (count < SOURCE_CAP) {
        diversified.push(item)
        diversifiedIds.add(item.row.id)
        sourceCounts.set(item.row.source_id, count + 1)
      }
    }

    // Overflow: scored articles that didn't make the cap, in score order
    const overflow = scored.filter(item => item.score >= 0.01 && !diversifiedIds.has(item.row.id))
    const fullPool = [...diversified, ...overflow]

    const page = fullPool.slice(offset, offset + limit)
    const hasMore = offset + limit < fullPool.length

    return Response.json({
      articles: page.map(({ row }) => toArticleShape(row)),
      nextCursor: hasMore ? String(offset + limit) : null,
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
    articles: page.map(toArticleShape),
    nextCursor: hasMore && last
      ? `${last.published_at ?? ''}|${last.id}`
      : null,
  })
}

function toArticleShape(row: ArticleRow) {
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
  }
}
