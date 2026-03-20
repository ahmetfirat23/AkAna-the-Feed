import { NextRequest } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase'

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
    .from('click_events')
    .insert({ article_id, source_id } as unknown as never)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return new Response('OK', { status: 200 })
}
