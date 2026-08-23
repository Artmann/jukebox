import { useEffect, useEffectEvent } from 'react'

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

/**
 * Opens the search palette when "/" is pressed anywhere on the page, unless
 * the user is typing into a form field or composing text via an IME.
 */
export function useSearchShortcut(openSearchPalette: () => void): void {
  const openPalette = useEffectEvent(openSearchPalette)

  useEffect(function registerSlashShortcut() {
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
      openPalette()
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [])
}
