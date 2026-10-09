import { kpiColorVar } from './kpiStatus'

/** Horizontal KPI bar with the % label. */
export function KpiBar({ value }: { value: number }) {
  const pct = Math.round(value || 0)
  const color = `rgb(var(${kpiColorVar(pct)}))`
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="w-9 text-right text-[12px] font-bold tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  )
}

/** Tiny inline sparkline of a KPI trend series. */
export function Sparkline({ series, kpi }: { series: number[]; kpi: number }) {
  const w = 72
  const h = 24
  if (series.length < 2) return <span className="text-xs text-fg-subtle">—</span>
  const min = Math.min(...series)
  const max = Math.max(...series)
  const range = max - min || 1
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * (w - 2) + 1
      const y = h - 2 - ((v - min) / range) * (h - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const color = `rgb(var(${kpi >= 70 ? '--success' : '--warning'}))`
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
