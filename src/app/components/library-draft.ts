export interface LibraryEntry {
  name: string
  path: string
  type: 'movies' | 'shows'
}

export interface LibraryDraft extends LibraryEntry {
  id: string
}

export type LibraryRowValidation =
  | { status: 'checking' }
  | { message: string; status: 'invalid' }
  | { status: 'valid' }

export function makeLibraryDraft(
  entry: LibraryEntry = { name: '', path: '', type: 'movies' }
): LibraryDraft {
  return { ...entry, id: crypto.randomUUID() }
}
