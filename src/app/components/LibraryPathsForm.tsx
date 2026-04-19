import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ReactElement
} from 'react'

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

export interface LibraryEntry {
  name: string
  path: string
  type: 'movies' | 'shows'
}

interface LibraryPathsFormProps {
  addButtonLabel?: string
  emptyButtonLabel?: string
  onChange: (libraries: LibraryEntry[]) => void
  value: LibraryEntry[]
}

export function LibraryPathsForm({
  addButtonLabel,
  emptyButtonLabel,
  onChange,
  value
}: LibraryPathsFormProps): ReactElement {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [browsingIndex, setBrowsingIndex] = useState<number | null>(null)
  const pathInputRef = useRef<HTMLInputElement>(null)

  useEffect(
    function focusEditingInput() {
      if (editingIndex !== null) {
        pathInputRef.current?.focus()
      }
    },
    [editingIndex]
  )

  function addLibrary() {
    const newIndex = value.length

    onChange([...value, { name: '', path: '', type: 'movies' }])
    setEditingIndex(newIndex)
  }

  function removeLibrary(index: number) {
    onChange(value.filter((_, innerIndex) => innerIndex !== index))

    if (editingIndex === index) {
      setEditingIndex(null)
    }
  }

  function updateLibrary(
    index: number,
    field: keyof LibraryEntry,
    fieldValue: string
  ) {
    onChange(
      value.map((library, innerIndex) =>
        innerIndex === index ? { ...library, [field]: fieldValue } : library
      )
    )
  }

  function handleBlur(index: number) {
    const current = value[index]

    if (current && current.path.trim() === '') {
      removeLibrary(index)
    }

    setEditingIndex(null)
  }

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
      {value.map((library, index) => (
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

          <Button
            aria-label="Browse folders"
            onClick={() => setBrowsingIndex(index)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <FolderOpen className="size-4" />
          </Button>

          <Select
            onValueChange={(nextType) =>
              updateLibrary(index, 'type', nextType)
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
        {addButtonLabel ?? 'Add another'}
      </Button>

      {browsingIndex !== null && (
        <DirectoryBrowserDialog
          initialPath={value[browsingIndex]?.path}
          onOpenChange={(open) => {
            if (!open) {
              setBrowsingIndex(null)
            }
          }}
          onSelect={(selectedPath) => {
            updateLibrary(browsingIndex, 'path', selectedPath)
          }}
          open={browsingIndex !== null}
        />
      )}
    </div>
  )
}
