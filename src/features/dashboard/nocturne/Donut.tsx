import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

export interface DonutSlice {
  key: string
  label: string
  value: number
  /** A `--chart-*` token name. Slices never carry a hex. */
  token: string
}

/**
 * The status ring.
 *
 * One conic sweep, no library, no tooltip: the numbers live in the legend
 * beside it, where they can be read rather than hovered for. The ring's job is
 * to show the SHAPE of the day — how much of the roster is green — and the
 * legend's job is to say exactly how many.
 *
 * An empty roster draws a single grey ring rather than nothing, so the block
 * never collapses while the branch is still loading.
 *
 * SELECTABLE. Give it `activeKey`/`onSelect` and every slice becomes a button:
 * the chosen one keeps its colour and its share is written in the hole, the
 * rest fade back. v1 does the same and uses it to narrow the roster beside it;
 * without it the ring is a picture you cannot ask anything of.
 */
export function Donut({
  slices,
  total,
  caption,
  size = 148,
  className,
  activeKey,
}: {
  slices: DonutSlice[]
  /** What the hole reads. A ratio ("17/21") is as valid here as a count. */
  total: ReactNode
  caption: string
  size?: number
  className?: string
  /** When set, only this slice keeps full colour and the hole shows its share. */
  activeKey?: string | null
}) {
  const lv = useLowVisionScale()
  const sum = slices.reduce((a, s) => a + Math.max(0, s.value), 0)
  const active = activeKey ? slices.find((s) => s.key === activeKey) : undefined
  let at = 0
  const stops = sum
    ? slices
        .filter((s) => s.value > 0)
        .map((s) => {
          const from = (at / sum) * 100
          at += s.value
          const to = (at / sum) * 100
          // A selected slice keeps its colour; the rest step back so the ring
          // reads as "this much of the roster", not as a new palette.
          const dim = active && s.key !== active.key ? ' / 0.22' : ''
          return `rgb(var(${s.token})${dim}) ${from.toFixed(2)}% ${to.toFixed(2)}%`
        })
        .join(', ')
    : `rgb(var(--chart-6)) 0% 100%`

  const share = active && sum ? Math.round((active.value / sum) * 100) : null

  return (
    <div
      className={cn('relative shrink-0 rounded-full transition-[background]', className)}
      style={{ width: size * lv, height: size * lv, background: `conic-gradient(${stops})` }}
      role="img"
      aria-label={`${caption}: ${total}`}
    >
      <div className="absolute inset-[15px] flex flex-col items-center justify-center rounded-full bg-surface leading-tight">
        <span className="text-[29px] font-bold text-fg [font-variant-numeric:tabular-nums]">
          {active ? active.value : total}
        </span>
        <span className="max-w-[80%] truncate text-[11.5px] text-fg-subtle">
          {active ? `${active.label} · ${share}%` : caption}
        </span>
      </div>
    </div>
  )
}

/**
 * The ring's legend: one row per slice, colour · label · count.
 *
 * With `onSelect` each row is a real button — clicking the chosen one again
 * clears the selection, so there is always a way back to the whole roster
 * without hunting for a reset control.
 */
export function DonutLegend({
  slices,
  activeKey,
  onSelect,
}: {
  slices: DonutSlice[]
  activeKey?: string | null
  onSelect?: (key: string | null) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[7px]">
      {slices.map((s) => {
        const isActive = activeKey === s.key
        const row = (
          <>
            <span
              className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
              style={{ background: `rgb(var(${s.token}))` }}
            />
            {/* Wraps rather than truncates: «Kech qolganlar» / «Xizmat safarida»
                were cut to «Kech qol…» beside the ring in a narrow column. */}
            <span className={cn('flex-1 text-left leading-tight', isActive ? 'text-fg' : 'text-fg-muted')}>
              {s.label}
            </span>
            <span className="font-semibold text-fg [font-variant-numeric:tabular-nums]">
              {s.value}
            </span>
          </>
        )
        if (!onSelect) {
          return (
            <div key={s.key} className="flex items-center gap-2 text-[12px]">
              {row}
            </div>
          )
        }
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={isActive}
            // A slice nobody is in cannot be asked about.
            disabled={s.value === 0}
            onClick={() => onSelect(isActive ? null : s.key)}
            className={cn(
              'flex items-center gap-2 rounded-control px-1.5 py-1 text-[12px] transition-colors',
              'hover:bg-fg/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
              isActive && 'bg-fg/[0.08]',
              s.value === 0 && 'cursor-default opacity-45 hover:bg-transparent',
            )}
          >
            {row}
          </button>
        )
      })}
    </div>
  )
}
