import { useQuery } from '@tanstack/react-query'

export interface SearchMovie {
  backdropPath: string | null
  id: number
  overview: string | null
  posterPath: string | null
  title: string
  year: number | null
}

export interface SearchShow {
  backdropPath: string | null
  id: number
  overview: string | null
  posterPath: string | null
  title: string
  year: number | null
}

export interface SearchEpisode {
  episodeNumber: number
  id: number
  overview: string | null
  seasonNumber: number
  showId: number
  showTitle: string
  stillPath: string | null
  title: string
}

export interface SearchResults {
  episodes: SearchEpisode[]
  movies: SearchMovie[]
  shows: SearchShow[]
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }

    return body.error?.message ?? response.statusText
  } catch {
    return response.statusText
  }
}

async function fetchSearch(query: string): Promise<SearchResults> {
  const params = new URLSearchParams({ q: query })
  const response = await fetch(`/api/search?${params.toString()}`)

  if (!response.ok) {
    throw new Error(await readError(response))
  }

  return (await response.json()) as SearchResults
}

export function useSearch(query: string) {
  return useQuery({
    enabled: query.trim().length > 0,
    queryKey: ['search', query],
    queryFn: () => fetchSearch(query),
    staleTime: 30_000
  })
}
