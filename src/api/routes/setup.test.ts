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

vi.mock('../../config', () => ({
  getConfig: vi.fn(),
  saveConfig: vi.fn()
}))

import { setupRoutes } from './setup'
import { getConfig, saveConfig } from '../../config'

async function request(path: string, options?: RequestInit) {
  const response = await setupRoutes.request(path, options)
  const body = await response.json()

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
      vi.mocked(getConfig).mockReturnValue(null)
      mockFrom.mockResolvedValue([])

      const { status, body } = await request('/')

      expect(status).toEqual(200)
      expect(body).toEqual({
        config: null,
        hasApiKey: false,
        libraries: [],
        libraryCount: 0,
        needsSetup: true
      })
    })

    it('returns needsSetup false when libraries exist', async () => {
      vi.mocked(getConfig).mockReturnValue({ tmdbApiKey: 'key' })
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
      expect(body.hasApiKey).toEqual(true)
      expect(body.libraryCount).toEqual(1)
      expect(body.needsSetup).toEqual(false)
      expect(body.config).toEqual({ tmdbApiKey: 'key' })
      expect(body.libraries).toEqual([
        { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
      ])
    })

    it('returns hasApiKey true when config has key', async () => {
      vi.mocked(getConfig).mockReturnValue({ tmdbApiKey: 'my-key' })
      mockFrom.mockResolvedValue([])

      const { body } = await request('/')

      expect(body.hasApiKey).toEqual(true)
    })
  })

  describe('POST /complete', () => {
    it('returns error when tmdbApiKey is missing', async () => {
      const { status, body } = await request('/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraries: [{ name: 'Movies', path: '/movies', type: 'movies' }]
        })
      })

      expect(status).toEqual(400)
      expect(body.error).toEqual({ message: 'TMDB API key is required' })
    })

    it('returns error when libraries are empty', async () => {
      const { status, body } = await request('/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbApiKey: 'key', libraries: [] })
      })

      expect(status).toEqual(400)
      expect(body.error).toEqual({
        message: 'At least one library is required'
      })
    })

    it('saves config and libraries on valid input', async () => {
      const { status, body } = await request('/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tmdbApiKey: 'test-key',
          libraries: [{ name: 'Movies', path: '/media/movies', type: 'movies' }]
        })
      })

      expect(status).toEqual(200)
      expect(body).toEqual({ success: true })
      expect(saveConfig).toHaveBeenCalledWith({ tmdbApiKey: 'test-key' })
    })
  })
})
