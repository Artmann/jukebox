import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { SetupPage } from './Setup'

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

describe('SetupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn() as unknown as typeof fetch
  })

  it('renders the welcome heading', () => {
    renderSetup()

    expect(screen.getByText('Welcome to Jukebox')).toBeInTheDocument()
  })

  it('renders the media libraries section', () => {
    renderSetup()

    expect(screen.getByText('Media Libraries')).toBeInTheDocument()
    expect(screen.getByText('Add Library')).toBeInTheDocument()
  })

  it('renders the movie metadata section', () => {
    renderSetup()

    expect(screen.getByText('Movie Metadata')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter your TMDB API key')).toBeInTheDocument()
  })

  it('renders the complete setup button', () => {
    renderSetup()

    expect(screen.getByText('Complete Setup')).toBeInTheDocument()
  })

  it('shows error when submitting without libraries', async () => {
    renderSetup()

    fireEvent.click(screen.getByText('Complete Setup'))

    await waitFor(() => {
      expect(screen.getByText('Please add at least one library.')).toBeInTheDocument()
    })
  })

  it('shows error when submitting without api key', async () => {
    renderSetup()

    // Add a library first
    fireEvent.click(screen.getByText('Add Library'))

    const input = screen.getByPlaceholderText('/mnt/media/movies')
    fireEvent.change(input, { target: { value: '/media/movies' } })
    fireEvent.blur(input)

    fireEvent.click(screen.getByText('Complete Setup'))

    await waitFor(() => {
      expect(screen.getByText('Please enter your TMDB API key.')).toBeInTheDocument()
    })
  })

  it('adds a library row when clicking add library', () => {
    renderSetup()

    fireEvent.click(screen.getByText('Add Library'))

    expect(screen.getByPlaceholderText('/mnt/media/movies')).toBeInTheDocument()
  })

  it('submits successfully and navigates to scan', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    })

    global.fetch = mockFetch as unknown as typeof fetch

    renderSetup()

    // Add a library
    fireEvent.click(screen.getByText('Add Library'))

    const pathInput = screen.getByPlaceholderText('/mnt/media/movies')
    fireEvent.change(pathInput, { target: { value: '/media/movies' } })

    // Enter API key
    const apiKeyInput = screen.getByPlaceholderText('Enter your TMDB API key')
    fireEvent.change(apiKeyInput, { target: { value: 'test-api-key' } })

    // Submit
    fireEvent.click(screen.getByText('Complete Setup'))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/setup/complete', expect.objectContaining({
        method: 'POST'
      }))
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/scan')
    })
  })

  it('shows error on failed submission', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' })
    }) as unknown as typeof fetch

    renderSetup()

    fireEvent.click(screen.getByText('Add Library'))

    const pathInput = screen.getByPlaceholderText('/mnt/media/movies')
    fireEvent.change(pathInput, { target: { value: '/media/movies' } })

    const apiKeyInput = screen.getByPlaceholderText('Enter your TMDB API key')
    fireEvent.change(apiKeyInput, { target: { value: 'test-key' } })

    fireEvent.click(screen.getByText('Complete Setup'))

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument()
    })
  })
})
