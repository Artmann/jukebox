import { useQuery } from '@tanstack/react-query'
import { ArrowUp, Folder, RefreshCw } from 'lucide-react'
import { useState, type ReactElement } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle
} from '@/components/ui/sheet'
import type { BrowseResponse } from '../../api/contract'
import { api } from '../lib/api-client'

async function fetchBrowse(browsePath: string): Promise<BrowseResponse> {
  // An empty path lists the filesystem roots (drives on Windows).
  return api((client) =>
    client.filesystem.browse({
      urlParams: browsePath.length > 0 ? { path: browsePath } : {}
    })
  )
}

interface DirectoryBrowserDialogProps {
  initialPath?: string
  onOpenChange: (open: boolean) => void
  onSelect: (selectedPath: string) => void
  open: boolean
}

export function DirectoryBrowserDialog({
  initialPath,
  onOpenChange,
  onSelect,
  open
}: DirectoryBrowserDialogProps): ReactElement {
  return (
    <Sheet
      onOpenChange={onOpenChange}
      open={open}
    >
      <SheetContent
        className="flex w-full max-w-lg flex-col gap-0 p-0"
        side="right"
      >
        <DirectoryBrowserPanel
          initialPath={initialPath}
          onOpenChange={onOpenChange}
          onSelect={onSelect}
        />
      </SheetContent>
    </Sheet>
  )
}

interface DirectoryBrowserPanelProps {
  initialPath?: string
  onOpenChange: (open: boolean) => void
  onSelect: (selectedPath: string) => void
}

interface PathDraft {
  forPath: string
  value: string
}

// Radix unmounts the sheet content when the dialog closes, so this panel's
// state is created fresh from initialPath on every open — no reset effect.
function DirectoryBrowserPanel({
  initialPath,
  onOpenChange,
  onSelect
}: DirectoryBrowserPanelProps): ReactElement {
  const [currentPath, setCurrentPath] = useState<string>(initialPath ?? '')
  const [draft, setDraft] = useState<PathDraft | null>(null)

  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['filesystem', 'browse', currentPath],
    queryFn: () => fetchBrowse(currentPath)
  })

  // The typed draft only applies to the folder it was typed against. After
  // navigating, it falls back to the server-normalized path automatically.
  const pathDraft =
    draft && draft.forPath === currentPath
      ? draft.value
      : (data?.path ?? currentPath)

  function navigateTo(nextPath: string) {
    setCurrentPath(nextPath)
    setDraft(null)
  }

  function handleSelect() {
    if (currentPath.length === 0) {
      return
    }

    onSelect(currentPath)
    onOpenChange(false)
  }

  const canGoUp = Boolean(data && data.parent !== null)
  const isAtRoots = currentPath.length === 0
  const errorMessage =
    error instanceof Error ? error.message : error ? String(error) : null

  return (
    <>
      <div className="border-b p-4">
        <SheetTitle>Browse folders</SheetTitle>
        <SheetDescription>
          Pick a folder on the Jukebox server.
        </SheetDescription>
      </div>

      <div className="flex items-center gap-2 border-b p-4">
        <Button
          aria-label="Go up one folder"
          disabled={!canGoUp}
          onClick={() => {
            if (data?.parent) {
              navigateTo(data.parent)
            } else if (!isAtRoots) {
              navigateTo('')
            }
          }}
          size="icon-sm"
          type="button"
          variant="outline"
        >
          <ArrowUp className="size-4" />
        </Button>

        <Input
          className="flex-1 font-mono text-sm"
          onChange={(event) =>
            setDraft({ forPath: currentPath, value: event.target.value })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              navigateTo(pathDraft.trim())
            }
          }}
          placeholder="Type a path and press Enter, or pick a root below"
          spellCheck={false}
          value={pathDraft}
        />

        <Button
          aria-label="Refresh"
          onClick={() => void refetch()}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <RefreshCw
            className={`size-4 ${isFetching ? 'animate-spin' : ''}`}
          />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Loading…</p>
        ) : errorMessage ? (
          <div className="flex flex-col items-start gap-2 p-3">
            <p className="text-sm text-destructive">{errorMessage}</p>
            <Button
              onClick={() => void refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              Try again
            </Button>
          </div>
        ) : data && data.entries.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No subfolders here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {data?.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => navigateTo(entry.path)}
                  type="button"
                >
                  <Folder className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t p-4">
        <Button
          onClick={() => onOpenChange(false)}
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
        <Button
          disabled={isAtRoots}
          onClick={handleSelect}
          type="button"
        >
          Select this folder
        </Button>
      </div>
    </>
  )
}
