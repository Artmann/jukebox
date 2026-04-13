import { Loader2, PlayIcon } from 'lucide-react'
import { useState, useEffect, type ReactElement } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { PageHeader } from '../components/PageHeader'
import { PosterImage } from '../components/PosterImage'
import { useShow } from '../hooks/useShow'
import type { Episode } from '../lib/media'

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

export function ShowDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: show, isLoading, error } = useShow(id)

  const [selectedSeason, setSelectedSeason] = useState(1)

  useEffect(() => {
    if (!show) {
      return
    }

    const seasonNumbers = show.seasons.map((season) => season.seasonNumber)

    if (!seasonNumbers.includes(selectedSeason)) {
      setSelectedSeason(seasonNumbers[0] ?? 1)
    }
  }, [show, selectedSeason])

  function handleEpisodeClick(episode: Episode) {
    void navigate(`/watch/episode/${episode.id}`)
  }

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
          <Button asChild variant="outline">
            <Link to="/shows">Back to Shows</Link>
          </Button>
        </div>
      </>
    )
  }

  const currentSeason =
    show.seasons.find((season) => season.seasonNumber === selectedSeason) ??
    show.seasons[0]

  const genres = show.genres ? show.genres.split(',').map((genre) => genre.trim()) : []
  const seasonCount = show.seasons.length

  return (
    <>
      <PageHeader />

      <div className="px-4 sm:px-9 pt-6 pb-12">
        <div className="flex gap-6 mb-8">
          <div className="hidden sm:block flex-shrink-0 w-40">
            <PosterImage
              alt={show.title}
              className="w-full rounded-lg"
              path={show.posterPath}
              title={show.title}
            />
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-2xl font-bold text-foreground">{show.title}</h1>

            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {show.year && <span>{show.year}</span>}

              {show.rating && (
                <span>{show.rating.toFixed(1)} rating</span>
              )}

              <span>
                {seasonCount} {seasonCount === 1 ? 'season' : 'seasons'}
              </span>

              {genres.length > 0 && (
                <span>{genres.join(', ')}</span>
              )}
            </div>

            {show.overview && (
              <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
                {show.overview}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-6">
          {show.seasons.map((season) => (
            <button
              className={`cursor-pointer rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                season.seasonNumber === selectedSeason
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
          <div className="flex flex-col gap-1">
            {currentSeason.episodes.map((episode) => {
              const runtime = formatRuntime(episode.runtime)

              return (
                <div
                  className="group flex items-start gap-4 rounded-lg px-3 py-3 cursor-pointer hover:bg-muted transition-colors"
                  key={episode.id}
                  onClick={() => handleEpisodeClick(episode)}
                >
                  <div className="flex-shrink-0 w-10 text-right text-sm text-muted-foreground pt-0.5">
                    {episode.episodeNumber}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">
                        {episode.title}
                      </span>

                      {runtime && (
                        <span className="text-xs text-muted-foreground">
                          {runtime}
                        </span>
                      )}
                    </div>

                    {episode.overview && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {episode.overview}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5">
                    <PlayIcon className="size-4 text-foreground" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
