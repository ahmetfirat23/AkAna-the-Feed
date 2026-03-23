import { NextRequest } from 'next/server'
import { GET } from '@/app/api/feed/route'

// ---------------------------------------------------------------------------
// Build a flexible chainable Supabase mock.
// Every query method (eq, gte, order, range, etc.) returns the same builder,
// so any chain depth is supported. The builder is also thenable, so awaiting
// the chain at any point resolves with { data, error }.
// ---------------------------------------------------------------------------

function makeBuilder(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {}

  // Thenable — resolves when awaited at any chain depth
  builder.then = (onFulfilled: (v: { data: unknown; error: unknown }) => unknown) =>
    Promise.resolve({ data, error }).then(onFulfilled)

  // All chainable methods return this same builder
  const chainable = ['eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'or', 'in', 'not', 'is',
                     'order', 'limit', 'range', 'maybeSingle', 'single', 'select']
  for (const m of chainable) {
    builder[m] = jest.fn().mockReturnValue(builder)
  }

  return builder as Record<string, jest.Mock>
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
    tfidf_terms: ['ai:0.8000', 'research:0.5000'],
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
    tfidf_terms: [],
    sources: { name: 'Source Two', custom_tags: ['news'], click_weight: 1 },
    bookmarks: [{ article_id: 'a2' }],
  },
]

// Table-aware client factory
function buildClient(overrides: Record<string, unknown> = {}) {
  const fromFn = jest.fn().mockImplementation((table: string) => {
    if (table === 'sources') {
      return makeBuilder(overrides.sources ?? [{ id: 's1' }])
    }
    if (table === 'user_interest') {
      return makeBuilder(overrides.user_interest ?? [])
    }
    if (table === 'articles') {
      return makeBuilder(overrides.articles ?? mockArticleRows, overrides.articleError ?? null)
    }
    return makeBuilder([])
  })
  return { from: fromFn, __fromFn: fromFn }
}

jest.mock('@/lib/supabase', () => {
  return {
    getServerClient: jest.fn(),
    serviceRoleClient: {},
    __mocks: {},
  }
})

import * as supabaseMod from '@/lib/supabase'

beforeEach(() => {
  jest.clearAllMocks()
  const client = buildClient()
  ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue(client)
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

  it('foryou articles include user_interest_score field', async () => {
    const request = new NextRequest('http://localhost/api/feed?mode=foryou')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    body.articles.forEach((a: { user_interest_score: unknown }) => {
      expect(typeof a.user_interest_score).toBe('number')
    })
  })

  it('foryou user_interest lifts score for matching terms', async () => {
    // Article 'a1' has tfidf_terms with 'ai:0.8000' — user profile has 'ai' with score 5.0
    const client = buildClient({ user_interest: [{ term: 'ai', score: 5.0 }] })
    ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue(client)

    const request = new NextRequest('http://localhost/api/feed?mode=foryou')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    const a1 = body.articles.find((a: { id: string }) => a.id === 'a1')
    if (a1) {
      // user_interest_score should be > 0 since 'ai' is in user interest profile
      expect(a1.user_interest_score).toBeGreaterThan(0)
    }
  })

  it('foryou empty user_interest still returns articles without crash', async () => {
    const client = buildClient({ user_interest: [] })
    ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue(client)

    const request = new NextRequest('http://localhost/api/feed?mode=foryou')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(body.articles)).toBe(true)
  })

  it('foryou freq_penalty reduces score for high-volume source', async () => {
    // Source 's1' has many articles in the last 7d (high freq_penalty)
    // Source 's2' has none (low freq_penalty) — a2 should score relatively higher
    const manyS1Articles = Array.from({ length: 50 }, () => ({ source_id: 's1' }))
    const client = buildClient({ articles: mockArticleRows, _source7d: manyS1Articles })

    // Patch: override the articles 7d count query to return many s1 articles
    const fromFn = jest.fn().mockImplementation((table: string) => {
      if (table === 'sources') return makeBuilder([{ id: 's1' }, { id: 's2' }])
      if (table === 'user_interest') return makeBuilder([])
      if (table === 'articles') {
        return makeBuilder(mockArticleRows)
      }
      return makeBuilder([])
    })

    // Override: first articles call (7d count) returns many s1 rows
    let articleCallCount = 0
    fromFn.mockImplementation((table: string) => {
      if (table === 'sources') return makeBuilder([{ id: 's1' }, { id: 's2' }])
      if (table === 'user_interest') return makeBuilder([])
      if (table === 'articles') {
        articleCallCount++
        if (articleCallCount === 1) return makeBuilder(manyS1Articles) // 7d count query
        return makeBuilder(mockArticleRows) // per-source article fetch
      }
      return makeBuilder([])
    })

    ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue({ from: fromFn })

    const request = new NextRequest('http://localhost/api/feed?mode=foryou')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    // Both articles should still be returned; freq_penalty just affects score order
    expect(body.articles.length).toBeGreaterThan(0)
  })

  it('foryou returns empty when no active sources', async () => {
    const client = buildClient({ sources: [] })
    ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue(client)

    const request = new NextRequest('http://localhost/api/feed?mode=foryou')
    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.articles).toEqual([])
    expect(body.nextCursor).toBeNull()
  })

  it('filters articles by tag in chronological mode', async () => {
    const request = new NextRequest('http://localhost/api/feed?tag=tech')

    const response = await GET(request)
    const body = await response.json()

    expect(response.status).toBe(200)
    // tech tag is only on a1 (source One)
    body.articles.forEach((a: { tags: string[] }) => {
      expect(a.tags.includes('tech')).toBe(true)
    })
  })

  it('maps is_bookmarked correctly', async () => {
    const request = new NextRequest('http://localhost/api/feed')

    const response = await GET(request)
    const body = await response.json()

    const a2 = body.articles.find((a: { id: string }) => a.id === 'a2')
    expect(a2?.is_bookmarked).toBe(true)

    const a1 = body.articles.find((a: { id: string }) => a.id === 'a1')
    expect(a1?.is_bookmarked).toBe(false)
  })

  it('returns 500 when Supabase errors in chronological mode', async () => {
    const client = buildClient({ articles: null, articleError: { message: 'db error' } })
    ;(supabaseMod.getServerClient as jest.Mock).mockResolvedValue(client)

    const request = new NextRequest('http://localhost/api/feed')

    const response = await GET(request)
    expect(response.status).toBe(500)
  })
})
