import type { ReactNode } from 'react'

/**
 * The one tooltip every chart in the app uses.
 *
 * ⚠️ NEVER USE RECHARTS' DEFAULT. It paints a white box with black text and
 * prints the raw series key ("value"), which is unreadable in the dark theme
 * and meaningless to the reader. This one sits on the elevated surface with
 * the app's own tokens and shows the label the caller chose.
 *
 * It also lived inside `ReportsPage` as a private helper, so the charts on
 * every other screen had no tooltip at all — hovering a slice told you
 * nothing. Now it is shared.
 */
export function ChartTooltip({
  active,
  payload,
  label,
  formatLabel,
  valueLabel,
  formatValue,
}: {
  active?: boolean
  payload?: { value?: number | string; name?: string; payload?: Record<string, unknown> }[]
  label?: string | number
  /** Turn the axis value into what the reader should see (a date, a month). */
  formatLabel?: (raw: string) => string
  /** Row caption, e.g. "Soni" — omit to show the series' own name. */
  valueLabel?: ReactNode
  formatValue?: (v: number | string) => ReactNode
}) {
  if (!active || !payload?.length) return null
  const head = label != null ? String(label) : (payload[0]?.name ?? '')
  return (
    <div className="pointer-events-none rounded-inner border border-line bg-elevated px-3 py-2 shadow-md">
      {head && (
        <p className="text-[11px] font-semibold text-fg-muted">
          {formatLabel ? formatLabel(head) : head}
        </p>
      )}
      {payload.map((p, i) => {
        // A pie slice's name IS the heading — printing it again gave
        // "18–30  18–30: 30".
        const caption = valueLabel ?? (p.name && p.name !== head ? p.name : '')
        return (
          <p key={i} className="text-[13px] font-bold tabular-nums text-fg">
            {caption}
            {caption ? ': ' : ''}
            {formatValue ? formatValue(p.value ?? 0) : (p.value ?? 0)}
          </p>
        )
      })}
    </div>
  )
}
