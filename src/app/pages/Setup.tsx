import { Film, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface LibraryEntry {
  name: string
  path: string
  type: 'movies' | 'shows'
}

export function SetupPage() {
  const navigate = useNavigate()

  const [apiKey, setApiKey] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [submitting, setSubmitting] = useState(false)
  const pathInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingIndex !== null) {
      pathInputRef.current?.focus()
    }
  }, [editingIndex])

  function addLibrary() {
    const newIndex = libraries.length

    setLibraries((previous) => [
      ...previous,
      { name: '', path: '', type: 'movies' }
    ])
    setEditingIndex(newIndex)
  }

  function removeLibrary(index: number) {
    setLibraries((previous) => previous.filter((_, i) => i !== index))

    if (editingIndex === index) {
      setEditingIndex(null)
    }
  }

  function updateLibrary(
    index: number,
    field: keyof LibraryEntry,
    value: string
  ) {
    setLibraries((previous) =>
      previous.map((library, i) =>
        i === index ? { ...library, [field]: value } : library
      )
    )
  }

  function handleBlur(index: number) {
    if (libraries[index]?.path.trim() === '') {
      removeLibrary(index)
    }

    setEditingIndex(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    const validLibraries = libraries.filter(
      (library) => library.path.trim() !== ''
    )

    if (validLibraries.length === 0) {
      setError('Please add at least one library.')

      return
    }

    const trimmedKey = apiKey.trim()

    if (!trimmedKey) {
      setError('Please enter your TMDB API key.')

      return
    }

    setSubmitting(true)

    try {
      const payload = validLibraries.map((library) => ({
        name:
          library.name.trim() ||
          library.path.split(/[\\/]/).pop() ||
          library.type,
        path: library.path.trim(),
        type: library.type
      }))

      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbApiKey: trimmedKey, libraries: payload })
      })

      if (!response.ok) {
        const data = (await response.json()) as { error?: string }

        throw new Error(data.error ?? 'Setup failed')
      }

      navigate('/scan')
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : 'Setup failed'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl">
        <div className="mb-10 flex flex-col items-center gap-3 text-center">
          <Film className="size-12 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">
            Welcome to Jukebox
          </h1>
          <p className="text-muted-foreground">
            Let's get your media server set up.
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-12">
            {/* Libraries */}
            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Media Libraries
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Add the directories where your movies and TV shows are stored.
              </p>

              <div className="mt-4 space-y-3">
                {libraries.map((library, index) => (
                  <div
                    className="flex items-center gap-3"
                    key={index}
                  >
                    {editingIndex === index ? (
                      <Input
                        ref={pathInputRef}
                        className="flex-[2]"
                        onBlur={() => handleBlur(index)}
                        onChange={(event) =>
                          updateLibrary(index, 'path', event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            pathInputRef.current?.blur()
                          }
                        }}
                        placeholder="/mnt/media/movies"
                        value={library.path}
                      />
                    ) : (
                      <button
                        className="flex-[2] cursor-pointer truncate rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                        onClick={() => setEditingIndex(index)}
                        type="button"
                      >
                        {library.path || (
                          <span className="text-muted-foreground">
                            /mnt/media/movies
                          </span>
                        )}
                      </button>
                    )}

                    <Select
                      onValueChange={(value) =>
                        updateLibrary(index, 'type', value)
                      }
                      value={library.type}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="movies">Movies</SelectItem>
                        <SelectItem value="shows">Shows</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={() => removeLibrary(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}

                <Button
                  className="flex gap-2 mt-3"
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={addLibrary}
                >
                  <Plus className="size-4" />
                  Add Library
                </Button>
              </div>
            </section>

            <hr className="border-border" />

            {/* TMDB API Key */}
            <section>
              <h2 className="text-lg font-semibold text-foreground">
                Movie Metadata
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Jukebox uses{' '}
                <a
                  className="text-primary underline underline-offset-4"
                  href="https://www.themoviedb.org"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  The Movie Database (TMDB)
                </a>{' '}
                to fetch posters, descriptions, and other metadata for your
                media. Create a free account, then go to{' '}
                <a
                  className="text-primary underline underline-offset-4"
                  href="https://www.themoviedb.org/settings/api"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Settings &rarr; API
                </a>{' '}
                to generate your API key.
              </p>

              <div className="mt-6 space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="Enter your TMDB API key"
                  type="text"
                  value={apiKey}
                />
              </div>
            </section>

            <hr className="border-border" />

            {error && (
              <p className="text-center text-sm text-destructive">{error}</p>
            )}

            <div className="flex justify-end">
              <Button
                disabled={submitting}
                size="lg"
                type="submit"
              >
                {submitting ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
