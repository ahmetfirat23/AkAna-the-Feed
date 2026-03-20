import { GET, POST } from '@/app/api/bookmarks/route'

jest.mock('@/lib/supabase', () => {
  const singleFn = jest.fn().mockResolvedValue({
    data: { id: 'bm1', article_id: 'a1', created_at: '2026-03-19T10:00:00Z' },
    error: null,
  })
  const upsertSelectFn = jest.fn().mockReturnValue({ single: singleFn })
  const upsertFn = jest.fn().mockReturnValue({ select: upsertSelectFn })
  const orderFn = jest.fn().mockResolvedValue({ data: [], error: null })
  const selectFn = jest.fn().mockReturnValue({ order: orderFn })
  const fromFn = jest.fn().mockReturnValue({ select: selectFn, upsert: upsertFn })
  const client = { from: fromFn }

  return {
    serviceRoleClient: client,
    getServerClient: jest.fn(),
    __mocks: { singleFn, upsertSelectFn, upsertFn, orderFn, selectFn, fromFn },
  }
})

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}))

import * as supabaseMod from '@/lib/supabase'
import { getSession } from '@/lib/session'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  singleFn: jest.Mock
  upsertSelectFn: jest.Mock
  upsertFn: jest.Mock
  orderFn: jest.Mock
  selectFn: jest.Mock
  fromFn: jest.Mock
}

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ isAdmin: true } as never)

  mocks.singleFn.mockResolvedValue({
    data: { id: 'bm1', article_id: 'a1', created_at: '2026-03-19T10:00:00Z' },
    error: null,
  })
  mocks.upsertSelectFn.mockReturnValue({ single: mocks.singleFn })
  mocks.upsertFn.mockReturnValue({ select: mocks.upsertSelectFn })
  mocks.orderFn.mockResolvedValue({ data: [], error: null })
  mocks.selectFn.mockReturnValue({ order: mocks.orderFn })
  mocks.fromFn.mockReturnValue({ select: mocks.selectFn, upsert: mocks.upsertFn })
})

describe('GET /api/bookmarks', () => {
  it('returns list of bookmarks', async () => {
    mocks.orderFn.mockResolvedValue({
      data: [{ id: 'bm1', article_id: 'a1', created_at: '2026-03-19T10:00:00Z', articles: {} }],
      error: null,
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.orderFn.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const response = await GET()

    expect(response.status).toBe(500)
  })
})

describe('POST /api/bookmarks', () => {
  it('creates bookmark and returns 201', async () => {
    const request = new Request('http://localhost/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toHaveProperty('article_id', 'a1')
  })

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({ isAdmin: false } as never)

    const request = new Request('http://localhost/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  it('returns 400 when article_id is missing', async () => {
    const request = new Request('http://localhost/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const request = new Request('http://localhost/api/bookmarks', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.singleFn.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const request = new Request('http://localhost/api/bookmarks', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
  })
})
