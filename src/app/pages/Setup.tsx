import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { LibraryPathsForm } from '../components/LibraryPathsForm'
import {
  makeLibraryDraft,
  type LibraryDraft,
  type LibraryRowValidation
} from '../components/library-draft'
import { setupStatusQueryKey } from '../hooks/useSetupStatus'

interface SetupData {
  libraries: Array<{ id: number; name: string; path: string; type: string }>
}

interface SetupErrorBody {
  error?: {
    fieldErrors?: Array<{ index: number; message: string }>
    message?: string
  }
}

export function SetupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [libraries, setLibraries] = useState<LibraryDraft[]>([])
  const [loaded, setLoaded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [validation, setValidation] = useState<
    Record<string, LibraryRowValidation>
  >({})

  // Guards live-validation responses against out-of-order arrival: only the
  // latest check per row may write its result.
  const validationRequests = useRef<Record<string, number>>({})

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

      if (data.libraries.length > 0) {
        setLibraries(
          data.libraries.map((library) =>
            makeLibraryDraft({
              name: library.name,
              path: library.path,
              type: library.type as 'movies' | 'shows'
            })
          )
        )
      }
    } finally {
      setLoaded(true)
    }
  }

  function handleLibrariesChange(next: LibraryDraft[]) {
    // Drop validation results for rows that were removed or whose path
    // changed — they no longer describe the current value.
    setValidation((previous) => {
      const currentPathById = new Map(
        libraries.map((library) => [library.id, library.path])
      )
      const kept: Record<string, LibraryRowValidation> = {}

      for (const row of next) {
        const entry = previous[row.id]

        if (entry && currentPathById.get(row.id) === row.path) {
          kept[row.id] = entry
        }
      }

      return kept
    })

    setLibraries(next)
  }

  async function validateRowPath(library: LibraryDraft) {
    const requestId = (validationRequests.current[library.id] ?? 0) + 1
    validationRequests.current[library.id] = requestId

    const isCurrent = () => validationRequests.current[library.id] === requestId

    setValidation((previous) => ({
      ...previous,
      [library.id]: { status: 'checking' }
    }))

    try {
      const response = await fetch(
        `/api/filesystem/browse?path=${encodeURIComponent(library.path.trim())}`
      )

      if (response.ok) {
        if (isCurrent()) {
          setValidation((previous) => ({
            ...previous,
            [library.id]: { status: 'valid' }
          }))
        }

        return
      }

      const body = (await response.json()) as SetupErrorBody
      const message =
        body.error?.message ??
        "Folder doesn't exist or isn't readable. Check the path."

      if (isCurrent()) {
        setValidation((previous) => ({
          ...previous,
          [library.id]: { message, status: 'invalid' }
        }))
      }
    } catch {
      // Network hiccup — clear the pending check rather than blocking the
      // user with a wrong verdict. Submit still validates server-side.
      if (isCurrent()) {
        setValidation((previous) => {
          const next = { ...previous }
          delete next[library.id]

          return next
        })
      }
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()

    const validLibraries = libraries.filter(
      (library) => library.path.trim() !== ''
    )

    if (validLibraries.length === 0) {
      toast.error('Add at least one folder before completing setup.')

      return
    }

    // Duplicate pre-check so the user doesn't need a server round-trip for
    // an obvious mistake. The server re-checks (case-insensitively on
    // Windows) as the authority.
    const seenPaths = new Set<string>()

    for (const library of validLibraries) {
      const trimmedPath = library.path.trim()

      if (seenPaths.has(trimmedPath)) {
        setValidation((previous) => ({
          ...previous,
          [library.id]: {
            message: `You've added ${trimmedPath} more than once. Remove the duplicate row.`,
            status: 'invalid'
          }
        }))
        toast.error('Fix the highlighted folders, then try again.')

        return
      }

      seenPaths.add(trimmedPath)
    }

    setSubmitting(true)

    try {
      const payload = validLibraries.map((library) => ({
        name: library.name.trim(),
        path: library.path.trim(),
        type: library.type
      }))

      const response = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libraries: payload })
      })

      if (!response.ok) {
        const data = (await response.json()) as SetupErrorBody
        const fieldErrors = data.error?.fieldErrors ?? []

        if (fieldErrors.length > 0) {
          setValidation((previous) => {
            const next = { ...previous }

            for (const fieldError of fieldErrors) {
              const row = validLibraries[fieldError.index]

              if (row) {
                next[row.id] = {
                  message: fieldError.message,
                  status: 'invalid'
                }
              }
            }

            return next
          })
        }

        throw new Error(
          data.error?.message ?? "Couldn't save your libraries. Try again."
        )
      }

      // The guard that redirects to /setup caches this — refresh it so the
      // rest of the app knows setup is done.
      void queryClient.invalidateQueries({ queryKey: setupStatusQueryKey })

      void navigate('/scan', { state: { autoStart: true } })
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't save your libraries. Try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  const hasAnyPath = libraries.some((library) => library.path.trim() !== '')

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
                  onChange={handleLibrariesChange}
                  onPathCommitted={(library) => void validateRowPath(library)}
                  validation={validation}
                  value={libraries}
                />
              </div>
            </section>

            <div className="animate-fade-up animate-delay-2">
              <div className="flex justify-end">
                <Button
                  disabled={submitting || !hasAnyPath}
                  size="lg"
                  type="submit"
                >
                  {submitting ? 'Saving…' : 'Save and scan'}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
