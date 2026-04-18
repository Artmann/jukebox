import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
const mockValues = vi.fn()

vi.mock('../../database', () => ({
  db: {
    delete: vi.fn(() => Promise.resolve()),
    select: vi.fn(() => ({ from: mockFrom })),
    insert: vi.fn(() => ({ values: mockValues }))
  },
  schema: {
    libraries: 'libraries'
  }
}))

import { setupRoutes } from './setup'

interface SetupStatusResponse {
  libraries: Array<{ id: number; name: string; path: string; type: string }>
  libraryCount: number
  needsSetup: boolean
}

interface ErrorResponse {
  error: { message: string }
}

interface SuccessResponse {
  success: boolean
}

type ResponseBody = SetupStatusResponse & ErrorResponse & SuccessResponse

async function request(path: string, options?: RequestInit) {
  const response = await setupRoutes.request(path, options)
  const body = (await response.json()) as ResponseBody

  return { status: response.status, body }
}

describe('setup routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockResolvedValue([])
    mockValues.mockResolvedValue(undefined)
  })

  describe('GET /', () => {
    it('returns needsSetup true when no libraries', async () => {
      mockFrom.mockResolvedValue([])

      const { status, body } = await request('/')

      expect(status).toEqual(200)
      expect(body).toEqual({
        libraries: [],
        libraryCount: 0,
        needsSetup: true
      })
    })

    it('returns needsSetup false when libraries exist', async () => {
      mockFrom.mockResolvedValue([
        {
          id: 1,
          name: 'Movies',
          path: '/media/movies',
          type: 'movies',
          createdAt: new Date()
        }
      ])

      const { status, body } = await request('/')

      expect(status).toEqual(200)
      expect(body.libraryCount).toEqual(1)
      expect(body.needsSetup).toEqual(false)
      expect(body.libraries).toEqual([
        { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
      ])
    })
  })

  describe('POST /complete', () => {
    it('returns error when libraries are empty', async () => {
      const { status, body } = await request('/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraries: [] })
      })

      expect(status).toEqual(400)
      expect(body.error).toEqual({
        message: 'At least one library is required'
      })
    })

    it('saves libraries on valid input', async () => {
      const { status, body } = await request('/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraries: [{ name: 'Movies', path: '/media/movies', type: 'movies' }]
        })
      })

      expect(status).toEqual(200)
      expect(body).toEqual({ success: true })
    })
  })
})
