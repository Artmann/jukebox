import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('../../database', () => ({
  db: {
    select: vi.fn(() => ({ from: mockFrom }))
  },
  schema: {
    libraries: 'libraries'
  }
}))

vi.mock('../../services/scanner', () => ({
  scanLibrary: vi.fn()
}))

vi.mock('../../services/show-scanner', () => ({
  scanShowLibrary: vi.fn()
}))

import { scanRoutes } from './scan'

describe('scan routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockResolvedValue([])
  })

  describe('GET /libraries', () => {
    it('returns empty array when no libraries configured', async () => {
      mockFrom.mockResolvedValue([])

      const response = await scanRoutes.request('/libraries')
      const body = await response.json()

      expect(response.status).toEqual(200)
      expect(body).toEqual([])
    })

    it('returns libraries with id, name, path, type', async () => {
      mockFrom.mockResolvedValue([
        {
          id: 1,
          name: 'Movies',
          path: '/media/movies',
          type: 'movies',
          createdAt: new Date()
        },
        {
          id: 2,
          name: 'Shows',
          path: '/media/shows',
          type: 'shows',
          createdAt: new Date()
        }
      ])

      const response = await scanRoutes.request('/libraries')
      const body = await response.json()

      expect(response.status).toEqual(200)
      expect(body).toEqual([
        { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' },
        { id: 2, name: 'Shows', path: '/media/shows', type: 'shows' }
      ])
    })
  })

  describe('GET /stream', () => {
    it('returns 400 when no libraries configured', async () => {
      mockFrom.mockResolvedValue([])

      const response = await scanRoutes.request('/stream')
      const body = await response.json()

      expect(response.status).toEqual(400)
      expect(body).toEqual({ error: { message: 'No libraries configured' } })
    })
  })
})
