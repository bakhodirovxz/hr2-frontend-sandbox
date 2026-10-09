import { useEffect, useState } from 'react'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

/** Width breakpoints grow with the low-vision font step, exactly as the CSS ones do. */
function scaled(query: string, scale: number): string {
  if (scale === 1) return query
  return query.replace(/((?:min|max)-width\s*:\s*)([\d.]+)px/g, (_, pre: string, n: string) => `${pre}${+(Number(n) * scale).toFixed(2)}px`)
}

/**
 * Live answer to a CSS media query.
 *
 * Needed where a size must be a NUMBER, not a class: Tailwind cannot express a
 * width the user dragged, so the board applies it inline — and inline styles
 * know nothing about breakpoints. This hook is what tells the board that the
 * side-by-side composition is actually on screen and the pixel size applies.
 *
 * Width queries are scaled by the low-vision font step (`postcss/lvScale.js`
 * does the same to the stylesheet), so JS and CSS agree on which composition
 * is showing.
 */
export function useMediaQuery(query: string): boolean {
  const scale = useLowVisionScale()
  const q = scaled(query, scale)
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(q).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(q)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [q])

  return matches
}
