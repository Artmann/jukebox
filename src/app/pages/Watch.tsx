import { useCallback, useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useNavigate, useParams, Link, useLocation } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetTitle
} from '@/components/ui/sheet'
import { VideoPlayer } from '../components/VideoPlayer'
import { VideoControls } from '../components/VideoControls'
import { EpisodePanel } from '../components/EpisodePanel'
import { UpNextOverlay } from '../components/UpNextOverlay'
import { VolumeIndicator } from '../components/VolumeIndicator'
import { useNextEpisode } from '../hooks/useNextEpisode'
import type { Movie } from '../hooks/useMovies'
import type { Episode, Show, ShowWithSeasons } from '../lib/media'
import type Player from 'video.js/dist/types/player'

async function fetchMovie(id: string): Promise<Movie> {
  const response = await fetch(`/api/library/movies/${id}`)

  if (!response.ok) {
    throw new Error('Failed to fetch movie')
  }

  return (await response.json()) as Movie
}

interface WatchProgress {
  currentTime: number
  duration: number | null
}

async function fetchMovieProgress(movieId: number): Promise<WatchProgress> {
  const response = await fetch(`/api/progress/${movieId}`)

  return (await response.json()) as WatchProgress
}

interface EpisodeWithShow {
  episode: Episode
  show: Show
}

async function fetchEpisodeWithShow(id: string): Promise<EpisodeWithShow> {
  const response = await fetch(`/api/library/shows/episodes/${id}`)

  if (!response.ok) throw new Error('Failed to fetch episode')

  return (await response.json()) as EpisodeWithShow
}

async function fetchShowForEpisode(showId: number): Promise<ShowWithSeasons> {
  const response = await fetch(`/api/library/shows/${showId}`)

  if (!response.ok) throw new Error('Failed to fetch show')

  return (await response.json()) as ShowWithSeasons
}

async function fetchEpisodeProgress(episodeId: number): Promise<WatchProgress> {
  const response = await fetch(`/api/progress/episode/${episodeId}`)

  return (await response.json()) as WatchProgress
}

type EpisodeProgressMap = Record<
  number,
  { currentTime: number; duration: number | null }
>

async function fetchShowProgress(showId: number): Promise<EpisodeProgressMap> {
  const response = await fetch(`/api/progress/episode/show/${showId}`)

  if (!response.ok) {
    return {}
  }

  return (await response.json()) as EpisodeProgressMap
}

const hideDelayMs = 3000
const upNextThresholdSeconds = 45

export function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const isEpisode = location.pathname.startsWith('/watch/episode/')

  const [controlsVisible, setControlsVisible] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [player, setPlayer] = useState<Player | null>(null)
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState(1)
  const [upNextDismissed, setUpNextDismissed] = useState(false)
  const [upNextVisible, setUpNextVisible] = useState(false)
  const [isCountingDown, setIsCountingDown] = useState(false)
  const [isSwapping, setIsSwapping] = useState(false)
  const [volumeIndicator, setVolumeIndicator] = useState<{
    volume: number
    muted: boolean
  } | null>(null)
  const hasRestoredProgress = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const volumeHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetHideTimer = useCallback(() => {
    setControlsVisible(true)

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }

    if (isPlaying) {
      hideTimerRef.current = setTimeout(() => {
        setControlsVisible(false)
      }, hideDelayMs)
    }
  }, [isPlaying])

  const showVolumeIndicator = useCallback((volume: number, muted: boolean) => {
    setVolumeIndicator({ volume, muted })

    if (volumeHideTimerRef.current) {
      clearTimeout(volumeHideTimerRef.current)
    }

    volumeHideTimerRef.current = setTimeout(() => {
      setVolumeIndicator(null)
    }, 1200)
  }, [])

  // Track play/pause state for auto-hide logic.
  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    player.on('play', onPlay)
    player.on('pause', onPause)
    setIsPlaying(!player.paused())

    return () => {
      if (player.isDisposed()) return
      player.off('play', onPlay)
      player.off('pause', onPause)
    }
  }, [player])

  // Show the volume indicator whenever volume or mute state changes.
  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const onVolumeChange = () => {
      if (player.isDisposed()) return
      showVolumeIndicator(player.volume() ?? 1, player.muted() ?? false)
    }

    player.on('volumechange', onVolumeChange)

    return () => {
      if (player.isDisposed()) return
      player.off('volumechange', onVolumeChange)
    }
  }, [player, showVolumeIndicator])

  // Clear the volume indicator timer on unmount to avoid leaked timers.
  useEffect(() => {
    return () => {
      if (volumeHideTimerRef.current) {
        clearTimeout(volumeHideTimerRef.current)
      }
    }
  }, [])

  // When paused, always show controls. When playing, start the hide timer.
  useEffect(() => {
    if (!isPlaying) {
      setControlsVisible(true)

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    } else {
      resetHideTimer()
    }

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [isPlaying, resetHideTimer])

  // Show controls on any keypress.
  useHotkeys('*', () => resetHideTimer())

  // Play/pause with space.
  useHotkeys(
    'space',
    (event) => {
      event.preventDefault()

      if (!player) return

      if (player.paused()) {
        void player.play()
      } else {
        player.pause()
      }
    },
    [player]
  )

  // Skip backward/forward with arrow keys.
  useHotkeys(
    'left',
    () => {
      if (!player) return
      const currentTime = player.currentTime() ?? 0
      player.currentTime(Math.max(0, currentTime - 10))
    },
    [player]
  )

  useHotkeys(
    'right',
    () => {
      if (!player) return
      const currentTime = player.currentTime() ?? 0
      const duration = player.duration() ?? 0
      player.currentTime(Math.min(duration, currentTime + 10))
    },
    [player]
  )

  // Increase volume with the up arrow.
  useHotkeys(
    'up',
    (event) => {
      event.preventDefault()

      if (!player || player.isDisposed()) return

      const current = player.volume() ?? 1
      const next = Math.min(1, current + 0.05)

      if (player.muted()) {
        player.muted(false)
      }

      player.volume(next)
    },
    [player]
  )

  // Decrease volume with the down arrow.
  useHotkeys(
    'down',
    (event) => {
      event.preventDefault()

      if (!player || player.isDisposed()) return

      const current = player.volume() ?? 1
      const next = Math.max(0, current - 0.05)

      player.volume(next)
    },
    [player]
  )

  // Movie queries (only when !isEpisode)
  const {
    data: movie,
    isLoading: isLoadingMovie,
    error: movieError
  } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => fetchMovie(id ?? ''),
    enabled: !!id && !isEpisode,
    // Keep previous data so the player tree doesn't unmount while fetching
    // the next movie — disposing the player mid-swap leaves consumers with
    // stale references and throws "Invalid target for null#on".
    placeholderData: keepPreviousData
  })

  // Episode queries (only when isEpisode)
  const {
    data: episodeData,
    isLoading: isLoadingEpisode,
    error: episodeError
  } = useQuery({
    queryKey: ['episode', id],
    queryFn: () => fetchEpisodeWithShow(id ?? ''),
    enabled: !!id && isEpisode,
    // Keep previous data so the player tree stays mounted across episode
    // transitions (see note on the movie query above).
    placeholderData: keepPreviousData
  })

  const episode = episodeData?.episode
  const episodeShow = episodeData?.show

  const { data: show } = useQuery({
    queryKey: ['show-for-episode', episodeShow?.id],
    queryFn: () => fetchShowForEpisode(episodeShow?.id ?? 0),
    enabled: !!episodeShow
  })

  const { data: episodeProgressMap } = useQuery({
    queryKey: ['show-progress', episodeShow?.id],
    queryFn: () => fetchShowProgress(episodeShow?.id ?? 0),
    enabled: !!episodeShow
  })

  // Progress (conditional)
  const { data: savedProgress } = useQuery({
    queryKey: [
      'progress',
      isEpisode ? 'episode' : 'movie',
      isEpisode ? episode?.id : movie?.id
    ],
    queryFn: () =>
      isEpisode
        ? fetchEpisodeProgress(episode?.id ?? 0)
        : fetchMovieProgress(movie?.id ?? 0),
    enabled: isEpisode ? !!episode : !!movie
  })

  // Set initial selected season when episode data loads.
  useEffect(() => {
    if (episode) {
      setSelectedSeason(episode.seasonNumber)
    }
  }, [episode])

  // Restore progress when both player and savedProgress are available.
  useEffect(() => {
    if (
      player &&
      savedProgress &&
      savedProgress.currentTime > 0 &&
      !hasRestoredProgress.current
    ) {
      hasRestoredProgress.current = true
      player.currentTime(savedProgress.currentTime)
    }
  }, [player, savedProgress])

  // Fetch the next unwatched episode from the server (endpoint-driven,
  // replaces the old ad-hoc on-ended redirect).
  const { data: nextEpisodeData } = useNextEpisode(
    episodeShow?.id,
    episode?.id,
    { enabled: isEpisode }
  )

  const nextEpisode = nextEpisodeData?.episode ?? null
  const nextEpisodeShow = nextEpisodeData?.show ?? null

  // Reset overlay state and the progress-restore guard every time the
  // watched episode changes. The player instance persists across episode
  // swaps, so we have to clear this ref manually.
  useEffect(() => {
    setUpNextDismissed(false)
    setUpNextVisible(false)
    setIsCountingDown(false)
    hasRestoredProgress.current = false
  }, [episode?.id])

  // Drop the fade overlay as soon as the new source is actually playing.
  useEffect(() => {
    if (!player || player.isDisposed()) return

    const onPlaying = () => setIsSwapping(false)

    player.on('playing', onPlaying)

    return () => {
      if (player.isDisposed()) return
      player.off('playing', onPlaying)
    }
  }, [player])

  const goToNextEpisode = useCallback(() => {
    if (!nextEpisode) return

    setIsSwapping(true)
    void navigate(`/watch/episode/${nextEpisode.id}`)
  }, [nextEpisode, navigate])

  // Track playback position to reveal the overlay in the last 30 seconds,
  // and drive the countdown state based on the 10-second threshold or the
  // `ended` event — whichever fires first.
  useEffect(() => {
    if (!player || player.isDisposed() || !isEpisode) return

    const onTimeUpdate = () => {
      const currentTime = player.currentTime() ?? 0
      const duration = player.duration() ?? 0

      if (duration <= 0) return

      const remaining = duration - currentTime

      if (remaining <= upNextThresholdSeconds && !upNextDismissed && nextEpisode) {
        setUpNextVisible(true)
        setIsCountingDown(true)
      }
    }

    const onEnded = () => {
      if (!nextEpisode) {
        toast("You've finished all episodes.")
        if (episodeShow) {
          void navigate(`/shows/${episodeShow.id}`)
        }
        return
      }

      if (upNextDismissed) {
        return
      }

      setUpNextVisible(true)
      setIsCountingDown(true)
    }

    player.on('timeupdate', onTimeUpdate)
    player.on('ended', onEnded)

    return () => {
      if (player.isDisposed()) return
      player.off('timeupdate', onTimeUpdate)
      player.off('ended', onEnded)
    }
  }, [
    player,
    isEpisode,
    nextEpisode,
    upNextDismissed,
    episodeShow,
    navigate
  ])

  const handleSelectEpisode = useCallback(
    (selectedEpisode: Episode) => {
      if (selectedEpisode.id === episode?.id) return

      if (player && episode) {
        const currentTime = player.currentTime() ?? 0
        const duration = player.duration() ?? 0

        void fetch(`/api/progress/episode/${episode.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentTime, duration })
        })
      }

      setIsSwapping(true)
      void navigate(`/watch/episode/${selectedEpisode.id}`)
    },
    [player, episode, navigate]
  )

  const isLoading = isEpisode ? isLoadingEpisode : isLoadingMovie
  const error = isEpisode ? episodeError : movieError

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    )
  }

  if (error || (isEpisode ? !episode : !movie)) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <p className="text-white">
          {isEpisode ? 'Episode not found' : 'Movie not found'}
        </p>
        <Button
          asChild
          variant="outline"
        >
          <Link to="/">Back to Library</Link>
        </Button>
      </div>
    )
  }

  const streamUrl = isEpisode
    ? `/api/stream/episode/${episode?.id}`
    : `/api/stream/${movie?.id}`

  const title =
    isEpisode && episode && episodeShow
      ? `${episodeShow.title} — S${episode.seasonNumber} E${episode.episodeNumber} · ${episode.title}`
      : (movie?.title ?? '')

  return (
    <div
      className={`bg-black w-full h-screen relative ${controlsVisible ? '' : 'cursor-none'}`}
      onMouseMove={resetHideTimer}
    >
      <div className="absolute inset-0">
        <VideoPlayer
          src={streamUrl}
          onReady={setPlayer}
        />
      </div>

      <div
        aria-hidden="true"
        className={`absolute inset-0 z-40 bg-black pointer-events-none transition-opacity duration-300 ${isSwapping ? 'opacity-100' : 'opacity-0'}`}
      />

      <VolumeIndicator
        muted={volumeIndicator?.muted ?? false}
        visible={volumeIndicator !== null}
        volume={volumeIndicator?.volume ?? 0}
      />

      {isEpisode && upNextVisible && nextEpisode && (
        <video
          aria-hidden="true"
          className="hidden"
          preload="auto"
          src={`/api/stream/episode/${nextEpisode.id}`}
        />
      )}

      {isEpisode && upNextVisible && nextEpisode && nextEpisodeShow && (
        <UpNextOverlay
          isCountingDown={isCountingDown}
          nextEpisode={nextEpisode}
          onCancel={() => {
            setUpNextDismissed(true)
            setUpNextVisible(false)
            setIsCountingDown(false)
          }}
          onPlayNow={goToNextEpisode}
          show={nextEpisodeShow}
        />
      )}

      {isEpisode && show && episode && (
        <>
          {/* Desktop side panel */}
          <div
            className={`hidden sm:block absolute top-0 right-0 bottom-0 w-96 z-20 ${
              episodePanelOpen ? '' : 'pointer-events-none opacity-0'
            } transition-opacity duration-200`}
          >
            {episodePanelOpen && (
              <EpisodePanel
                currentEpisodeId={episode.id}
                onClose={() => setEpisodePanelOpen(false)}
                onSelectEpisode={handleSelectEpisode}
                onSelectSeason={setSelectedSeason}
                progressMap={episodeProgressMap}
                seasons={show.seasons}
                selectedSeason={selectedSeason}
                showTitle={show.title}
              />
            )}
          </div>

          {/* Mobile bottom sheet */}
          <Sheet
            onOpenChange={setEpisodePanelOpen}
            open={episodePanelOpen}
          >
            <SheetContent
              className="sm:hidden h-[85vh] p-0 bg-black/95 border-white/10"
              hideCloseButton
              side="bottom"
            >
              <SheetTitle className="sr-only">
                {show.title} episodes
              </SheetTitle>
              <EpisodePanel
                currentEpisodeId={episode.id}
                onClose={() => setEpisodePanelOpen(false)}
                onSelectEpisode={handleSelectEpisode}
                onSelectSeason={setSelectedSeason}
                progressMap={episodeProgressMap}
                seasons={show.seasons}
                selectedSeason={selectedSeason}
                showTitle={show.title}
              />
            </SheetContent>
          </Sheet>
        </>
      )}

      <Link
        aria-label="Back to home"
        className={`absolute top-4 left-4 z-30 flex items-center justify-center size-11 text-white/90 hover:text-white transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        to="/"
      >
        <ArrowLeft className="size-7" />
      </Link>

      <div
        className={`absolute bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-black/80 to-transparent pt-16 transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <VideoControls
          title={title}
          player={player}
          movieId={isEpisode ? undefined : movie?.id}
          episodeId={isEpisode ? episode?.id : undefined}
          showEpisodesButton={isEpisode}
          streamUrl={streamUrl}
          onToggleEpisodes={() => setEpisodePanelOpen((open) => !open)}
        />
      </div>
    </div>
  )
}
