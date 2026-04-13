import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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

interface SetupData {
  config: { tmdbApiKey: string } | null
  libraries: Array<{ id: number; name: string; path: string; type: string }>
}

export function SetupPage() {
  const navigate = useNavigate()

  const [apiKey, setApiKey] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const pathInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadExistingConfig()
  }, [])

  useEffect(() => {
    if (editingIndex !== null) {
      pathInputRef.current?.focus()
    }
  }, [editingIndex])

  async function loadExistingConfig() {
    try {
      const response = await fetch('/api/setup')

      if (!response.ok) {
        return
      }

      const data = (await response.json()) as SetupData

      if (data.config?.tmdbApiKey) {
        setApiKey(data.config.tmdbApiKey)
      }

      if (data.libraries.length > 0) {
        setLibraries(
          data.libraries.map((library) => ({
            name: library.name,
            path: library.path,
            type: library.type as 'movies' | 'shows'
          }))
        )
      }
    } finally {
      setLoaded(true)
    }
  }

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

    const validLibraries = libraries.filter(
      (library) => library.path.trim() !== ''
    )

    if (validLibraries.length === 0) {
      toast.error('Please add at least one library.')

      return
    }

    const trimmedKey = apiKey.trim()

    if (!trimmedKey) {
      toast.error('Please enter your TMDB API key.')

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
        const data = (await response.json()) as { error?: { message?: string } }

        throw new Error(data.error?.message ?? 'Setup failed')
      }

      navigate('/scan')
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : 'Setup failed'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (!loaded) {
    return null
  }

  return (
    <div className="flex min-h-screen items-start justify-center px-6 pt-[15vh] pb-16">
      <div className="w-full max-w-lg">
        <div className="mb-16 animate-fade-up">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            Set up your library
          </h1>
          <p className="mt-3 text-muted-foreground">
            Add your media folders and we'll take care of the rest.
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-16">
            <section className="animate-fade-up animate-delay-1">
              <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Libraries
              </h2>

              <div className="mt-6">
                {libraries.length === 0 ? (
                  <button
                    className="flex w-full items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                    onClick={addLibrary}
                    type="button"
                  >
                    <Plus className="mr-2 size-4" />
                    Add a folder
                  </button>
                ) : (
                  <div className="space-y-2">
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
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="movies">Movies</SelectItem>
                            <SelectItem value="shows">Shows</SelectItem>
                          </SelectContent>
                        </Select>

                        <Button
                          onClick={() => removeLibrary(index)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      className="mt-1"
                      onClick={addLibrary}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Plus className="size-4" />
                      Add another
                    </Button>
                  </div>
                )}
              </div>
            </section>

            <section className="animate-fade-up animate-delay-2">
              <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Metadata
              </h2>
              <p className="mt-3 text-sm text-muted-foreground/70">
                Jukebox uses{' '}
                <a
                  className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  href="https://www.themoviedb.org/settings/api"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  TMDB
                </a>{' '}
                to find posters, ratings, and descriptions for your media.
              </p>

              <Input
                className="mt-4"
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="TMDB API key"
                type="text"
                value={apiKey}
              />
            </section>

            <div className="animate-fade-up animate-delay-3">
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
          </div>
        </form>
      </div>
    </div>
  )
}
