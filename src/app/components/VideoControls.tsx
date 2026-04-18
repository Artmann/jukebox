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
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { toast } from 'sonner'
import type Player from 'video.js/dist/types/player'

import { cn } from '@/lib/utils'

import type { SubtitleTrack } from '../lib/media'
import { formatTime } from '../lib/format'
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

// 'off' is a reserved sentinel for the "no captions" menu item — subtitle ids
// are positive integers from the database so there's no collision.
const subtitleOffValue = 'off'

const skipSeconds = 10
const saveIntervalMs = 10000

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
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [remainingTime, setRemainingTime] = useState(0)
  const [activeSubtitleId, setActiveSubtitleId] = useState<string>(
    subtitleOffValue
  )
  const lastSavedTimeRef = useRef<number>(0)

  // Reset the selected subtitle when the available track list changes (e.g.
  // navigating from one episode to another). The player tears down and
  // recreates remote text tracks, so any prior selection is gone.
  useEffect(() => {
    setActiveSubtitleId(subtitleOffValue)
  }, [subtitles])

  // Surface track-load errors as a toast so the user knows to pick a
  // different language instead of staring at empty captions.
  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const remoteTrackElements = player.remoteTextTrackEls() as unknown as {
      length: number
      [index: number]: HTMLTrackElement
    } | null

    if (!remoteTrackElements || remoteTrackElements.length === 0) {
      return
    }

    const handleTrackError = () => {
      toast.error('Subtitle failed to load. Pick another track.')
      setActiveSubtitleId(subtitleOffValue)
    }

    const elementsToCleanup: HTMLTrackElement[] = []

    for (let index = 0; index < remoteTrackElements.length; index++) {
      const element = remoteTrackElements[index]

      if (!element) {
        continue
      }

      element.addEventListener('error', handleTrackError)
      elementsToCleanup.push(element)
    }

    return () => {
      for (const element of elementsToCleanup) {
        element.removeEventListener('error', handleTrackError)
      }
    }
  }, [player, subtitles])

  const supportedSubtitles = (subtitles ?? []).filter(
    (subtitle) => subtitle.isSupported
  )
  const unsupportedSubtitles = (subtitles ?? []).filter(
    (subtitle) => !subtitle.isSupported
  )
  const hasSubtitles =
    supportedSubtitles.length > 0 || unsupportedSubtitles.length > 0

  const handleSelectSubtitle = (selectedId: string) => {
    setActiveSubtitleId(selectedId)

    if (!player || player.isDisposed()) {
      return
    }

    // video.js's TrackList type doesn't expose length/indexing, but the
    // runtime instance is iterable via `length`/[index]. Cast through unknown
    // to a minimal interface so we can walk it safely.
    const textTracks = player.textTracks() as unknown as {
      length: number
      [index: number]: TextTrack
    } | null

    if (!textTracks) {
      return
    }

    const selectedSubtitle = supportedSubtitles.find(
      (subtitle) => String(subtitle.id) === selectedId
    )

    for (let index = 0; index < textTracks.length; index++) {
      const track = textTracks[index]

      if (!track || track.kind !== 'subtitles') {
        continue
      }

      if (selectedSubtitle && track.language === selectedSubtitle.language) {
        track.mode = 'showing'
      } else {
        track.mode = 'disabled'
      }
    }
  }

  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    const onTimeUpdate = () => {
      const currentTime = player.currentTime() ?? 0
      const duration = player.duration() ?? 0
      if (duration > 0) {
        setProgress(currentTime / duration)
        setRemainingTime(duration - currentTime)
      }
    }

    const onProgress = () => {
      const bufferedRanges = player.buffered() as TimeRanges | null
      const duration = player.duration() ?? 0

      if (bufferedRanges && bufferedRanges.length > 0 && duration > 0) {
        const bufferedEnd = bufferedRanges.end(bufferedRanges.length - 1)
        setBuffered(bufferedEnd / duration)
      }
    }

    player.on('play', onPlay)
    player.on('pause', onPause)
    player.on('timeupdate', onTimeUpdate)
    player.on('progress', onProgress)

    setIsPlaying(!player.paused())

    return () => {
      if (player.isDisposed()) return
      player.off('play', onPlay)
      player.off('pause', onPause)
      player.off('timeupdate', onTimeUpdate)
      player.off('progress', onProgress)
    }
  }, [player])

  // Save progress at intervals
  useEffect(() => {
    if (!player) {
      return
    }

    const saveProgress = async () => {
      if (player.isDisposed()) {
        return
      }

      const currentTime = player.currentTime() ?? 0
      const duration = player.duration() ?? 0

      if (currentTime === lastSavedTimeRef.current) {
        return
      }

      lastSavedTimeRef.current = currentTime

      const progressUrl = episodeId
        ? `/api/progress/episode/${episodeId}`
        : `/api/progress/${movieId}`

      await fetch(progressUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentTime, duration })
      })
    }

    const interval = setInterval(() => void saveProgress(), saveIntervalMs)

    return () => {
      clearInterval(interval)
      void saveProgress()
    }
  }, [player, movieId, episodeId])

  const handlePlayPause = () => {
    if (!player) return
    if (player.paused()) {
      void player.play()
    } else {
      void player.pause()
    }
  }

  const handleSkipBackward = () => {
    if (!player) return
    const currentTime = player.currentTime() ?? 0
    player.currentTime(Math.max(0, currentTime - skipSeconds))
  }

  const handleSkipForward = () => {
    if (!player) return
    const currentTime = player.currentTime() ?? 0
    const duration = player.duration() ?? 0
    player.currentTime(Math.min(duration, currentTime + skipSeconds))
  }

  const handleSeek = (position: number) => {
    if (!player) return
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
              onSelect={handleSelectSubtitle}
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
    >
      {children}
    </button>
  )
}
