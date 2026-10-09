import { useCallback, type KeyboardEvent, type RefObject } from 'react'

/**
 * Arrow-key navigation for a list of controls (nav rows, menu items, options).
 *
 * Returns an `onKeyDown` handler to put on the CONTAINER — it moves DOM focus
 * between the elements matching `selector`, so it works no matter how the list
 * is rendered. ↑/↓ (and ←/→ when horizontal) wrap around; Home/End jump to the
 * ends. Typing a letter jumps to the next item starting with it, which is what
 * long menus (150+ nav entries) need.
 */
export function useArrowNav<T extends HTMLElement>(
  ref: RefObject<T | null>,
  {
    selector = '[data-nav-item]',
    orientation = 'vertical',
    typeahead = true,
  }: { selector?: string; orientation?: 'vertical' | 'horizontal'; typeahead?: boolean } = {},
) {
  return useCallback(
    (e: KeyboardEvent<T>) => {
      const container = ref.current
      if (!container) return

      const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight'
      const prevKey = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft'
      const isNav = [nextKey, prevKey, 'Home', 'End'].includes(e.key)
      const isTypeahead =
        typeahead && e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey
      if (!isNav && !isTypeahead) return

      const items = Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      )
      if (!items.length) return

      const active = document.activeElement as HTMLElement | null
      const idx = active ? items.indexOf(active) : -1

      if (isTypeahead) {
        const ch = e.key.toLowerCase()
        const from = idx + 1
        const ordered = [...items.slice(from), ...items.slice(0, from)]
        const hit = ordered.find((el) => (el.textContent ?? '').trim().toLowerCase().startsWith(ch))
        if (!hit) return
        e.preventDefault()
        hit.focus()
        return
      }

      e.preventDefault()
      let next: number
      if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = items.length - 1
      else if (e.key === nextKey) next = idx < 0 ? 0 : (idx + 1) % items.length
      else next = idx < 0 ? items.length - 1 : (idx - 1 + items.length) % items.length

      items[next].focus()
    },
    [ref, selector, orientation, typeahead],
  )
}
