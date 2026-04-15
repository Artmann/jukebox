import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'

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
   * the final 30 seconds before the automatic countdown starts.
   */
  isCountingDown: boolean
}

const defaultCountdownSeconds = 10

export function UpNextOverlay({
  nextEpisode,
  show,
  onPlayNow,
  onCancel,
  countdownSeconds = defaultCountdownSeconds,
  isCountingDown
}: UpNextOverlayProps): ReactElement {
  const [remaining, setRemaining] = useState(countdownSeconds)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!isCountingDown) {
      setRemaining(countdownSeconds)
      firedRef.current = false
      return
    }

    const interval = setInterval(() => {
      setRemaining((value) => {
        const nextValue = value - 1

        if (nextValue <= 0 && !firedRef.current) {
          firedRef.current = true
          onPlayNow()
          return 0
        }

        return Math.max(0, nextValue)
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [isCountingDown, countdownSeconds, onPlayNow])

  const subtitle = useMemo(
    () =>
      `S${nextEpisode.seasonNumber} E${nextEpisode.episodeNumber} · ${nextEpisode.title}`,
    [nextEpisode]
  )

  const label = isCountingDown
    ? `Playing in ${remaining}s`
    : 'Up next'

  return (
    <div
      aria-live="polite"
      className="absolute bottom-24 right-6 z-40 w-80 max-w-[calc(100vw-3rem)] rounded-lg bg-black/85 p-4 shadow-2xl ring-1 ring-white/10 backdrop-blur"
      role="dialog"
    >
      <div className="flex gap-3">
        <div className="w-20 flex-shrink-0 overflow-hidden rounded">
          <PosterImage
            alt={show.title}
            path={show.posterPath}
            size="w185"
            title={show.title}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs uppercase tracking-wide text-white/60">
            {label}
          </span>
          <h3 className="mt-1 truncate text-sm font-semibold text-white">
            {show.title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-white/70">{subtitle}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button
          className="flex-1"
          onClick={onPlayNow}
          size="sm"
        >
          Play now
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
    </div>
  )
}
