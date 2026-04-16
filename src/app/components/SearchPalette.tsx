import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Loader2, Search } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/lib/utils'

import { useDebouncedValue } from '../hooks/useDebouncedValue'
import {
  useSearch,
  type SearchEpisode,
  type SearchMovie,
  type SearchShow
} from '../hooks/useSearch'
import { PosterImage } from './PosterImage'

interface SearchPaletteProps {
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function SearchPalette({
  onOpenChange,
  open
}: SearchPaletteProps): ReactElement {
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 200)
  const navigate = useNavigate()

  const trimmedQuery = debouncedQuery.trim()
  const { data, error, isFetching } = useSearch(debouncedQuery)

  useEffect(
    function resetWhenClosed() {
      if (!open) {
        setQuery('')
      }
    },
    [open]
  )

  function close() {
    onOpenChange(false)
  }

  function goTo(path: string) {
    close()
    void navigate(path)
  }

  const hasQuery = trimmedQuery.length > 0
  const totalResults =
    (data?.movies.length ?? 0) +
    (data?.shows.length ?? 0) +
    (data?.episodes.length ?? 0)

  const showIndexEmptyState =
    hasQuery && !isFetching && !error && (data?.indexEmpty ?? false)
  const showEmptyState =
    hasQuery &&
    !isFetching &&
    !error &&
    totalResults === 0 &&
    !showIndexEmptyState

  return (
    <Dialog.Root
      onOpenChange={onOpenChange}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[92vw] max-w-2xl -translate-x-1/2 overflow-hidden rounded-lg border bg-background shadow-2xl"
        >
          <Dialog.Title className="sr-only">Search your library</Dialog.Title>
          <Command
            label="Search your library"
            shouldFilter={false}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <Search
                aria-hidden
                className="size-4 text-muted-foreground"
              />
              <Command.Input
                autoFocus
                className="flex h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                onValueChange={setQuery}
                placeholder="Search movies, shows, episodes…"
                value={query}
              />
              {isFetching ? (
                <Loader2
                  aria-label="Searching"
                  className="size-4 animate-spin text-muted-foreground"
                />
              ) : null}
            </div>

            <Command.List className="max-h-[60vh] overflow-y-auto p-2">
              {!hasQuery ? (
                <PlaceholderMessage>
                  Start typing to search your library.
                </PlaceholderMessage>
              ) : null}

              {error ? (
                <PlaceholderMessage tone="error">
                  {error.message}
                </PlaceholderMessage>
              ) : null}

              {showIndexEmptyState ? (
                <PlaceholderMessage>
                  Search index isn&rsquo;t ready yet. Try again after the next
                  scan completes.
                </PlaceholderMessage>
              ) : null}

              {showEmptyState ? (
                <PlaceholderMessage>
                  No matches for &ldquo;{trimmedQuery}&rdquo;. Try a shorter
                  term or check your library.
                </PlaceholderMessage>
              ) : null}

              {data && data.movies.length > 0 ? (
                <Command.Group
                  className="px-1 py-1 text-xs uppercase tracking-wide text-muted-foreground"
                  heading="Movies"
                >
                  {data.movies.map((movie) => (
                    <MovieItem
                      key={movie.id}
                      movie={movie}
                      onSelect={() => goTo(`/watch/${movie.id}`)}
                    />
                  ))}
                </Command.Group>
              ) : null}

              {data && data.shows.length > 0 ? (
                <Command.Group
                  className="px-1 py-1 text-xs uppercase tracking-wide text-muted-foreground"
                  heading="Shows"
                >
                  {data.shows.map((show) => (
                    <ShowItem
                      key={show.id}
                      onSelect={() => goTo(`/shows/${show.id}`)}
                      show={show}
                    />
                  ))}
                </Command.Group>
              ) : null}

              {data && data.episodes.length > 0 ? (
                <Command.Group
                  className="px-1 py-1 text-xs uppercase tracking-wide text-muted-foreground"
                  heading="Episodes"
                >
                  {data.episodes.map((episode) => (
                    <EpisodeItem
                      episode={episode}
                      key={episode.id}
                      onSelect={() => goTo(`/watch/episode/${episode.id}`)}
                    />
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function PlaceholderMessage({
  children,
  tone = 'default'
}: {
  children: React.ReactNode
  tone?: 'default' | 'error'
}): ReactElement {
  return (
    <p
      className={cn(
        'px-3 py-6 text-center text-sm',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground'
      )}
    >
      {children}
    </p>
  )
}

function MovieItem({
  movie,
  onSelect
}: {
  movie: SearchMovie
  onSelect: () => void
}): ReactElement {
  return (
    <Command.Item
      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
      onSelect={onSelect}
      value={`movie-${movie.id}-${movie.title}`}
    >
      <PosterThumb
        path={movie.posterPath}
        title={movie.title}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{movie.title}</span>
          {movie.year !== null ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {movie.year}
            </span>
          ) : null}
        </div>
        {movie.overview ? (
          <p className="truncate text-xs text-muted-foreground">
            {movie.overview}
          </p>
        ) : null}
      </div>
    </Command.Item>
  )
}

function ShowItem({
  onSelect,
  show
}: {
  onSelect: () => void
  show: SearchShow
}): ReactElement {
  return (
    <Command.Item
      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
      onSelect={onSelect}
      value={`show-${show.id}-${show.title}`}
    >
      <PosterThumb
        path={show.posterPath}
        title={show.title}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{show.title}</span>
          {show.year !== null ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {show.year}
            </span>
          ) : null}
        </div>
        {show.overview ? (
          <p className="truncate text-xs text-muted-foreground">
            {show.overview}
          </p>
        ) : null}
      </div>
    </Command.Item>
  )
}

function EpisodeItem({
  episode,
  onSelect
}: {
  episode: SearchEpisode
  onSelect: () => void
}): ReactElement {
  const seasonEpisode = `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`

  return (
    <Command.Item
      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-foreground data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
      onSelect={onSelect}
      value={`episode-${episode.id}-${episode.title}`}
    >
      <PosterThumb
        path={episode.stillPath}
        title={episode.title}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-medium">{episode.title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {episode.showTitle} · {seasonEpisode}
          </span>
        </div>
        {episode.overview ? (
          <p className="truncate text-xs text-muted-foreground">
            {episode.overview}
          </p>
        ) : null}
      </div>
    </Command.Item>
  )
}

function PosterThumb({
  path,
  title
}: {
  path: string | null
  title: string
}): ReactElement {
  return (
    <div className="h-12 w-9 shrink-0 overflow-hidden rounded">
      <PosterImage
        alt=""
        className="h-12 w-9 object-cover"
        path={path}
        size="w92"
        title={title}
      />
    </div>
  )
}
