import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

import { useSearchShortcut } from '../hooks/useSearchShortcut'
import { SearchPalette } from './SearchPalette'

interface SearchPaletteContextValue {
  close: () => void
  isOpen: boolean
  open: () => void
  toggle: () => void
}

const SearchPaletteContext = createContext<SearchPaletteContextValue | null>(
  null
)

export function SearchPaletteProvider({
  children
}: {
  children: ReactNode
}): ReactElement {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((current) => !current), [])

  useSearchShortcut(open)

  const value = useMemo<SearchPaletteContextValue>(
    () => ({ close, isOpen, open, toggle }),
    [close, isOpen, open, toggle]
  )

  return (
    <SearchPaletteContext.Provider value={value}>
      {children}
      <SearchPalette
        onOpenChange={setIsOpen}
        open={isOpen}
      />
    </SearchPaletteContext.Provider>
  )
}

export function useSearchPalette(): SearchPaletteContextValue {
  const value = use(SearchPaletteContext)

  if (value === null) {
    throw new Error(
      'useSearchPalette must be used inside a <SearchPaletteProvider>.'
    )
  }

  return value
}
