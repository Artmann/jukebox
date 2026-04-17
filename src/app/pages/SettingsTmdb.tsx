import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { TmdbKeyForm } from '../components/TmdbKeyForm'
import { useSaveTmdbKey, useTmdbKey } from '../hooks/useSettings'
import { SettingsLayout } from './Settings'

export function SettingsTmdbPage(): ReactElement {
  const { data, isLoading } = useTmdbKey()
  const save = useSaveTmdbKey()

  const [apiKey, setApiKey] = useState('')
  const [initialized, setInitialized] = useState(false)

  useEffect(
    function hydrateFromServer() {
      if (!initialized && data) {
        setApiKey(data.apiKey)
        setInitialized(true)
      }
    },
    [data, initialized]
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmed = apiKey.trim()

    if (trimmed.length === 0) {
      toast.error(
        'Please enter your TMDB API key. Get one at themoviedb.org/settings/api.'
      )

      return
    }

    try {
      await save.mutateAsync(trimmed)
      toast.success('TMDB API key saved.')
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't save TMDB key. Please try again."
      )
    }
  }

  if (isLoading) {
    return (
      <SettingsLayout>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </SettingsLayout>
    )
  }

  return (
    <SettingsLayout>
      <div>
        <h2 className="text-xl font-semibold">TMDB</h2>
        <p className="text-sm text-muted-foreground">
          Jukebox uses{' '}
          <a
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            href="https://www.themoviedb.org/settings/api"
            rel="noopener noreferrer"
            target="_blank"
          >
            TMDB
          </a>{' '}
          to fetch posters, ratings, and descriptions for your movies and
          shows.
        </p>
      </div>

      <form
        className="mt-6 grid max-w-md gap-4"
        onSubmit={(event) => void handleSubmit(event)}
      >
        <TmdbKeyForm
          id="tmdb-api-key"
          label="API key"
          onChange={setApiKey}
          value={apiKey}
        />

        <div>
          <Button
            disabled={save.isPending}
            type="submit"
          >
            {save.isPending ? 'Saving…' : 'Save key'}
          </Button>
        </div>
      </form>
    </SettingsLayout>
  )
}
