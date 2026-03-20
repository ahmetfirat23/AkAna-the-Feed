import { getSession } from '@/lib/session'
import { serviceRoleClient } from '@/lib/supabase'
import ssrfFilter from 'ssrf-req-filter'
import http from 'http'
import https from 'https'

async function validateUrl(url: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  return new Promise((resolve) => {
    const agent = ssrfFilter(url)
    const mod = parsed.protocol === 'https:' ? https : http
    const req = mod.request(
      url,
      { method: 'HEAD', agent, timeout: 5000 },
      () => {
        resolve(true)
      }
    )
    req.on('error', () => {
      resolve(false)
    })
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

export async function GET() {
  const { data, error } = await serviceRoleClient
    .from('sources')
    .select('*')
    .order('name', { ascending: true })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return Response.json(data)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session.isAdmin) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { name?: string; url?: string; tags?: string[] }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { name, url, tags } = body

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return new Response(JSON.stringify({ error: 'name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!url || typeof url !== 'string') {
    return new Response(JSON.stringify({ error: 'url is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!Array.isArray(tags)) {
    return new Response(JSON.stringify({ error: 'tags must be an array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const urlSafe = await validateUrl(url)
  if (!urlSafe) {
    return new Response(
      JSON.stringify({ error: 'Invalid or blocked URL' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const { data, error } = await serviceRoleClient
    .from('sources')
    .insert({ name: name.trim(), url, custom_tags: tags } as unknown as never)
    .select()
    .single()

  if (error) {
    // Unique constraint violation on url
    if (error.code === '23505') {
      return new Response(
        JSON.stringify({ error: 'A source with this URL already exists' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify(data), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session.isAdmin) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { id?: string }
  try {
    body = await request.json()
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  const { id } = body

  if (!id || typeof id !== 'string') {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { error } = await serviceRoleClient
    .from('sources')
    .delete()
    .eq('id', id)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response('OK', { status: 200 })
}
