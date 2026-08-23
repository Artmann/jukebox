import { useCallback, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { UpNextOverlay } from '../components/UpNextOverlay'
import { VideoControls } from '../components/VideoControls'
import { VideoPlayer } from '../components/VideoPlayer'
import type { ResolvedSource } from '../lib/resolve-source'
import { VolumeIndicator } from '../components/VolumeIndicator'
import { WatchEpisodePanels } from '../components/WatchEpisodePanels'
import { useControlsAutoHide } from '../hooks/useControlsAutoHide'
import { useIsPlaying } from '../hooks/useIsPlaying'
import { useMeasuredHeight } from '../hooks/useMeasuredHeight'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { usePlaybackTimeline } from '../hooks/usePlaybackTimeline'
import { usePlayerHotkeys } from '../hooks/usePlayerHotkeys'
import { useRestoreProgress } from '../hooks/useRestoreProgress'
import { useSaveProgress } from '../hooks/useSaveProgress'
import { useSourceSwapFade } from '../hooks/useSourceSwapFade'
import { useUpNextCountdown } from '../hooks/useUpNextCountdown'
import { useVolumeIndicator } from '../hooks/useVolumeIndicator'
import { useWatchData } from '../hooks/useWatchData'
import type { Episode } from '../lib/media'
import { fetchSeekStart } from '../lib/seek-start'
import type Player from 'video.js/dist/types/player'

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

  const [player, setPlayer] = useState<Player | null>(null)
  const [episodePanelOpen, setEpisodePanelOpen] = useState(false)
  const isMobile = useMediaQuery('(max-width: 639px)')
  const [seasonSelection, setSeasonSelection] =
    useState<SeasonSelection | null>(null)
  // What the player decided about the current stream: whether it's transcoded,
  // and the file's real duration. Tagged with the media it belongs to so the
  // page never treats the previous episode's answer as this one's.
  const [resolvedSource, setResolvedSource] = useState<{
    mediaKey: string
    source: ResolvedSource
  } | null>(null)
  // Where the current playback session starts in the file. Non-zero only after
  // a seek past a running transcode, which restarts the conversion there.
  const [startSeconds, setStartSeconds] = useState(0)
  const [startSecondsMediaKey, setStartSecondsMediaKey] = useState<
    string | null
  >(null)
  const { height: controlsHeight, ref: controlsRef } = useMeasuredHeight()
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
  const { controlsVisible, showControls } = useControlsAutoHide(isPlaying)
  const { beginSwap, isSwapping } = useSourceSwapFade(player)
  const volumeIndicator = useVolumeIndicator(player)
  const { mutate: saveProgress } = useSaveProgress()

  const mediaKey = isEpisode
    ? episode
      ? `episode-${episode.id}`
      : null
    : movie
      ? `movie-${movie.id}`
      : null

  // Reset the offset during render rather than in an effect, so the player is
  // never handed a new episode together with the previous one's seek position.
  if (startSecondsMediaKey !== mediaKey) {
    setStartSecondsMediaKey(mediaKey)
    setStartSeconds(0)
  }

  const isSourceReady =
    mediaKey !== null && resolvedSource?.mediaKey === mediaKey

  const restartFileId = resolvedSource?.source.fileId ?? null
  const restartRequestRef = useRef(0)

  const handleRestart = useCallback(
    (seconds: number) => {
      // Fade to black while the new conversion spins up, so the jump reads
      // as a seek instead of a reload.
      beginSwap()

      const requestId = ++restartRequestRef.current

      void (async () => {
        // Stream-copied video can only begin at a keyframe, so ask the
        // server where this seek actually starts and use that as the
        // session offset — otherwise absolute time would drift by up to one
        // GOP after every seek. fetchSeekStart falls back to the raw target
        // if the lookup fails.
        const startSeconds = restartFileId
          ? await fetchSeekStart(restartFileId, seconds)
          : seconds

        // A newer seek superseded this one while the lookup was in flight.
        if (restartRequestRef.current !== requestId) {
          return
        }

        setStartSeconds(startSeconds)
      })()
    },
    [beginSwap, restartFileId]
  )

  const handleSourceResolved = useCallback(
    (source: ResolvedSource) => {
      if (mediaKey === null) {
        return
      }

      setResolvedSource({ mediaKey, source })
    },
    [mediaKey]
  )

  const timeline = usePlaybackTimeline({
    duration: isSourceReady ? (resolvedSource?.source.duration ?? null) : null,
    isTranscoded: isSourceReady
      ? (resolvedSource?.source.isTranscoded ?? false)
      : false,
    onRestart: handleRestart,
    player,
    startSeconds
  })

  useRestoreProgress({ isSourceReady, mediaKey, savedProgress, timeline })

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

  usePlayerHotkeys(player, timeline, showControls)

  const goToNextEpisode = useCallback(() => {
    if (!nextEpisode) {
      return
    }

    beginSwap()
    void navigate(`/watch/episode/${nextEpisode.id}`)
  }, [beginSwap, nextEpisode, navigate])

  const handleSelectEpisode = useCallback(
    (selectedEpisode: Episode) => {
      if (selectedEpisode.id === episode?.id) {
        return
      }

      if (player && episode) {
        saveProgress({
          currentTime: timeline.currentTime(),
          duration: timeline.duration(),
          progressUrl: `/api/progress/episode/${episode.id}`
        })
      }

      beginSwap()
      void navigate(`/watch/episode/${selectedEpisode.id}`)
    },
    [beginSwap, player, episode, navigate, saveProgress, timeline]
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
      onMouseMove={showControls}
    >
      <div className="absolute inset-0">
        <VideoPlayer
          onReady={setPlayer}
          onSourceResolved={handleSourceResolved}
          src={streamUrl}
          startSeconds={startSeconds}
          subtitles={subtitles}
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
          timeline={timeline}
          onFullscreen={handleFullscreen}
          onNextEpisode={isEpisode && nextEpisode ? goToNextEpisode : undefined}
          onToggleEpisodes={() => setEpisodePanelOpen((open) => !open)}
        />
      </div>
    </div>
  )
}
