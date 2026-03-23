import { NextRequest } from 'next/server'
import { POST } from '@/app/api/opens/route'

jest.mock('@/lib/supabase', () => {
  const insertFn = jest.fn().mockResolvedValue({ error: null })
  const upsertFn = jest.fn().mockResolvedValue({ error: null })
  const maybeSingleFn = jest.fn().mockResolvedValue({ data: null, error: null })

  const fromFn = jest.fn().mockImplementation((table: string) => {
    if (table === 'open_events') return { insert: insertFn }
    if (table === 'articles') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ maybeSingle: maybeSingleFn }),
        }),
      }
    }
    if (table === 'user_interest') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
        upsert: upsertFn,
      }
    }
    return { insert: insertFn }
  })

  const client = { from: fromFn }
  return {
    serviceRoleClient: client,
    getServerClient: jest.fn(),
    __mocks: { insertFn, upsertFn, maybeSingleFn, fromFn },
  }
})

import * as supabaseMod from '@/lib/supabase'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  insertFn: jest.Mock
  upsertFn: jest.Mock
  maybeSingleFn: jest.Mock
  fromFn: jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
  mocks.insertFn.mockResolvedValue({ error: null })
  mocks.upsertFn.mockResolvedValue({ error: null })
  mocks.maybeSingleFn.mockResolvedValue({ data: null, error: null })

  mocks.fromFn.mockImplementation((table: string) => {
    if (table === 'open_events') return { insert: mocks.insertFn }
    if (table === 'articles') {
      return {
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({ maybeSingle: mocks.maybeSingleFn }),
        }),
      }
    }
    if (table === 'user_interest') {
      return {
        select: jest.fn().mockReturnValue({
          in: jest.fn().mockResolvedValue({ data: [], error: null }),
        }),
        upsert: mocks.upsertFn,
      }
    }
    return { insert: mocks.insertFn }
  })
})

const flushPromises = () => new Promise(r => setTimeout(r, 10))

describe('POST /api/opens', () => {
  it('records an open event and returns 200', async () => {
    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(mocks.insertFn).toHaveBeenCalledWith({ article_id: 'a1', source_id: 's1' })
  })

  it('returns 400 when article_id is missing', async () => {
    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 400 when source_id is missing', async () => {
    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('returns 500 when Supabase insert errors', async () => {
    mocks.insertFn.mockResolvedValue({ error: { message: 'db error' } })

    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(500)
  })

  it('updates user_interest with +0.2 click weight when article has tfidf_terms', async () => {
    mocks.maybeSingleFn.mockResolvedValue({
      data: { tfidf_terms: ['generative ai:0.9000', 'model:0.5000', 'training:0.3000', 'data:0.2000'] },
      error: null,
    })

    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(request)
    await flushPromises()

    expect(mocks.upsertFn).toHaveBeenCalledTimes(1)
    const upsertArg = mocks.upsertFn.mock.calls[0][0] as { term: string; score: number }[]
    // OPEN_INTEREST_DELTA = 0.2, 4 terms → 0.05 per term
    expect(upsertArg.find(r => r.term === 'generative ai')?.score).toBeCloseTo(0.05)
    expect(upsertArg.find(r => r.term === 'model')?.score).toBeCloseTo(0.05)
  })

  it('does not crash when article has no tfidf_terms', async () => {
    mocks.maybeSingleFn.mockResolvedValue({
      data: { tfidf_terms: [] },
      error: null,
    })

    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    await flushPromises()

    expect(response.status).toBe(200)
    expect(mocks.upsertFn).not.toHaveBeenCalled()
  })

  it('does not crash when article fetch returns null', async () => {
    mocks.maybeSingleFn.mockResolvedValue({ data: null, error: null })

    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    await flushPromises()

    expect(response.status).toBe(200)
    expect(mocks.upsertFn).not.toHaveBeenCalled()
  })

  it('accumulates on top of existing user_interest scores', async () => {
    mocks.maybeSingleFn.mockResolvedValue({
      data: { tfidf_terms: ['apple:0.8000'] },
      error: null,
    })
    // Simulate existing score of 1.5 for 'apple'
    mocks.fromFn.mockImplementation((table: string) => {
      if (table === 'open_events') return { insert: mocks.insertFn }
      if (table === 'articles') {
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({ maybeSingle: mocks.maybeSingleFn }),
          }),
        }
      }
      if (table === 'user_interest') {
        return {
          select: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({ data: [{ term: 'apple', score: 1.5 }], error: null }),
          }),
          upsert: mocks.upsertFn,
        }
      }
      return { insert: mocks.insertFn }
    })

    const request = new NextRequest('http://localhost/api/opens', {
      method: 'POST',
      body: JSON.stringify({ article_id: 'a1', source_id: 's1' }),
      headers: { 'Content-Type': 'application/json' },
    })

    await POST(request)
    await flushPromises()

    const upsertArg = mocks.upsertFn.mock.calls[0][0] as { term: string; score: number }[]
    // 1.5 existing + 0.2/1 = 1.7
    expect(upsertArg.find(r => r.term === 'apple')?.score).toBeCloseTo(1.7)
  })
})
