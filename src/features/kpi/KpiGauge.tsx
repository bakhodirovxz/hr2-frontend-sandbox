import { useTranslation } from 'react-i18next'
import { kpiOutcome, OUTCOME_COLOR_VAR, OUTCOME_LABEL_KEY } from './outcome'

const GAUGE_MAX = 100
const R = 80
const CX = 100
const CY = 100

function polar(angleDeg: number, radius: number) {
  const rad = ((180 - angleDeg) * Math.PI) / 180
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) }
}

function arcPath(fromPct: number, toPct: number, radius: number) {
  const a1 = (fromPct / GAUGE_MAX) * 180
  const a2 = (toPct / GAUGE_MAX) * 180
  const p1 = polar(a1, radius)
  const p2 = polar(a2, radius)
  return `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 0 1 ${p2.x} ${p2.y}`
}

/**
 * KPI dial. `value` is the month result (Σ bonus − Σ penalty, may exceed 100);
 * the needle is clamped to 100. The label says what the number means —
 * bonus, penalty or a normal month — rather than grading 0 as a failure
 * (see ./outcome.ts).
 */
export function KpiGauge({ value, bonus, penalty }: { value: number; bonus?: number | null; penalty?: number | null }) {
  const { t } = useTranslation()
  const real = Number.isFinite(value) ? value : 0
  const needleValue = Math.max(0, Math.min(GAUGE_MAX, real))
  const outcome = kpiOutcome(real, penalty)
  const colorVar = OUTCOME_COLOR_VAR[outcome]
  const needleAngle = (needleValue / GAUGE_MAX) * 180
  const tip = polar(needleAngle, R - 12)
  const both = (bonus ?? 0) > 0 && (penalty ?? 0) > 0

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[260px]" role="img" aria-label={t('kpi.gaugeLabel')}>
        <path d={arcPath(0, GAUGE_MAX, R)} fill="none" stroke="rgb(var(--fg-muted))" strokeWidth={14} opacity={0.15} />
        {needleValue > 0 && (
          <path d={arcPath(0, needleValue, R)} fill="none" stroke={`rgb(var(${colorVar}))`} strokeWidth={14} strokeLinecap="round" />
        )}
        <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} stroke="rgb(var(--fg))" strokeWidth={2.5} strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={5} fill="rgb(var(--fg))" />
      </svg>
      <div className="-mt-4 text-center">
        <p className="text-3xl font-bold tabular-nums text-fg">{Math.round(real)}%</p>
        <p className="text-sm font-medium" style={{ color: `rgb(var(${colorVar}))` }}>
          {t(OUTCOME_LABEL_KEY[outcome] as never)}
          {outcome === 'penalty' && ` −${Math.round(penalty ?? 0)}`}
        </p>
        {both && (
          <p className="mt-0.5 text-[11px] text-fg-subtle">
            {t('kpi.outcomeBoth', { bonus: Math.round(bonus ?? 0), penalty: Math.round(penalty ?? 0) })}
          </p>
        )}
      </div>
    </div>
  )
}
