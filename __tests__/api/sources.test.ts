import { GET, POST, DELETE } from '@/app/api/sources/route'

// Mock SSRF filter to always allow in tests
jest.mock('ssrf-req-filter', () => jest.fn(() => null))
// Mock http/https so validateUrl resolves true without network calls
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

const mockSingle = jest.fn().mockResolvedValue({
  data: { id: 's1', name: 'Test Source', url: 'https://example.com/feed', custom_tags: ['tech'] },
  error: null,
})
const mockSelect = jest.fn().mockReturnValue({ single: mockSingle })
const mockInsert = jest.fn().mockReturnValue({ select: mockSelect })
const mockDeleteEq = jest.fn().mockResolvedValue({ error: null })
const mockDelete = jest.fn().mockReturnValue({ eq: mockDeleteEq })
const mockOrder = jest.fn().mockResolvedValue({
  data: [{ id: 's1', name: 'Source One' }],
  error: null,
})
const mockGetSelect = jest.fn().mockReturnValue({ order: mockOrder })
const mockEq = jest.fn().mockReturnValue({ order: mockOrder })
const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
  serviceRoleClient: { from: mockFrom },
  getServerClient: jest.fn(),
}))

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}))

import { getSession } from '@/lib/session'
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>

beforeEach(() => {
  jest.clearAllMocks()
  // Default: authenticated admin
  mockGetSession.mockResolvedValue({ isAdmin: true } as never)

  mockFrom.mockImplementation((table: string) => {
    if (table === 'sources') {
      return {
        select: mockGetSelect,
        insert: mockInsert,
        delete: mockDelete,
        eq: mockEq,
      }
    }
    return { select: mockGetSelect, insert: mockInsert, delete: mockDelete, eq: mockEq }
  })

  // Reset sub-mocks
  mockOrder.mockResolvedValue({ data: [{ id: 's1', name: 'Source One' }], error: null })
  mockGetSelect.mockReturnValue({ order: mockOrder })
  mockInsert.mockReturnValue({ select: mockSelect })
  mockSelect.mockReturnValue({ single: mockSingle })
  mockSingle.mockResolvedValue({
    data: { id: 's1', name: 'Test Source', url: 'https://example.com/feed', custom_tags: ['tech'] },
    error: null,
  })
  mockDeleteEq.mockResolvedValue({ error: null })
  mockDelete.mockReturnValue({ eq: mockDeleteEq })
})

describe('GET /api/sources', () => {
  it('returns list of sources', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(body)).toBe(true)
  })

  it('returns 500 when Supabase errors', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'db error' } })

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
    mockSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } })

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
    mockDeleteEq.mockResolvedValue({ error: { message: 'db error' } })

    const request = new Request('http://localhost/api/sources', {
      method: 'DELETE',
      body: JSON.stringify({ id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await DELETE(request)

    expect(response.status).toBe(500)
  })
})
