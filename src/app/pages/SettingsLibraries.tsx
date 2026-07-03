import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { toast } from 'sonner'

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
import { DirectoryBrowserDialog } from '../components/DirectoryBrowserDialog'
import type { LibraryEntry } from '../components/library-draft'
import {
  useAddLibrary,
  useRemoveLibrary,
  useSettingsLibraries,
  type DeleteLibraryError,
  type Library
} from '../hooks/useSettings'
import { SettingsLayout } from './Settings'

interface NewLibraryState {
  name: string
  path: string
  type: 'movies' | 'shows'
}

const emptyLibrary: NewLibraryState = { name: '', path: '', type: 'movies' }

export function SettingsLibrariesPage(): ReactElement {
  const { data: libraries, isLoading } = useSettingsLibraries()
  const addLibrary = useAddLibrary()
  const removeLibrary = useRemoveLibrary()

  const [draft, setDraft] = useState<NewLibraryState>(emptyLibrary)
  const [isBrowsing, setIsBrowsing] = useState(false)

  async function handleAdd() {
    const trimmedPath = draft.path.trim()

    if (trimmedPath.length === 0) {
      toast.error('Enter a folder path before adding a library.')

      return
    }

    const entry: LibraryEntry = {
      name: draft.name.trim(),
      path: trimmedPath,
      type: draft.type
    }

    try {
      await addLibrary.mutateAsync(entry)
      setDraft(emptyLibrary)
      toast.success('Library added.')
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't add library."
      )
    }
  }

  async function handleRemove(library: Library) {
    const confirmed = window.confirm(
      `Remove library "${library.name}" (${library.path})? Scanned items in this folder will be kept until you run a scan.`
    )

    if (!confirmed) {
      return
    }

    try {
      await removeLibrary.mutateAsync({ id: library.id })
      toast.success(`Removed ${library.name}.`)
    } catch (caughtError) {
      const error = caughtError as DeleteLibraryError

      if (error.status === 409) {
        const forceConfirmed = window.confirm(
          `${error.message}\n\nForce remove will also delete all scanned items in this folder from Jukebox (files on disk are not touched). Continue?`
        )

        if (!forceConfirmed) {
          return
        }

        try {
          await removeLibrary.mutateAsync({ id: library.id, force: true })
          toast.success(`Removed ${library.name} and its scanned items.`)
        } catch (innerError) {
          toast.error(
            innerError instanceof Error
              ? innerError.message
              : "Couldn't force remove library."
          )
        }

        return
      }

      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Couldn't remove library."
      )
    }
  }

  return (
    <SettingsLayout>
      <div>
        <h2 className="text-xl font-semibold">Libraries</h2>
        <p className="text-sm text-muted-foreground">
          Folders Jukebox scans for movies and TV shows.
        </p>
      </div>

      <div className="mt-6 space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : libraries && libraries.length > 0 ? (
          libraries.map((library) => (
            <div
              className="flex items-center gap-3 rounded-lg border bg-card p-4"
              key={library.id}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{library.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {library.path}
                </p>
              </div>

              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {library.type === 'movies' ? 'Movies' : 'Shows'}
              </span>

              <Button
                aria-label={`Remove ${library.name}`}
                disabled={removeLibrary.isPending}
                onClick={() => void handleRemove(library)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            No libraries yet. Add one below to start scanning.
          </p>
        )}
      </div>

      <div className="mt-8 rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Add a library</h3>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor="new-library-path">Folder path</Label>
            <div className="flex items-center gap-2">
              <Input
                className="flex-1"
                id="new-library-path"
                onChange={(event) =>
                  setDraft((previous) => ({
                    ...previous,
                    path: event.target.value
                  }))
                }
                placeholder="/mnt/media/movies"
                spellCheck={false}
                value={draft.path}
              />
              <Button
                onClick={() => setIsBrowsing(true)}
                type="button"
                variant="outline"
              >
                <FolderOpen className="size-4" />
                Browse
              </Button>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-library-name">
              Name{' '}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="new-library-name"
              onChange={(event) =>
                setDraft((previous) => ({
                  ...previous,
                  name: event.target.value
                }))
              }
              placeholder="Leave blank to use the folder name"
              value={draft.name}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="new-library-type">Type</Label>
            <Select
              onValueChange={(value) =>
                setDraft((previous) => ({
                  ...previous,
                  type: value === 'shows' ? 'shows' : 'movies'
                }))
              }
              value={draft.type}
            >
              <SelectTrigger
                className="w-40"
                id="new-library-type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="movies">Movies</SelectItem>
                <SelectItem value="shows">Shows</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Button
              disabled={addLibrary.isPending || draft.path.trim().length === 0}
              onClick={() => void handleAdd()}
              type="button"
            >
              <Plus className="size-4" />
              {addLibrary.isPending ? 'Adding…' : 'Add library'}
            </Button>
          </div>
        </div>
      </div>

      {isBrowsing && (
        <DirectoryBrowserDialog
          initialPath={draft.path.trim() || undefined}
          onOpenChange={setIsBrowsing}
          onSelect={(selectedPath) =>
            setDraft((previous) => ({ ...previous, path: selectedPath }))
          }
          open={isBrowsing}
        />
      )}
    </SettingsLayout>
  )
}
