import { Film, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useMovies } from '../hooks/useMovies'
import { LibraryGrid } from '../components/LibraryGrid'

function formatFileSize(bytes: number | null): string {
  if (!bytes) return 'Unknown'
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(2)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)} MB`
}

export function Home() {
  const { data: movies, isLoading, error } = useMovies()

  return <LibraryGrid items={movies || []} />

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border py-6">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold">Jukebox</h1>
          <p className="text-muted-foreground">Your movie library</p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-destructive">
            Failed to load movies. Make sure to run `bun run scan` first.
          </div>
        )}

        {movies && movies.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            No movies found. Run `bun run scan` to scan your library.
          </div>
        )}

        {movies && movies.length > 0 && (
          <>
            <p className="text-muted-foreground mb-6">
              {movies.length} movies in library
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {movies.map((movie) => (
                <Link
                  key={movie.id}
                  to={`/watch/${movie.id}`}
                >
                  <Card className="overflow-hidden hover:ring-2 hover:ring-primary transition-all cursor-pointer h-full">
                    <div className="aspect-[2/3] bg-muted flex items-center justify-center">
                      {movie.posterPath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w342${movie.posterPath}`}
                          alt={movie.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Film className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>
                    <CardHeader className="p-3">
                      <CardTitle className="text-sm font-medium line-clamp-2">
                        {movie.title}
                        {movie.year && (
                          <span className="text-muted-foreground font-normal ml-1">
                            ({movie.year})
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      {movie.rating ? (
                        <p className="text-xs text-muted-foreground">
                          ★ {movie.rating.toFixed(1)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(movie.fileSize)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default Home
