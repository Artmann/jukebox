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

vi.mock('../../services/scan-manager', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/scan-manager')>()

  return {
    parseLibraryResults: actual.parseLibraryResults,
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
          libraryResults: null,
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
        libraries: [],
        startedAt: '2025-01-01T12:00:00.000Z',
        status: 'done',
        total: 10,
        updated: 1
      })
    })

    it('parses per-library results from the job row', async () => {
      const libraryResult = {
        added: 2,
        error: null,
        libraryId: 1,
        name: 'Movies',
        status: 'complete',
        total: 3,
        updated: 1
      }

      mockGetStatus.mockResolvedValue({
        currentJob: null,
        isRunning: false,
        lastJob: {
          added: 2,
          endedAt: new Date('2025-01-01T12:05:00Z'),
          errorMessage: null,
          id: 8,
          libraryResults: JSON.stringify([libraryResult]),
          startedAt: new Date('2025-01-01T12:00:00Z'),
          status: 'done',
          total: 3,
          updated: 1
        }
      })

      const response = await scanRoutes.request('/status')
      const body = (await response.json()) as {
        lastJob: { libraries: unknown[] }
      }

      expect(response.status).toEqual(200)
      expect(body.lastJob.libraries).toEqual([libraryResult])
    })
  })

  describe('GET /stream', () => {
    it('forwards job-started as a scan-started SSE event', async () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const mockOn = vi.mocked(scanManager.on)

      const response = await scanRoutes.request('/stream')
      const reader = response.body?.getReader()

      expect(reader).toBeDefined()

      if (!reader) {
        return
      }

      const decoder = new TextDecoder()

      // First chunk is the 'ready' heartbeat — by then all listeners are
      // registered on the scan manager.
      const first = await reader.read()

      expect(decoder.decode(first.value)).toContain('event: ready')

      const jobStartedCall = mockOn.mock.calls.find(
        ([event]) => event === 'job-started'
      )

      expect(jobStartedCall).toBeDefined()

      const listener = jobStartedCall?.[1]
      listener?.({ jobId: 42, startedAt: new Date('2025-01-01T12:00:00Z') })

      const second = await reader.read()
      const payload = decoder.decode(second.value)

      expect(payload).toContain('event: scan-started')
      expect(payload).toContain('"jobId":42')
      expect(payload).toContain('"startedAt":"2025-01-01T12:00:00.000Z"')

      await reader.cancel()
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
