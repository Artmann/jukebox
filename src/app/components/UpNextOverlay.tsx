import { useMemo, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'

import { useUpNextAutoAdvance } from '../hooks/useUpNextAutoAdvance'
import type { Episode, Show } from '../lib/media'
import { PosterImage } from './PosterImage'

interface UpNextOverlayProps {
  nextEpisode: Episode
  show: Show
  onPlayNow: () => void
  onCancel: () => void
  countdownSeconds?: number
  /**
   * When true the overlay is rendering its final countdown. While false it's
   * in "peek" mode (visible but not counting) so the viewer has context for
   * the final 90 seconds before the automatic countdown starts.
   */
  isCountingDown: boolean
}

const defaultCountdownSeconds = 9

export function UpNextOverlay({
  nextEpisode,
  show,
  onPlayNow,
  onCancel,
  countdownSeconds = defaultCountdownSeconds,
  isCountingDown
}: UpNextOverlayProps): ReactElement {
  const { advance, fillRef } = useUpNextAutoAdvance({
    countdownSeconds,
    isCountingDown,
    onAdvance: onPlayNow
  })

  const subtitle = useMemo(
    () =>
      `S${nextEpisode.seasonNumber} E${nextEpisode.episodeNumber} · ${nextEpisode.title}`,
    [nextEpisode]
  )

  return (
    // A native non-modal dialog: rendered with `open` so it never steals
    // focus or blocks the player the way showModal() would. The utility
    // classes reset the browser's default dialog margin, inset, and border.
    <dialog
      aria-label="Up next"
      aria-live="polite"
      className="absolute bottom-24 right-6 left-auto top-auto z-40 m-0 w-80 max-w-[calc(100vw-3rem)] rounded-lg border-0 bg-black/85 p-4 text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
      open
    >
      <div className="flex gap-3">
        <div className="w-20 flex-shrink-0 overflow-hidden rounded">
          <PosterImage
            alt={show.title}
            url={show.posterUrl}
            title={show.title}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs uppercase tracking-wide text-white/60">
            Up next
          </span>
          <h3 className="mt-1 truncate text-sm font-semibold text-white">
            {show.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-white/70">{subtitle}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          className="flex-1 relative overflow-hidden bg-white/15 text-white hover:bg-white/25"
          onClick={advance}
          size="sm"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-full origin-left bg-white"
            ref={fillRef}
            style={{ transform: 'scaleX(0)' }}
          />
          <span className="relative mix-blend-difference">Next episode</span>
        </Button>
        <Button
          className="flex-1"
          onClick={onCancel}
          size="sm"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </dialog>
  )
}
