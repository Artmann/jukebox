import type { ReactElement } from 'react'

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'

import { EpisodePanel } from './EpisodePanel'
import type { EpisodeProgressMap } from '../hooks/useWatchData'
import type { Episode, SeasonWithEpisodes } from '../lib/media'

interface WatchEpisodePanelsProps {
  controlsHeight: number
  currentEpisodeId: number
  isMobile: boolean
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
 * The episode browser for the watch page: a side panel on desktop and a
 * bottom sheet on mobile, both sitting above the video controls.
 */
export function WatchEpisodePanels({
  controlsHeight,
  currentEpisodeId,
  isMobile,
  onOpenChange,
  onSelectEpisode,
  onSelectSeason,
  open,
  progressMap,
  seasons,
  selectedSeason,
  showTitle
}: WatchEpisodePanelsProps): ReactElement {
  return (
    <>
      {/* Desktop side panel */}
      <div
        className={`hidden sm:block absolute top-0 right-0 w-96 z-20 ${
          open ? '' : 'pointer-events-none opacity-0'
        } transition-opacity duration-200`}
        style={{ bottom: controlsHeight }}
      >
        {open && (
          <EpisodePanel
            currentEpisodeId={currentEpisodeId}
            onClose={() => onOpenChange(false)}
            onSelectEpisode={onSelectEpisode}
            onSelectSeason={onSelectSeason}
            progressMap={progressMap}
            seasons={seasons}
            selectedSeason={selectedSeason}
            showTitle={showTitle}
          />
        )}
      </div>

      {/* Mobile bottom sheet */}
      {isMobile && (
        <Sheet
          onOpenChange={onOpenChange}
          open={open}
        >
          <SheetContent
            className="p-0 bg-black/95 border-white/10"
            hideCloseButton
            side="bottom"
            style={{
              height: `calc(85vh - ${controlsHeight}px)`,
              bottom: controlsHeight
            }}
          >
            <SheetTitle className="sr-only">{showTitle} episodes</SheetTitle>
            <EpisodePanel
              currentEpisodeId={currentEpisodeId}
              onClose={() => onOpenChange(false)}
              onSelectEpisode={onSelectEpisode}
              onSelectSeason={onSelectSeason}
              progressMap={progressMap}
              seasons={seasons}
              selectedSeason={selectedSeason}
              showTitle={showTitle}
            />
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
