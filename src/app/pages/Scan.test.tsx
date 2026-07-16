import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

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

// The typed api client hands globalThis.fetch an absolute URL, so mock
// matching happens on the request's pathname.
function requestPathname(url: string | URL): string {
  return new URL(url, 'http://localhost:3000').pathname
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status
  })
}

function setFetchResponses(
  responses: Record<string, { ok: boolean; json: () => Promise<unknown> }>
) {
  global.fetch = vi.fn(async (url: string | URL) => {
    const matched = responses[requestPathname(url)]

    if (!matched) {
      return jsonResponse({})
    }

    return jsonResponse(await matched.json(), matched.ok ? 200 : 500)
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

  it('shows a Start scan button when idle with libraries', async () => {
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
      expect(
        screen.getByRole('button', { name: 'Start scan' })
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByRole('button', { name: 'Continue' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Go to Library' })
    ).not.toBeInTheDocument()
  })

  it('shows a disabled Scanning button while a scan is running', async () => {
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
      expect(
        screen.getByRole('button', { name: 'Scanning…' })
      ).toBeDisabled()
    })

    expect(
      screen.queryByRole('button', { name: 'Continue' })
    ).not.toBeInTheDocument()
  })

  it('keeps a row complete when SSE events land before the start POST resolves', async () => {
    let resolveStart: (value: Response) => void = () => {}

    const startPromise = new Promise<Response>((resolve) => {
      resolveStart = resolve
    })

    global.fetch = vi.fn((url: string | URL) => {
      const pathname = requestPathname(url)

      if (pathname === '/api/scan/start') {
        return startPromise
      }

      if (pathname === '/api/scan/libraries') {
        return Promise.resolve(
          jsonResponse([
            { id: 1, name: 'Shows', path: 'D:\\Media\\Shows', type: 'shows' }
          ])
        )
      }

      return Promise.resolve(
        jsonResponse({ currentJob: null, isRunning: false, lastJob: null })
      )
    }) as unknown as typeof fetch

    renderScan()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start scan' })
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start scan' }))

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
      resolveStart(jsonResponse({ status: 'started' }))
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

    // A finished job from an earlier visit keeps the page in the idle phase —
    // completion actions only appear when a scan finishes during this visit.
    expect(
      screen.getByRole('button', { name: 'Start scan' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Go to Library' })
    ).not.toBeInTheDocument()
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
        ([url]) => requestPathname(url as string | URL) === '/api/scan/start'
      )

      expect(startCalls).toHaveLength(1)
    })

    // The onboarding flow ends in the same completed phase as a manual scan.
    act(() => {
      const source = scanStreamSource()
      source.dispatch('scan-started', { jobId: 1, startedAt: '2026-07-03T12:00:00.000Z' })
      source.dispatch('library-start', { index: 0, libraryId: 1, name: 'Movies', type: 'movies' })
      source.dispatch('library-complete', { added: 4, index: 0, libraryId: 1, total: 4, updated: 0 })
      source.dispatch('scan-complete', { added: 4, errorMessage: null, found: 4, status: 'done', updated: 0 })
    })

    await waitFor(() => {
      expect(screen.getByText('Scan complete')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Go to Library' })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Scan again' })
      ).toBeInTheDocument()
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
      expect(
        screen.getByRole('button', { name: 'Start scan' })
      ).toBeInTheDocument()
    })

    const fetchMock = vi.mocked(global.fetch)
    const startCalls = fetchMock.mock.calls.filter(
      ([url]) => requestPathname(url as string | URL) === '/api/scan/start'
    )

    expect(startCalls).toHaveLength(0)
  })

  it('shows No video files found for a completed library with zero files', async () => {
    setFetchResponses({
      '/api/scan/libraries': {
        ok: true,
        json: () =>
          Promise.resolve([
            { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' },
            { id: 2, name: 'Blender', path: 'D:\\Blender', type: 'movies' }
          ])
      },
      '/api/scan/status': {
        ok: true,
        json: () =>
          Promise.resolve({
            currentJob: null,
            isRunning: false,
            lastJob: {
              added: 0,
              endedAt: '2026-07-03T20:17:33.000Z',
              errorMessage: null,
              id: 95,
              libraries: [
                {
                  added: 0,
                  error: null,
                  libraryId: 1,
                  name: 'Movies',
                  status: 'complete',
                  total: 9,
                  updated: 9
                },
                {
                  added: 0,
                  error: null,
                  libraryId: 2,
                  name: 'Blender',
                  status: 'complete',
                  total: 0,
                  updated: 0
                }
              ],
              startedAt: '2026-07-03T20:17:18.000Z',
              status: 'done',
              total: 9,
              updated: 9
            }
          })
      }
    })

    renderScan()

    // The regression: a completed library with zero video files used to
    // render a permanent "Scanning…" even though the scan was long done.
    await waitFor(() => {
      expect(screen.getByText('No video files found')).toBeInTheDocument()
      expect(screen.queryByText('Scanning…')).not.toBeInTheDocument()
    })
  })

  it('shows completion actions and navigates home after a scan finishes', async () => {
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

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    })

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/scan']}>
          <Routes>
            <Route
              element={<ScanPage />}
              path="/scan"
            />
            <Route
              element={<div>Home page</div>}
              path="/"
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start scan' })
      ).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start scan' }))

    act(() => {
      const source = scanStreamSource()
      source.dispatch('scan-started', { jobId: 1, startedAt: '2026-07-03T12:00:00.000Z' })
      source.dispatch('library-start', { index: 0, libraryId: 1, name: 'Movies', type: 'movies' })
      source.dispatch('library-complete', { added: 2, index: 0, libraryId: 1, total: 2, updated: 0 })
      source.dispatch('scan-complete', { added: 2, errorMessage: null, found: 2, status: 'done', updated: 0 })
    })

    await waitFor(() => {
      expect(screen.getByText('Scan complete')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Scan again' })
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Go to Library' }))

    await waitFor(() => {
      expect(screen.getByText('Home page')).toBeInTheDocument()
    })
  })

  it('starts another scan when Scan again is clicked after completion', async () => {
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

    renderScan()

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Start scan' })
      ).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Start scan' }))

    act(() => {
      const source = scanStreamSource()
      source.dispatch('scan-started', { jobId: 1, startedAt: '2026-07-03T12:00:00.000Z' })
      source.dispatch('library-complete', { added: 2, index: 0, libraryId: 1, total: 2, updated: 0 })
      source.dispatch('scan-complete', { added: 2, errorMessage: null, found: 2, status: 'done', updated: 0 })
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Scan again' })
      ).not.toBeDisabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }))

    await waitFor(() => {
      const fetchMock = vi.mocked(global.fetch)
      const startCalls = fetchMock.mock.calls.filter(
        ([url]) => requestPathname(url as string | URL) === '/api/scan/start'
      )

      expect(startCalls).toHaveLength(2)
    })
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

    // Scanning nothing isn't actionable — the message above tells the user
    // to add a library first.
    expect(screen.getByRole('button', { name: 'Start scan' })).toBeDisabled()
  })
})
