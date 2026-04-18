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

vi.mock('../../services/scan-manager', () => {
  return {
    scanManager: {
      getStatus: vi.fn(),
      isRunning: vi.fn(),
      off: vi.fn(),
      on: vi.fn(),
      start: vi.fn()
    }
  }
})

import { scanRoutes } from './scan'
import { scanManager } from '../../services/scan-manager'

// eslint-disable-next-line @typescript-eslint/unbound-method
const mockGetStatus = vi.mocked(scanManager.getStatus)
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockIsRunning = vi.mocked(scanManager.isRunning)
// eslint-disable-next-line @typescript-eslint/unbound-method
const mockStart = vi.mocked(scanManager.start)

describe('scan routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockResolvedValue([])
    mockGetStatus.mockResolvedValue({
      currentJob: null,
      isRunning: false,
      lastJob: null
    })
    mockIsRunning.mockReturnValue(false)
  })

  describe('GET /libraries', () => {
    it('returns empty array when no libraries configured', async () => {
      mockFrom.mockResolvedValue([])

      const response = await scanRoutes.request('/libraries')
      const body = (await response.json()) as unknown[]

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
      const body = (await response.json()) as unknown[]

      expect(response.status).toEqual(200)
      expect(body).toEqual([
        { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' },
        { id: 2, name: 'Shows', path: '/media/shows', type: 'shows' }
      ])
    })
  })

  describe('GET /status', () => {
    it('returns null jobs when there has never been a scan', async () => {
      const response = await scanRoutes.request('/status')
      const body = (await response.json()) as unknown

      expect(response.status).toEqual(200)
      expect(body).toEqual({
        currentJob: null,
        isRunning: false,
        lastJob: null
      })
    })

    it('serializes timestamps as ISO strings', async () => {
      mockGetStatus.mockResolvedValue({
        currentJob: null,
        isRunning: false,
        lastJob: {
          added: 3,
          endedAt: new Date('2025-01-01T12:05:00Z'),
          errorMessage: null,
          id: 7,
          startedAt: new Date('2025-01-01T12:00:00Z'),
          status: 'done',
          total: 10,
          updated: 1
        }
      })

      const response = await scanRoutes.request('/status')
      const body = (await response.json()) as {
        currentJob: null
        isRunning: false
        lastJob: { startedAt: string; endedAt: string | null }
      }

      expect(response.status).toEqual(200)
      expect(body.lastJob).toEqual({
        added: 3,
        endedAt: '2025-01-01T12:05:00.000Z',
        errorMessage: null,
        id: 7,
        startedAt: '2025-01-01T12:00:00.000Z',
        status: 'done',
        total: 10,
        updated: 1
      })
    })
  })

  describe('POST /start', () => {
    it('returns 400 when no libraries configured', async () => {
      mockFrom.mockResolvedValue([])

      const response = await scanRoutes.request('/start', { method: 'POST' })
      const body = (await response.json()) as { error: { message: string } }

      expect(response.status).toEqual(400)
      expect(body).toEqual({
        error: {
          message:
            'No libraries configured. Add a library in Settings before scanning.'
        }
      })
      expect(mockStart).not.toHaveBeenCalled()
    })

    it('returns already-running without calling start when a scan is in flight', async () => {
      mockFrom.mockResolvedValue([
        { id: 1, name: 'Movies', path: '/m', type: 'movies' }
      ])
      mockIsRunning.mockReturnValue(true)

      const response = await scanRoutes.request('/start', { method: 'POST' })
      const body = (await response.json()) as { status: string }

      expect(response.status).toEqual(200)
      expect(body).toEqual({ status: 'already-running' })
      expect(mockStart).not.toHaveBeenCalled()
    })

    it('starts a scan when idle with libraries configured', async () => {
      mockFrom.mockResolvedValue([
        { id: 1, name: 'Movies', path: '/m', type: 'movies' }
      ])
      mockIsRunning.mockReturnValue(false)
      mockStart.mockResolvedValue({
        added: 0,
        status: 'done',
        total: 0,
        updated: 0
      })

      const response = await scanRoutes.request('/start', { method: 'POST' })
      const body = (await response.json()) as { status: string }

      expect(response.status).toEqual(200)
      expect(body).toEqual({ status: 'started' })
      expect(mockStart).toHaveBeenCalledTimes(1)
    })
  })
})
