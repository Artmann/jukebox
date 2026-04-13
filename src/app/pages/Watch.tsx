import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { VideoPlayer } from '../components/VideoPlayer'
import { VideoControls } from '../components/VideoControls'
import type { Movie } from '../hooks/useMovies'
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

async function fetchProgress(movieId: number): Promise<WatchProgress> {
  const response = await fetch(`/api/progress/${movieId}`)

  return (await response.json()) as WatchProgress
}

const hideDelayMs = 3000

export function WatchPage() {
  const { id } = useParams<{ id: string }>()
  const [controlsVisible, setControlsVisible] = useState(true)
  const [isPlaying, setIsPlaying] = useState(false)
  const [player, setPlayer] = useState<Player | null>(null)
  const hasRestoredProgress = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Track play/pause state for auto-hide logic.
  useEffect(() => {
    if (!player) {
      return
    }

    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    player.on('play', onPlay)
    player.on('pause', onPause)
    setIsPlaying(!player.paused())

    return () => {
      player.off('play', onPlay)
      player.off('pause', onPause)
    }
  }, [player])

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

  const {
    data: movie,
    isLoading,
    error
  } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => fetchMovie(id ?? ''),
    enabled: !!id
  })

  const { data: savedProgress } = useQuery({
    queryKey: ['progress', movie?.id],
    queryFn: () => fetchProgress(movie?.id ?? 0),
    enabled: !!movie
  })

  // Restore progress when both player and savedProgress are available
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
      </div>
    )
  }

  if (error || !movie) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-4">
        <p className="text-white">Movie not found</p>
        <Button
          asChild
          variant="outline"
        >
          <Link to="/">Back to Library</Link>
        </Button>
      </div>
    )
  }

  return (
    <div
      className={`bg-black w-full h-screen flex flex-col ${controlsVisible ? '' : 'cursor-none'}`}
      onMouseMove={resetHideTimer}
    >
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-7xl">
          <VideoPlayer
            src={`/api/stream/${movie.id}`}
            onReady={setPlayer}
          />
        </div>
      </main>

      <div
        className={`transition-opacity duration-300 ${controlsVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <VideoControls
          title={movie.title}
          player={player}
          movieId={movie.id}
        />
      </div>
    </div>
  )
}
