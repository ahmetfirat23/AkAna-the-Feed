import { NextRequest } from 'next/server'
import { getServerClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const query = searchParams.get('q') ?? ''
  const limitParam = parseInt(searchParams.get('limit') ?? '20', 10)
  const limit = Math.min(isNaN(limitParam) ? 20 : limitParam, 50)

  if (!query.trim()) {
    return Response.json({ articles: [] })
  }

  const supabase = await getServerClient()

  const { data, error } = await supabase
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
      sources ( name, custom_tags )
    `)
    .textSearch('search_vector', query, { type: 'websearch', config: 'english' })
    .eq('is_duplicate', false)
    .limit(limit)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const articles = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    url: row.link,
    description: row.description,
    summary: row.summary,
    image_url: row.image_url,
    published_at: row.published_at,
    source_id: row.source_id,
    source_name: (row.sources as { name: string; custom_tags: string[] } | null)?.name ?? null,
    tags: (row.sources as { name: string; custom_tags: string[] } | null)?.custom_tags ?? [],
  }))

  return Response.json({ articles })
}
