import { useEffect, useRef, type RefObject } from 'react'

interface ScrollEpisodeIntoViewOptions {
  // 'horizontal' for the show page's episode row, 'vertical' for the
  // player's episode grid.
  axis: 'horizontal' | 'vertical'
  currentEpisodeId: number | undefined
  episodeCount: number | undefined
  selectedSeason: number | null
}

interface ScrollEpisodeIntoViewResult {
  currentEpisodeRef: RefObject<HTMLElement | null>
  listRef: RefObject<HTMLDivElement | null>
}

/**
 * Centers the current episode within its scrollable list whenever the list
 * appears or the season / episode changes. Only the list scrolls, never the
 * page, so the show page's hero stays in view. This has to be an effect
 * because it measures the rendered DOM after commit.
 */
export function useScrollEpisodeIntoView({
  axis,
  currentEpisodeId,
  episodeCount,
  selectedSeason
}: ScrollEpisodeIntoViewOptions): ScrollEpisodeIntoViewResult {
  const currentEpisodeRef = useRef<HTMLElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = listRef.current
    const current = currentEpisodeRef.current

    if (!container || !current) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const currentRect = current.getBoundingClientRect()

    if (axis === 'horizontal') {
      const offsetLeft =
        currentRect.left - containerRect.left + container.scrollLeft
      const target =
        offsetLeft - container.clientWidth / 2 + current.clientWidth / 2
      const max = container.scrollWidth - container.clientWidth

      container.scrollLeft = Math.max(0, Math.min(target, max))

      return
    }

    const offsetTop = currentRect.top - containerRect.top + container.scrollTop
    const target =
      offsetTop - container.clientHeight / 2 + current.clientHeight / 2
    const max = container.scrollHeight - container.clientHeight

    container.scrollTop = Math.max(0, Math.min(target, max))
  }, [axis, currentEpisodeId, episodeCount, selectedSeason])

  return { currentEpisodeRef, listRef }
}
