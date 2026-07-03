import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { ScanPage } from './Scan'

class MockEventSource {
  listeners: Record<string, ((event: { data: string }) => void)[]> = {}
  onerror: (() => void) | null = null

  constructor(public url: string) {
    MockEventSource.instances.push(this)
  }

  static instances: MockEventSource[] = []

  static reset() {
    MockEventSource.instances = []
  }

  addEventListener(event: string, callback: (event: { data: string }) => void) {
    this.listeners[event] ??= []
    this.listeners[event].push(callback)
  }

  removeEventListener() {}

  close() {}

  dispatch(event: string, payload: unknown) {
    for (const listener of this.listeners[event] ?? []) {
      listener({ data: JSON.stringify(payload) })
    }
  }
}

function setFetchResponses(
  responses: Record<string, { ok: boolean; json: () => Promise<unknown> }>
) {
  global.fetch = vi.fn((url: string | URL) => {
    const key = typeof url === 'string' ? url : url.toString()
    const matched = responses[key]

    if (!matched) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({})
      } as Response)
    }

    return Promise.resolve(matched as unknown as Response)
  }) as unknown as typeof fetch
}

function renderScan(options: { autoStart?: boolean } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  const initialEntry = options.autoStart
    ? { pathname: '/scan', state: { autoStart: true } }
    : { pathname: '/scan' }

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ScanPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function scanStreamSource(): MockEventSource {
  const source = MockEventSource.instances.find((instance) =>
    instance.url.includes('/api/scan/stream')
  )

  if (!source) {
    throw new Error('ScanPage did not open an EventSource.')
  }

  return source
}

describe('ScanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    MockEventSource.reset()

    Object.defineProperty(global, 'EventSource', {
      value: MockEventSource,
      writable: true
    })
  })

  it('renders the library scan heading when idle', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () => Promise.resolve([])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: null
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByText('Library scan')).toBeInTheDocument()
    })
  })

  it('shows libraries after fetching', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' },
            { id: 2, name: 'Shows', path: '/media/shows', type: 'shows' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: null
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByText('Movies')).toBeInTheDocument()
      expect(screen.getByText('Shows')).toBeInTheDocument()
    })
  })

  it('shows a Start manual scan button when idle with libraries', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: null
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Start manual scan')
    })
  })

  it('disables the button while a scan is running', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: {
              added: 0,
              endedAt: null,
              errorMessage: null,
              id: 1,
              libraries: [],
              startedAt: new Date().toISOString(),
              status: 'running',
              total: 0,
              updated: 0
            },
            isRunning: true,
            lastJob: null
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeDisabled()
    })
  })

  it('keeps a row complete when SSE events land before the start POST resolves', async () => {
    let resolveStart: (value: unknown) => void = () => {}

    const startPromise = new Promise((resolve) => {
      resolveStart = resolve
    })

    global.fetch = vi.fn((url: string | URL) => {
      const key = typeof url === 'string' ? url : url.toString()

      if (key === '/api/scan/start') {
        return startPromise as Promise<Response>
      }

      if (key === '/api/scan/libraries') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve([
              { id: 1, name: 'Shows', path: 'D:\\Media\\Shows', type: 'shows' }
            ])
        } as unknown as Response)
      }

      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ currentJob: null, isRunning: false, lastJob: null })
      } as unknown as Response)
    }) as unknown as typeof fetch

    renderScan()

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Start manual scan')
    })

    fireEvent.click(screen.getByRole('button'))

    // A fast (e.g. empty-folder) scan finishes entirely while the start POST
    // is still in flight.
    act(() => {
      const source = scanStreamSource()
      source.dispatch('scan-started', { jobId: 1, startedAt: '2026-07-03T12:00:00.000Z' })
      source.dispatch('library-start', { index: 0, libraryId: 1, name: 'Shows', type: 'shows' })
      source.dispatch('library-complete', { added: 3, index: 0, libraryId: 1, total: 3, updated: 0 })
      source.dispatch('scan-complete', { added: 3, errorMessage: null, found: 3, status: 'done', updated: 0 })
    })

    await act(async () => {
      resolveStart({
        ok: true,
        json: () => Promise.resolve({ status: 'started' })
      })
      await startPromise
    })

    // The regression: the post-await reset used to clobber the completed row
    // back to a permanent "Waiting".
    await waitFor(() => {
      expect(screen.getByText(/3 files/)).toBeInTheDocument()
      expect(screen.queryByText('Waiting')).not.toBeInTheDocument()
      expect(screen.queryByText('Not scanned yet')).not.toBeInTheDocument()
    })
  })

  it('reconciles rows with the last finished job instead of showing Waiting', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' },
            { id: 2, name: 'Shows', path: '/media/shows', type: 'shows' },
            { id: 3, name: 'Anime', path: '/media/anime', type: 'shows' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: {
              added: 5,
              endedAt: '2026-07-03T12:05:00.000Z',
              errorMessage: null,
              id: 4,
              libraries: [
                {
                  added: 5,
                  error: null,
                  libraryId: 1,
                  name: 'Movies',
                  status: 'complete',
                  total: 8,
                  updated: 3
                },
                {
                  added: 0,
                  error: "Can't read library folder /media/shows",
                  libraryId: 2,
                  name: 'Shows',
                  status: 'error',
                  total: 0,
                  updated: 0
                }
              ],
              startedAt: '2026-07-03T12:00:00.000Z',
              status: 'done',
              total: 8,
              updated: 3
            }
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByText(/8 files/)).toBeInTheDocument()
      expect(
        screen.getByText("Can't read library folder /media/shows")
      ).toBeInTheDocument()
      // The library the job never scanned is the only pending one, and while
      // idle it reads "Not scanned yet" rather than a misleading "Waiting".
      expect(screen.getByText('Not scanned yet')).toBeInTheDocument()
      expect(screen.queryByText('Waiting')).not.toBeInTheDocument()
    })
  })

  it('resets completed rows to Waiting when a new scan starts', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: {
              added: 2,
              endedAt: '2026-07-03T12:05:00.000Z',
              errorMessage: null,
              id: 4,
              libraries: [
                {
                  added: 2,
                  error: null,
                  libraryId: 1,
                  name: 'Movies',
                  status: 'complete',
                  total: 2,
                  updated: 0
                }
              ],
              startedAt: '2026-07-03T12:00:00.000Z',
              status: 'done',
              total: 2,
              updated: 0
            }
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByText(/2 files/)).toBeInTheDocument()
    })

    act(() => {
      scanStreamSource().dispatch('scan-started', {
        jobId: 5,
        startedAt: '2026-07-03T13:00:00.000Z'
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Waiting')).toBeInTheDocument()
      expect(screen.queryByText(/2 files/)).not.toBeInTheDocument()
    })
  })

  it('starts exactly one scan automatically when arriving from setup', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: null
          })
      },
      '/api/scan/start': {
        ok: true,
        json: () => Promise.resolve({ status: 'started' })
      }
    })

    renderScan({ autoStart: true })

    await waitFor(() => {
      const fetchMock = vi.mocked(global.fetch)
      const startCalls = fetchMock.mock.calls.filter(
        ([url]) => typeof url === 'string' && url === '/api/scan/start'
      )

      expect(startCalls).toHaveLength(1)
    })
  })

  it('does not auto-start without the router state flag', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: null
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('Start manual scan')
    })

    const fetchMock = vi.mocked(global.fetch)
    const startCalls = fetchMock.mock.calls.filter(
      ([url]) => typeof url === 'string' && url === '/api/scan/start'
    )

    expect(startCalls).toHaveLength(0)
  })

  it('shows an empty-libraries message when none are configured', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () => Promise.resolve([])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: null
          })
      }
    })

    renderScan()

    await waitFor(() => {
      expect(
        screen.getByText(/No libraries configured/i)
      ).toBeInTheDocument()
    })
  })
})
