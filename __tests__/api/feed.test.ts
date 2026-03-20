import { NextRequest } from 'next/server'
import { GET } from '@/app/api/feed/route'

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

const mockLimit = jest.fn().mockResolvedValue({ data: mockArticleRows, error: null })
const mockOrder = jest.fn().mockReturnValue({ limit: mockLimit })
const mockEq = jest.fn().mockReturnValue({ order: mockOrder })
const mockSelect = jest.fn().mockReturnValue({ eq: mockEq })
const mockFrom = jest.fn().mockReturnValue({ select: mockSelect })

jest.mock('@/lib/supabase', () => ({
  getServerClient: jest.fn().mockResolvedValue({
    from: mockFrom,
  }),
  serviceRoleClient: {
    from: mockFrom,
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockLimit.mockResolvedValue({ data: mockArticleRows, error: null })
  mockOrder.mockReturnValue({ limit: mockLimit })
  mockEq.mockReturnValue({ order: mockOrder, lt: jest.fn().mockReturnValue({ order: mockOrder }) })
  mockSelect.mockReturnValue({ eq: mockEq })
  mockFrom.mockReturnValue({ select: mockSelect })
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
    mockLimit.mockResolvedValue({ data: rows, error: null })

    const request = new NextRequest('http://localhost/api/feed?tag=tech')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.articles.every((a: { tags: string[] }) => a.tags.includes('tech'))).toBe(true)
  })

  it('maps is_bookmarked correctly', async () => {
    mockLimit.mockResolvedValue({ data: mockArticleRows, error: null })

    const request = new NextRequest('http://localhost/api/feed')

    const response = await GET(request)
    const body = await response.json()

    const a2 = body.articles.find((a: { id: string }) => a.id === 'a2')
    expect(a2?.is_bookmarked).toBe(true)

    const a1 = body.articles.find((a: { id: string }) => a.id === 'a1')
    expect(a1?.is_bookmarked).toBe(false)
  })

  it('returns 500 when Supabase errors', async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: 'db error' } })

    const request = new NextRequest('http://localhost/api/feed')

    const response = await GET(request)

    expect(response.status).toBe(500)
  })
})
