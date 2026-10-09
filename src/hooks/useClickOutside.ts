import { useEffect, type RefObject } from 'react'

/** Invoke handler when a pointer/touch lands outside the referenced element. */
export function useClickOutside<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: () => void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return
    const listener = (e: MouseEvent | TouchEvent) => {
      const el = ref.current
      if (!el || el.contains(e.target as Node)) return
      handler()
    }
    document.addEventListener('mousedown', listener)
    document.addEventListener('touchstart', listener)
    return () => {
      document.removeEventListener('mousedown', listener)
      document.removeEventListener('touchstart', listener)
    }
  }, [ref, handler, enabled])
}
