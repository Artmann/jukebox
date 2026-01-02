import { render, screen, fireEvent, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

import { LibraryGrid } from './LibraryGrid'
import type { Movie } from '../hooks/useMovies'

const mockMovies: Movie[] = [
  {
    id: 1,
    title: 'Jurassic Park',
    year: 1993,
    overview:
      'A pragmatic paleontologist touring an almost complete theme park.',
    posterPath: '/poster1.jpg',
    backdropPath: '/backdrop1.jpg',
    trailerUrl: 'https://www.youtube.com/watch?v=abc123',
    rating: 8.1,
    filePath: '/movies/jurassic-park.mp4',
    fileName: 'jurassic-park.mp4',
    fileSize: 1000000,
    extension: '.mp4',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  },
  {
    id: 2,
    title: 'The Matrix',
    year: 1999,
    overview: 'A computer hacker learns about the true nature of reality.',
    posterPath: '/poster2.jpg',
    backdropPath: '/backdrop2.jpg',
    trailerUrl: null,
    rating: 8.7,
    filePath: '/movies/the-matrix.mp4',
    fileName: 'the-matrix.mp4',
    fileSize: 2000000,
    extension: '.mp4',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01'
  }
]

function renderWithRouter(component: React.ReactElement) {
  return render(<MemoryRouter>{component}</MemoryRouter>)
}

describe('LibraryGrid', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders movie items', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const jurassicLinks = screen.getAllByLabelText('Jurassic Park')
    const matrixLinks = screen.getAllByLabelText('The Matrix')

    expect(jurassicLinks.length).toBeGreaterThan(0)
    expect(matrixLinks.length).toBeGreaterThan(0)
  })

  it('renders empty grid when no items', () => {
    renderWithRouter(<LibraryGrid items={[]} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('shows movie links with correct hrefs', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const links = screen.getAllByLabelText('Jurassic Park')
    expect(links[0]).toHaveAttribute('href', '/watch/1')
  })

  it('shows hover popover after delay', async () => {
    vi.useFakeTimers()
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const gridItems = document.querySelectorAll('.relative')
    const firstGridItem = gridItems[0]
    expect(firstGridItem).toBeInTheDocument()

    const popover = firstGridItem?.querySelector('div[style]')
    expect(popover).toHaveStyle({ opacity: '0' })

    fireEvent.mouseEnter(firstGridItem!)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(popover).toHaveStyle({ opacity: '1' })
  })

  it('hides popover on mouse leave', async () => {
    vi.useFakeTimers()
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const gridItems = document.querySelectorAll('.relative')
    const firstGridItem = gridItems[0]
    const popover = firstGridItem?.querySelector('div[style]')

    fireEvent.mouseEnter(firstGridItem!)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    expect(popover).toHaveStyle({ opacity: '1' })

    fireEvent.mouseLeave(firstGridItem!)

    expect(popover).toHaveStyle({ opacity: '0' })
  })

  it('opens modal when clicking show more button', async () => {
    vi.useFakeTimers()
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const gridItems = document.querySelectorAll('.relative')
    const firstGridItem = gridItems[0]

    fireEvent.mouseEnter(firstGridItem!)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const showMoreButton = firstGridItem?.querySelector('button')
    expect(showMoreButton).toBeInTheDocument()

    fireEvent.click(showMoreButton!)

    expect(screen.getByText('1993')).toBeInTheDocument()
    expect(screen.getByText(/pragmatic paleontologist/)).toBeInTheDocument()
  })

  it('closes modal when clicking close button', async () => {
    vi.useFakeTimers()
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const gridItems = document.querySelectorAll('.relative')
    const firstGridItem = gridItems[0]

    fireEvent.mouseEnter(firstGridItem!)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const showMoreButton = firstGridItem?.querySelector('button')
    fireEvent.click(showMoreButton!)

    expect(screen.getByText('1993')).toBeInTheDocument()

    const modalButtons = document.querySelectorAll('.fixed button')
    const closeButton = modalButtons[0]
    fireEvent.click(closeButton!)

    expect(screen.queryByText('1993')).not.toBeInTheDocument()
  })

  it('closes modal when clicking backdrop', async () => {
    vi.useFakeTimers()
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const gridItems = document.querySelectorAll('.relative')
    const firstGridItem = gridItems[0]

    fireEvent.mouseEnter(firstGridItem!)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const showMoreButton = firstGridItem?.querySelector('button')
    fireEvent.click(showMoreButton!)

    expect(screen.getByText('1993')).toBeInTheDocument()

    const backdrop = document.querySelector('.fixed.inset-0')
    fireEvent.click(backdrop!)

    expect(screen.queryByText('1993')).not.toBeInTheDocument()
  })

  it('renders YouTube trailer when trailerUrl exists', async () => {
    vi.useFakeTimers()
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const gridItems = document.querySelectorAll('.relative')
    const firstGridItem = gridItems[0]

    fireEvent.mouseEnter(firstGridItem!)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const showMoreButton = firstGridItem?.querySelector('button')
    fireEvent.click(showMoreButton!)

    const iframe = document.querySelector('iframe')
    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute(
      'src',
      expect.stringContaining('youtube.com/embed/abc123')
    )
  })

  it('does not render trailer iframe when trailerUrl is null', async () => {
    vi.useFakeTimers()
    renderWithRouter(<LibraryGrid items={[mockMovies[1]!]} />)

    const gridItems = document.querySelectorAll('.relative')
    const firstGridItem = gridItems[0]

    fireEvent.mouseEnter(firstGridItem!)

    await act(async () => {
      vi.advanceTimersByTime(300)
    })

    const showMoreButton = firstGridItem?.querySelector('button')
    fireEvent.click(showMoreButton!)

    expect(screen.getByText('1999')).toBeInTheDocument()
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
  })
})
