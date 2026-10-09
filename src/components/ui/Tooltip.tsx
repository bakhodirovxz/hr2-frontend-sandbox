import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface TooltipProps {
  /** Full text shown in the bubble on hover. Empty/undefined → no bubble, but the
   *  wrapper (and its `className`, e.g. flex-1) is still rendered so layout stays
   *  identical whether or not there is a tooltip. */
  text?: string | null
  children: ReactNode
  className?: string
}

/** Tooltip with a position:fixed bubble — never clipped by scroll containers. */
export function Tooltip({ text, children, className }: TooltipProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null)
  const interactive = !!text

  const show = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.top < 44 // flip below when there's no headroom
    setPos({
      x: Math.min(Math.max(r.left + r.width / 2, 8), window.innerWidth - 8),
      y: below ? r.bottom + 6 : r.top - 6,
      below,
    })
  }, [])

  const hide = useCallback(() => setPos(null), [])

  /*
   * ⚠️ THE BUBBLE WAS UNREACHABLE AND UNNAMED.
   *
   * The wrapper is a plain <span>, so `onFocus`/`onBlur` never fired for a
   * non-interactive child — a keyboard user could not summon the tooltip at
   * all. And the bubble carried `role="tooltip"` without anything pointing at
   * it, so assistive tech never associated the two.
   *
   * That mattered most in the attendance calendar, where each day is an empty
   * coloured <span> and the tooltip is the ONLY carrier of the day's status:
   * a month came through as 31 unlabelled, unreachable boxes.
   *
   * `tabIndex` makes it focusable, `aria-describedby` ties the bubble to it,
   * and `aria-label` gives the box a name even before the bubble opens — so
   * the status is available without hovering at all.
   */
  const tipId = useId()

  return (
    <span
      ref={ref}
      className={cn('relative inline-flex min-w-0 max-w-full', className)}
      tabIndex={interactive ? 0 : undefined}
      // `role="img"` so the label is actually announced: an `aria-label` on a
      // bare <span> with no role is ignored by several screen readers, which
      // would leave the calendar's coloured boxes nameless again.
      role={interactive ? 'img' : undefined}
      aria-label={interactive ? text : undefined}
      aria-describedby={interactive && pos ? tipId : undefined}
      onMouseEnter={interactive ? show : undefined}
      onMouseLeave={interactive ? hide : undefined}
      onFocus={interactive ? show : undefined}
      onBlur={interactive ? hide : undefined}
    >
      {children}
      {interactive && pos && (
        <span
          id={tipId}
          role="tooltip"
          className="pointer-events-none fixed z-[100] w-max max-w-[280px] rounded-lg bg-elevated px-2.5 py-1.5 text-[11px] font-medium leading-snug text-fg shadow-pop ring-1 ring-line"
          style={{
            left: pos.x,
            top: pos.y,
            transform: pos.below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
          }}
        >
          {text}
        </span>
      )}
    </span>
  )
}
