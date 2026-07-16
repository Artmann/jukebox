import { CheckIcon, Loader2, PlayIcon, StarIcon } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import type {
  EpisodeProgressEntry,
  ShowWithSeasons
} from '../../api/contract'
import { watchedThreshold } from '../../lib/watched'
import { FavoriteButton } from '../components/FavoriteButton'
import { PageHeader } from '../components/PageHeader'
import { useShow } from '../hooks/useShow'
import { api } from '../lib/api-client'
import { parseGenres } from '../lib/genres'

type EpisodeProgress = EpisodeProgressEntry

type EpisodeProgressMap = Record<number, EpisodeProgress>

interface ResumeTarget {
  episodeId: number
  label: string
  seasonNumber: number
}

async function fetchShowProgress(showId: number): Promise<EpisodeProgressMap> {
  return api((client) =>
    client.episodeProgress.getShowProgress({ path: { showId } })
  )
}

function formatRuntime(minutes: number | null): string {
  if (minutes === null) {
    return ''
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60

  return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
}

function progressPercent(progress: EpisodeProgress | undefined): number {
  if (!progress || !progress.duration) {
    return 0
  }

  return Math.min((progress.currentTime / progress.duration) * 100, 100)
}

function isWatched(progress: EpisodeProgress | undefined): boolean {
  if (!progress || !progress.duration) {
    return false
  }

  return progress.currentTime >= progress.duration * watchedThreshold
}

// The episode the big hero button should play: the most recently updated
// in-progress episode, else the first unwatched episode, else the first
// episode of the show. Specials (season 0) are only considered after the
// regular seasons, so a fresh show starts at Season 1, not at the specials.
function findResumeTarget(
  allSeasons: ShowWithSeasons['seasons'],
  progressMap: EpisodeProgressMap | undefined
): ResumeTarget | null {
  const seasons = [
    ...allSeasons.filter((season) => season.seasonNumber > 0),
    ...allSeasons.filter((season) => season.seasonNumber === 0)
  ]

  let inProgressEpisodeId: number | null = null
  let inProgressSeasonNumber = 0
  let inProgressEpisodeNumber = 0
  let latestUpdatedAt = ''

  for (const season of seasons) {
    for (const episode of season.episodes) {
      const progress = progressMap?.[episode.id]

      if (!progress?.duration || progress.currentTime <= 0) {
        continue
      }

      if (progress.currentTime >= progress.duration * watchedThreshold) {
        continue
      }

      if (!latestUpdatedAt || progress.updatedAt > latestUpdatedAt) {
        inProgressEpisodeId = episode.id
        inProgressEpisodeNumber = episode.episodeNumber
        inProgressSeasonNumber = episode.seasonNumber
        latestUpdatedAt = progress.updatedAt
      }
    }
  }

  if (inProgressEpisodeId !== null) {
    return {
      episodeId: inProgressEpisodeId,
      label: `Resume S${inProgressSeasonNumber}E${inProgressEpisodeNumber}`,
      seasonNumber: inProgressSeasonNumber
    }
  }

  let anyWatched = false

  for (const season of seasons) {
    for (const episode of season.episodes) {
      if (isWatched(progressMap?.[episode.id])) {
        anyWatched = true

        continue
      }

      return {
        episodeId: episode.id,
        label: anyWatched
          ? `Play S${episode.seasonNumber}E${episode.episodeNumber}`
          : 'Play',
        seasonNumber: episode.seasonNumber
      }
    }
  }

  const firstEpisode = seasons[0]?.episodes[0]

  if (!firstEpisode) {
    return null
  }

  return {
    episodeId: firstEpisode.id,
    label: `Play S${firstEpisode.seasonNumber}E${firstEpisode.episodeNumber}`,
    seasonNumber: firstEpisode.seasonNumber
  }
}

export function ShowDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>()
  const { data: show, isLoading, error } = useShow(id)

  const showId = show?.id

  const { data: progressMap } = useQuery({
    queryKey: ['show-progress', showId],
    queryFn: () => fetchShowProgress(showId ?? 0),
    enabled: !!showId
  })

  const resumeTarget = useMemo(() => {
    if (!show) {
      return null
    }

    return findResumeTarget(show.seasons, progressMap)
  }, [progressMap, show])

  // The user's explicit pick wins; otherwise derive a default during render
  // (the season the resume target lives in, falling back to the first season).
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)

  const activeSeasonNumber =
    selectedSeason ??
    resumeTarget?.seasonNumber ??
    show?.seasons[0]?.seasonNumber ??
    null

  if (isLoading) {
    return (
      <>
        <PageHeader />
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  if (error || !show) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <p className="text-foreground">Show not found</p>
          <Button
            asChild
            variant="outline"
          >
            <Link to="/shows">Back to Shows</Link>
          </Button>
        </div>
      </>
    )
  }

  const currentSeason =
    show.seasons.find(
      (season) => season.seasonNumber === activeSeasonNumber
    ) ?? show.seasons[0]

  const genres = parseGenres(show.genres)
  const seasonCount = show.seasons.length

  const metadataItems: ReactElement[] = []

  if (show.year) {
    metadataItems.push(<span key="year">{show.year}</span>)
  }

  if (show.rating) {
    metadataItems.push(
      <span
        className="flex items-center gap-1"
        key="rating"
      >
        <StarIcon className="size-3.5 fill-current" />
        {show.rating.toFixed(1)}
      </span>
    )
  }

  metadataItems.push(
    <span key="seasons">
      {seasonCount} {seasonCount === 1 ? 'season' : 'seasons'}
    </span>
  )

  if (genres.length > 0) {
    metadataItems.push(<span key="genres">{genres.join(', ')}</span>)
  }

  return (
    <div className="relative">
      <div className="absolute inset-x-0 top-0 h-[45vh] min-h-80 overflow-hidden">
        {show.backdropUrl ? (
          <img
            alt=""
            className="size-full object-cover object-top"
            src={show.backdropUrl}
          />
        ) : (
          <div className="size-full bg-gradient-to-b from-muted to-background" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/20" />
      </div>

      <PageHeader />

      <main className="relative px-4 pb-12 sm:px-6">
        <div className="flex flex-col items-start gap-3 pt-36 sm:gap-4 sm:pt-52">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            {show.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {metadataItems.map((item, index) => (
              <Fragment key={item.key}>
                {index > 0 && <span aria-hidden>·</span>}
                {item}
              </Fragment>
            ))}
          </div>

          {show.overview && (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground line-clamp-3 sm:text-base sm:line-clamp-none">
              {show.overview}
            </p>
          )}

          <div className="mt-1 flex items-center gap-3">
            {resumeTarget && (
              <Button
                asChild
                size="lg"
              >
                <Link to={`/watch/episode/${resumeTarget.episodeId}`}>
                  <PlayIcon className="fill-current" />
                  {resumeTarget.label}
                </Link>
              </Button>
            )}

            <FavoriteButton
              className="size-11 opacity-100"
              target={{ kind: 'show', showId: show.id }}
            />
          </div>
        </div>

        <div className="mt-10 mb-6 flex flex-wrap gap-2">
          {show.seasons.map((season) => (
            <button
              className={`cursor-pointer rounded-md px-4 min-h-11 text-sm font-medium transition-colors ${
                season.seasonNumber === activeSeasonNumber
                  ? 'bg-foreground text-background'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              key={season.id}
              onClick={() => setSelectedSeason(season.seasonNumber)}
              type="button"
            >
              {season.name ?? `Season ${season.seasonNumber}`}
            </button>
          ))}
        </div>

        {currentSeason && (
          <div className="max-w-4xl divide-y divide-border/60">
            {currentSeason.episodes.map((episode) => {
              const runtime = formatRuntime(episode.runtime)
              const progress = progressMap?.[episode.id]
              const percent = progressPercent(progress)
              const watched = isWatched(progress)
              const inProgress = percent > 0 && !watched

              return (
                <Link
                  className="group flex items-center gap-4 px-2 py-4 cursor-pointer hover:bg-muted/50 transition-colors sm:gap-6 sm:px-4 sm:py-5"
                  key={episode.id}
                  to={`/watch/episode/${episode.id}`}
                >
                  <div className="w-8 flex-shrink-0 text-center">
                    <span className="text-xl font-light text-muted-foreground tabular-nums group-hover:hidden sm:text-2xl">
                      {episode.episodeNumber}
                    </span>

                    <PlayIcon className="mx-auto hidden size-5 fill-current text-foreground group-hover:block" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <span
                      className={`font-medium ${watched ? 'text-muted-foreground' : 'text-foreground'}`}
                    >
                      {episode.title}
                    </span>

                    {episode.overview && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {episode.overview}
                      </p>
                    )}

                    {(watched || inProgress) && (
                      <div className="mt-2.5 h-1 w-full max-w-xs rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            watched ? 'bg-muted-foreground/40' : 'bg-red-600'
                          }`}
                          style={{ width: `${watched ? 100 : percent}%` }}
                        />
                      </div>
                    )}
                  </div>

                  <div className="ml-auto flex flex-shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    {watched && (
                      <CheckIcon
                        aria-label="Watched"
                        className="size-4"
                      />
                    )}

                    {runtime && <span>{runtime}</span>}
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
