import { NextRequest } from 'next/server'
import { POST } from '@/app/api/clicks/route'

jest.mock('@/lib/supabase', () => {
  const insertFn = jest.fn().mockResolvedValue({ error: null })
  const fromFn = jest.fn().mockReturnValue({ insert: insertFn })
  const client = { from: fromFn }

  return {
    serviceRoleClient: client,
    getServerClient: jest.fn(),
    __mocks: { insertFn, fromFn },
  }
})

import * as supabaseMod from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  insertFn: jest.Mock
  fromFn: jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
  mocks.insertFn.mockResolvedValue({ error: null })
  mocks.fromFn.mockReturnValue({ insert: mocks.insertFn })
})

describe('POST /api/clicks', () => {
  it('records a click and returns 200', async () => {
    const request = new NextRequest('http://localhost/api/clicks', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.insertFn).toHaveBeenCalledWith({ article_id: 'a1', source_id: 's1' })
  })

  it('returns 400 when article_id is missing', async () => {
    const request = new NextRequest('http://localhost/api/clicks', {
      method: 'POST',
      body: JSON.stringify({ source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 when source_id is missing', async () => {
    const request = new NextRequest('http://localhost/api/clicks', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const request = new NextRequest('http://localhost/api/clicks', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.insertFn.mockResolvedValue({ error: { message: 'db error' } })

    const request = new NextRequest('http://localhost/api/clicks', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
  })
})
