import { POST } from '@/app/api/auth/login/route'

const mockSave = jest.fn()
const mockSession = { isAdmin: false, save: mockSave }

jest.mock('@/lib/session', () => ({
  getSession: jest.fn(),
}))

import { getSession } from '@/lib/session'

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue(mockSession as never)
  process.env.ADMIN_PASSWORD = 'test-admin-password'
})

describe('POST /api/auth/login', () => {
  it('returns 200 and sets isAdmin on correct password', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'test-admin-password' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mockSession.isAdmin).toBe(true)
    expect(mockSave).toHaveBeenCalled()
  })

  it('returns 401 on wrong password', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong-password' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
    expect(mockSave).not.toHaveBeenCalled()
  })

  it('returns 401 when password is missing', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(401)
  })

  it('returns 400 on invalid JSON body', async () => {
    const request = new Request('http://localhost/api/auth/login', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
  })
})
