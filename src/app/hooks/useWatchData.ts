import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { MovieWithSubtitles, WatchProgressSummary } from '../../api/contract'
import { useNextEpisode } from './useNextEpisode'
import { api } from '../lib/api-client'
import type {
  Episode,
  Show,
  ShowWithSeasons,
  SubtitleTrack
} from '../lib/media'

export type { MovieWithSubtitles } from '../../api/contract'

export type WatchProgress = WatchProgressSummary

export type EpisodeProgressMap = Record<
  number,
  { currentTime: number; duration: number | null }
>

async function fetchShowProgress(showId: number): Promise<EpisodeProgressMap> {
  try {
    return await api((client) =>
      client.episodeProgress.getShowProgress({ path: { showId } })
    )
  } catch {
    // Progress is decoration on the episode list — start from a clean map
    // rather than failing the whole watch page.
    return {}
  }
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
  subtitles: ReadonlyArray<SubtitleTrack>
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
    queryFn: () =>
      api((client) => client.library.getMovie({ path: { id: Number(id) } })),
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
    queryFn: () =>
      api((client) => client.shows.getEpisode({ path: { id: Number(id) } })),
    enabled: !!id && isEpisode,
    // Keep previous data so the player tree stays mounted across episode
    // transitions (see note on the movie query above).
    placeholderData: keepPreviousData
  })

  const episode = episodeData?.episode
  const episodeShow = episodeData?.show

  const { data: show } = useQuery({
    queryKey: ['show-for-episode', episodeShow?.id],
    queryFn: () =>
      api((client) =>
        client.shows.getShow({ path: { id: episodeShow?.id ?? 0 } })
      ),
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
        ? api((client) =>
            client.episodeProgress.getEpisodeProgress({
              path: { episodeId: episode?.id ?? 0 }
            })
          )
        : api((client) =>
            client.progress.getMovieProgress({
              path: { movieId: movie?.id ?? 0 }
            })
          ),
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
