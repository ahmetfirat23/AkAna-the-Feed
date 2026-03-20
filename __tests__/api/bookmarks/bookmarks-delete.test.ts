import { DELETE } from '@/app/api/bookmarks/[articleId]/route'

jest.mock('@/lib/supabase', () => {
  const eqFn = jest.fn().mockResolvedValue({ error: null })
  const deleteFn = jest.fn().mockReturnValue({ eq: eqFn })
  const fromFn = jest.fn().mockReturnValue({ delete: deleteFn })
  const client = { from: fromFn }

  return {
    serviceRoleClient: client,
    getServerClient: jest.fn(),
    __mocks: { eqFn, deleteFn, fromFn },
  }
})

import * as supabaseMod from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  eqFn: jest.Mock
  deleteFn: jest.Mock
  fromFn: jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
  mocks.eqFn.mockResolvedValue({ error: null })
  mocks.deleteFn.mockReturnValue({ eq: mocks.eqFn })
  mocks.fromFn.mockReturnValue({ delete: mocks.deleteFn })
})

describe('DELETE /api/bookmarks/[articleId]', () => {
  it('deletes bookmark and returns 200', async () => {
    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ articleId: 'a1' }),
    })

    expect(response.status).toBe(200)
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.eqFn.mockResolvedValue({ error: { message: 'db error' } })

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ articleId: 'a1' }),
    })

    expect(response.status).toBe(500)
  })
})
