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
    progress: { added: 0, total: 0, updated: 0 },
    status: 'pending',
    type: library.type
  }
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
