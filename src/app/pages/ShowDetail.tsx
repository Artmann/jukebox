import { Loader2, StarIcon } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { EpisodeCard } from '../components/EpisodeCard'
import { FavoriteButton } from '../components/FavoriteButton'
import { PageHeader } from '../components/PageHeader'
import { SeasonSelect } from '../components/SeasonSelect'
import { PlayButtons, TitleHero } from '../components/TitleHero'
import { useScrollEpisodeIntoView } from '../hooks/useScrollEpisodeIntoView'
import { useShow } from '../hooks/useShow'
import { api } from '../lib/api-client'
import { parseGenres } from '../lib/genres'
import {
  episodeCode,
  findResumeTarget,
  progressPercent,
  type EpisodeProgressMap,
  type ResumeTarget
} from '../lib/resume-target'
import type { ShowWithSeasons } from '../lib/media'

async function fetchShowProgress(showId: number): Promise<EpisodeProgressMap> {
  return api((client) =>
    client.episodeProgress.getShowProgress({ path: { showId } })
  )
}

function showMetadata(show: ShowWithSeasons): ReactElement[] {
  const seasonCount = show.seasons.filter(
    (season) => season.seasonNumber > 0
  ).length

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

  if (seasonCount > 0) {
    metadataItems.push(
      <span key="seasons">
        {seasonCount} {seasonCount === 1 ? 'season' : 'seasons'}
      </span>
    )
  }

  return metadataItems
}

function ResumeButtons({
  resumeTarget
}: {
  resumeTarget: ResumeTarget
}): ReactElement {
  const isResume = resumeTarget.kind === 'resume'
  const watchUrl = `/watch/episode/${resumeTarget.episode.id}`

  return (
    <PlayButtons
      label={`${isResume ? 'Resume' : 'Play'} ${episodeCode(resumeTarget.episode)}`}
      progressPercent={
        isResume
          ? progressPercent(resumeTarget.progress ?? undefined)
          : undefined
      }
      restartTo={isResume ? `${watchUrl}?start=beginning` : undefined}
      to={watchUrl}
    />
  )
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

  const resumeTarget = show ? findResumeTarget(show.seasons, progressMap) : null

  // The user's explicit pick wins; otherwise derive a default during render
  // (the season the resume target lives in, falling back to the first season).
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)

  const activeSeasonNumber =
    selectedSeason ??
    resumeTarget?.episode.seasonNumber ??
    show?.seasons[0]?.seasonNumber ??
    null

  const currentSeason =
    show?.seasons.find(
      (season) => season.seasonNumber === activeSeasonNumber
    ) ?? show?.seasons[0]

  const { currentEpisodeRef, listRef } = useScrollEpisodeIntoView({
    axis: 'horizontal',
    currentEpisodeId: resumeTarget?.episode.id,
    episodeCount: currentSeason?.episodes.length,
    selectedSeason: activeSeasonNumber
  })

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
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
          <p className="text-foreground">Show not found</p>
          <p className="max-w-md text-sm text-muted-foreground">
            It may have been removed from your library or renamed on disk. Run a
            library scan if you just moved files.
          </p>
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

  // Once the viewer has started the show, the hero features their episode;
  // before that, it presents the show itself.
  const featuredEpisode =
    resumeTarget && resumeTarget.kind !== 'start' ? resumeTarget.episode : null

  return (
    <div className="relative">
      <TitleHero
        actions={
          <>
            {resumeTarget && <ResumeButtons resumeTarget={resumeTarget} />}

            <FavoriteButton
              className="size-11 opacity-100"
              target={{ kind: 'show', showId: show.id }}
            />
          </>
        }
        genres={parseGenres(show.genres)}
        imageUrl={featuredEpisode?.stillUrl ?? show.backdropUrl}
        metadata={showMetadata(show)}
        overview={featuredEpisode?.overview ?? show.overview}
        subheading={
          featuredEpisode
            ? `${episodeCode(featuredEpisode)}: ${featuredEpisode.title}`
            : undefined
        }
        title={show.title}
      />

      <main className="relative pb-12">
        <div className="px-4 sm:px-6">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Episodes
          </h2>

          {show.seasons.length > 1 && activeSeasonNumber !== null && (
            <SeasonSelect
              className="mb-5"
              onSelectSeason={setSelectedSeason}
              seasons={show.seasons}
              selectedSeason={activeSeasonNumber}
            />
          )}
        </div>

        {currentSeason && (
          <div
            className="flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 [-ms-overflow-style:none] [scrollbar-width:none] sm:scroll-px-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
            ref={listRef}
          >
            {currentSeason.episodes.map((episode) => (
              <EpisodeCard
                className="w-64 flex-shrink-0 snap-start sm:w-72 lg:w-80"
                episode={episode}
                fallbackImageUrl={show.backdropUrl}
                key={episode.id}
                progress={progressMap?.[episode.id]}
                ref={
                  episode.id === resumeTarget?.episode.id
                    ? currentEpisodeRef
                    : undefined
                }
                to={`/watch/episode/${episode.id}`}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
