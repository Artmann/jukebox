import { useEffect, useState } from 'react'

/**
 * Returns `value` after it has been stable for `delay` ms. Useful for
 * debouncing search input before kicking off a network request.
 */
export function useDebouncedValue<Value>(value: Value, delay: number): Value {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      window.clearTimeout(handle)
    }
  }, [delay, value])

  return debouncedValue
}
