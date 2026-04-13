import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
    genres: '["Action","Adventure","Science Fiction"]',
    runtime: 127,
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
    genres: '["Action","Science Fiction"]',
    runtime: 136,
    updatedAt: '2024-01-01'
  }
]

function renderWithRouter(component: React.ReactElement) {
  return render(<MemoryRouter>{component}</MemoryRouter>)
}

describe('LibraryGrid', () => {
  it('renders movie items with titles visible below posters', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    expect(screen.getAllByText('Jurassic Park').length).toBeGreaterThan(0)
    expect(screen.getAllByText('The Matrix').length).toBeGreaterThan(0)
  })

  it('renders empty grid when no items', () => {
    renderWithRouter(<LibraryGrid items={[]} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders the grid with list role', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    expect(screen.getByRole('list')).toBeInTheDocument()
  })

  it('shows movie links with correct hrefs', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const links = screen.getAllByLabelText('Jurassic Park')

    expect(links[0]).toHaveAttribute('href', '/watch/1')
  })

  it('shows year below the poster', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    expect(screen.getByText('1993')).toBeInTheDocument()
    expect(screen.getByText('1999')).toBeInTheDocument()
  })

  it('shows more info button with aria-label', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    expect(
      screen.getByLabelText('More information about Jurassic Park')
    ).toBeInTheDocument()

    expect(
      screen.getByLabelText('More information about The Matrix')
    ).toBeInTheDocument()
  })

  it('opens modal when clicking more info button', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const infoButton = screen.getByLabelText(
      'More information about Jurassic Park'
    )

    fireEvent.click(infoButton)

    expect(screen.getByText(/pragmatic paleontologist/)).toBeInTheDocument()
  })

  it('closes modal when clicking close button', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const infoButton = screen.getByLabelText(
      'More information about Jurassic Park'
    )

    fireEvent.click(infoButton)

    expect(screen.getByText(/pragmatic paleontologist/)).toBeInTheDocument()

    const modalButtons = document.querySelectorAll('.fixed button')
    const closeButton = modalButtons[0]

    fireEvent.click(closeButton as Element)

    expect(
      screen.queryByText(/pragmatic paleontologist/)
    ).not.toBeInTheDocument()
  })

  it('closes modal when clicking backdrop', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const infoButton = screen.getByLabelText(
      'More information about Jurassic Park'
    )

    fireEvent.click(infoButton)

    expect(screen.getByText(/pragmatic paleontologist/)).toBeInTheDocument()

    const backdrop = document.querySelector('.fixed.inset-0')

    fireEvent.click(backdrop as Element)

    expect(
      screen.queryByText(/pragmatic paleontologist/)
    ).not.toBeInTheDocument()
  })

  it('renders YouTube trailer when trailerUrl exists', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    const infoButton = screen.getByLabelText(
      'More information about Jurassic Park'
    )

    fireEvent.click(infoButton)

    const iframe = document.querySelector('iframe')

    expect(iframe).toBeInTheDocument()
    expect(iframe).toHaveAttribute(
      'src',
      expect.stringContaining('youtube.com/embed/abc123')
    )
  })

  it('shows backdrop image instead of trailer when trailerUrl is null', () => {
    const movie = mockMovies[1]
    if (!movie) throw new Error('Missing test data')

    renderWithRouter(<LibraryGrid items={[movie]} />)

    const infoButton = screen.getByLabelText(
      'More information about The Matrix'
    )

    fireEvent.click(infoButton)

    expect(screen.getAllByText('1999').length).toBeGreaterThan(0)
    expect(document.querySelector('iframe')).not.toBeInTheDocument()
  })
})
