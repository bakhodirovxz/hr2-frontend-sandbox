import type { ReactNode } from 'react'

/**
 * One label/value line inside a `<dl>`.
 *
 * The verification screens (letter, order, KPI report, trip movement) all show
 * the same thing — a short list of facts about a piece of paper someone is
 * holding — so they share one row rather than each growing its own.
 */
export function DetailRow({
  label,
  value,
  icon,
}: {
  label: string
  value?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="flex min-w-0 items-center gap-2 text-[12px] text-fg-subtle">
        {icon ? <span className="shrink-0 text-fg-subtle">{icon}</span> : null}
        {label}
      </dt>
      <dd className="truncate text-right text-[13px] font-medium text-fg">
        {value == null || value === '' ? '—' : value}
      </dd>
    </div>
  )
}
