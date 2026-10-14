import { useState, type ReactNode } from 'react'
import { lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, CalendarRange, ChartLine, ListPlus, RefreshCw, Users } from 'lucide-react'
import { PageContainer } from '@/components/layout/Page'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { TD, TD_MESSAGE, TH } from '@/components/data/tableStyles'
import { useServerText } from '@/features/statistics/serverText'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { fmtDay, num, pct, percentTone, useKpiMutations, usePerformance } from '@/features/kpi/api'
import { KpiGauge } from '@/features/kpi/KpiGauge'
import { KpiStatusMenu } from '@/features/kpi/KpiStatusMenu'
import { PerformanceDrawer } from '@/features/kpi/PerformanceDrawer'
import { TONE_TEXT } from '@/features/kpi/KpiResultsTab'
import { useKpiAccess } from '@/features/kpi/useKpiAccess'

/**
 * One scorecard (`/kpi/performances/:id`, v1 `EmployeePerformancePage`): the
 * person and the speedometer on the left, the arguments that make the result
 * on the right with plan / fact totals. A manager moves the status, recomputes
 * and edits the arguments; the person and their head read it.
 */
export function KpiPerformancePage() {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const navigate = useNavigate()
  const { id } = useParams()
  const perfId = Number(id) || null
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const { perf, loading, error } = usePerformance(perfId)
  const [editing, setEditing] = useState(false)

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/kpi?tab=sheets'))

  if (loading) return <CenteredSpinner />
  if (error || !perf) {
    return (
      <PageContainer>
        <Card className="p-6">
          <EmptyState title={t('kpi.sheetNotFound')} description={errorMessage(error, '')} action={<Button variant="secondary" onClick={back}>{t('kpi.back')}</Button>} />
        </Card>
      </PageContainer>
    )
  }

  const profile = perf.employee_profile ?? {}
  const args = perf.arguments ?? []
  let plan = 0
  let fact = 0
  for (const a of args) {
    const e = a.source_entry
    if (!e) continue
    plan += Number(e.plan_value ?? 0)
    fact += (a.operation === 'S' ? -1 : 1) * Number(e.fact_value ?? 0)
  }

  const run = async (p: () => Promise<unknown>, ok: string) => {
    try {
      await p()
      toast.ok(ok)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <PageContainer>
      <div className="mb-4 flex items-center gap-3">
        <IconButton label={t('kpi.back')} onClick={back}>
          <ArrowLeft size={18} />
        </IconButton>
        <div className="min-w-0">
          <h1 className="truncate text-[18px] font-semibold text-fg">{t('kpi.sheetTitle')}</h1>
          <p className="truncate text-[12.5px] text-fg-subtle">{perf.interval?.name ?? ''}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex flex-col items-center gap-4 p-5">
          <Avatar src={profile.photo_path} name={profile.legal_name ?? perf.employee?.legal_name} size={88} />
          <div className="text-center">
            <p className="text-[15px] font-semibold leading-snug text-fg">{profile.legal_name ?? perf.employee?.legal_name ?? '—'}</p>
            <p className="text-[12px] text-fg-subtle">{[lt(profile.job_position_name), lt(profile.department_name)].filter(Boolean).join(', ')}</p>
          </div>
          <KpiStatusMenu
            status={perf.status}
            onAction={acc.manager ? (a) => run(() => mut.performanceStatus.mutateAsync({ id: perf.id, action: a }), t('kpi.statusChanged')) : undefined}
            allowed={(a) => acc.may('employee_performance', `performance_${a}`)}
          />
          <dl className="flex w-full flex-col gap-2.5 border-t border-line pt-4">
            <Info icon={<Building2 size={14} />} label={t('kpi.colDepartment')} value={lt(profile.department_name) || undefined} />
            <Info
              icon={<CalendarRange size={14} />}
              label={t('kpi.colPeriod')}
              value={perf.interval ? `${fmtDay(perf.interval.begin_date)} — ${fmtDay(perf.interval.end_date)}` : null}
            />
            <Info icon={<Users size={14} />} label={t('kpi.supervisor')} value={profile.supervisor_name} />
          </dl>
          <KpiGauge value={perf.result_percent} />
        </Card>

        <Card className="flex min-w-0 flex-col overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
            <ChartLine size={17} className="text-brand" aria-hidden />
            <h3 className="text-[14px] font-semibold text-fg">{t('kpi.argumentsTitle')}</h3>
            <div className="ml-auto flex gap-2">
              {acc.may('employee_performance', 'performance_arguments') && (
                <Button size="sm" variant="secondary" leftIcon={<ListPlus size={14} />} onClick={() => setEditing(true)}>
                  {t('kpi.editArguments')}
                </Button>
              )}
              {acc.manager && (
                <IconButton label={t('kpi.recompute')} onClick={() => run(() => mut.recomputePerformance.mutateAsync(perf.id), t('kpi.recomputed'))}>
                  <RefreshCw size={16} className={cn(mut.recomputePerformance.isPending && 'animate-spin')} />
                </IconButton>
              )}
            </div>
          </div>
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full border-collapse text-left" style={{ minWidth: 640 }}>
              <thead>
                <tr className="border-b border-line">
                  <th className={TH}>{t('kpi.colIndicator')}</th>
                  <th className={cn(TH, 'text-center')}>{t('kpi.weight')}</th>
                  <th className={cn(TH, 'text-center')}>{t('kpi.operation')}</th>
                  <th className={cn(TH, 'text-right')}>{t('kpi.colPlan')}</th>
                  <th className={cn(TH, 'text-right')}>{t('kpi.colFact')}</th>
                  <th className={cn(TH, 'text-center')}>{t('kpi.colResult')}</th>
                </tr>
              </thead>
              <tbody>
                {args.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={TD_MESSAGE}>
                      {t('kpi.argumentsEmpty')}
                    </td>
                  </tr>
                ) : (
                  args.map((a) => {
                    const e = a.source_entry
                    return (
                      <tr key={a.id} className="border-b border-line last:border-0">
                        <td className={cn(TD, 'max-w-[24rem]')}>
                          <span className="line-clamp-2 text-fg">{sx(e?.indicator?.name) || `#${a.source_entry_id}`}</span>
                        </td>
                        <td className={cn(TD, 'text-center tabular-nums')}>{num(a.weight)}</td>
                        <td className={cn(TD, 'text-center font-bold', a.operation === 'S' ? 'text-danger' : 'text-success')}>{a.operation === 'S' ? '−' : '+'}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{num(e?.plan_value)}</td>
                        <td className={cn(TD, 'text-right tabular-nums')}>{num(e?.fact_value)}</td>
                        <td className={cn(TD, 'text-center')}>
                          <span className={cn('inline-block min-w-12 rounded-pill px-2 py-0.5 text-[12px] font-bold tabular-nums', TONE_TEXT[percentTone(e?.result_percent)])}>
                            {pct(e?.result_percent)}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {args.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-line bg-surface-2/40 font-semibold">
                    <td className={cn(TD, 'text-fg-muted')} colSpan={3}>
                      {t('kpi.total')}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{plan}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{fact}</td>
                    <td className={cn(TD, 'text-center tabular-nums')}>{pct(perf.result_percent)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>

      <PerformanceDrawer id={editing ? perf.id : null} onClose={() => setEditing(false)} />
    </PageContainer>
  )
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand-strong">{icon}</span>
      <div className="min-w-0">
        <dt className="text-[11px] text-fg-subtle">{label}</dt>
        <dd className="truncate text-[13px] text-fg">{value || '—'}</dd>
      </div>
    </div>
  )
}
