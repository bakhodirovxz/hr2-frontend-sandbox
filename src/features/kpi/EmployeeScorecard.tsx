import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Building2, CalendarRange, ChevronRight, Clock, Download, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { TD, TD_MESSAGE, TH } from '@/components/data/tableStyles'
import { useServerText } from '@/features/statistics/serverText'
import { errorMessage } from '@/api/errorMessage'
import { monthTitle } from '@/lib/format'
import { cn } from '@/lib/cn'
import { exportScorecard, fmtDay, isPenalty, num, pct, percentTone, useMyTeam, useScorecard, type KpiTeamMember } from './api'
import { KpiGauge } from './KpiGauge'
import { KpiStatusMenu } from './KpiStatusMenu'
import { TONE_TEXT } from './KpiResultsTab'

/**
 * «Mening KPI» — a person's KPI window (v1 `EmployeeKpiScreen`): the profile
 * and the speedometer on the left, the month's indicators on the right with
 * plan / fact totals (a penalty is subtracted), a month picker over the
 * months that have entries, and the Excel file of what is on screen.
 * `employeeId` — a head (or HR) looking at someone else's window.
 */
export function EmployeeScorecard({ employeeId, onOpenEntry }: { employeeId: number | null; onOpenEntry?: (id: number) => void }) {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const [period, setPeriod] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const { scorecard, loading, error } = useScorecard(employeeId, period)
  const profile = scorecard?.profile
  const entries = useMemo(() => scorecard?.entries ?? [], [scorecard])
  const periods = scorecard?.available_periods ?? []
  const current = period ?? scorecard?.period ?? null

  // Additive indicators sum their plan and fact; a penalty's fact is taken away.
  const totals = useMemo(() => {
    let plan = 0
    let fact = 0
    let penalty = 0
    for (const e of entries) {
      if (isPenalty(e.indicator)) penalty += Number(e.fact_value ?? 0)
      else {
        plan += Number(e.plan_value ?? 0)
        fact += Number(e.fact_value ?? 0)
      }
    }
    return { plan, fact, penalty, net: fact - penalty }
  }, [entries])

  if (error && !scorecard) {
    return (
      <Card className="p-6">
        <EmptyState title={t('kpi.scorecardUnavailable')} description={errorMessage(error, t('list.loadFailedHint'))} />
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="flex flex-col items-center gap-4 p-5">
        <Avatar src={profile?.photo_path} name={profile?.legal_name} size={88} />
        <div className="text-center">
          <p className="text-[15px] font-semibold leading-snug text-fg">{profile?.legal_name ?? (loading ? '…' : '—')}</p>
          <p className="text-[12px] text-fg-subtle">{[profile?.job_position_name, profile?.department_name].filter(Boolean).join(', ')}</p>
        </div>
        <dl className="flex w-full flex-col gap-2.5 border-t border-line pt-4">
          <Info icon={<Building2 size={14} />} label={t('kpi.colDepartment')} value={profile?.department_name} />
          <Info
            icon={<CalendarRange size={14} />}
            label={t('kpi.colPeriod')}
            value={profile?.period_begin ? `${fmtDay(profile.period_begin)} — ${fmtDay(profile.period_end)}` : null}
          />
          <Info icon={<Users size={14} />} label={t('kpi.supervisor')} value={profile?.supervisor_name} />
          <Info icon={<Clock size={14} />} label={t('kpi.workSchedule')} value={profile?.work_schedule} />
        </dl>
        <KpiGauge value={loading ? null : scorecard?.result_percent} />
        {periods.length > 0 && (
          <div className="w-full border-t border-line pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">
              <CalendarRange size={13} aria-hidden /> {t('kpi.evaluationPeriod')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {periods.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={current === p}
                  className={cn(
                    'h-7 rounded-pill px-3 text-[12px] font-medium transition-colors',
                    current === p ? 'bg-brand text-fg-on-brand' : 'bg-surface-2 text-fg-muted hover:text-fg',
                  )}
                >
                  {monthTitle(`${p}-01`)}
                </button>
              ))}
            </div>
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          leftIcon={<Download size={14} />}
          loading={exporting}
          onClick={async () => {
            setExporting(true)
            try {
              await exportScorecard(employeeId, current)
            } catch (e) {
              toast.error(errorMessage(e, t('kpi.exportFailed')))
            } finally {
              setExporting(false)
            }
          }}
        >
          {t('kpi.exportExcel')}
        </Button>
      </Card>

      <Card className="flex min-w-0 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-5 py-4">
          <h3 className="text-[14px] font-semibold text-fg">{t('kpi.indicators')}</h3>
          {current && <span className="text-[12px] text-fg-subtle">· {monthTitle(`${current}-01`)}</span>}
        </div>
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full border-collapse text-left" style={{ minWidth: 720 }}>
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>{t('kpi.colIndicator')}</th>
                <th className={TH}>{t('kpi.begin')}</th>
                <th className={TH}>{t('kpi.end')}</th>
                <th className={cn(TH, 'text-right')}>{t('kpi.colResult')}</th>
                <th className={cn(TH, 'text-right')}>{t('kpi.colPlan')}</th>
                <th className={cn(TH, 'text-right')}>{t('kpi.colFact')}</th>
                <th className={TH}>{t('kpi.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className={TD_MESSAGE}>
                    {t('common.loading')}
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td colSpan={7} className={TD_MESSAGE}>
                    {t('kpi.monthEmpty')}
                  </td>
                </tr>
              ) : (
                entries.map((e) => {
                  const pen = isPenalty(e.indicator)
                  const f = Number(e.fact_value ?? 0)
                  return (
                    <tr
                      key={e.id}
                      onClick={onOpenEntry ? () => onOpenEntry(e.id) : undefined}
                      className={cn('border-b border-line align-top last:border-0', onOpenEntry && 'cursor-pointer hover:bg-surface-2/60', pen && 'bg-danger-soft/30')}
                    >
                      <td className={cn(TD, 'max-w-[26rem]')}>
                        {pen && <span className="mr-1.5 rounded bg-danger-soft px-1.5 py-0.5 text-[10.5px] font-bold text-danger">{t('kpi.penaltyMark')}</span>}
                        <span className="whitespace-pre-wrap leading-snug text-fg">{sx(e.indicator?.name) || '—'}</span>
                      </td>
                      <td className={cn(TD, 'whitespace-nowrap tabular-nums text-fg-muted')}>{fmtDay(e.period_start)}</td>
                      <td className={cn(TD, 'whitespace-nowrap tabular-nums text-fg-muted')}>{fmtDay(e.period_end)}</td>
                      <td className={cn(TD, 'text-right font-semibold tabular-nums')}>
                        {pen ? (
                          <span className={f > 0 ? 'text-danger' : 'text-fg-subtle'}>{f > 0 ? `−${f}` : '0'}</span>
                        ) : (
                          <span className={cn('rounded-pill px-2 py-0.5', TONE_TEXT[percentTone(e.result_percent)])}>{pct(e.result_percent)}</span>
                        )}
                      </td>
                      <td className={cn(TD, 'text-right tabular-nums')}>{num(e.plan_value)}</td>
                      <td className={cn(TD, 'text-right tabular-nums', pen && f > 0 && 'text-danger')}>{pen && f > 0 ? `−${f}` : num(e.fact_value)}</td>
                      <td className={TD}>
                        <KpiStatusMenu status={e.status} />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {!loading && entries.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-surface-2/40 font-semibold">
                  <td className={cn(TD, 'text-right text-fg-muted')} colSpan={4}>
                    {t('kpi.totalPlanFact')}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{totals.plan}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{totals.fact}</td>
                  <td className={TD} />
                </tr>
                {totals.penalty > 0 && (
                  <tr className="font-semibold text-danger">
                    <td className={cn(TD, 'text-right')} colSpan={5}>
                      {t('kpi.penaltySubtracted')}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>−{totals.penalty}</td>
                    <td className={cn(TD, 'whitespace-nowrap')}>
                      {t('kpi.total')}: {totals.net}
                    </td>
                  </tr>
                )}
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
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

/**
 * «Xodimlarim samaradorligi» — a head's direct reports with this month's
 * result (same formula as the speedometer); a row opens that person's window.
 */
export function TeamTab() {
  const { t } = useTranslation()
  const { team, members, loading } = useMyTeam(null)
  const [picked, setPicked] = useState<KpiTeamMember | null>(null)

  if (picked) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={15} />} onClick={() => setPicked(null)}>
            {t('kpi.backToTeam')}
          </Button>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-fg">{picked.legal_name}</p>
            {picked.job_position_name && <p className="truncate text-[12px] text-fg-subtle">{picked.job_position_name}</p>}
          </div>
        </div>
        <EmployeeScorecard employeeId={picked.employee_id} />
      </div>
    )
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
        <h3 className="text-[14px] font-semibold text-fg">{t('kpi.teamTitle')}</h3>
        {team && (
          <span className="text-[12px] tabular-nums text-fg-subtle">
            {t('kpi.colPeriod')}: {fmtDay(team.period_begin)} — {fmtDay(team.period_end)}
          </span>
        )}
      </div>
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 760 }}>
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>{t('kpi.colEmployee')}</th>
              <th className={TH}>{t('kpi.colDepartment')}</th>
              <th className={cn(TH, 'text-center')}>{t('kpi.indicators')}</th>
              <th className={cn(TH, 'text-center')}>{t('kpi.colResult')}</th>
              <th className={TH}>{t('kpi.colStatus')}</th>
              <th className={TH} aria-hidden />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className={TD_MESSAGE}>
                  {t('common.loading')}
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={6} className={TD_MESSAGE}>
                  {t('kpi.teamEmpty')}
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr
                  key={m.employee_id}
                  tabIndex={0}
                  onClick={() => setPicked(m)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPicked(m))}
                  className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2/60"
                >
                  <td className={TD}>
                    <span className="flex items-center gap-2.5">
                      <Avatar src={m.photo_path} name={m.legal_name} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">{m.legal_name}</span>
                        {m.job_position_name && <span className="block truncate text-[11.5px] text-fg-subtle">{m.job_position_name}</span>}
                      </span>
                    </span>
                  </td>
                  <td className={cn(TD, 'text-fg-muted')}>{m.department_name || '—'}</td>
                  <td className={cn(TD, 'text-center tabular-nums text-fg-muted')}>{m.entries_count}</td>
                  <td className={cn(TD, 'text-center')}>
                    <span className={cn('inline-block min-w-12 rounded-pill px-2 py-0.5 text-[12px] font-bold tabular-nums', TONE_TEXT[percentTone(m.result_percent)])}>
                      {pct(m.result_percent)}
                    </span>
                  </td>
                  <td className={TD}>
                    <KpiStatusMenu status={m.all_done ? 'D' : 'I'} />
                  </td>
                  <td className={cn(TD, 'text-right')}>
                    <ChevronRight size={16} className="text-fg-subtle" aria-hidden />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
