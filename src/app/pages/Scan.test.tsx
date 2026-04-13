import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { ScanPage } from './Scan'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')

  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

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
    if (!this.listeners[event]) {
      this.listeners[event] = []
    }

    this.listeners[event].push(callback)
  }

  close() {}
}

function setFetchMock(response: unknown) {
  global.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch
}

function renderScan() {
  return render(
    <MemoryRouter>
      <ScanPage />
    </MemoryRouter>
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

  it('renders the scanning header', async () => {
    setFetchMock({ ok: true, json: () => Promise.resolve([]) })

    renderScan()

    expect(screen.getByText('Scanning Libraries')).toBeInTheDocument()
  })

  it('shows skeletons while loading libraries', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch

    renderScan()

    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')

    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows libraries after fetching', async () => {
    setFetchMock({
      ok: true,
      json: () => Promise.resolve([
        { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' },
        { id: 2, name: 'Shows', path: '/media/shows', type: 'shows' }
      ])
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByText('Movies')).toBeInTheDocument()
      expect(screen.getByText('Shows')).toBeInTheDocument()
    })
  })

  it('shows pending status for libraries', async () => {
    setFetchMock({
      ok: true,
      json: () => Promise.resolve([
        { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
      ])
    })

    renderScan()

    await waitFor(() => {
      expect(screen.getByText('Waiting...')).toBeInTheDocument()
    })
  })

  it('shows 0 media files found initially', () => {
    setFetchMock({ ok: true, json: () => Promise.resolve([]) })

    renderScan()

    expect(screen.getByText('0 media files found')).toBeInTheDocument()
  })

  it('disables go to library button while scanning', () => {
    setFetchMock({ ok: true, json: () => Promise.resolve([]) })

    renderScan()

    const button = screen.getByText('Go to Library')

    expect(button).toBeDisabled()
  })

  it('shows footer with totals', () => {
    setFetchMock({ ok: true, json: () => Promise.resolve([]) })

    renderScan()

    expect(screen.getByText('0 media files found')).toBeInTheDocument()
    expect(screen.getByText('0 added, 0 updated')).toBeInTheDocument()
  })
})
