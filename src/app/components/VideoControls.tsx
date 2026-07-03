import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  CheckIcon,
  List,
  Maximize,
  PauseIcon,
  PlayIcon,
  RotateCcw,
  RotateCw,
  SkipForward,
  Subtitles
} from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import type Player from 'video.js/dist/types/player'

import { cn } from '@/lib/utils'

import type { SubtitleTrack } from '../lib/media'
import { formatTime } from '../lib/format'
import { usePlaybackState } from '../hooks/usePlaybackState'
import { useProgressAutoSave } from '../hooks/useSaveProgress'
import {
  subtitleOffValue,
  useSubtitleSelection
} from '../hooks/useSubtitleSelection'
import { CastButton } from './CastButton'
import { VideoTrackBar } from './VideoTrackBar'
import { VolumeControl } from './VolumeControl'

interface VideoControlsProps {
  title: string
  player: Player | null
  movieId?: number
  episodeId?: number
  onFullscreen?: () => void
  onNextEpisode?: () => void
  onToggleEpisodes?: () => void
  showEpisodesButton?: boolean
  streamUrl?: string
  subtitles?: SubtitleTrack[]
}

const skipSeconds = 10

export function VideoControls({
  title,
  player,
  movieId,
  episodeId,
  onFullscreen,
  onNextEpisode,
  onToggleEpisodes,
  showEpisodesButton,
  streamUrl,
  subtitles
}: VideoControlsProps) {
  const { buffered, isPlaying, progress, remainingTime } =
    usePlaybackState(player)
  const { activeSubtitleId, selectSubtitle } = useSubtitleSelection(
    player,
    subtitles
  )

  useProgressAutoSave(player, { episodeId, movieId })

  const supportedSubtitles = (subtitles ?? []).filter(
    (subtitle) => subtitle.isSupported
  )
  const unsupportedSubtitles = (subtitles ?? []).filter(
    (subtitle) => !subtitle.isSupported
  )
  const hasSubtitles =
    supportedSubtitles.length > 0 || unsupportedSubtitles.length > 0

  const handlePlayPause = () => {
    if (!player) {
      return
    }

    if (player.paused()) {
      void player.play()
    } else {
      void player.pause()
    }
  }

  const handleSkipBackward = () => {
    if (!player) {
      return
    }

    const currentTime = player.currentTime() ?? 0

    player.currentTime(Math.max(0, currentTime - skipSeconds))
  }

  const handleSkipForward = () => {
    if (!player) {
      return
    }

    const currentTime = player.currentTime() ?? 0
    const duration = player.duration() ?? 0

    player.currentTime(Math.min(duration, currentTime + skipSeconds))
  }

  const handleSeek = (position: number) => {
    if (!player) {
      return
    }

    const duration = player.duration() ?? 0

    player.currentTime(position * duration)
  }

  return (
    <div className="px-6 overflow-visible">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <VideoTrackBar
            buffered={buffered}
            progress={progress}
            onSeek={handleSeek}
          />
        </div>
        <span className="text-white text-xs font-mono whitespace-nowrap">
          {formatTime(remainingTime)}
        </span>
      </div>
      <div className="flex justify-between items-center py-4 relative z-10">
        <div className="flex gap-2 items-center">
          <IconButton
            aria-label={isPlaying ? 'Pause' : 'Play'}
            onClick={handlePlayPause}
          >
            {isPlaying ? (
              <PauseIcon
                className="size-7 hover:scale-125 text-white"
                fill="currentColor"
              />
            ) : (
              <PlayIcon
                className="size-7 hover:scale-125 text-white"
                fill="currentColor"
              />
            )}
          </IconButton>

          <IconButton
            aria-label="Skip backward 10 seconds"
            onClick={handleSkipBackward}
          >
            <RotateCcw className="size-7 hover:scale-125 text-white" />
          </IconButton>

          <IconButton
            aria-label="Skip forward 10 seconds"
            onClick={handleSkipForward}
          >
            <RotateCw className="size-7 hover:scale-125 text-white" />
          </IconButton>

          <VolumeControl player={player} />
        </div>

        <div className="text-white text-sm truncate">{title}</div>

        <div className="flex gap-2 items-center">
          {streamUrl && (
            <CastButton
              episodeId={episodeId}
              movieId={movieId}
              player={player}
              streamUrl={streamUrl}
              title={title}
            />
          )}
          {hasSubtitles && (
            <SubtitleMenu
              activeSubtitleId={activeSubtitleId}
              onSelect={selectSubtitle}
              supportedSubtitles={supportedSubtitles}
              unsupportedSubtitles={unsupportedSubtitles}
            />
          )}
          {onNextEpisode && (
            <IconButton
              aria-label="Next episode"
              onClick={onNextEpisode}
            >
              <SkipForward
                className="size-7 hover:scale-125 text-white"
                fill="currentColor"
              />
            </IconButton>
          )}
          {showEpisodesButton && onToggleEpisodes && (
            <IconButton
              aria-label="Browse episodes"
              onClick={onToggleEpisodes}
            >
              <List className="size-7 hover:scale-125 text-white" />
            </IconButton>
          )}
          {onFullscreen && (
            <IconButton
              aria-label="Toggle fullscreen"
              onClick={onFullscreen}
            >
              <Maximize className="size-7 hover:scale-125 text-white" />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  )
}

interface SubtitleMenuProps {
  activeSubtitleId: string
  onSelect: (id: string) => void
  supportedSubtitles: SubtitleTrack[]
  unsupportedSubtitles: SubtitleTrack[]
}

function SubtitleMenu({
  activeSubtitleId,
  onSelect,
  supportedSubtitles,
  unsupportedSubtitles
}: SubtitleMenuProps): ReactElement {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Subtitles"
          className="p-2 flex justify-center items-center cursor-pointer"
          type="button"
        >
          <Subtitles className="size-7 hover:scale-125 text-white" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          className="z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          side="top"
          sideOffset={8}
        >
          <SubtitleMenuItem
            isActive={activeSubtitleId === subtitleOffValue}
            label="Off"
            onSelect={() => onSelect(subtitleOffValue)}
          />

          {supportedSubtitles.map((subtitle) => {
            const value = String(subtitle.id)

            return (
              <SubtitleMenuItem
                isActive={activeSubtitleId === value}
                key={subtitle.id}
                label={subtitle.displayLanguage}
                onSelect={() => onSelect(value)}
              />
            )
          })}

          {unsupportedSubtitles.map((subtitle) => (
            <DropdownMenu.Item
              className="flex cursor-not-allowed items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-muted-foreground opacity-60 outline-none data-[disabled]:pointer-events-none"
              disabled
              key={subtitle.id}
            >
              <span className="size-4" />
              <span className="flex-1 truncate">
                {subtitle.displayLanguage} (unsupported format)
              </span>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

interface SubtitleMenuItemProps {
  isActive: boolean
  label: string
  onSelect: () => void
}

function SubtitleMenuItem({
  isActive,
  label,
  onSelect
}: SubtitleMenuItemProps): ReactElement {
  return (
    <DropdownMenu.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground',
        isActive && 'font-medium'
      )}
      onSelect={(event) => {
        event.preventDefault()
        onSelect()
      }}
    >
      {isActive ? (
        <CheckIcon className="size-4 text-muted-foreground" />
      ) : (
        <span className="size-4" />
      )}
      <span className="flex-1 truncate">{label}</span>
    </DropdownMenu.Item>
  )
}

interface IconButtonProps {
  'aria-label': string
  children: ReactNode
  onClick?: () => void
}

function IconButton({
  'aria-label': ariaLabel,
  children,
  onClick
}: IconButtonProps): ReactElement {
  return (
    <button
      aria-label={ariaLabel}
      className="p-2 flex justify-center items-center cursor-pointer"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}
