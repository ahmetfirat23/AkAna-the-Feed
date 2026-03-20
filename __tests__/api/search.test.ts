import { NextRequest } from 'next/server'
import { GET } from '@/app/api/search/route'

jest.mock('@/lib/supabase', () => {
  const limitFn = jest.fn()
  const eqFn = jest.fn().mockReturnValue({ limit: limitFn })
  const textSearchFn = jest.fn().mockReturnValue({ eq: eqFn })
  const selectFn = jest.fn().mockReturnValue({ textSearch: textSearchFn })
  const fromFn = jest.fn().mockReturnValue({ select: selectFn })
  const client = { from: fromFn }

  return {
    getServerClient: jest.fn().mockResolvedValue(client),
    serviceRoleClient: client,
    __mocks: { limitFn, eqFn, textSearchFn, selectFn, fromFn },
  }
})

import * as supabaseMod from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  limitFn: jest.Mock
  eqFn: jest.Mock
  textSearchFn: jest.Mock
  selectFn: jest.Mock
  fromFn: jest.Mock
}

const mockArticleRows = [
  {
    id: 'a1',
    title: 'Test Article',
    link: 'https://example.com/a1',
    description: 'desc',
    summary: null,
    image_url: null,
    published_at: '2026-03-19T10:00:00Z',
    source_id: 's1',
    sources: { name: 'Source One', custom_tags: ['tech'] },
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  mocks.limitFn.mockResolvedValue({ data: mockArticleRows, error: null })
  mocks.eqFn.mockReturnValue({ limit: mocks.limitFn })
  mocks.textSearchFn.mockReturnValue({ eq: mocks.eqFn })
  mocks.selectFn.mockReturnValue({ textSearch: mocks.textSearchFn })
  mocks.fromFn.mockReturnValue({ select: mocks.selectFn })
  ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue({ from: mocks.fromFn })
})

describe('GET /api/search', () => {
  it('returns articles matching query', async () => {
    const request = new NextRequest('http://localhost/api/search?q=test')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('articles')
    expect(Array.isArray(body.articles)).toBe(true)
    expect(body.articles[0]).toHaveProperty('id', 'a1')
  })

  it('returns empty array when query is blank', async () => {
    const request = new NextRequest('http://localhost/api/search?q=')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.articles).toEqual([])
  })

  it('returns empty array when q param is absent', async () => {
    const request = new NextRequest('http://localhost/api/search')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.articles).toEqual([])
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.limitFn.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const request = new NextRequest('http://localhost/api/search?q=test')

    const response = await GET(request)

    expect(response.status).toBe(500)
  })

  it('maps source_name and tags from joined sources', async () => {
    const request = new NextRequest('http://localhost/api/search?q=test')

    const response = await GET(request)
    const body = await response.json()

    expect(body.articles[0]).toHaveProperty('source_name', 'Source One')
    expect(body.articles[0].tags).toContain('tech')
  })
})
