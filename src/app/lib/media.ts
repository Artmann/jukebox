import type {
  Episode,
  Movie,
  SeasonWithEpisodes,
  Show,
  ShowWithSeasons,
  SubtitleTrack
} from '../../api/contract'

// The entity shapes live in the api contract now — this module keeps the
// names the app has always used and the merge helper for the library grid.
export type {
  Episode,
  SeasonWithEpisodes,
  Show,
  ShowWithSeasons,
  SubtitleTrack
}

export type SubtitleFormat = SubtitleTrack['format']

export type MediaItem =
  | { type: 'movie'; item: Movie }
  | { type: 'show'; item: Show }

export function mergeMedia(
  movies: ReadonlyArray<Movie>,
  shows: ReadonlyArray<Show>
): MediaItem[] {
  const items: MediaItem[] = [
    ...movies.map((item) => ({ type: 'movie' as const, item })),
    ...shows.map((item) => ({ type: 'show' as const, item }))
  ]

  return items
}
