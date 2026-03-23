import { getSession } from '@/lib/session'
import { serviceRoleClient } from '@/lib/supabase'

export async function GET() {
  const session = await getSession()
  if (!session.isAdmin) {
    return new Response('Unauthorized', { status: 401 })
  }

  const [clicksRes, viewsRes, opensRes] = await Promise.all([
    serviceRoleClient.from('click_events').select('source_id, type'),
    serviceRoleClient.from('view_events').select('source_id'),
    serviceRoleClient.from('open_events').select('source_id'),
  ])

  const likeMap: Record<string, number> = {}
  const dislikeMap: Record<string, number> = {}
  const viewMap: Record<string, number> = {}
  const openMap: Record<string, number> = {}

  for (const row of clicksRes.data ?? []) {
    const sid = row.source_id as string
    if (row.type === 'like') likeMap[sid] = (likeMap[sid] ?? 0) + 1
    else if (row.type === 'dislike') dislikeMap[sid] = (dislikeMap[sid] ?? 0) + 1
  }

  for (const row of viewsRes.data ?? []) {
    const sid = row.source_id as string
    viewMap[sid] = (viewMap[sid] ?? 0) + 1
  }

  for (const row of opensRes.data ?? []) {
    const sid = row.source_id as string
    openMap[sid] = (openMap[sid] ?? 0) + 1
  }

  const allIds = new Set([
    ...Object.keys(likeMap),
    ...Object.keys(dislikeMap),
    ...Object.keys(viewMap),
    ...Object.keys(openMap),
  ])

  const stats = Array.from(allIds).map((id) => ({
    source_id: id,
    like_count: likeMap[id] ?? 0,
    dislike_count: dislikeMap[id] ?? 0,
    view_count: viewMap[id] ?? 0,
    open_count: openMap[id] ?? 0,
  }))

  return Response.json(stats)
}
