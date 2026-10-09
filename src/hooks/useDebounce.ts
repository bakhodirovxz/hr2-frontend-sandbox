import { useEffect, useState } from 'react'

/** Returns a debounced copy of the value after `delay` ms of stability. */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
