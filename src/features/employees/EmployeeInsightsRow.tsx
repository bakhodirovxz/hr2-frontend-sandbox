import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, Trophy } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useEmployeeKpiRanked, type EmployeeKpiRow, type TaskExecutionStats } from './useEmployeeKpi'

export function EmployeeInsightsRow({ tasks }: { tasks?: TaskExecutionStats }) {
  const { t } = useTranslation()
  const top = useEmployeeKpiRanked('best_kpi')
  const worst = useEmployeeKpiRanked('worst_kpi')

  const warnings: string[] = []
  if (tasks) {
    if (tasks.absent_employee_count > 0)
      warnings.push(t('employees.warnAbsentToday', { count: tasks.absent_employee_count }))
    if (tasks.late_employee_count > 0)
      warnings.push(t('employees.warnLateToday', { count: tasks.late_employee_count }))
    if (tasks.kpi_below_50_employee_count > 0)
      warnings.push(t('employees.warnKpiLow', { count: tasks.kpi_below_50_employee_count }))
    if (tasks.absent_employee_strike_5_days_count > 0)
      warnings.push(
        t('employees.warnAbsentStreak', { count: tasks.absent_employee_strike_5_days_count }),
      )
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="flex flex-col">
        <CardHeader title={t('employees.top5')} icon={<Trophy size={16} />} />
        <RankedList rows={top.rows} loading={top.loading} accent="--success" />
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t('employees.needsAttention')} icon={<AlertTriangle size={16} />} />
        <RankedList rows={worst.rows} loading={worst.loading} accent="--danger" />
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t('employees.warnings')} icon={<Bell size={16} />} />
        <div className="min-h-[160px] flex-1 p-3">
          {warnings.length === 0 ? (
            <EmptyState title={t('employees.noWarnings')} />
          ) : (
            <ul className="space-y-2">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning"
                >
                  <AlertTriangle size={15} className="shrink-0" />
                  <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}

function RankedList({
  rows,
  loading,
  accent,
}: {
  rows: EmployeeKpiRow[]
  loading: boolean
  accent: string
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (!rows.length) {
    return (
      <div className="min-h-[160px] flex-1 p-3">
        <EmptyState title={t('employees.noData')} />
      </div>
    )
  }

  return (
    <ul className="min-h-[160px] flex-1 divide-y divide-line">
      {rows.map((r, i) => {
        const kpi = Math.round(r.kpi_percentage || 0)
        return (
          <li key={r.id}>
            <Link
              to={`/employees/${r.id}`}
              className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2"
            >
              <span className="w-4 shrink-0 text-center text-xs font-bold tabular-nums text-fg-subtle">
                {i + 1}
              </span>
              <Avatar src={r.photo_thumb_path} fallbackSrc={r.photo_path} name={r.legal_name} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-fg">{r.legal_name}</p>
                <p className="truncate text-[11px] text-fg-muted">{r.job_position_name || '—'}</p>
              </div>
              <div className="flex w-24 shrink-0 items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${kpi}%`, backgroundColor: `rgb(var(${accent}))` }}
                  />
                </div>
                <span className={cn('w-9 text-right text-[11px] font-bold tabular-nums text-fg')}>
                  {kpi}%
                </span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
