import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  Loader2,
  Maximize,
  PlayIcon,
  RotateCcw,
  RotateCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Movie } from '../hooks/useMovies'
import type { ReactElement, ReactNode } from 'react'

async function fetchMovie(id: string): Promise<Movie> {
  const response = await fetch(`/api/library/movies/${id}`)

  if (!response.ok) {
    throw new Error('Failed to fetch movie')
  }

  return response.json()
}

export function Watch() {
  const { id } = useParams<{ id: string }>()

  const {
    data: movie,
    isLoading,
    error
  } = useQuery({
    queryKey: ['movie', id],
    queryFn: () => fetchMovie(id!),
    enabled: !!id
  })

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
    <div className="bg-black w-full h-screen">
      <div className="fixed bottom-0 left-0 right-0 px-6">
        <div className="flex justify-between items-center py-4">
          <div className="flex gap-2">
            <IconButton>
              <PlayIcon className="size-7 hover:scale-125 text-white" />
            </IconButton>

            <IconButton>
              <RotateCcw className="size-7 hover:scale-125 text-white" />
            </IconButton>

            <IconButton>
              <RotateCw className="size-7 hover:scale-125 text-white" />
            </IconButton>
          </div>

          <div className="text-white text-lg">{movie.title}</div>

          <div>
            <IconButton>
              <Maximize className="size-7 hover:scale-125 text-white" />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  )
}

function IconButton({ children }: { children: ReactNode }): ReactElement {
  return (
    <button className="p-2 flex justify-center items-center">{children}</button>
  )
}
