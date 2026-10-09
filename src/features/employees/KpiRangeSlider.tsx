import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Free 0–100 KPI range, the companion to the five preset bands.
 *
 * v1 offers both: the bands answer "show me the problem cases", the slider
 * answers "show me 62 to 71", which no band can express. v2 shipped the bands
 * only, so any question that did not fall on a band boundary was unaskable —
 * even though `/employees` has accepted `kpi_min`/`kpi_max` all along.
 *
 * Two overlaid native range inputs rather than a drag library: it keeps keyboard
 * and screen-reader behaviour for free. The value is committed on release, not
 * on every pixel, so dragging does not fire a request per step.
 */
export function KpiRangeSlider({
  min,
  max,
  onCommit,
}: {
  min?: number
  max?: number
  onCommit: (range: { min?: number; max?: number }) => void
}) {
  const { t } = useTranslation()
  const [lo, setLo] = useState(min ?? 0)
  const [hi, setHi] = useState(max ?? 100)

  // Follow the outside value when a preset band (or Reset) changes it.
  useEffect(() => {
    setLo(min ?? 0)
    setHi(max ?? 100)
  }, [min, max])

  const commit = (nextLo: number, nextHi: number) =>
    // A full 0–100 span is "no filter", not "everyone between 0 and 100": sending
    // it would exclude employees with no KPI value at all.
    onCommit(nextLo === 0 && nextHi === 100 ? {} : { min: nextLo, max: nextHi })

  return (
    <div className="flex w-full flex-col gap-1 lg:w-56">
      <div className="flex items-center justify-between text-[11px] text-fg-muted">
        <span>{t('employees.kpiRangeLabel')}</span>
        <span className="tabular-nums font-medium text-fg">
          {lo} – {hi}
        </span>
      </div>
      <div className="relative h-5">
        <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-pill bg-surface-2" />
        <span
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-pill bg-brand"
          style={{ left: `${lo}%`, right: `${100 - hi}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={lo}
          aria-label={t('employees.kpiRangeMin')}
          onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
          className="pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand"
        />
        <input
          type="range"
          min={0}
          max={100}
          value={hi}
          aria-label={t('employees.kpiRangeMax')}
          onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
          onPointerUp={() => commit(lo, hi)}
          onKeyUp={() => commit(lo, hi)}
          className="pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand"
        />
      </div>
    </div>
  )
}
