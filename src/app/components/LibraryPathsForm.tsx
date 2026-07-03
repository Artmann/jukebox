import { CheckCircle, FolderOpen, Loader2, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

import { DirectoryBrowserDialog } from './DirectoryBrowserDialog'
import {
  makeLibraryDraft,
  type LibraryDraft,
  type LibraryEntry,
  type LibraryRowValidation
} from './library-draft'

interface LibraryPathsFormProps {
  addButtonLabel?: string
  emptyButtonLabel?: string
  onChange: (libraries: LibraryDraft[]) => void
  /**
   * Fired when a row's path is committed — the input loses focus with a
   * non-empty path, or a folder is picked in the browse dialog. Lets the
   * parent run live validation without reacting to every keystroke.
   */
  onPathCommitted?: (library: LibraryDraft) => void
  validation?: Record<string, LibraryRowValidation>
  value: LibraryDraft[]
}

export function LibraryPathsForm({
  addButtonLabel,
  emptyButtonLabel,
  onChange,
  onPathCommitted,
  validation,
  value
}: LibraryPathsFormProps): ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [browsingId, setBrowsingId] = useState<string | null>(null)

  function addLibrary() {
    const draft = makeLibraryDraft()

    onChange([...value, draft])
    setEditingId(draft.id)
  }

  function removeLibrary(id: string) {
    onChange(value.filter((library) => library.id !== id))

    if (editingId === id) {
      setEditingId(null)
    }

    if (browsingId === id) {
      setBrowsingId(null)
    }
  }

  function updateLibrary(
    id: string,
    field: keyof LibraryEntry,
    fieldValue: string
  ) {
    onChange(
      value.map((library) =>
        library.id === id ? { ...library, [field]: fieldValue } : library
      )
    )
  }

  function handleBlur(library: LibraryDraft) {
    setEditingId(null)

    if (library.path.trim() !== '') {
      onPathCommitted?.(library)
    }
  }

  const browsingLibrary = value.find((library) => library.id === browsingId)

  if (value.length === 0) {
    return (
      <button
        className="flex w-full items-center justify-center rounded-lg border border-dashed border-border py-10 text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
        onClick={addLibrary}
        type="button"
      >
        <Plus className="mr-2 size-4" />
        {emptyButtonLabel ?? 'Add a folder'}
      </button>
    )
  }

  return (
    <div className="space-y-2">
      {value.map((library) => {
        const rowValidation = validation?.[library.id]

        return (
          <div key={library.id}>
            <div className="flex items-center gap-3">
              {editingId === library.id ? (
                <Input
                  autoFocus
                  className="flex-[2]"
                  onBlur={() => handleBlur(library)}
                  onChange={(event) =>
                    updateLibrary(library.id, 'path', event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                  }}
                  placeholder="/mnt/media/movies"
                  value={library.path}
                />
              ) : (
                <button
                  className="flex-[2] cursor-pointer truncate rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                  onClick={() => setEditingId(library.id)}
                  type="button"
                >
                  {library.path || (
                    <span className="text-muted-foreground">
                      /mnt/media/movies
                    </span>
                  )}
                </button>
              )}

              {rowValidation?.status === 'checking' && (
                <Loader2
                  aria-label="Checking folder"
                  className="size-4 shrink-0 animate-spin text-muted-foreground"
                />
              )}
              {rowValidation?.status === 'valid' && (
                <CheckCircle
                  aria-label="Folder found"
                  className="size-4 shrink-0 text-foreground/60"
                />
              )}

              <Button
                aria-label="Browse folders"
                onClick={() => setBrowsingId(library.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <FolderOpen className="size-4" />
              </Button>

              <Select
                onValueChange={(nextType) =>
                  updateLibrary(library.id, 'type', nextType)
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
                aria-label="Remove library"
                onClick={() => removeLibrary(library.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            {rowValidation?.status === 'invalid' && (
              <p className="mt-1 px-3 text-xs text-destructive">
                {rowValidation.message}
              </p>
            )}
          </div>
        )
      })}

      <Button
        className="mt-1"
        onClick={addLibrary}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Plus className="size-4" />
        {addButtonLabel ?? 'Add another'}
      </Button>

      {browsingLibrary && (
        <DirectoryBrowserDialog
          initialPath={browsingLibrary.path}
          onOpenChange={(open) => {
            if (!open) {
              setBrowsingId(null)
            }
          }}
          onSelect={(selectedPath) => {
            // Target the row by its stable id — the list may have changed
            // while the dialog was open.
            const updated = { ...browsingLibrary, path: selectedPath }

            onChange(
              value.map((library) =>
                library.id === browsingLibrary.id ? updated : library
              )
            )
            onPathCommitted?.(updated)
          }}
          open={browsingLibrary !== undefined}
        />
      )}
    </div>
  )
}
