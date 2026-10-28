import type { ReactElement } from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import type { SeasonWithEpisodes } from '../lib/media'

interface SeasonSelectProps {
  className?: string
  onSelectSeason: (seasonNumber: number) => void
  portalContainer?: HTMLElement | null
  seasons: ReadonlyArray<SeasonWithEpisodes>
  selectedSeason: number
}

function seasonLabel(season: SeasonWithEpisodes): string {
  if (season.name) {
    return season.name
  }

  return season.seasonNumber === 0
    ? 'Specials'
    : `Season ${season.seasonNumber}`
}

export function SeasonSelect({
  className,
  onSelectSeason,
  portalContainer,
  seasons,
  selectedSeason
}: SeasonSelectProps): ReactElement {
  return (
    <Select
      onValueChange={(value) => onSelectSeason(Number(value))}
      value={String(selectedSeason)}
    >
      <SelectTrigger
        aria-label="Season"
        className={cn(
          'min-h-11 min-w-40 cursor-pointer border-white/10 bg-white/10 text-base font-semibold text-foreground hover:bg-white/15',
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>

      <SelectContent container={portalContainer}>
        {seasons.map((season) => (
          <SelectItem
            className="min-h-11 cursor-pointer"
            key={season.id}
            value={String(season.seasonNumber)}
          >
            {seasonLabel(season)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
