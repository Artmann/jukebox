import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { LibraryGrid } from './LibraryGrid'
import type { Movie } from '../hooks/useMovies'

const mockMovies: Movie[] = [
  {
    id: 1,
    title: 'Jurassic Park',
    year: 1993,
    overview:
      'A pragmatic paleontologist touring an almost complete theme park.',
    externalId: null,
    posterUrl: 'https://cdn.example/poster1.jpg',
    backdropUrl: 'https://cdn.example/backdrop1.jpg',
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
    externalId: null,
    posterUrl: 'https://cdn.example/poster2.jpg',
    backdropUrl: 'https://cdn.example/backdrop2.jpg',
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
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{component}</MemoryRouter>
    </QueryClientProvider>
  )
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

    expect(links[0]).toHaveAttribute('href', '/movies/1')
  })

  it('shows year below the poster', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    expect(screen.getByText('1993')).toBeInTheDocument()
    expect(screen.getByText('1999')).toBeInTheDocument()
  })

  it('links the more information button to the movie page', () => {
    renderWithRouter(<LibraryGrid items={mockMovies} />)

    expect([
      screen
        .getByLabelText('More information about Jurassic Park')
        .getAttribute('href'),
      screen
        .getByLabelText('More information about The Matrix')
        .getAttribute('href')
    ]).toEqual(['/movies/1', '/movies/2'])
  })
})
