import { DELETE } from '@/app/api/reading-points/[id]/route'

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

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}))

import * as supabaseMod from '@/lib/supabase'
import { getSession } from '@/lib/session'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mocks = (supabaseMod as any).__mocks as {
  eqFn: jest.Mock
  deleteFn: jest.Mock
  fromFn: jest.Mock
}

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ isAdmin: true } as never)
  mocks.eqFn.mockResolvedValue({ error: null })
  mocks.deleteFn.mockReturnValue({ eq: mocks.eqFn })
  mocks.fromFn.mockReturnValue({ delete: mocks.deleteFn })
})

describe('DELETE /api/reading-points/[id]', () => {
  it('deletes reading point and returns 200', async () => {
    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'rp1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.eqFn).toHaveBeenCalledWith('id', 'rp1')
  })

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue({ isAdmin: false } as never)

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'rp1' }),
    })

    expect(response.status).toBe(401)
  })

  it('returns 500 when Supabase errors', async () => {
    mocks.eqFn.mockResolvedValue({ error: { message: 'db error' } })

    const response = await DELETE(new Request('http://localhost'), {
      params: Promise.resolve({ id: 'rp1' }),
    })

    expect(response.status).toBe(500)
  })
})
