import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'

import { SetupPage } from './Setup'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn()
  }
}))

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')

  return {
    ...actual,
    useNavigate: () => mockNavigate
  }
})

function renderSetup() {
  return render(
    <MemoryRouter>
      <SetupPage />
    </MemoryRouter>
  )
}

function mockSetupFetch(
  config: { tmdbApiKey: string } | null = null,
  libraries: unknown[] = []
) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ config, libraries })
  }) as unknown as typeof fetch
}

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSetupFetch()
  })

  it('renders the welcome heading', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Set up your library')).toBeInTheDocument()
    })
  })

  it('renders the media libraries section', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Libraries')).toBeInTheDocument()
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })
  })

  it('renders the metadata section', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Metadata')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('TMDB API key')).toBeInTheDocument()
    })
  })

  it('renders the complete setup button', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Complete Setup')).toBeInTheDocument()
    })
  })

  it('shows toast error when submitting without libraries', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Complete Setup')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Complete Setup'))

    expect(toast.error).toHaveBeenCalledWith('Please add at least one library.')
  })

  it('shows toast error when submitting without api key', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add a folder'))

    const input = screen.getByPlaceholderText('/mnt/media/movies')
    fireEvent.change(input, { target: { value: '/media/movies' } })
    fireEvent.blur(input)

    fireEvent.click(screen.getByText('Complete Setup'))

    expect(toast.error).toHaveBeenCalledWith('Please enter your TMDB API key.')
  })

  it('adds a library row when clicking add a folder', async () => {
    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add a folder'))

    expect(screen.getByPlaceholderText('/mnt/media/movies')).toBeInTheDocument()
  })

  it('pre-populates with existing config', async () => {
    mockSetupFetch({ tmdbApiKey: 'existing-key' }, [
      { id: 1, name: 'Movies', path: '/media/movies', type: 'movies' }
    ])

    renderSetup()

    await waitFor(() => {
      expect(screen.getByDisplayValue('existing-key')).toBeInTheDocument()
      expect(screen.getByText('/media/movies')).toBeInTheDocument()
    })
  })

  it('submits successfully and navigates to scan', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ config: null, libraries: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true })
      })

    global.fetch = mockFetch as unknown as typeof fetch

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    // Add a library
    fireEvent.click(screen.getByText('Add a folder'))

    const pathInput = screen.getByPlaceholderText('/mnt/media/movies')
    fireEvent.change(pathInput, { target: { value: '/media/movies' } })

    // Enter API key
    const apiKeyInput = screen.getByPlaceholderText('TMDB API key')
    fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } })

    // Submit
    fireEvent.click(screen.getByText('Complete Setup'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/setup/complete',
        expect.objectContaining({
          method: 'POST'
        })
      )
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/scan')
    })
  })

  it('shows error on failed submission', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ config: null, libraries: [] })
      })
      .mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: { message: 'Server error' } })
      })

    global.fetch = mockFetch as unknown as typeof fetch

    renderSetup()

    await waitFor(() => {
      expect(screen.getByText('Add a folder')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Add a folder'))

    const pathInput = screen.getByPlaceholderText('/mnt/media/movies')
    fireEvent.change(pathInput, { target: { value: '/media/movies' } })

    const apiKeyInput = screen.getByPlaceholderText('TMDB API key')
    fireEvent.change(apiKeyInput, { target: { value: 'test-key' } })

    fireEvent.click(screen.getByText('Complete Setup'))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Server error')
    })
  })
})
