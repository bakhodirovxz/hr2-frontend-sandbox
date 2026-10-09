import { useTranslation } from 'react-i18next'

/*
 * KPI speedometer (v1 `KpiGauge`): five bands on a 0–100 scale, a needle and
 * the real result in the middle. The result is a sum of points and can pass
 * 100 (all bonuses collected: 200 − 30 = 170 %); the needle and the band stop
 * at 100, the number does not.
 */

const R = 80
const CX = 100
const CY = 100

export const KPI_BANDS = [
  { to: 20, color: '--danger', alpha: 1, key: 'kpi.bandBad' },
  { to: 40, color: '--warning', alpha: 0.7, key: 'kpi.bandPoor' },
  { to: 60, color: '--warning', alpha: 1, key: 'kpi.bandFair' },
  { to: 80, color: '--success', alpha: 0.65, key: 'kpi.bandGood' },
  { to: 100, color: '--success', alpha: 1, key: 'kpi.bandExcellent' },
] as const

export function kpiBand(value?: number | null) {
  const v = Math.max(0, Number(value ?? 0))
  return KPI_BANDS.find((b) => v < b.to) ?? KPI_BANDS[KPI_BANDS.length - 1]
}

function polar(pct: number, radius: number) {
  const rad = ((180 - (pct / 100) * 180) * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) }
}

function arc(from: number, to: number) {
  const a = polar(from, R)
  const b = polar(to, R)
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`
}

export function KpiGauge({ value }: { value: number | null | undefined }) {
  const { t } = useTranslation()
  const real = value == null ? null : Math.max(0, Number(value))
  const needle = Math.min(100, real ?? 0)
  const band = kpiBand(real)
  const tip = polar(needle, R - 18)
  let from = 0

  return (
    <div className="flex w-full flex-col items-center">
      <svg viewBox="0 0 200 116" className="w-full max-w-[260px]" role="img" aria-label={t('kpi.gaugeLabel')}>
        {KPI_BANDS.map((b) => {
          const d = arc(from + (from ? 0.8 : 0), b.to)
          from = b.to
          return (
            <path key={b.to} d={d} fill="none" stroke={`rgb(var(${b.color}))`} strokeOpacity={b.alpha} strokeWidth={16} />
          )
        })}
        {real != null && (
          <>
            <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="rgb(var(--fg))" strokeWidth={3} strokeLinecap="round" />
            <circle cx={CX} cy={CY} r={6} fill="rgb(var(--fg))" />
          </>
        )}
      </svg>
      <div className="-mt-1 text-center">
        <p className="text-3xl font-bold tabular-nums text-fg">{real == null ? '—' : `${Math.round(real)}%`}</p>
        {real != null && (
          <p className="text-[12px] font-bold uppercase tracking-wide" style={{ color: `rgb(var(${band.color}))` }}>
            {t(band.key)}
          </p>
        )}
      </div>
    </div>
  )
}
