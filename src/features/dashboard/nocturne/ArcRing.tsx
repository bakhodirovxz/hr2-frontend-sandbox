/**
 * A hoverable donut drawn with SVG arcs — no chart library.
 *
 * ⚠️ WHY THIS EXISTS. `DemographicsPanel` used recharts for exactly one thing:
 * a `PieChart` with a lifted active slice. That single import put the whole
 * `charts` chunk — 413 KB raw, 112 KB gzip — on the dashboard, the most
 * visited page in the product, for two small rings (measured 2026-09-10).
 * Everything the panel needs is a few `<path>` arcs: hover per slice, the
 * lift, the halo, the dimming of the rest. ~60 lines.
 */
export interface ArcSlice {
  key: string
  value: number
  /** A CSS colour (the panel passes `rgb(var(--chart-n))`). */
  fill: string
}

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

/** SVG path of a ring sector between two angles (degrees, clockwise from 12). */
function arcPath(cx: number, cy: number, rIn: number, rOut: number, a0: number, a1: number): string {
  // Cap just under a full circle: an arc whose start equals its end draws nothing.
  const end = Math.min(a1, a0 + 359.999)
  const large = end - a0 > 180 ? 1 : 0
  const o0 = polar(cx, cy, rOut, a0)
  const o1 = polar(cx, cy, rOut, end)
  const i0 = polar(cx, cy, rIn, a0)
  const i1 = polar(cx, cy, rIn, end)
  return [
    `M ${o0.x} ${o0.y}`,
    `A ${rOut} ${rOut} 0 ${large} 1 ${o1.x} ${o1.y}`,
    `L ${i1.x} ${i1.y}`,
    `A ${rIn} ${rIn} 0 ${large} 0 ${i0.x} ${i0.y}`,
    'Z',
  ].join(' ')
}

export function ArcRing({
  slices,
  size = 118,
  innerRadius = 36,
  outerRadius = 54,
  paddingAngle = 2,
  active,
  onActive,
  onPick,
  tipFor,
}: {
  slices: ArcSlice[]
  size?: number
  innerRadius?: number
  outerRadius?: number
  /** Gap between slices, in degrees. */
  paddingAngle?: number
  active: number | null
  onActive: (i: number | null) => void
  /** Makes each arc a click target (the board opens the slice's people). */
  onPick?: (i: number) => void
  /** Per-arc hover tip props (see boardDrill `tipProps`). */
  tipFor?: (i: number) => Record<string, string>
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0)
  const c = size / 2
  const visible = slices.map((s, i) => ({ ...s, i })).filter((s) => s.value > 0)
  const gaps = visible.length > 1 ? paddingAngle * visible.length : 0
  const sweep = 360 - gaps
  let at = 0
  const arcs = visible.map((s) => {
    const a0 = at
    const a1 = at + (total ? (s.value / total) * sweep : 0)
    at = a1 + (visible.length > 1 ? paddingAngle : 0)
    return { ...s, a0, a1 }
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" aria-hidden>
      {arcs.map((s) => {
        const isActive = active === s.i
        const dim = active != null && !isActive
        const rOut = isActive ? outerRadius + 5 : outerRadius
        return (
          <g
            key={s.key}
            onMouseEnter={() => onActive(s.i)}
            onMouseLeave={() => onActive(null)}
            onClick={onPick ? () => onPick(s.i) : undefined}
            {...(tipFor ? tipFor(s.i) : {})}
            style={{ transition: 'opacity 120ms', cursor: onPick ? 'pointer' : undefined }}
            opacity={dim ? 0.32 : 1}
          >
            <path d={arcPath(c, c, innerRadius, rOut, s.a0, s.a1)} fill={s.fill} />
            {isActive && (
              // The halo: a thin second arc just outside the lifted one.
              <path d={arcPath(c, c, rOut + 1, rOut + 3, s.a0, s.a1)} fill={s.fill} opacity={0.35} />
            )}
          </g>
        )
      })}
    </svg>
  )
}
