import * as Dialog from '@radix-ui/react-dialog'
import { XIcon } from 'lucide-react'
import type { ReactElement } from 'react'

import { useScrollEpisodeIntoView } from '../hooks/useScrollEpisodeIntoView'
import type { Episode, SeasonWithEpisodes } from '../lib/media'
import type { EpisodeProgressMap } from '../lib/resume-target'
import { EpisodeCard } from './EpisodeCard'
import { SeasonSelect } from './SeasonSelect'

interface EpisodeOverlayProps {
  // The element to render into. The watch page passes its fullscreen
  // wrapper, so the overlay stays visible in fullscreen.
  container?: HTMLElement | null
  currentEpisodeId: number
  fallbackImageUrl: string | null
  onOpenChange: (open: boolean) => void
  onSelectEpisode: (episode: Episode) => void
  onSelectSeason: (seasonNumber: number) => void
  open: boolean
  progressMap?: EpisodeProgressMap
  seasons: ReadonlyArray<SeasonWithEpisodes>
  selectedSeason: number
  showTitle: string
}

/**
 * The watch page's episode browser: dims the video and lays the season's
 * episodes out as a grid of stills. Playback continues underneath.
 */
export function EpisodeOverlay({
  container,
  onOpenChange,
  open,
  showTitle,
  ...gridProps
}: EpisodeOverlayProps): ReactElement {
  return (
    <Dialog.Root
      onOpenChange={onOpenChange}
      open={open}
    >
      <Dialog.Portal container={container}>
        <Dialog.Content className="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <Dialog.Description className="sr-only">
            Pick an episode to play.
          </Dialog.Description>

          <EpisodeOverlayGrid
            {...gridProps}
            container={container}
            onClose={() => onOpenChange(false)}
            showTitle={showTitle}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface EpisodeOverlayGridProps extends Omit<
  EpisodeOverlayProps,
  'onOpenChange' | 'open'
> {
  onClose: () => void
}

// Mounted only while the overlay is open, so the current episode is scrolled
// into view each time it opens.
function EpisodeOverlayGrid({
  container,
  currentEpisodeId,
  fallbackImageUrl,
  onClose,
  onSelectEpisode,
  onSelectSeason,
  progressMap,
  seasons,
  selectedSeason,
  showTitle
}: EpisodeOverlayGridProps): ReactElement {
  const activeSeason = seasons.find(
    (season) => season.seasonNumber === selectedSeason
  )

  const { currentEpisodeRef, listRef } = useScrollEpisodeIntoView({
    axis: 'vertical',
    currentEpisodeId,
    episodeCount: activeSeason?.episodes.length,
    selectedSeason
  })

  return (
    <>
      <div className="flex items-center gap-4 px-4 pt-4 pb-4 sm:px-8 sm:pt-6">
        <Dialog.Title className="min-w-0 flex-1 truncate text-lg font-semibold text-white sm:text-xl">
          {showTitle}
        </Dialog.Title>

        {seasons.length > 1 && (
          <SeasonSelect
            onSelectSeason={onSelectSeason}
            portalContainer={container}
            seasons={seasons}
            selectedSeason={selectedSeason}
          />
        )}

        <Dialog.Close
          aria-label="Close episodes"
          className="flex size-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
        >
          <XIcon className="size-6" />
        </Dialog.Close>
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 pb-8 slim-scrollbar sm:px-8"
        ref={listRef}
      >
        <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {activeSeason?.episodes.map((episode) => (
            <EpisodeCard
              episode={episode}
              fallbackImageUrl={fallbackImageUrl}
              isCurrent={episode.id === currentEpisodeId}
              key={episode.id}
              onSelect={() => {
                onSelectEpisode(episode)
                onClose()
              }}
              progress={progressMap?.[episode.id]}
              ref={
                episode.id === currentEpisodeId ? currentEpisodeRef : undefined
              }
            />
          ))}
        </div>
      </div>
    </>
  )
}
