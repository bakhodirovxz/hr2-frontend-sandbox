import type { ReactNode } from 'react'
import { lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, Cake, CalendarClock, Clock, Trophy, UserCheck, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { useEmployeeKpiRanked, useRosterHeadline } from './useEmployeeKpi'
import type { EmployeeKpiRow } from './types'

function StatCard({ icon, label, value, share, tone, loading }: { icon: ReactNode; label: string; value: number | string; share?: string; tone: string; loading: boolean }) {
  return (
    <Card className="flex items-center gap-3 p-card">
      <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', tone)}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-fg-muted">{label}</span>
        {loading ? (
          <Skeleton className="mt-1 h-5 w-12" />
        ) : (
          <span className="flex items-baseline gap-1.5">
            <span className="text-[18px] font-semibold tabular-nums text-fg">{value}</span>
            {share && <span className="text-[11.5px] tabular-nums text-fg-subtle">{share}</span>}
          </span>
        )}
      </span>
    </Card>
  )
}

/**
 * Roster headline (v1 `EmployeesAdminKpiRow`): total, today's attendance
 * categories (present / late / other / absent) and the average age.
 */
export function HeadlineCards({ adminView, averageAge, ageLoading }: { adminView: boolean; averageAge: number; ageLoading: boolean }) {
  const { t } = useTranslation()
  const h = useRosterHeadline(adminView)
  const pct = (n: number) => (h.total > 0 ? `${((n / h.total) * 100).toFixed(1)}%` : undefined)
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard icon={<Users size={17} />} tone="bg-brand-soft text-brand-strong" label={t('personnel.stats.total')} value={h.total} loading={h.totalLoading} />
      <StatCard icon={<UserCheck size={17} />} tone="bg-success-soft text-success" label={t('personnel.stats.present')} value={h.present} share={pct(h.present)} loading={h.attendanceLoading} />
      <StatCard icon={<Clock size={17} />} tone="bg-info-soft text-info" label={t('personnel.stats.late')} value={h.late} share={pct(h.late)} loading={h.attendanceLoading} />
      <StatCard icon={<CalendarClock size={17} />} tone="bg-warning-soft text-warning" label={t('personnel.stats.other')} value={h.other} share={pct(h.other)} loading={h.attendanceLoading} />
      <StatCard icon={<AlertTriangle size={17} />} tone="bg-danger-soft text-danger" label={t('personnel.stats.absent')} value={h.absent} share={pct(h.absent)} loading={h.attendanceLoading} />
      <StatCard icon={<Cake size={17} />} tone="bg-surface-2 text-fg-muted" label={t('personnel.stats.avgAge')} value={averageAge} loading={ageLoading} />
    </div>
  )
}

function RankRow({ rank, row, tone }: { rank: number; row: EmployeeKpiRow; tone: 'success' | 'danger' }) {
  const kpi = Math.round(Number(row.kpi_percentage) || 0)
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <span className="w-5 shrink-0 text-[11px] font-bold text-fg-subtle">{rank}.</span>
      <Avatar src={row.photo_thumb_path} fallbackSrc={row.photo_path} name={row.legal_name} size={28} />
      <Link to={`/employees/${row.id}`} className="min-w-0 flex-1 hover:underline">
        <span className="block truncate text-[12.5px] font-semibold text-fg">{row.legal_name}</span>
        <span className="block truncate text-[11px] text-fg-subtle">{lt(row.job_position_name) || '—'}</span>
      </Link>
      <span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-surface-2">
        <span className={cn('block h-full rounded-full', tone === 'success' ? 'bg-success' : 'bg-danger')} style={{ width: `${Math.min(100, Math.max(0, kpi))}%` }} />
      </span>
      <span className={cn('w-10 shrink-0 text-right text-[12px] font-bold tabular-nums', tone === 'success' ? 'text-success' : 'text-danger')}>{kpi}%</span>
    </li>
  )
}

/** «Eng yaxshi 5 xodim» / «E'tiborga muhtoj xodimlar» (v1 insights row). */
export function KpiInsights() {
  const { t } = useTranslation()
  const top = useEmployeeKpiRanked('best_kpi', 5)
  const worst = useEmployeeKpiRanked('worst_kpi', 10)
  const block = (title: string, icon: ReactNode, data: { rows: EmployeeKpiRow[]; loading: boolean }, tone: 'success' | 'danger') => (
    <Card className="flex flex-col">
      <CardHeader title={title} icon={icon} />
      <div className="max-h-[260px] overflow-y-auto px-4 pb-3">
        {data.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : data.rows.length === 0 ? (
          <p className="py-6 text-center text-xs italic text-fg-subtle">{t('employees.noData')}</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {data.rows.map((r, i) => (
              <RankRow key={r.id} rank={i + 1} row={r} tone={tone} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {block(t('personnel.stats.top'), <Trophy size={16} />, top, 'success')}
      {block(t('personnel.stats.attention'), <AlertCircle size={16} />, worst, 'danger')}
    </div>
  )
}
