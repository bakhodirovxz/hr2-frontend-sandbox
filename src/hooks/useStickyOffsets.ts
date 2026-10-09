import { useEffect, useState, type RefObject } from 'react'

/**
 * The measured height of an element, kept up to date.
 *
 * ⚠️ WHY NOT A CONSTANT. `PhonePage` stacked three sticky layers (table head,
 * branch row, department row) on HARDCODED offsets — `HEAD_H = 40`,
 * `BRANCH_H = 42`. Measured 2026-09-10 in the browser: the head is 49px and the
 * branch row 40.5px. So the branch header was pinned 9px too high and sat
 * PARTLY BEHIND the table head, and the department header 7.5px behind the
 * branch header. Nobody noticed because both layers are opaque and the clipping
 * only shows while scrolling.
 *
 * A measured offset cannot drift when a padding or a font size changes, which a
 * constant silently does.
 */
export function useElementHeight(ref: RefObject<HTMLElement>, fallback: number): number {
  const [h, setH] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setH(Math.round(el.getBoundingClientRect().height))
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return h
}
