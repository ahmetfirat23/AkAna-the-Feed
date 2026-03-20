import { getSession } from '@/lib/session'

export async function POST(request: Request) {
  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { password } = body

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    return new Response('Unauthorized', { status: 401 })
  }

  const session = await getSession()
  session.isAdmin = true
  await session.save()

  return new Response('OK', { status: 200 })
}
