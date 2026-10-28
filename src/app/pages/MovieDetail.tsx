import * as Dialog from '@radix-ui/react-dialog'
import { ClapperboardIcon, Loader2, StarIcon, XIcon } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { FavoriteButton } from '../components/FavoriteButton'
import { PageHeader } from '../components/PageHeader'
import { PlayButtons, TitleHero } from '../components/TitleHero'
import { api } from '../lib/api-client'
import { parseGenres } from '../lib/genres'
import {
  formatRuntime,
  isInProgress,
  progressPercent
} from '../lib/resume-target'
import { getYouTubeEmbedUrl } from '../lib/trailer'

export function MovieDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>()
  const [trailerOpen, setTrailerOpen] = useState(false)

  const {
    data: movie,
    error,
    isLoading
  } = useQuery({
    queryKey: ['movie', id],
    queryFn: () =>
      api((client) => client.library.getMovie({ path: { id: Number(id) } })),
    enabled: !!id
  })

  // Progress only decorates the page: if it fails to load, the movie simply
  // shows as unstarted.
  const { data: progress } = useQuery({
    queryKey: ['progress', 'movie', movie?.id],
    queryFn: () =>
      api((client) =>
        client.progress.getMovieProgress({
          path: { movieId: movie?.id ?? 0 }
        })
      ),
    enabled: !!movie
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

  if (error || !movie) {
    return (
      <>
        <PageHeader />
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-6 text-center">
          <p className="text-foreground">Movie not found</p>
          <p className="max-w-md text-sm text-muted-foreground">
            It may have been removed from your library or renamed on disk. Run a
            library scan if you just moved files.
          </p>
          <Button
            asChild
            variant="outline"
          >
            <Link to="/movies">Back to Movies</Link>
          </Button>
        </div>
      </>
    )
  }

  const inProgress = isInProgress(progress)
  const runtime = formatRuntime(movie.runtime)
  const trailerEmbedUrl = getYouTubeEmbedUrl(movie.trailerUrl)
  const watchUrl = `/watch/${movie.id}`

  const metadataItems: ReactElement[] = []

  if (movie.year) {
    metadataItems.push(<span key="year">{movie.year}</span>)
  }

  if (runtime) {
    metadataItems.push(<span key="runtime">{runtime}</span>)
  }

  if (movie.rating) {
    metadataItems.push(
      <span
        className="flex items-center gap-1"
        key="rating"
      >
        <StarIcon className="size-3.5 fill-current" />
        {movie.rating.toFixed(1)}
      </span>
    )
  }

  return (
    <div className="relative">
      <TitleHero
        actions={
          <>
            <PlayButtons
              label={inProgress ? 'Resume' : 'Watch Now'}
              progressPercent={
                inProgress ? progressPercent(progress) : undefined
              }
              restartTo={inProgress ? `${watchUrl}?start=beginning` : undefined}
              to={watchUrl}
            />

            {trailerEmbedUrl && (
              <Button
                className="min-h-11 bg-white/15 text-base font-semibold text-foreground hover:bg-white/25"
                onClick={() => setTrailerOpen(true)}
                size="lg"
                type="button"
                variant="secondary"
              >
                <ClapperboardIcon />
                Trailer
              </Button>
            )}

            <FavoriteButton
              className="size-11 opacity-100"
              target={{ kind: 'movie', movieId: movie.id }}
            />
          </>
        }
        genres={parseGenres(movie.genres)}
        imageUrl={movie.backdropUrl}
        metadata={metadataItems}
        overview={movie.overview}
        title={movie.title}
      />

      {trailerEmbedUrl && (
        <Dialog.Root
          onOpenChange={setTrailerOpen}
          open={trailerOpen}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=open]:fade-in-0" />

            <Dialog.Content className="fixed inset-x-3 top-1/2 z-50 mx-auto max-w-5xl -translate-y-1/2 overflow-hidden rounded-md bg-black shadow-lg sm:inset-x-6">
              <Dialog.Title className="sr-only">
                {movie.title} trailer
              </Dialog.Title>

              <Dialog.Description className="sr-only">
                The trailer plays from YouTube.
              </Dialog.Description>

              <div className="aspect-video">
                <iframe
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  className="size-full"
                  sandbox="allow-scripts allow-presentation allow-popups allow-popups-to-escape-sandbox"
                  src={trailerEmbedUrl}
                  title={`${movie.title} trailer`}
                />
              </div>

              <Dialog.Close
                aria-label="Close trailer"
                className="absolute right-2 top-2 flex size-11 cursor-pointer items-center justify-center rounded-full bg-black/70 text-white hover:bg-black/90"
              >
                <XIcon className="size-5" />
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  )
}
