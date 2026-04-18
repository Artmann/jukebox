import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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

function renderScan() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ScanPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
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
