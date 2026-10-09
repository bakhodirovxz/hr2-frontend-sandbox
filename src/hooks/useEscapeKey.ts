import { useEffect } from 'react'

/** Invoke handler when Escape is pressed. Every dismissible overlay (dropdown,
 *  popover, drawer) must close on Escape — pair it with useClickOutside. */
export function useEscapeKey(handler: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const listener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handler()
    }
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [handler, enabled])
}
