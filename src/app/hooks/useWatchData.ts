import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { Movie } from './useMovies'
import { useNextEpisode } from './useNextEpisode'
import type {
  Episode,
  Show,
  ShowWithSeasons,
  SubtitleTrack
} from '../lib/media'

export interface MovieWithSubtitles extends Movie {
  subtitles: SubtitleTrack[]
}

export interface WatchProgress {
  currentTime: number
  duration: number | null
}

export type EpisodeProgressMap = Record<
  number,
  { currentTime: number; duration: number | null }
>

interface EpisodeWithShow {
  episode: Episode
  show: Show
  subtitles: SubtitleTrack[]
}

async function fetchMovie(id: string): Promise<MovieWithSubtitles> {
  const response = await fetch(`/api/library/movies/${id}`)

  if (!response.ok) {
    throw new Error('Failed to fetch movie')
  }

  return (await response.json()) as MovieWithSubtitles
}

async function fetchMovieProgress(movieId: number): Promise<WatchProgress> {
  const response = await fetch(`/api/progress/${movieId}`)

  return (await response.json()) as WatchProgress
}

async function fetchEpisodeWithShow(id: string): Promise<EpisodeWithShow> {
  const response = await fetch(`/api/library/shows/episodes/${id}`)

  if (!response.ok) {
    throw new Error('Failed to fetch episode')
  }

  return (await response.json()) as EpisodeWithShow
}

async function fetchShowForEpisode(showId: number): Promise<ShowWithSeasons> {
  const response = await fetch(`/api/library/shows/${showId}`)

  if (!response.ok) {
    throw new Error('Failed to fetch show')
  }

  return (await response.json()) as ShowWithSeasons
}

async function fetchEpisodeProgress(episodeId: number): Promise<WatchProgress> {
  const response = await fetch(`/api/progress/episode/${episodeId}`)

  return (await response.json()) as WatchProgress
}

async function fetchShowProgress(showId: number): Promise<EpisodeProgressMap> {
  const response = await fetch(`/api/progress/episode/show/${showId}`)

  if (!response.ok) {
    return {}
  }

  return (await response.json()) as EpisodeProgressMap
}

export interface WatchData {
  episode: Episode | undefined
  episodeProgressMap: EpisodeProgressMap | undefined
  episodeShow: Show | undefined
  error: Error | null
  isLoading: boolean
  movie: MovieWithSubtitles | undefined
  nextEpisode: Episode | null
  nextEpisodeShow: Show | null
  savedProgress: WatchProgress | undefined
  show: ShowWithSeasons | undefined
  subtitles: SubtitleTrack[]
}

/**
 * Loads everything the watch page needs for the current media: the movie or
 * episode itself, its show and seasons, saved progress, and the next episode.
 */
export function useWatchData(
  id: string | undefined,
  isEpisode: boolean
): WatchData {
  const {
    data: movie,
    isLoading: isLoadingMovie,
    error: movieError
  } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => fetchMovie(id ?? ''),
    enabled: !!id && !isEpisode,
    // Keep previous data so the player tree doesn't unmount while fetching
    // the next movie — disposing the player mid-swap leaves consumers with
    // stale references and throws "Invalid target for null#on".
    placeholderData: keepPreviousData
  })

  const {
    data: episodeData,
    isLoading: isLoadingEpisode,
    error: episodeError
  } = useQuery({
    queryKey: ['episode', id],
    queryFn: () => fetchEpisodeWithShow(id ?? ''),
    enabled: !!id && isEpisode,
    // Keep previous data so the player tree stays mounted across episode
    // transitions (see note on the movie query above).
    placeholderData: keepPreviousData
  })

  const episode = episodeData?.episode
  const episodeShow = episodeData?.show

  const { data: show } = useQuery({
    queryKey: ['show-for-episode', episodeShow?.id],
    queryFn: () => fetchShowForEpisode(episodeShow?.id ?? 0),
    enabled: !!episodeShow
  })

  const { data: episodeProgressMap } = useQuery({
    queryKey: ['show-progress', episodeShow?.id],
    queryFn: () => fetchShowProgress(episodeShow?.id ?? 0),
    enabled: !!episodeShow
  })

  const { data: savedProgress } = useQuery({
    queryKey: [
      'progress',
      isEpisode ? 'episode' : 'movie',
      isEpisode ? episode?.id : movie?.id
    ],
    queryFn: () =>
      isEpisode
        ? fetchEpisodeProgress(episode?.id ?? 0)
        : fetchMovieProgress(movie?.id ?? 0),
    enabled: isEpisode ? !!episode : !!movie
  })

  // Fetch the next unwatched episode from the server (endpoint-driven,
  // replaces the old ad-hoc on-ended redirect).
  const { data: nextEpisodeData } = useNextEpisode(episodeShow?.id, episode?.id, {
    enabled: isEpisode
  })

  const subtitles = isEpisode
    ? (episodeData?.subtitles ?? [])
    : (movie?.subtitles ?? [])

  return {
    episode,
    episodeProgressMap,
    episodeShow,
    error: isEpisode ? episodeError : movieError,
    isLoading: isEpisode ? isLoadingEpisode : isLoadingMovie,
    movie,
    nextEpisode: nextEpisodeData?.episode ?? null,
    nextEpisodeShow: nextEpisodeData?.show ?? null,
    savedProgress,
    show,
    subtitles
  }
}
