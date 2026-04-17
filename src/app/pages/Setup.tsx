import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  LibraryPathsForm,
  type LibraryEntry
} from '../components/LibraryPathsForm'
import { TmdbKeyForm } from '../components/TmdbKeyForm'

interface SetupData {
  config: { tmdbApiKey: string } | null
  libraries: Array<{ id: number; name: string; path: string; type: string }>
}

export function SetupPage() {
  const navigate = useNavigate()

  const [apiKey, setApiKey] = useState('')
  const [libraries, setLibraries] = useState<LibraryEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void loadExistingConfig()
  }, [])

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
          (library.path.split(/[\\/]/).pop() ?? library.type),
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

      void navigate('/scan')
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
                <LibraryPathsForm
                  onChange={setLibraries}
                  value={libraries}
                />
              </div>
            </section>

            <section className="animate-fade-up animate-delay-2">
              <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Metadata
              </h2>

              <div className="mt-4">
                <TmdbKeyForm
                  description={
                    <>
                      Jukebox uses{' '}
                      <a
                        className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        href="https://www.themoviedb.org/settings/api"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        TMDB
                      </a>{' '}
                      to find posters, ratings, and descriptions for your
                      media.
                    </>
                  }
                  onChange={setApiKey}
                  value={apiKey}
                />
              </div>
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
