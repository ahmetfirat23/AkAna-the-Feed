import { POST } from '@/app/api/auth/logout/route'

const mockDestroy = jest.fn()
const mockSession = { isAdmin: true, destroy: mockDestroy }

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}))

import { getSession } from '@/lib/session'

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(mockSession as never)
})

describe('POST /api/auth/logout', () => {
  it('returns 200 and destroys session', async () => {
    const response = await POST()

    expect(response.status).toBe(200)
    expect(mockDestroy).toHaveBeenCalled()
  })
})
