import { NextRequest } from 'next/server'
import { GET } from '@/app/api/feed/route'

// Mocks are hoisted — build the mock client inside the factory, then grab a ref after
jest.mock('@/lib/supabase', () => {
  const limitFn = jest.fn()
  const orderFn = jest.fn().mockReturnValue({ limit: limitFn })
  const ltFn = jest.fn().mockReturnValue({ order: orderFn })
  const eqFn = jest.fn().mockReturnValue({ order: orderFn, lt: ltFn })
  const selectFn = jest.fn().mockReturnValue({ eq: eqFn })
  const fromFn = jest.fn().mockReturnValue({ select: selectFn })
  const client = { from: fromFn }

  return {
    getServerClient: jest.fn().mockResolvedValue(client),
    serviceRoleClient: client,
    __mocks: { limitFn, orderFn, eqFn, selectFn, fromFn },
  }
})

import * as supabaseMod from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  limitFn: jest.Mock
  orderFn: jest.Mock
  eqFn: jest.Mock
  selectFn: jest.Mock
  fromFn: jest.Mock
}

const mockArticleRows = [
  {
    id: 'a1',
    title: 'Article One',
    link: 'https://example.com/a1',
    description: 'desc one',
    summary: null,
    image_url: null,
    published_at: '2026-03-19T10:00:00Z',
    source_id: 's1',
    sources: { name: 'Source One', custom_tags: ['tech'], click_weight: 1 },
    bookmarks: [],
  },
  {
    id: 'a2',
    title: 'Article Two',
    link: 'https://example.com/a2',
    description: 'desc two',
    summary: 'summary two',
    image_url: 'https://example.com/img.jpg',
    published_at: '2026-03-18T10:00:00Z',
    source_id: 's2',
    sources: { name: 'Source Two', custom_tags: ['news'], click_weight: 0 },
    bookmarks: [{ article_id: 'a2' }],
  },
]

beforeEach(() => {
  jest.clearAllMocks()
  mocks.limitFn.mockResolvedValue({ data: mockArticleRows, error: null })
  mocks.orderFn.mockReturnValue({ limit: mocks.limitFn })
  mocks.eqFn.mockReturnValue({ order: mocks.orderFn, lt: jest.fn().mockReturnValue({ order: mocks.orderFn }) })
  mocks.selectFn.mockReturnValue({ eq: mocks.eqFn })
  mocks.fromFn.mockReturnValue({ select: mocks.selectFn })
  ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue({ from: mocks.fromFn })
})

describe('GET /api/feed', () => {
  it('returns articles in chronological mode', async () => {
    const request = new NextRequest('http://localhost/api/feed?mode=chronological')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('articles')
    expect(body).toHaveProperty('nextCursor')
    expect(Array.isArray(body.articles)).toBe(true)
  })

  it('returns articles in foryou mode', async () => {
    const request = new NextRequest('http://localhost/api/feed?mode=foryou')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toHaveProperty('articles')
    expect(Array.isArray(body.articles)).toBe(true)
  })

  it('filters articles by tag', async () => {
    const rows = mockArticleRows.filter(r => r.sources.custom_tags.includes('tech'))
    mocks.limitFn.mockResolvedValue({ data: rows, error: null })

    const request = new NextRequest('http://localhost/api/feed?tag=tech')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.articles.every((a: { tags: string[] }) => a.tags.includes('tech'))).toBe(true)
  })

  it('maps is_bookmarked correctly', async () => {
    mocks.limitFn.mockResolvedValue({ data: mockArticleRows, error: null })

    const request = new NextRequest('http://localhost/api/feed')

    const response = await GET(request)
    const body = await response.json()

    const a2 = body.articles.find((a: { id: string }) => a.id === 'a2')
    expect(a2?.is_bookmarked).toBe(true)

    const a1 = body.articles.find((a: { id: string }) => a.id === 'a1')
    expect(a1?.is_bookmarked).toBe(false)
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.limitFn.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const request = new NextRequest('http://localhost/api/feed')

    const response = await GET(request)

    expect(response.status).toBe(500)
  })
})
