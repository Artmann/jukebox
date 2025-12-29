import { useQuery } from '@tanstack/react-query'

export interface Movie {
  id: number
  title: string
  filePath: string
  fileName: string
  fileSize: number | null
  extension: string | null
  createdAt: string
  updatedAt: string
}

async function fetchMovies(): Promise<Movie[]> {
  const response = await fetch('/api/library/movies')
  if (!response.ok) {
    throw new Error('Failed to fetch movies')
  }
  return response.json()
}

export function useMovies() {
  return useQuery({
    queryKey: ['movies'],
    queryFn: fetchMovies
  })
}
