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

// 9s fill + 1s hold = 10s total from overlay appearing to transition.
const defaultCountdownSeconds = 9
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
  const onPlayNowRef = useRef(onPlayNow)

  // Stash the latest callback in a ref so the countdown effect doesn't need
  // it as a dependency. Without this, a new callback identity during the
  // countdown would cancel the animation and clear the auto-fire timeout,
  // which is why the bar appeared frozen and auto-advance never fired.
  useEffect(() => {
    onPlayNowRef.current = onPlayNow
  }, [onPlayNow])

  useEffect(() => {
    if (!isCountingDown) {
      firedRef.current = false
      return
    }

    const fillElement = fillRef.current

    if (!fillElement) return

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
      onPlayNowRef.current()
    }, countdownSeconds * 1000 + holdMs)

    return () => {
      animation.cancel()
      clearTimeout(timeout)
    }
  }, [isCountingDown, countdownSeconds])

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
          className="flex-1 relative overflow-hidden bg-white/15 text-white hover:bg-white/25"
          onClick={handlePlayNowClick}
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
    </div>
  )
}
