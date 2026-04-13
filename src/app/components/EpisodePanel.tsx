import { X } from 'lucide-react'
import type { Episode, SeasonWithEpisodes } from '../lib/media'

interface EpisodePanelProps {
  currentEpisodeId: number
  onClose: () => void
  onSelectEpisode: (episode: Episode) => void
  onSelectSeason: (seasonNumber: number) => void
  seasons: SeasonWithEpisodes[]
  selectedSeason: number
  showTitle: string
}

export function EpisodePanel({
  currentEpisodeId,
  onClose,
  onSelectEpisode,
  onSelectSeason,
  seasons,
  selectedSeason,
  showTitle
}: EpisodePanelProps) {
  const activeSeason = seasons.find((season) => season.seasonNumber === selectedSeason)

  return (
    <div className="bg-black/95 border-l border-white/10 h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <span className="text-white text-sm font-medium truncate">{showTitle}</span>
        <button
          aria-label="Close episode panel"
          className="p-1 text-white/60 hover:text-white cursor-pointer flex-shrink-0 ml-2"
          onClick={onClose}
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="flex gap-1 px-4 py-3 border-b border-white/10 flex-wrap">
        {seasons.map((season) => (
          <button
            key={season.seasonNumber}
            className={`px-3 py-1 rounded text-sm font-medium cursor-pointer transition-colors ${
              season.seasonNumber === selectedSeason
                ? 'bg-white text-black'
                : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
            onClick={() => onSelectSeason(season.seasonNumber)}
          >
            S{season.seasonNumber}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeSeason?.episodes.map((episode) => {
          const isCurrent = episode.id === currentEpisodeId

          return (
            <button
              key={episode.id}
              className={`w-full text-left px-4 py-3 border-l-2 transition-colors ${
                isCurrent
                  ? 'bg-white/10 border-red-600'
                  : 'border-transparent hover:bg-white/5'
              }`}
              onClick={() => onSelectEpisode(episode)}
            >
              <div className="text-white/60 text-xs mb-1">
                E{episode.episodeNumber}
                {episode.runtime != null && ` · ${episode.runtime}m`}
              </div>
              <div className="text-white text-sm leading-snug">{episode.title}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
