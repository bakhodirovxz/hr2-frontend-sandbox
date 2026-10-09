import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, CheckCircle2, Clock, FileText, PieChart as PieIcon, TrendingUp, XCircle } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { ChartTooltip } from '@/components/data/ChartTooltip'
import { cn } from '@/lib/cn'
import { useOrderChartRows, useOrderStats, type OrderAct } from './useOrders'

const v = (token: string) => `rgb(var(${token}))`
const APPROVED = ['approved', 'confirmed', 'applied']

/** Last 12 months that hold orders: `{month: 'YYYY-MM', total, approved}`. */
function byMonth(rows: OrderAct[]) {
  const map = new Map<string, { month: string; total: number; approved: number }>()
  for (const o of rows) {
    // v1 reads `created_at`; the act date is the fallback for an older row.
    const raw = o.created_at || o.act_date
    if (!raw) continue
    const key = String(raw).slice(0, 7)
    const cur = map.get(key) ?? { month: key, total: 0, approved: 0 }
    cur.total += 1
    if (APPROVED.includes(o.status ?? '')) cur.approved += 1
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12)
}

/** `2026-10` → `10.2026` (the axis has no room for a month name per tick). */
const monthLabel = (m: string) => (m.length >= 7 ? `${m.slice(5, 7)}.${m.slice(0, 4)}` : m)

/**
 * The register at a glance (v1 BuyruqlarKPI + BuyruqlarCharts): four counters
 * from `order-acts/stats`, monthly dynamics, the status split and orders per
 * month. Scoped like the list (the header branch, the caller's visibility).
 */
export function OrderStats() {
  const { t } = useTranslation()
  const { stats, loading } = useOrderStats()
  const chart = useOrderChartRows()
  const months = useMemo(() => byMonth(chart.rows), [chart.rows])

  const tiles = [
    { key: 'total', label: t('orders.statTotal'), value: stats?.total, icon: <FileText size={17} />, tone: 'bg-brand-soft text-brand' },
    { key: 'approved', label: t('orders.statApproved'), value: stats?.approved, icon: <CheckCircle2 size={17} />, tone: 'bg-success-soft text-success' },
    { key: 'pending', label: t('orders.statPending'), value: stats?.pending, icon: <Clock size={17} />, tone: 'bg-warning-soft text-warning' },
    { key: 'rejected', label: t('orders.statRejected'), value: stats?.rejected, icon: <XCircle size={17} />, tone: 'bg-danger-soft text-danger' },
  ]
  const donut = [
    { key: 'approved', name: t('orders.statApproved'), value: stats?.approved ?? 0, color: v('--success') },
    { key: 'rejected', name: t('orders.statRejected'), value: stats?.rejected ?? 0, color: v('--danger') },
    { key: 'pending', name: t('orders.statPending'), value: stats?.pending ?? 0, color: v('--warning') },
  ]
  const donutTotal = donut.reduce((s, d) => s + d.value, 0)
  const axis = { tick: { fill: v('--fg-subtle'), fontSize: 11 }, axisLine: false, tickLine: false } as const

  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,300px)]">
        <div className="grid grid-cols-2 gap-3">
          {tiles.map((tile) => (
            <Card key={tile.key} className="flex flex-col justify-between gap-2 p-3.5">
              <span className={cn('grid h-8 w-8 place-items-center rounded-inner', tile.tone)}>{tile.icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-fg-muted">{tile.label}</span>
                {loading ? (
                  <Skeleton className="mt-1 h-6 w-12" />
                ) : (
                  <span className="block text-[22px] font-extrabold leading-tight tabular-nums text-fg">{tile.value ?? 0}</span>
                )}
              </span>
            </Card>
          ))}
        </div>

        <Card className="min-w-0">
          <CardHeader title={t('orders.chartDynamics')} icon={<TrendingUp size={16} />} />
          <div className="h-[168px] px-2 pb-3">
            {chart.loading ? (
              <Skeleton className="h-full w-full" />
            ) : months.length === 0 ? (
              <ChartEmpty text={t('orders.chartEmpty')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={months} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="rgb(var(--fg) / 0.07)" />
                  <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
                  <YAxis allowDecimals={false} width={36} {...axis} />
                  <RTooltip content={<ChartTooltip formatLabel={monthLabel} />} />
                  <Area type="monotone" dataKey="total" name={t('orders.chartTotal')} stroke={v('--brand')} fill={v('--brand')} fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="approved" name={t('orders.statApproved')} stroke={v('--success')} fill={v('--success')} fillOpacity={0.12} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader title={t('orders.chartStatus')} icon={<PieIcon size={16} />} />
          <div className="flex items-center gap-3 px-4 pb-3">
            <div className="relative h-[140px] w-[140px] shrink-0">
              {loading ? (
                <Skeleton className="h-full w-full rounded-pill" />
              ) : (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutTotal > 0 ? donut : [{ key: 'none', name: '', value: 1, color: 'rgb(var(--fg) / 0.08)' }]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={46}
                        outerRadius={66}
                        paddingAngle={donutTotal > 0 ? 2 : 0}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {(donutTotal > 0 ? donut : [{ key: 'none', color: 'rgb(var(--fg) / 0.08)' }]).map((d) => (
                          <Cell key={d.key} fill={d.color} />
                        ))}
                      </Pie>
                      {donutTotal > 0 && <RTooltip content={<ChartTooltip />} />}
                    </PieChart>
                  </ResponsiveContainer>
                  <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[20px] font-extrabold leading-none tabular-nums text-fg">{stats?.total ?? 0}</span>
                    <span className="mt-1 text-[11px] text-fg-subtle">{t('orders.chartTotalOrders')}</span>
                  </span>
                </>
              )}
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5">
              {donut.map((d) => (
                <li key={d.key} className="flex items-center gap-2 text-[12.5px]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-pill" style={{ backgroundColor: d.color }} />
                  <span className="min-w-0 flex-1 truncate text-fg-muted">{d.name}</span>
                  <span className="font-semibold tabular-nums text-fg">{d.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t('orders.chartMonthly')} icon={<BarChart3 size={16} />} />
        <div className="h-[150px] px-2 pb-3">
          {chart.loading ? (
            <Skeleton className="h-full w-full" />
          ) : months.length === 0 ? (
            <ChartEmpty text={t('orders.chartEmpty')} />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgb(var(--fg) / 0.07)" />
                <XAxis dataKey="month" tickFormatter={monthLabel} {...axis} />
                <YAxis allowDecimals={false} width={36} {...axis} />
                <RTooltip cursor={{ fill: 'rgb(var(--fg) / 0.05)' }} content={<ChartTooltip formatLabel={monthLabel} />} />
                <Bar dataKey="total" name={t('orders.chartOrders')} fill={v('--brand')} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  )
}

function ChartEmpty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-[12.5px] text-fg-subtle">{text}</div>
}
