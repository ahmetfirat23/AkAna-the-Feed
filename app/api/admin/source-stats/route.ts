import { getSession } from '@/lib/session'
import { serviceRoleClient } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session.isAdmin) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data, error } = await serviceRoleClient
    .from('click_events')
    .select('source_id, type')

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const likeMap: Record<string, number> = {}
  const dislikeMap: Record<string, number> = {}

  for (const row of data ?? []) {
    const sid = row.source_id as string
    if (row.type === 'like') {
      likeMap[sid] = (likeMap[sid] ?? 0) + 1
    } else if (row.type === 'dislike') {
      dislikeMap[sid] = (dislikeMap[sid] ?? 0) + 1
    }
  }

  const allIds = new Set([...Object.keys(likeMap), ...Object.keys(dislikeMap)])
  const stats = Array.from(allIds).map((id) => ({
    source_id: id,
    like_count: likeMap[id] ?? 0,
    dislike_count: dislikeMap[id] ?? 0,
  }))

  return Response.json(stats)
}
