import { useSyncExternalStore } from 'react'

const scrollThresholdPixels = 16

function getServerSnapshot(): boolean {
  return false
}

function getSnapshot(): boolean {
  return window.scrollY >= scrollThresholdPixels
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener('scroll', onStoreChange, { passive: true })

  return () => {
    window.removeEventListener('scroll', onStoreChange)
  }
}

/**
 * Tells the page header whether the window has scrolled past the point where
 * it should switch from transparent to its blurred background.
 */
export function usePageHeaderScrolled(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
