import { NextRequest } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase'
import { parseTfidfTerms } from '@/lib/tfidf'

const INTEREST_DELTA: Record<string, number> = {
  like: 1.0,
  dislike: -2.0,
}

export async function POST(request: NextRequest) {
  let body: { article_id?: string; source_id?: string; type?: string }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { article_id, source_id, type = 'like' } = body

  if (!article_id || !source_id) {
    return new Response('Bad Request: article_id and source_id are required', { status: 400 })
  }

  if (type !== 'like' && type !== 'dislike') {
    return new Response('Bad Request: type must be like or dislike', { status: 400 })
  }

  const { error } = await serviceRoleClient
    .from('click_events')
    .insert({ article_id, source_id, type } as unknown as never)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  // Update user interest profile based on the article's TF-IDF terms.
  // Fire-and-forget — a failure here doesn't fail the click recording.
  void updateUserInterest(article_id, INTEREST_DELTA[type] ?? 0)

  return new Response('OK', { status: 200 })
}

async function updateUserInterest(articleId: string, totalDelta: number) {
  if (totalDelta === 0) return

  // Fetch the article's TF-IDF terms
  const { data: article } = await serviceRoleClient
    .from('articles')
    .select('tfidf_terms')
    .eq('id', articleId)
    .maybeSingle()

  const tfidfTerms = (article as { tfidf_terms?: string[] } | null)?.tfidf_terms ?? []
  if (tfidfTerms.length === 0) return

  const termsMap = parseTfidfTerms(tfidfTerms)
  const termList = Array.from(termsMap.keys())
  const perTermDelta = totalDelta / termList.length

  // Fetch existing user_interest scores for these terms
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
