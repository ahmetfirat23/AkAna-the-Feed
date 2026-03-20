// Mock SSRF filter and http/https before importing the route
jest.mock('ssrf-req-filter', () => jest.fn(() => null))
jest.mock('http', () => ({
  request: jest.fn((_url: string, _opts: object, cb: () => void) => {
    cb()
    return { on: jest.fn(), end: jest.fn() }
  }),
}))
jest.mock('https', () => ({
  request: jest.fn((_url: string, _opts: object, cb: () => void) => {
    cb()
    return { on: jest.fn(), end: jest.fn() }
  }),
}))

jest.mock('@/lib/supabase', () => {
  // GET chain: from -> select -> order  (resolves)
  // POST chain: from -> insert -> select -> single  (resolves)
  // DELETE chain: from -> delete -> eq  (resolves)
  const singleFn = jest.fn().mockResolvedValue({
    data: { id: 's1', name: 'Test Source', url: 'https://example.com/feed', custom_tags: ['tech'] },
    error: null,
  })
  const insertSelectFn = jest.fn().mockReturnValue({ single: singleFn })
  const insertFn = jest.fn().mockReturnValue({ select: insertSelectFn })
  const deleteEqFn = jest.fn().mockResolvedValue({ error: null })
  const deleteFn = jest.fn().mockReturnValue({ eq: deleteEqFn })
  const orderFn = jest.fn().mockResolvedValue({ data: [{ id: 's1', name: 'Source One' }], error: null })
  const selectFn = jest.fn().mockReturnValue({ order: orderFn })
  const fromFn = jest.fn().mockReturnValue({
    select: selectFn,
    insert: insertFn,
    delete: deleteFn,
  })
  const client = { from: fromFn }

  return {
    serviceRoleClient: client,
    getServerClient: jest.fn(),
    __mocks: { singleFn, insertSelectFn, insertFn, deleteEqFn, deleteFn, orderFn, selectFn, fromFn },
  }
})

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}))

import { GET, POST, DELETE } from '@/app/api/sources/route'
import * as supabaseMod from '@/lib/supabase'
import { getSession } from '@/lib/session'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  singleFn: jest.Mock
  insertSelectFn: jest.Mock
  insertFn: jest.Mock
  deleteEqFn: jest.Mock
  deleteFn: jest.Mock
  orderFn: jest.Mock
  selectFn: jest.Mock
  fromFn: jest.Mock
}

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ isAdmin: true } as never)

  mocks.singleFn.mockResolvedValue({
    data: { id: 's1', name: 'Test Source', url: 'https://example.com/feed', custom_tags: ['tech'] },
    error: null,
  })
  mocks.insertSelectFn.mockReturnValue({ single: mocks.singleFn })
  mocks.insertFn.mockReturnValue({ select: mocks.insertSelectFn })
  mocks.deleteEqFn.mockResolvedValue({ error: null })
  mocks.deleteFn.mockReturnValue({ eq: mocks.deleteEqFn })
  mocks.orderFn.mockResolvedValue({ data: [{ id: 's1', name: 'Source One' }], error: null })
  mocks.selectFn.mockReturnValue({ order: mocks.orderFn })
  mocks.fromFn.mockReturnValue({
    select: mocks.selectFn,
    insert: mocks.insertFn,
    delete: mocks.deleteFn,
  })
})

describe('GET /api/sources', () => {
  it('returns list of sources', async () => {
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

describe('POST /api/sources', () => {
  it('creates a source and returns 201', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test Source', url: 'https://example.com/feed', tags: ['tech'] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toHaveProperty('id')
  })

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({ isAdmin: false } as never)

    const request = new Request('http://localhost/api/sources', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', url: 'https://example.com/feed', tags: [] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  it('returns 400 when name is missing', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com/feed', tags: [] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 when url is missing', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', tags: [] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 when tags is not an array', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', url: 'https://example.com/feed', tags: 'tech' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })

  it('returns 409 on duplicate URL', async () => {
    mocks.singleFn.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })

    const request = new Request('http://localhost/api/sources', {
      method: 'POST',
      body: JSON.stringify({ name: 'Test', url: 'https://example.com/feed', tags: [] }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
  })
})

describe('DELETE /api/sources', () => {
  it('deletes a source and returns 200', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'DELETE',
      body: JSON.stringify({ id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await DELETE(request)

    expect(response.status).toBe(200)
  })

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({ isAdmin: false } as never)

    const request = new Request('http://localhost/api/sources', {
      method: 'DELETE',
      body: JSON.stringify({ id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await DELETE(request)

    expect(response.status).toBe(401)
  })

  it('returns 400 when id is missing', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'DELETE',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await DELETE(request)

    expect(response.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const request = new Request('http://localhost/api/sources', {
      method: 'DELETE',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await DELETE(request)

    expect(response.status).toBe(400)
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.deleteEqFn.mockResolvedValue({ error: { message: 'db error' } })

    const request = new Request('http://localhost/api/sources', {
      method: 'DELETE',
      body: JSON.stringify({ id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await DELETE(request)

    expect(response.status).toBe(500)
  })
})
