jest.mock('@/lib/supabase', () => {
  // We need different responses per from() call.
  // Expose a queue so tests can control what each call returns.
  const queue: Array<object> = []

  const fromFn = jest.fn().mockImplementation(() => {
    if (queue.length > 0) return queue.shift()
    // fallback
    return {}
  })

  const client = { from: fromFn }

  return {
    serviceRoleClient: client,
    getServerClient: jest.fn(),
    __mocks: { fromFn, queue },
  }
})

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}))

import { GET, POST } from '@/app/api/reading-points/route'
import * as supabaseMod from '@/lib/supabase'
import { getSession } from '@/lib/session'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  fromFn: jest.Mock
  queue: Array<object>
}

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>

// Helpers that build the right mock shape for each call
function makeGetListChain(data: object[], error: object | null = null) {
  const orderFn = jest.fn().mockResolvedValue({ data, error })
  const selectFn = jest.fn().mockReturnValue({ order: orderFn })
  return { select: selectFn, __orderFn: orderFn }
}

function makeArticleLookupChain(data: object | null, error: object | null = null) {
  const singleFn = jest.fn().mockResolvedValue({ data, error })
  const eqFn = jest.fn().mockReturnValue({ single: singleFn })
  const selectFn = jest.fn().mockReturnValue({ eq: eqFn })
  return { select: selectFn }
}

function makeExistingPointsChain(data: object[], error: object | null = null) {
  const orderFn = jest.fn().mockResolvedValue({ data, error })
  const eqFn = jest.fn().mockReturnValue({ order: orderFn })
  const selectFn = jest.fn().mockReturnValue({ eq: eqFn })
  return { select: selectFn }
}

function makeInsertChain(data: object | null, error: object | null = null) {
  const singleFn = jest.fn().mockResolvedValue({ data, error })
  const selectFn = jest.fn().mockReturnValue({ single: singleFn })
  const insertFn = jest.fn().mockReturnValue({ select: selectFn })
  return { insert: insertFn }
}

function makeDeleteChain(error: object | null = null) {
  const eqFn = jest.fn().mockResolvedValue({ error })
  const deleteFn = jest.fn().mockReturnValue({ eq: eqFn })
  return { delete: deleteFn }
}

beforeEach(() => {
  jest.clearAllMocks()
  mocks.queue.length = 0
  mockGetSession.mockResolvedValue({ isAdmin: true } as never)
})

describe('GET /api/reading-points', () => {
  it('returns reading points list', async () => {
    mocks.queue.push(makeGetListChain([{ id: 'rp1', type: 'manual', article_id: 'a1' }]))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0]).toHaveProperty('id', 'rp1')
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.queue.push(makeGetListChain([], { message: 'db error' }))

    const response = await GET()

    expect(response.status).toBe(500)
  })
})

describe('POST /api/reading-points', () => {
  it('creates a manual reading point and returns 201', async () => {
    // call 1: articles lookup
    mocks.queue.push(makeArticleLookupChain({ title: 'Test Article' }))
    // call 2: existing points query (empty, under limit)
    mocks.queue.push(makeExistingPointsChain([]))
    // call 3: insert
    mocks.queue.push(makeInsertChain({
      id: 'rp1', type: 'manual', article_id: 'a1', article_title: 'Test Article', label: 'Manual',
    }))

    const request = new Request('http://localhost/api/reading-points', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', is_auto: false }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toHaveProperty('article_id', 'a1')
  })

  it('evicts oldest point when at limit before inserting', async () => {
    // 5 existing manual points (MAX_MANUAL = 5)
    const existing = Array.from({ length: 5 }, (_, i) => ({
      id: `rp${i}`,
      saved_at: `2026-03-1${i}T00:00:00Z`,
    }))

    mocks.queue.push(makeArticleLookupChain({ title: 'Test Article' }))
    mocks.queue.push(makeExistingPointsChain(existing))
    // call 3: delete oldest (rp0)
    mocks.queue.push(makeDeleteChain())
    // call 4: insert
    mocks.queue.push(makeInsertChain({
      id: 'rp5', type: 'manual', article_id: 'a2', article_title: 'Test Article', label: 'Manual',
    }))

    const request = new Request('http://localhost/api/reading-points', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a2' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
  })

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({ isAdmin: false } as never)

    const request = new Request('http://localhost/api/reading-points', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  it('returns 400 when article_id is missing', async () => {
    const request = new Request('http://localhost/api/reading-points', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const request = new Request('http://localhost/api/reading-points', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 404 when article is not found', async () => {
    mocks.queue.push(makeArticleLookupChain(null, { message: 'not found' }))

    const request = new Request('http://localhost/api/reading-points', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'nonexistent' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(404)
  })
})
