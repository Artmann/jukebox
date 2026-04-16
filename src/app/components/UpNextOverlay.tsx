import { useEffect, useMemo, useRef, type ReactElement } from 'react'
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
   * the final 90 seconds before the automatic countdown starts.
   */
  isCountingDown: boolean
}

const defaultCountdownSeconds = 10
const holdMs = 1000

export function UpNextOverlay({
  nextEpisode,
  show,
  onPlayNow,
  onCancel,
  countdownSeconds = defaultCountdownSeconds,
  isCountingDown
}: UpNextOverlayProps): ReactElement {
  const fillRef = useRef<HTMLSpanElement>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!isCountingDown) {
      firedRef.current = false
      return
    }

    const fillElement = fillRef.current

    if (!fillElement) return

    // Drive the fill with the Web Animations API so the bar animates
    // independently of React re-renders and reliably resets on cancel.
    const animation = fillElement.animate(
      [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
      {
        duration: countdownSeconds * 1000,
        easing: 'linear',
        fill: 'forwards'
      }
    )

    const timeout = setTimeout(() => {
      if (firedRef.current) return

      firedRef.current = true
      onPlayNow()
    }, countdownSeconds * 1000 + holdMs)

    return () => {
      animation.cancel()
      clearTimeout(timeout)
    }
  }, [isCountingDown, countdownSeconds, onPlayNow])

  const subtitle = useMemo(
    () =>
      `S${nextEpisode.seasonNumber} E${nextEpisode.episodeNumber} · ${nextEpisode.title}`,
    [nextEpisode]
  )

  const handlePlayNowClick = () => {
    if (firedRef.current) return

    firedRef.current = true
    onPlayNow()
  }

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
          className="flex-1 relative overflow-hidden"
          onClick={handlePlayNowClick}
          size="sm"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 w-full origin-left bg-white/30"
            ref={fillRef}
            style={{ transform: 'scaleX(0)' }}
          />
          <span className="relative">Next episode</span>
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
