import { useEffect, useRef, useState } from 'react'
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

  return response.json()
}

interface WatchProgress {
  currentTime: number
  duration: number | null
}

async function fetchProgress(movieId: number): Promise<WatchProgress> {
  const response = await fetch(`/api/progress/${movieId}`)
  return response.json()
}

export function Watch() {
  const { id } = useParams<{ id: string }>()
  const [player, setPlayer] = useState<Player | null>(null)
  const hasRestoredProgress = useRef(false)

  const {
    data: movie,
    isLoading,
    error
  } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => fetchMovie(id!),
    enabled: !!id
  })

  const { data: savedProgress } = useQuery({
    queryKey: ['progress', movie?.id],
    queryFn: () => fetchProgress(movie!.id),
    enabled: !!movie
  })

  // Restore progress when both player and savedProgress are available
  useEffect(() => {
    if (player && savedProgress && savedProgress.currentTime > 0 && !hasRestoredProgress.current) {
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
    <div className="bg-black w-full h-screen flex flex-col">
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-7xl">
          <VideoPlayer src={`/api/stream/${movie.id}`} onReady={setPlayer} />
        </div>
      </main>

      <VideoControls title={movie.title} player={player} movieId={movie.id} />
    </div>
  )
}
