import { useQuery } from '@tanstack/react-query'

export interface Movie {
  backdropPath: string | null
  createdAt: string
  extension: string | null
  fileName: string
  filePath: string
  fileSize: number | null
  genres: string | null
  id: number
  overview: string | null
  posterPath: string | null
  rating: number | null
  runtime: number | null
  title: string
  trailerUrl: string | null
  updatedAt: string
  year: number | null
}

async function fetchMovies(): Promise<Movie[]> {
  const response = await fetch('/api/library/movies')
  if (!response.ok) {
    throw new Error('Failed to fetch movies')
  }
  return (await response.json()) as Movie[]
}

export function useMovies() {
  return useQuery({
    queryKey: ['movies'],
    queryFn: fetchMovies
  })
}
