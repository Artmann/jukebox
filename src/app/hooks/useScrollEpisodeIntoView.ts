import { useEffect, useRef, type RefObject } from 'react'

interface ScrollEpisodeIntoViewOptions {
  currentEpisodeId: number
  episodeCount: number | undefined
  selectedSeason: number
}

interface ScrollEpisodeIntoViewResult {
  currentEpisodeRef: RefObject<HTMLButtonElement | null>
  listRef: RefObject<HTMLDivElement | null>
}

/**
 * Centers the currently playing episode in the episode panel's scrollable
 * list whenever the panel opens or the season / episode changes. This has to
 * be an effect because it measures the rendered DOM after commit.
 */
export function useScrollEpisodeIntoView({
  currentEpisodeId,
  episodeCount,
  selectedSeason
}: ScrollEpisodeIntoViewOptions): ScrollEpisodeIntoViewResult {
  const currentEpisodeRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = listRef.current
    const current = currentEpisodeRef.current

    if (!container || !current) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const currentRect = current.getBoundingClientRect()
    const offsetTop = currentRect.top - containerRect.top + container.scrollTop

    const target =
      offsetTop - container.clientHeight / 2 + current.clientHeight / 2
    const max = container.scrollHeight - container.clientHeight

    container.scrollTop = Math.max(0, Math.min(target, max))
  }, [selectedSeason, currentEpisodeId, episodeCount])

  return { currentEpisodeRef, listRef }
}
