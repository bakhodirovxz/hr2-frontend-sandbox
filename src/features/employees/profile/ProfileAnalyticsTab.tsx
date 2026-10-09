import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { LoadError } from '@/components/data/LoadError'
import dayjs from 'dayjs'

/** Design tokens, not literals — the charts must follow the active theme. */
const v = (name: string) => `rgb(var(${name}))`

interface EffMonth { month: string; label?: string | null; kpi: number; is_low?: boolean; has_data?: boolean }
interface Efficiency { year: number; target?: number; average_kpi?: number; months?: EffMonth[] | null }
interface Slice { key: string; name: string; value: number; color?: string | null }
interface Breakdown {
  attendance?: Slice[] | null
  attendance_total?: number
  tasks?: Slice[] | null
  tasks_total?: number
}
interface RadarRow { key: string; subject: string; actual: number; benchmark: number }
interface PlanActual { metric: string; plan: number; actual: number }
interface MonthDetail {
  label?: string | null
  kpi?: number
  attendance_percentage?: number
  completed_tasks?: number
  not_completed_tasks?: number
  late_tasks?: number
  plan_vs_actual?: PlanActual[] | null
}
interface Characteristics { radar?: RadarRow[] | null }

/**
 * HOW THIS PERSON IS DOING — the reading v1 gave on an employee's card and v2
 * had no equivalent for at all.
 *
 * Three questions, three shapes: KPI month by month across the year (is the
 * trend up?), how their days and tasks actually broke down over a window (what
 * are they made of?), and their profile against the benchmark (where are they
 * strong?). Every number is computed server-side; this only draws it.
 *
 * ⚠️ The characteristics endpoint can also run an LLM summary (`use_llm`). It
 * is deliberately NOT requested: the AI assistant is out of scope for now, and
 * asking for it would make an ordinary profile view wait on a model call.
 */
export function ProfileAnalyticsTab({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(String(thisYear))

  // A month window for the breakdown: the current month is what people ask
  // about, and a year of daily rows would say nothing legible in a donut.
  const { from, to } = useMemo(() => {
    const d = new Date()
    const first = new Date(d.getFullYear(), d.getMonth(), 1)
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    // ⚠️ Local calendar date, not UTC: before 05:00 Tashkent the UTC date is
    // still yesterday and the range would start a day early.
    const iso = (x: Date) => dayjs(x).format('YYYY-MM-DD')
    return { from: iso(first), to: iso(last) }
  }, [])

  const eff = useQuery({
    queryKey: ['emp-efficiency', employeeId, year],
    queryFn: () => apiGet<Efficiency>(`dashboard/employees/${employeeId}/efficiency`, { year }),
  })
  const brk = useQuery({
    queryKey: ['emp-breakdown', employeeId, from, to],
    queryFn: () =>
      apiGet<Breakdown>(`dashboard/employees/${employeeId}/breakdown`, { date_from: from, date_to: to }),
  })
  const chr = useQuery({
    queryKey: ['emp-characteristics', employeeId],
    queryFn: () => apiGet<Characteristics>(`dashboard/employees/${employeeId}/characteristics`),
  })

  const years = useMemo(
    () => Array.from({ length: 5 }, (_, i) => String(thisYear - i)),
    [thisYear],
  )
  const months = eff.data?.months ?? []
  // Clicking a bar asks the server for THAT month's detail: attendance,
  // completed / late tasks and plan-vs-actual. The year chart says which month
  // went wrong; only this says why.
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [y, mo] = (openMonth ?? '-').split('-')
  const monthDetail = useQuery({
    queryKey: ['emp-efficiency-month', employeeId, openMonth],
    queryFn: () =>
      apiGet<MonthDetail>(`dashboard/employees/${employeeId}/efficiency/${Number(y)}/${Number(mo)}`),
    enabled: !!openMonth,
  })
  const target = eff.data?.target ?? 0

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title={t('profile.efficiencyTitle')}
          action={
            <Select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              options={years.map((y) => ({ value: y, label: y }))}
            />
          }
        />
        {eff.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : eff.isError ? (
          /* "No data" on a person's efficiency reads as "this employee did
           * nothing all year". Three charts on this tab said it whenever the
           * request failed. */
          <LoadError error={eff.error} onRetry={() => void eff.refetch()} />
        ) : months.length === 0 ? (
          <EmptyState title={t('profile.noData')} />
        ) : (
          <>
            <p className="mb-3 text-xs text-fg-subtle">
              {t('profile.efficiencyAvg', {
                value: (eff.data?.average_kpi ?? 0).toFixed(1),
                target: String(target),
              })}
            </p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months}>
                  <CartesianGrid strokeDasharray="3 3" stroke={v('--border')} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: v('--fg-subtle') }} />
                  <YAxis tick={{ fontSize: 11, fill: v('--fg-subtle') }} />
                  <RTooltip
                    contentStyle={{
                      background: v('--surface'),
                      border: `1px solid ${v('--border')}`,
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="kpi"
                    radius={[5, 5, 0, 0]}
                    cursor="pointer"
                    onClick={(d: { payload?: EffMonth }) => setOpenMonth(d?.payload?.month ?? null)}
                  >
                    {months.map((m) => (
                      // A month under target reads as a warning, not a failure —
                      // it is a prompt to look, which is what the target is for.
                      <Cell key={m.month} fill={m.is_low ? v('--warning') : v('--brand')} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t('profile.breakdownTitle')} />
          {brk.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : brk.isError ? (
            <LoadError error={brk.error} onRetry={() => void brk.refetch()} />
          ) : (
            <div className="space-y-4">
              <SliceBars rows={brk.data?.attendance ?? []} total={brk.data?.attendance_total ?? 0} />
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-semibold text-fg-muted">
                  {t('profile.tasksLabel')}
                </p>
                <SliceBars rows={brk.data?.tasks ?? []} total={brk.data?.tasks_total ?? 0} />
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title={t('profile.radarTitle')} />
          {chr.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : chr.isError ? (
            <LoadError error={chr.error} onRetry={() => void chr.refetch()} />
          ) : (chr.data?.radar ?? []).length === 0 ? (
            <EmptyState title={t('profile.noData')} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chr.data?.radar ?? []} outerRadius="72%">
                  <PolarGrid stroke={v('--border')} />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: v('--fg-subtle') }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: v('--fg-subtle') }} />
                  <Radar
                    name={t('profile.radarActual')}
                    dataKey="actual"
                    stroke={v('--brand')}
                    fill={v('--brand')}
                    fillOpacity={0.35}
                  />
                  <Radar
                    name={t('profile.radarBenchmark')}
                    dataKey="benchmark"
                    stroke={v('--fg-subtle')}
                    fill="none"
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* One month, opened from the chart above. */}
      <Modal
        open={!!openMonth}
        onClose={() => setOpenMonth(null)}
        size="sm"
        title={monthDetail.data?.label || openMonth || ''}
      >
        {monthDetail.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Metric label={t('profile.mKpi')} value={`${Math.round(monthDetail.data?.kpi ?? 0)}%`} />
              <Metric
                label={t('profile.mAttendance')}
                value={`${Math.round(monthDetail.data?.attendance_percentage ?? 0)}%`}
              />
              <Metric label={t('profile.mDone')} value={String(monthDetail.data?.completed_tasks ?? 0)} />
              <Metric label={t('profile.mLate')} value={String(monthDetail.data?.late_tasks ?? 0)} />
            </div>
            {(monthDetail.data?.plan_vs_actual ?? []).length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                {(monthDetail.data?.plan_vs_actual ?? []).map((r) => (
                  <div key={r.metric} className="flex items-center gap-3">
                    <span className="w-36 shrink-0 truncate text-[13px] text-fg-muted">{r.metric}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
                      <div
                        className="h-full rounded-pill bg-brand"
                        style={{ width: `${r.plan > 0 ? Math.min(100, (r.actual / r.plan) * 100) : 0}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-[13px] tabular-nums text-fg">
                      {r.actual} / {r.plan}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="text-[11.5px] font-semibold text-fg-muted">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-fg">{value}</div>
    </div>
  )
}

/**
 * The breakdown as labelled bars rather than a pie. A pie of six slices where
 * four are zero is unreadable; a bar list stays legible and still shows the
 * share. Colours come from the server because they are DATA — the same key
 * must look the same on every screen that draws it.
 */
function SliceBars({ rows, total }: { rows: Slice[]; total: number }) {
  const { t } = useTranslation()
  if (!rows.length || total === 0) {
    return <p className="text-sm text-fg-subtle">{t('profile.noData')}</p>
  }
  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.value / total) * 100) : 0
        return (
          <div key={r.key} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-[13px] text-fg-muted">{r.name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
              <div
                className="h-full rounded-pill"
                style={{ width: `${pct}%`, background: r.color || v('--brand') }}
              />
            </div>
            <span className="w-14 shrink-0 text-right text-[13px] tabular-nums text-fg">
              {r.value} <span className="text-fg-subtle">({pct}%)</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
