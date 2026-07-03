import { useEffect, useRef } from 'react'
import { Check, X } from 'lucide-react'
import type { Episode, SeasonWithEpisodes } from '../lib/media'
import { watchedThreshold } from '../../lib/watched'

type EpisodeProgressMap = Record<
  number,
  { currentTime: number; duration: number | null }
>

interface EpisodePanelProps {
  currentEpisodeId: number
  onClose: () => void
  onSelectEpisode: (episode: Episode) => void
  onSelectSeason: (seasonNumber: number) => void
  progressMap?: EpisodeProgressMap
  seasons: SeasonWithEpisodes[]
  selectedSeason: number
  showTitle: string
}

export function EpisodePanel({
  currentEpisodeId,
  onClose,
  onSelectEpisode,
  onSelectSeason,
  progressMap,
  seasons,
  selectedSeason,
  showTitle
}: EpisodePanelProps) {
  const activeSeason = seasons.find(
    (season) => season.seasonNumber === selectedSeason
  )

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const currentRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const container = scrollRef.current
    const current = currentRef.current

    if (!container || !current) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const currentRect = current.getBoundingClientRect()
    const offsetTop =
      currentRect.top - containerRect.top + container.scrollTop

    const target =
      offsetTop - container.clientHeight / 2 + current.clientHeight / 2
    const max = container.scrollHeight - container.clientHeight

    container.scrollTop = Math.max(0, Math.min(target, max))
  }, [selectedSeason, currentEpisodeId, activeSeason?.episodes.length])

  return (
    <div className="bg-black/95 border-l border-white/10 h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white text-sm font-medium truncate">
          {showTitle}
        </span>
        <button
          aria-label="Close episode panel"
          className="min-h-11 min-w-11 flex items-center justify-center text-white/60 hover:text-white cursor-pointer flex-shrink-0 ml-2"
          onClick={onClose}
          type="button"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex gap-1 px-4 py-3 border-b border-white/10 flex-wrap">
        {seasons.map((season) => (
          <button
            key={season.seasonNumber}
            className={`px-3 min-h-11 rounded text-sm font-medium cursor-pointer transition-colors ${
              season.seasonNumber === selectedSeason
                ? 'bg-white text-black'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            onClick={() => onSelectSeason(season.seasonNumber)}
            type="button"
          >
            Season {season.seasonNumber}
          </button>
        ))}
      </div>

      <div
        className="flex-1 overflow-y-auto slim-scrollbar"
        ref={scrollRef}
      >
        {activeSeason?.episodes.map((episode) => {
          const isCurrent = episode.id === currentEpisodeId
          const progress = progressMap?.[episode.id]
          const percent = progress?.duration
            ? Math.min((progress.currentTime / progress.duration) * 100, 100)
            : 0
          const watched = progress?.duration
            ? progress.currentTime / progress.duration >= watchedThreshold
            : false
          const inProgress = percent > 0 && !watched

          return (
            <button
              key={episode.id}
              ref={isCurrent ? currentRef : undefined}
              className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                isCurrent
                  ? 'bg-white/10 border-red-600'
                  : 'border-transparent hover:bg-white/5'
              }`}
              onClick={() => {
                onSelectEpisode(episode)
                onClose()
              }}
              type="button"
            >
              <div className="text-white/60 text-xs mb-1 flex items-center gap-1">
                {watched && <Check className="size-3" />}
                <span>
                  E{episode.episodeNumber}
                  {episode.runtime != null && ` · ${episode.runtime}m`}
                </span>
              </div>

              <div
                className={`text-sm leading-snug ${watched ? 'text-white/70' : 'text-white'}`}
              >
                {episode.title}
              </div>

              {(watched || inProgress) && (
                <div className="mt-1.5 h-0.5 w-full rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${watched ? 'bg-white/40' : 'bg-red-600'}`}
                    style={{ width: `${watched ? 100 : percent}%` }}
                  />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
