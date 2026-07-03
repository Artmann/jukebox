import { CheckCircle, Circle, Loader2, XCircle } from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'

import type { LibraryProgress } from './scan-types'

function LibraryProgressRow({ library }: { library: LibraryProgress }) {
  return (
    <div className="flex items-center gap-3">
      {library.status === 'pending' && (
        <Circle className="size-4 shrink-0 text-muted-foreground/20" />
      )}
      {library.status === 'scanning' && (
        <Loader2 className="size-4 shrink-0 animate-spin text-foreground" />
      )}
      {library.status === 'complete' && (
        <CheckCircle className="size-4 shrink-0 text-foreground" />
      )}
      {library.status === 'error' && (
        <XCircle className="size-4 shrink-0 text-destructive" />
      )}

      <div className="flex-1">
        <p className="text-sm text-foreground">{library.name}</p>

        {library.status === 'pending' && (
          <p className="text-xs text-muted-foreground/50">Waiting</p>
        )}

        {(library.status === 'scanning' || library.status === 'complete') && (
          <p className="text-xs text-muted-foreground">
            {library.progress.total > 0 ? (
              <>
                {library.progress.total} files
                {library.progress.added > 0 &&
                  ` \u00b7 ${library.progress.added} new`}
                {library.progress.updated > 0 &&
                  ` \u00b7 ${library.progress.updated} updated`}
              </>
            ) : (
              'Scanning…'
            )}
          </p>
        )}

        {library.status === 'error' && (
          <p className="text-xs text-destructive">{library.error}</p>
        )}
      </div>
    </div>
  )
}

function LibraryProgressSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((index) => (
        <div
          className="flex items-center gap-3"
          key={index}
        >
          <Skeleton className="size-4 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ScanLibraryList({
  libraries
}: {
  libraries: LibraryProgress[] | null
}) {
  if (libraries === null) {
    return <LibraryProgressSkeleton />
  }

  if (libraries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No libraries configured. Add one from Settings before running a scan.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {libraries.map((library) => (
        <LibraryProgressRow
          key={library.id}
          library={library}
        />
      ))}
    </div>
  )
}
