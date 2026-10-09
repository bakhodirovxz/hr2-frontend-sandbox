import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { apiGet } from '@/api/http'
import { cn } from '@/lib/cn'
import { Panel, PanelEmpty } from './Panel'
import { ToneTile, tipProps } from './boardDrill'

/**
 * MY KPI — the employee board's KPI card (2026-09-24).
 *
 * The REAL KPI: the person's evaluation sheets (`kpi_employee_performances`,
 * DONE only) from `/dashboard/my-kpi-sheets`, drawn against the branch
 * average. The old tile read `my-scorecard` for the CURRENT month, which is
 * half-filled by definition (TEST: every September sheet 0% on the 23rd). This
 * card speaks for the latest CLOSED month and says which one.
 *
 * A month without a closed sheet is a GAP in the line, not a zero.
 */
export interface MyKpiMonth {
  month: string
  mine: number | null
  branch_average: number | null
  closed: boolean
}
export interface MyKpiSheets {
  months: MyKpiMonth[]
  last: (MyKpiMonth & { rank: { position: number; of: number } | null }) | null
  average: number | null
  best: { month: string; value: number } | null
}

export function useMyKpiSheets(enabled = true) {
  const q = useQuery({
    queryKey: ['board', 'my-kpi-sheets'],
    queryFn: () => apiGet<MyKpiSheets>('dashboard/my-kpi-sheets'),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  })
  return { data: q.data ?? null, loading: q.isLoading, failed: q.isError }
}

export function useMonthLabel() {
  const { t } = useTranslation()
  const months = t('date.months', { returnObjects: true }) as unknown as string[]
  const shorts = t('dashboard.drill.monthsShort', { returnObjects: true }) as unknown as string[]
  const i = (m: string) => Number(m.slice(5, 7)) - 1
  return {
    full: (m: string) => `${months?.[i(m)] ?? m} ${m.slice(0, 4)}`,
    short: (m: string) => `${shorts?.[i(m)] ?? m.slice(5, 7)} ’${m.slice(2, 4)}`,
    axis: (m: string) => shorts?.[i(m)] ?? m.slice(5, 7),
  }
}

export function MyKpiCard({ className }: { className?: string }) {
  const { t } = useTranslation()
  const { data, loading } = useMyKpiSheets()
  const ml = useMonthLabel()
  if (loading) return <Panel className={className}>{null}</Panel>
  const last = data?.last
  return (
    <Panel wash="violet" className={className} label={t('dashboard.myKpi.title')}>
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3.5">
        <h2 className="m-0 flex min-w-0 items-center gap-2.5 text-[15px] font-bold text-fg">
          <ToneTile icon={BarChart3} size={30} />
          <span className="truncate">{t('dashboard.myKpi.title')}</span>
        </h2>
        {data && <span className="text-[11.5px] text-fg-subtle">{t('dashboard.myKpi.months', { count: data.months.length })}</span>}
      </div>
      {!last || !data ? (
        <PanelEmpty text={t('dashboard.myKpi.empty')} />
      ) : (
        <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-3">
          <div className="flex items-start gap-4">
            <div className="flex flex-col">
              <span className="bg-gradient-to-r from-[#7C3AED] to-[#C026D3] bg-clip-text text-[40px] font-extrabold leading-none tracking-[-0.04em] text-transparent tabular-nums dark:from-[#C4B5FD] dark:to-[#F0ABFC]">
                {Math.round(last.mine ?? 0)}%
              </span>
              <span className="mt-1 text-[11.5px] text-fg-subtle">{ml.full(last.month)}</span>
            </div>
            <dl className="m-0 grid flex-1 grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[12px]">
              {last.rank && (
                <>
                  <dt className="text-fg-muted">{t('dashboard.myKpi.rank')}</dt>
                  <dd className="m-0 text-right font-bold tabular-nums text-brand-strong">
                    {last.rank.position} / {last.rank.of}
                  </dd>
                </>
              )}
              {data.average != null && (
                <>
                  <dt className="text-fg-muted">{t('dashboard.myKpi.average', { count: data.months.length })}</dt>
                  <dd className="m-0 text-right font-bold tabular-nums text-fg">{data.average}%</dd>
                </>
              )}
              {data.best && (
                <>
                  <dt className="text-fg-muted">{t('dashboard.myKpi.best')}</dt>
                  <dd className="m-0 text-right font-bold tabular-nums text-fg">
                    {Math.round(data.best.value)}% · {ml.short(data.best.month)}
                  </dd>
                </>
              )}
            </dl>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-fg-muted">
            <span className="flex items-center gap-1.5"><i className="h-[3px] w-4 rounded bg-brand" />{t('dashboard.myKpi.me')}</span>
            <span className="flex items-center gap-1.5"><i className="h-0 w-4 border-t-2 border-dashed border-info" />{t('dashboard.myKpi.branch')}</span>
            <span className="ml-auto text-fg-subtle">{t('dashboard.myKpi.gapHint')}</span>
          </div>
          <DualLine months={data.months} />
        </div>
      )}
    </Panel>
  )
}

function DualLine({ months }: { months: MyKpiMonth[] }) {
  const { t } = useTranslation()
  const ml = useMonthLabel()
  const w = 320
  const h = 96
  const X = (i: number) => (i / Math.max(months.length - 1, 1)) * (w - 16) + 8
  const Y = (v: number) => h - 10 - (Math.min(v, 100) / 100) * (h - 20)
  const path = (key: 'mine' | 'branch_average') => {
    let d = ''
    let pen = false
    months.forEach((m, i) => {
      const v = m.closed ? m[key] : null
      if (v == null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)} `
      pen = true
    })
    return d
  }
  return (
    // The chart takes what the panel has left, but never less than 72px: a
    // dragged-short panel used to clip it to nothing. Below that the card scrolls.
    <div className="flex min-h-[92px] flex-1 flex-col">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block min-h-[72px] w-full flex-1 overflow-visible" role="img" aria-label={t('dashboard.myKpi.title')}>
        {[50, 100].map((g) => (
          <line key={g} x1={0} x2={w} y1={Y(g)} y2={Y(g)} className="stroke-border" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path('branch_average')} fill="none" className="stroke-info" strokeWidth={1.8} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={path('mine')} fill="none" className="stroke-brand" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {months.map((m, i) => (
          <g
            key={m.month}
            className="group"
            {...tipProps(
              ml.full(m.month),
              !m.closed
                ? [[t('dashboard.drill.kpiState'), t('dashboard.myKpi.notClosed')]]
                : [
                    [t('dashboard.myKpi.me'), m.mine == null ? '—' : `${m.mine}%`],
                    [t('dashboard.myKpi.branch'), m.branch_average == null ? '—' : `${m.branch_average}%`],
                  ],
            )}
          >
            <rect x={X(i) - w / months.length / 2} y={0} width={w / months.length} height={h} fill="transparent" />
            <line x1={X(i)} x2={X(i)} y1={2} y2={h} className="stroke-brand opacity-0 group-hover:opacity-40" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            {m.closed && m.mine != null ? (
              <circle cx={X(i)} cy={Y(m.mine)} r={3.2} className={cn('fill-surface stroke-brand group-hover:fill-brand')} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            ) : (
              <circle cx={X(i)} cy={h - 10} r={2.4} className="fill-none stroke-fg-subtle" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
            )}
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-0.5 pt-0.5 text-[10px] text-fg-subtle">
        {months.map((m, i) => (
          <span key={m.month} className={i % 2 ? 'invisible' : ''}>{ml.axis(m.month)}</span>
        ))}
      </div>
    </div>
  )
}
