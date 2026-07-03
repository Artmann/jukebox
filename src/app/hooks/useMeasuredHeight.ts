import { useCallback, useRef, useState } from 'react'

/**
 * Measures an element's rendered height via ResizeObserver. Attach the
 * returned ref callback to the element you want to measure.
 */
export function useMeasuredHeight(): {
  height: number
  ref: (node: HTMLDivElement | null) => void
} {
  const [height, setHeight] = useState(0)
  const observerRef = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()

    if (!node) {
      observerRef.current = null
      return
    }

    setHeight(node.offsetHeight)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (entry) {
        setHeight(entry.contentRect.height)
      }
    })

    observer.observe(node)
    observerRef.current = observer
  }, [])

  return { height, ref }
}
