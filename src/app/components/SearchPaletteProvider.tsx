import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'

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

  useEffect(
    function registerSlashShortcut() {
      function onKeyDown(event: KeyboardEvent) {
        // Ignore IME composition so picking a Japanese / Chinese candidate
        // doesn't accidentally open the palette.
        if (event.isComposing || event.keyCode === 229) {
          return
        }

        if (event.key !== '/') {
          return
        }

        // Ignore the shortcut when the user is typing into a form field, so
        // hitting "/" while editing doesn't yank focus into the palette.
        if (isFormFieldTarget(event.target)) {
          return
        }

        // Don't fight modifier-driven browser shortcuts (e.g. Cmd+/).
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return
        }

        event.preventDefault()
        setIsOpen(true)
      }

      window.addEventListener('keydown', onKeyDown)

      return () => {
        window.removeEventListener('keydown', onKeyDown)
      }
    },
    []
  )

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

function isFormFieldTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  const tag = target.tagName

  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
