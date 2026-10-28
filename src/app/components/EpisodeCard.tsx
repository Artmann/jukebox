import { CheckIcon, PlayIcon } from 'lucide-react'
import type { ReactElement, ReactNode, Ref } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '@/lib/utils'

import type { Episode } from '../lib/media'
import {
  formatRuntime,
  isInProgress,
  isWatched,
  progressPercent,
  type EpisodeProgress
} from '../lib/resume-target'

interface EpisodeCardBaseProps {
  className?: string
  episode: Episode
  // Shown, dimmed, when the episode has no still of its own.
  fallbackImageUrl: string | null
  isCurrent?: boolean
  progress?: EpisodeProgress
  ref?: Ref<HTMLElement>
}

type EpisodeCardProps = EpisodeCardBaseProps &
  ({ onSelect: () => void; to?: never } | { onSelect?: never; to: string })

/**
 * An episode as a still with its number, title, runtime, and synopsis. Used by
 * the show page's episode row and the player's episode overlay.
 */
export function EpisodeCard({
  className,
  episode,
  fallbackImageUrl,
  isCurrent = false,
  onSelect,
  progress,
  ref,
  to
}: EpisodeCardProps): ReactElement {
  const watched = isWatched(progress)
  const inProgress = isInProgress(progress)
  const runtime = formatRuntime(episode.runtime)
  const classes = cn(
    // flex-col keeps the content top-aligned: a button otherwise centers it
    // vertically when the grid stretches the card to its row's height.
    'group flex w-full cursor-pointer flex-col rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-white',
    className
  )

  const content: ReactNode = (
    <>
      <span className="relative block aspect-video w-full overflow-hidden rounded-md bg-zinc-800">
        {episode.stillUrl ? (
          <img
            alt=""
            className="size-full object-cover transition-transform duration-300 ease-out hover-hover:group-hover:scale-105"
            loading="lazy"
            src={episode.stillUrl}
          />
        ) : (
          <>
            {fallbackImageUrl && (
              <img
                alt=""
                className="size-full object-cover opacity-40"
                loading="lazy"
                src={fallbackImageUrl}
              />
            )}

            <span className="absolute inset-0 flex items-center justify-center text-4xl font-light text-white/70 tabular-nums">
              {episode.episodeNumber}
            </span>
          </>
        )}

        <span className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />

        <span className="absolute bottom-3 left-3 flex items-center gap-2 text-white">
          <PlayIcon className="size-5 fill-current" />

          {isCurrent && (
            <span className="rounded-sm bg-white/90 px-1.5 py-0.5 text-xs font-semibold text-black">
              Now playing
            </span>
          )}
        </span>

        {(watched || inProgress) && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span
              className={
                watched ? 'block h-full bg-white/60' : 'block h-full bg-red-600'
              }
              style={{ width: `${watched ? 100 : progressPercent(progress)}%` }}
            />
          </span>
        )}
      </span>

      <span className="mt-2 flex flex-col gap-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {watched && (
            <CheckIcon
              aria-label="Watched"
              className="size-4 shrink-0 text-muted-foreground"
            />
          )}

          <span className="truncate">
            {episode.episodeNumber}. {episode.title}
          </span>
        </span>

        {runtime && (
          <span className="text-xs text-muted-foreground">{runtime}</span>
        )}

        {episode.overview && (
          <span className="text-sm leading-snug text-muted-foreground line-clamp-3">
            {episode.overview}
          </span>
        )}
      </span>
    </>
  )

  if (to !== undefined) {
    return (
      <Link
        className={classes}
        ref={ref as Ref<HTMLAnchorElement>}
        to={to}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      aria-current={isCurrent ? 'true' : undefined}
      className={classes}
      onClick={onSelect}
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
    >
      {content}
    </button>
  )
}
