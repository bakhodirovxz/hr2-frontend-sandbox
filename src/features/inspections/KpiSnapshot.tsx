import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { inTashkent, numberLocale } from '@/lib/format'
import { Gauge } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { KpiSnapshotData, SnapshotRow } from './useInspections'

const num = (v?: number | null) => (v == null ? '—' : v.toLocaleString(numberLocale(), { maximumFractionDigits: 2 }))

/**
 * TZ K5: the KPI indicators gathered for the audit (`inspections.kpi_snapshot`)
 * — frozen when the audit starts and refreshed when it completes: plan, fact,
 * completion % and deviation over the audited period.
 */
export function KpiSnapshot({ snapshot }: { snapshot?: KpiSnapshotData | null }) {
  const { t } = useTranslation()
  if (!snapshot || !Array.isArray(snapshot.rows)) return null
  const cols: { key: keyof SnapshotRow; label: string; text?: boolean; fmt?: (r: SnapshotRow) => string }[] = [
    { key: 'name', label: t('inspections.snapIndicator'), text: true },
    { key: 'measure', label: t('inspections.snapMeasure'), text: true },
    { key: 'entries', label: t('inspections.snapEntries') },
    { key: 'plan', label: t('inspections.snapPlan') },
    { key: 'fact', label: t('inspections.snapFact') },
    { key: 'percent', label: t('inspections.snapPercent'), fmt: (r) => (r.percent == null ? '—' : `${num(r.percent)}%`) },
    { key: 'deviation_abs', label: t('inspections.snapDeviation') },
  ]
  return (
    <section className="rounded-lg border border-line bg-surface-2/50 p-3" aria-label={t('inspections.kpiIndicators')}>
      <h4 className="mb-2 flex items-center gap-1.5 text-[13.5px] font-semibold text-fg">
        <Gauge size={14} className="text-brand" /> {t('inspections.kpiIndicators')}
      </h4>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-fg-muted">
        {(snapshot.period_start || snapshot.period_end) && (
          <span>
            {t('inspections.snapPeriod')}:{' '}
            <b className="font-medium text-fg">
              {snapshot.period_start ? dayjs(snapshot.period_start).format('DD.MM.YYYY') : '…'} — {snapshot.period_end ? dayjs(snapshot.period_end).format('DD.MM.YYYY') : '…'}
            </b>
          </span>
        )}
        {snapshot.taken_at && (
          <span>
            {t('inspections.snapTakenAt')}: <b className="font-medium text-fg">{inTashkent(snapshot.taken_at).format('DD.MM.YYYY HH:mm')}</b>
          </span>
        )}
      </div>
      {snapshot.rows.length === 0 ? (
        <p className="text-[12.5px] text-fg-subtle">{t('inspections.snapEmpty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} scope="col" className={cn('whitespace-nowrap px-2.5 py-1.5 text-[11.5px] font-semibold text-fg-muted', c.text ? 'text-left' : 'text-right')}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map((r, i) => (
                <tr key={r.indicator_id ?? i} className="border-t border-line/60">
                  {cols.map((c) => (
                    <td key={c.key} className={cn('px-2.5 py-1.5', c.text ? 'text-fg' : 'text-right tabular-nums text-fg')}>
                      {c.fmt ? c.fmt(r) : c.text ? (r[c.key] as string) || '—' : num(r[c.key] as number | null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
