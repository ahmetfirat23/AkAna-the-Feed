import { NextRequest } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase'
import { parseTfidfTerms } from '@/lib/tfidf'

const OPEN_INTEREST_DELTA = 0.2

export async function POST(request: NextRequest) {
  let body: { article_id?: string; source_id?: string }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { article_id, source_id } = body
  if (!article_id || !source_id) {
    return new Response('Bad Request: article_id and source_id are required', { status: 400 })
  }

  const { error } = await serviceRoleClient
    .from('open_events')
    .insert({ article_id, source_id } as unknown as never)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Softly nudge user interest profile toward topics in this article.
  // Fire-and-forget — failure here doesn't fail the open recording.
  void updateUserInterest(article_id)

  return new Response('OK', { status: 200 })
}

async function updateUserInterest(articleId: string) {
  const { data: article } = await serviceRoleClient
    .from('articles')
    .select('tfidf_terms')
    .eq('id', articleId)
    .maybeSingle()

  const tfidfTerms = (article as { tfidf_terms?: string[] } | null)?.tfidf_terms ?? []
  if (tfidfTerms.length === 0) return

  const termsMap = parseTfidfTerms(tfidfTerms)
  const termList = Array.from(termsMap.keys())
  const perTermDelta = OPEN_INTEREST_DELTA / termList.length

  const { data: existing } = await serviceRoleClient
    .from('user_interest')
    .select('term, score')
    .in('term', termList)

  const existingMap = new Map(
    ((existing ?? []) as { term: string; score: number }[]).map(r => [r.term, r.score]),
  )

  const now = new Date().toISOString()
  const upserts = termList.map(term => ({
    term,
    score: (existingMap.get(term) ?? 0) + perTermDelta,
    updated_at: now,
  }))

  await serviceRoleClient
    .from('user_interest')
    .upsert(upserts as unknown as never[], { onConflict: 'term' })
}
