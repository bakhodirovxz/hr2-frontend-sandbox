import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

interface InViewOptions {
  /** How early to start, relative to the viewport. */
  rootMargin?: string
  /**
   * Hold off observing until this is true.
   *
   * ⚠️ NOT OPTIONAL FOR ANYTHING BELOW A LIST. Measured on `/employees`: the
   * statistics strip sits under the table, but while the table is still a
   * skeleton the page is SHORT, so the strip was inside the viewport on the very
   * first observation and mounted immediately — 413 KB of recharts plus eight
   * dashboard requests, exactly what the gate was added to avoid. Pass the
   * list's `!loading` here so the first measurement happens against the real
   * layout.
   */
  armed?: boolean
  /**
   * Wait for the browser to go idle before observing at all (default `true`).
   * Nothing behind this gate is first-paint content, so it must never compete
   * with it.
   */
  idle?: boolean
}

/** requestIdleCallback where available, a macrotask otherwise (Safari). */
function onIdle(fn: () => void): () => void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback
  if (ric) {
    const id = ric(fn, { timeout: 1500 })
    return () => (globalThis as { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(id)
  }
  const id = setTimeout(fn, 300)
  return () => clearTimeout(id)
}

/**
 * `[ref, seen]` — flips to `true` the first time the referenced element comes
 * within `rootMargin` of the viewport, then stops observing.
 *
 * Exposed separately from `DeferUntilVisible` because a panel's DATA is usually
 * as expensive as its code: the roster's statistics strip fires eight dashboard
 * queries, and gating only the render would still have paid for all eight. Pass
 * `seen` into the hook's `enabled` flag as well.
 */
export function useInViewOnce(
  opts: InViewOptions | string = {},
): [RefObject<HTMLDivElement>, boolean] {
  const { rootMargin = '200px', armed = true, idle = true } =
    typeof opts === 'string' ? { rootMargin: opts } : opts
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (seen || !armed) return
    let io: IntersectionObserver | null = null
    const start = () => {
      const el = ref.current
      // Fail OPEN: a missing IntersectionObserver must never hide a panel.
      if (!el || typeof IntersectionObserver === 'undefined') {
        setSeen(true)
        return
      }
      io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            setSeen(true)
            io?.disconnect()
          }
        },
        { rootMargin },
      )
      io.observe(el)
    }
    const cancel = idle ? onIdle(start) : (start(), () => {})
    return () => {
      cancel()
      io?.disconnect()
    }
  }, [seen, armed, idle, rootMargin])

  return [ref, seen]
}

/**
 * Mounts its children only once the placeholder scrolls into view.
 *
 * ⚠️ WHY `React.lazy` ALONE WAS NOT ENOUGH. The dashboard already wrapped its
 * map and its demographics charts in `lazy()`, and both chunks still arrived on
 * first paint — measured: `maplibre-gl` 964 KB + 81 KB CSS and `charts` 413 KB,
 * on the most-visited page in the product. `lazy()` defers the import by a tick,
 * not until it is needed: the moment the element is RENDERED the import fires,
 * and both panels were rendered unconditionally.
 *
 * `minHeight` reserves the panel's box so deferring cannot introduce a layout
 * shift.
 */
export function DeferUntilVisible({
  children,
  minHeight,
  rootMargin,
  armed,
  className,
  placeholder = null,
}: {
  children: ReactNode
  /** Reserved height while the real content is not mounted yet (CLS guard). */
  minHeight: number | string
  rootMargin?: string
  armed?: boolean
  className?: string
  placeholder?: ReactNode
}) {
  const [ref, seen] = useInViewOnce({ rootMargin, armed })
  if (seen) return <>{children}</>
  return (
    <div ref={ref} className={className} style={{ minHeight }} aria-hidden>
      {placeholder}
    </div>
  )
}
