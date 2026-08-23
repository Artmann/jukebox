import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'

// 9s fill + 1s hold = 10s total from the countdown starting to transition.
const holdMs = 1000

interface UpNextAutoAdvanceOptions {
  countdownSeconds: number
  isCountingDown: boolean
  onAdvance: () => void
}

interface UpNextAutoAdvanceResult {
  /** Advances immediately (for the "Next episode" button), at most once. */
  advance: () => void
  /** Attach to the element that animates the countdown fill bar. */
  fillRef: RefObject<HTMLSpanElement | null>
}

/**
 * Runs the up-next countdown: animates the fill bar and fires `onAdvance`
 * once when the countdown (plus a short hold) elapses. `onAdvance` is read
 * through an effect event so a new callback identity during the countdown
 * doesn't cancel the animation and auto-fire timeout — that bug made the bar
 * appear frozen and auto-advance never fire.
 */
export function useUpNextAutoAdvance({
  countdownSeconds,
  isCountingDown,
  onAdvance
}: UpNextAutoAdvanceOptions): UpNextAutoAdvanceResult {
  const fillRef = useRef<HTMLSpanElement>(null)
  const firedRef = useRef(false)

  const fireAdvance = useEffectEvent(() => {
    if (firedRef.current) return

    firedRef.current = true
    onAdvance()
  })

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

    const timeout = setTimeout(
      () => {
        fireAdvance()
      },
      countdownSeconds * 1000 + holdMs
    )

    return () => {
      animation.cancel()
      clearTimeout(timeout)
    }
  }, [isCountingDown, countdownSeconds])

  const advance = () => {
    if (firedRef.current) return

    firedRef.current = true
    onAdvance()
  }

  return { advance, fillRef }
}
