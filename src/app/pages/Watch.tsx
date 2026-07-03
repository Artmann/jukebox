import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UpNextOverlay } from '../components/UpNextOverlay'
import { VideoControls } from '../components/VideoControls'
import { VideoPlayer } from '../components/VideoPlayer'
import { VolumeIndicator } from '../components/VolumeIndicator'
import { WatchEpisodePanels } from '../components/WatchEpisodePanels'
import { useIsPlaying } from '../hooks/useIsPlaying'
import { useMeasuredHeight } from '../hooks/useMeasuredHeight'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { usePlayerHotkeys } from '../hooks/usePlayerHotkeys'
import { useRestoreProgress } from '../hooks/useRestoreProgress'
import { useSaveProgress } from '../hooks/useSaveProgress'
import { useUpNextCountdown } from '../hooks/useUpNextCountdown'
import { useVolumeIndicator } from '../hooks/useVolumeIndicator'
import { useWatchData } from '../hooks/useWatchData'
import type { Episode } from '../lib/media'
import type Player from 'video.js/dist/types/player'

const hideDelayMs = 3000

interface SeasonSelection {
  // The episode the viewer picked a season for. When the watched episode
  // changes, a selection for the old episode is ignored and the panel falls
  // back to the new episode's season — no reset effect needed.
  forEpisodeId: number
  season: number
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-white" />
    </div>
  )
}

function NotFoundScreen({ isEpisode }: { isEpisode: boolean }) {
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

export function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const isEpisode = location.pathname.startsWith('/watch/episode/')

  const [controlsVisible, setControlsVisible] = useState(true)
  const [player, setPlayer] = useState<Player | null>(null)
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 639px)')
  const [seasonSelection, setSeasonSelection] =
    useState<SeasonSelection | null>(null)
  const [isSwapping, setIsSwapping] = useState(false)
  const { height: controlsHeight, ref: controlsRef } = useMeasuredHeight()
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const {
    episode,
    episodeProgressMap,
    episodeShow,
    error,
    isLoading,
    movie,
    nextEpisode,
    nextEpisodeShow,
    savedProgress,
    show,
    subtitles
  } = useWatchData(id, isEpisode)

  const isPlaying = useIsPlaying(player)
  const volumeIndicator = useVolumeIndicator(player)
  const { mutate: saveProgress } = useSaveProgress()

  const mediaKey = isEpisode
    ? episode
      ? `episode-${episode.id}`
      : null
    : movie
      ? `movie-${movie.id}`
      : null

  useRestoreProgress(player, savedProgress, mediaKey)

  const {
    dismiss: dismissUpNext,
    isCountingDown,
    upNextVisible
  } = useUpNextCountdown({
    episodeId: episode?.id,
    episodeShow,
    isEpisode,
    nextEpisode,
    player
  })

  const handleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void wrapperRef.current?.requestFullscreen()
    }
  }, [])

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

  // When paused, always show controls. When playing, start the hide timer.
  useEffect(() => {
    setControlsVisible(true)

    if (!isPlaying) {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }

      return
    }

    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false)
    }, hideDelayMs)

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [isPlaying])

  usePlayerHotkeys(player, resetHideTimer)

  // Drop the fade overlay as soon as the new source is actually playing.
  useEffect(() => {
    if (!player || player.isDisposed()) {
      return
    }

    const onPlaying = () => setIsSwapping(false)

    player.on('playing', onPlaying)

    return () => {
      if (player.isDisposed()) {
        return
      }

      player.off('playing', onPlaying)
    }
  }, [player])

  const goToNextEpisode = useCallback(() => {
    if (!nextEpisode) {
      return
    }

    setIsSwapping(true)
    void navigate(`/watch/episode/${nextEpisode.id}`)
  }, [nextEpisode, navigate])

  const handleSelectEpisode = useCallback(
    (selectedEpisode: Episode) => {
      if (selectedEpisode.id === episode?.id) {
        return
      }

      if (player && episode) {
        saveProgress({
          currentTime: player.currentTime() ?? 0,
          duration: player.duration() ?? 0,
          progressUrl: `/api/progress/episode/${episode.id}`
        })
      }

      setIsSwapping(true)
      void navigate(`/watch/episode/${selectedEpisode.id}`)
    },
    [player, episode, navigate, saveProgress]
  )

  const selectedSeason =
    seasonSelection && seasonSelection.forEpisodeId === episode?.id
      ? seasonSelection.season
      : (episode?.seasonNumber ?? 1)

  const handleSelectSeason = (season: number) => {
    if (!episode) {
      return
    }

    setSeasonSelection({ forEpisodeId: episode.id, season })
  }

  if (isLoading) {
    return <LoadingScreen />
  }

  if (error || (isEpisode ? !episode : !movie)) {
    return <NotFoundScreen isEpisode={isEpisode} />
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
      ref={wrapperRef}
      className={`bg-black w-full h-screen relative ${controlsVisible ? '' : 'cursor-none'}`}
      onMouseMove={resetHideTimer}
    >
      <div className="absolute inset-0">
        <VideoPlayer
          src={streamUrl}
          subtitles={subtitles}
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
          muted
          preload="auto"
          src={`/api/stream/episode/${nextEpisode.id}`}
          tabIndex={-1}
        />
      )}

      {isEpisode && upNextVisible && nextEpisode && nextEpisodeShow && (
        <UpNextOverlay
          isCountingDown={isCountingDown}
          nextEpisode={nextEpisode}
          onCancel={dismissUpNext}
          onPlayNow={goToNextEpisode}
          show={nextEpisodeShow}
        />
      )}

      {isEpisode && show && episode && (
        <WatchEpisodePanels
          controlsHeight={controlsHeight}
          currentEpisodeId={episode.id}
          isMobile={isMobile}
          onOpenChange={setEpisodePanelOpen}
          onSelectEpisode={handleSelectEpisode}
          onSelectSeason={handleSelectSeason}
          open={episodePanelOpen}
          progressMap={episodeProgressMap}
          seasons={show.seasons}
          selectedSeason={selectedSeason}
          showTitle={show.title}
        />
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
        ref={controlsRef}
      >
        <VideoControls
          title={title}
          player={player}
          movieId={isEpisode ? undefined : movie?.id}
          episodeId={isEpisode ? episode?.id : undefined}
          showEpisodesButton={isEpisode}
          streamUrl={streamUrl}
          subtitles={subtitles}
          onFullscreen={handleFullscreen}
          onNextEpisode={isEpisode && nextEpisode ? goToNextEpisode : undefined}
          onToggleEpisodes={() => setEpisodePanelOpen((open) => !open)}
        />
      </div>
    </div>
  )
}
