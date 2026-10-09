import { useState } from 'react'

/**
 * A small line chart drawn with SVG — a dozen monthly points, a 0–100 axis,
 * hover readout. No chart library.
 *
 * ⚠️ WHY: the roster's statistics strip imported recharts for ONE trend line
 * and ONE donut, and that import put the 413 KB `charts` chunk on
 * `/employees`, the second most visited page (measured 2026-09-10). A monotone
 * line through twelve points is forty lines of SVG.
 */
export interface TrendPoint {
  label: string
  value: number
}

const cssVar = (name: string) => `rgb(var(${name}))`

export function TrendLine({
  points,
  max = 100,
  height = 124,
  unit = '%',
  valueLabel,
}: {
  points: TrendPoint[]
  max?: number
  height?: number
  unit?: string
  /** Name printed before the value in the hover readout ("KPI"). */
  valueLabel?: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 320
  const H = height
  const padL = 28
  const padR = 10
  const padT = 10
  const padB = 18
  const n = points.length
  const x = (i: number) => (n > 1 ? padL + (i / (n - 1)) * (W - padL - padR) : W / 2)
  const y = (v: number) => padT + (1 - Math.min(Math.max(v, 0), max) / max) * (H - padT - padB)

  // Monotone cubic: the same curve recharts drew, so the shape of the trend
  // reads exactly as before.
  const d = points
    .map((p, i) => {
      if (i === 0) return `M ${x(0)} ${y(p.value)}`
      const x0 = x(i - 1)
      const x1 = x(i)
      const cx = (x0 + x1) / 2
      return `C ${cx} ${y(points[i - 1].value)}, ${cx} ${y(p.value)}, ${x1} ${y(p.value)}`
    })
    .join(' ')

  const ticks = [0, 25, 50, 75, 100].map((t) => (t / 100) * max)
  const readout = hover != null ? points[hover] : null

  return (
    <div className="relative h-full w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        aria-hidden
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          if (n === 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * W
          let best = 0
          for (let i = 1; i < n; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
          setHover(best)
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={cssVar('--border')} strokeDasharray="3 3" />
            <text x={padL - 4} y={y(t) + 3} fontSize="10" textAnchor="end" fill={cssVar('--fg-subtle')}>
              {t}
            </text>
          </g>
        ))}
        {points.map((p, i) => (
          <text key={p.label + i} x={x(i)} y={H - 4} fontSize="10" textAnchor="middle" fill={cssVar('--fg-subtle')}>
            {p.label}
          </text>
        ))}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={cssVar('--border')} />
        )}
        <path d={d} fill="none" stroke={cssVar('--brand')} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(p.value)}
            r={hover === i ? 5 : 3}
            fill={cssVar('--brand')}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      {readout && (
        <div
          className="pointer-events-none absolute -top-1 rounded-inner border border-line bg-elevated px-2 py-1 text-[11px] shadow-sm"
          style={{ left: `${(x(hover!) / W) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <span className="text-fg-muted">{readout.label}</span>
          <span className="ml-1.5 font-semibold tabular-nums text-fg">
            {valueLabel ? `${valueLabel} ` : ''}
            {readout.value}
            {unit}
          </span>
        </div>
      )}
    </div>
  )
}
