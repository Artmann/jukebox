import type { ScanJobSummary } from '../hooks/useScanStatus'

/**
 * The scan page's visit-scoped lifecycle. `complete` only happens after a
 * scan finished while the user was on the page — a fresh load with an old
 * finished job starts back at `idle`.
 */
export type ScanPhase = 'complete' | 'idle' | 'running'

export interface LibraryInfo {
  id: number
  name: string
  path: string
  type: string
}

export interface LibraryProgress {
  error?: string
  id: number
  name: string
  path: string
  progress: { added: number; total: number; updated: number }
  status: 'pending' | 'scanning' | 'complete' | 'error'
  type: string
}

export function makeInitialLibraryProgress(
  library: LibraryInfo
): LibraryProgress {
  return {
    id: library.id,
    name: library.name,
    path: library.path,
    progress: { added: 0, total: 0, updated: 0 },
    status: 'pending',
    type: library.type
  }
}

/**
 * Fold a job's persisted per-library results into the library rows so a page
 * opened after (or during) a scan shows each library's outcome instead of a
 * permanent "Waiting". Libraries the job never reached stay untouched.
 */
export function mergeLibrariesWithJob(
  libraries: LibraryProgress[],
  job: ScanJobSummary | null
): LibraryProgress[] {
  // Array.isArray also guards against cached /status payloads from before
  // per-library results existed.
  if (!job || !Array.isArray(job.libraries) || job.libraries.length === 0) {
    return libraries
  }

  return libraries.map((library) => {
    const result = job.libraries.find(
      (candidate) => candidate.libraryId === library.id
    )

    if (!result) {
      return library
    }

    if (result.status === 'error') {
      return {
        ...library,
        error: result.error ?? 'Unknown error',
        status: 'error' as const
      }
    }

    return {
      ...library,
      error: undefined,
      progress: {
        added: result.added,
        total: result.total,
        updated: result.updated
      },
      status: 'complete' as const
    }
  })
}

export function summarizeTotals(libraries: LibraryProgress[]) {
  return libraries.reduce(
    (accumulator, library) => ({
      added: accumulator.added + library.progress.added,
      found: accumulator.found + library.progress.total,
      updated: accumulator.updated + library.progress.updated
    }),
    { added: 0, found: 0, updated: 0 }
  )
}
