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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const mode = searchParams.get('mode') ?? 'chronological'
  const tag = searchParams.get('tag') ?? null
  const cursor = searchParams.get('cursor') ?? null
  const limitParam = parseInt(searchParams.get('limit') ?? '20', 10)
  const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 50)

  const supabase = await getServerClient()

  let query = supabase
    .from('articles')
    .select(`
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
    `)
    .eq('is_duplicate', false)

  if (cursor) {
    query = query.lt('published_at', cursor)
  }

  if (mode === 'chronological') {
    // Fetch limit+1 to detect whether there is a next page
    query = query.order('published_at', { ascending: false }).limit(limit + 1)
  } else {
    // For "foryou": fetch a larger window and sort in JS by the scoring formula
    // We fetch extra rows so pagination still makes sense after JS re-scoring
    query = query.order('published_at', { ascending: false }).limit(200)
  }

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  let rows = (data ?? []) as unknown as ArticleRow[]

  // Filter by tag after join (Supabase JS can't filter on related table columns easily)
  if (tag) {
    rows = rows.filter(
      (row) => row.sources && row.sources.custom_tags.includes(tag)
    )
  }

  let articles
  let nextCursor: string | null = null

  if (mode === 'foryou') {
    const now = Date.now()

    const scored = rows.map((row) => {
      const publishedMs = row.published_at ? new Date(row.published_at).getTime() : now
      const ageInDays = (now - publishedMs) / (1000 * 60 * 60 * 24)
      const clickWeight = row.sources?.click_weight ?? 1
      // Slow recency decay (~3-day half-life) so older articles still compete.
      const recency = Math.exp(-ageInDays * 0.3)
      // Stable per-article jitter (0.7–1.3×) derived from article ID —
      // breaks strict chronological order so the feed feels algorithmic,
      // but stays consistent across page loads (no random flicker).
      const idByte = parseInt(row.id.replace(/-/g, '').slice(-2), 16) // 0–255
      const jitter = 0.7 + (idByte / 255) * 0.6
      const score = clickWeight * recency * jitter
      return { row, score }
    })

    scored.sort((a, b) => b.score - a.score)

    const page = scored.slice(0, limit)
    const hasMore = scored.length > limit

    articles = page.map(({ row }) => toArticleShape(row))
    // Use the published_at of the lowest-scored item in the page as the next cursor
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1].row
      nextCursor = last.published_at ?? null
    }
  } else {
    const hasMore = rows.length > limit
    const page = hasMore ? rows.slice(0, limit) : rows
    articles = page.map(toArticleShape)
    if (hasMore && page.length > 0) {
      const last = page[page.length - 1]
      nextCursor = last.published_at ?? null
    }
  }

  return Response.json({ articles, nextCursor })
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
