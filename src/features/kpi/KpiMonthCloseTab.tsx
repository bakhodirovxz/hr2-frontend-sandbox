import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, FileText, Lock, LockOpen } from 'lucide-react'
import { apiGet, apiPost } from '@/api/http'
import { KPI_INTERVAL_CLOSE, KPI_INTERVAL_CLOSE_CHECKLIST, KPI_INTERVAL_REOPEN } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button, Card, EmptyState, Field, Modal, Textarea, useToast } from '@/components/ui'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { cn } from '@/lib/cn'
import { useDynamicT } from '@/i18n/dynamicKey'
import { useIntervals, type KpiInterval } from './useKpiExtras'
import { KpiFactGrid } from './KpiFactGrid'

interface Checklist {
  interval: { id: number; name: string; begin_date: string; end_date: string; is_active: boolean; organization_branch_id?: number | null }
  month: string
  entries: { total: number; done: number; open: number; with_fact: number }
  tasks: { total: number; not_counted: number }
  performances: { total: number; done: number; open: number }
  reports: { id: number; title: string; status: string; approved_at?: string | null }[]
  approved_report_id: number | null
  can_close: boolean
  can_reopen: boolean
  warnings: string[]
}

interface CloseResult {
  locked_entries: number
  finalized_performances: number
  report?: { id: number } | null
}

const singleMonth = (iv: KpiInterval) =>
  !!iv.begin_date && !!iv.end_date && iv.begin_date.slice(0, 7) === iv.end_date.slice(0, 7)

/**
 * «Oy yakuni» — the monthly close in one place.
 *
 * Measured in the client's Verifix: one KPI administrator closes each month
 * in a day or two after it ends — types the handful of rewards/penalties,
 * sets everything Done, files the QR report. Here: pick the month, see what
 * is still open, fill the grid, press one button (the server finalises,
 * files and approves the report in a single transaction).
 */
export function KpiMonthCloseTab({ onOpenReports }: { onOpenReports: () => void }) {
  const { t } = useTranslation()
  const tKey = useDynamicT()
  const toast = useToast()
  const qc = useQueryClient()
  const { intervals, loading } = useIntervals()
  const monthly = useMemo(
    () => intervals.filter(singleMonth).sort((a, b) => (b.begin_date ?? '').localeCompare(a.begin_date ?? '')),
    [intervals],
  )
  const [ivId, setIvId] = useState('')
  useEffect(() => {
    if (!ivId && monthly.length) setIvId(String((monthly.find((i) => i.is_active) ?? monthly[0]).id))
  }, [monthly, ivId])
  const iv = monthly.find((i) => String(i.id) === ivId)

  const check = useQuery({
    queryKey: ['kpi', 'month-close', iv?.id],
    queryFn: () => apiGet<Checklist>(KPI_INTERVAL_CLOSE_CHECKLIST(iv!.id)),
    enabled: !!iv,
  })
  const [confirming, setConfirming] = useState(false)
  const [approve, setApprove] = useState(true)
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [reason, setReason] = useState('')
  const [reopenBusy, setReopenBusy] = useState(false)

  const reopen = async () => {
    if (!iv || reason.trim().length < 3) return
    setReopenBusy(true)
    try {
      const r = await apiPost<{ reopened_entries: number }>(KPI_INTERVAL_REOPEN(iv.id), { reason: reason.trim() })
      toast.ok(t('kpi.monthClose.reopened', { count: r.reopened_entries }))
      setReopening(false)
      setReason('')
      await qc.invalidateQueries({ queryKey: ['kpi'] })
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setReopenBusy(false)
    }
  }

  const close = async () => {
    if (!iv) return
    setClosing(true)
    try {
      const r = await apiPost<CloseResult>(KPI_INTERVAL_CLOSE(iv.id), { approve, with_qr: true })
      toast.ok(t('kpi.monthClose.closed', { locked: r.locked_entries, sheets: r.finalized_performances }))
      setConfirming(false)
      await qc.invalidateQueries({ queryKey: ['kpi'] })
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setClosing(false)
    }
  }

  if (loading) return <CenteredSpinner />
  if (monthly.length === 0) return <EmptyState title={t('kpi.monthClose.noIntervals')} />

  const c = check.data
  const month = c?.month ?? (iv?.begin_date ? `${iv.begin_date.slice(0, 7)}-01` : '')
  const approved = c?.reports.find((r) => r.status === 'approved')
  const draft = c?.reports.find((r) => r.status !== 'approved')

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          <Field label={t('kpi.monthClose.interval')} className="w-64 max-w-full">
            <Combobox
              value={ivId}
              onChange={setIvId}
              options={monthly.map((i) => ({ value: String(i.id), label: i.name ?? `#${i.id}` }))}
            />
          </Field>
          <p className="min-w-[240px] flex-1 text-sm text-fg-muted">{t('kpi.monthClose.hint')}</p>
        </div>

        {check.isLoading ? (
          <div className="py-6"><CenteredSpinner /></div>
        ) : check.isError ? (
          <p className="mt-4 text-sm text-danger">{errorMessage(check.error, t('common.actionFailed'))}</p>
        ) : c ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label={t('kpi.monthClose.entries')} value={t('kpi.monthClose.entriesDone', { done: c.entries.done, total: c.entries.total })} ok={c.entries.open === 0 && c.entries.total > 0} />
              <Stat label={t('kpi.monthClose.withFact')} value={String(c.entries.with_fact)} />
              <Stat label={t('kpi.monthClose.tasksNotCounted')} value={String(c.tasks.not_counted)} warn={c.tasks.not_counted > 0} />
              <Stat label={t('kpi.monthClose.sheets')} value={t('kpi.monthClose.sheetsDone', { done: c.performances.done, total: c.performances.total })} ok={c.performances.total > 0 && c.performances.open === 0} />
              <Stat
                label={t('kpi.monthClose.report')}
                value={approved ? t('kpi.monthClose.reportApproved') : draft ? t('kpi.monthClose.reportDraft') : t('kpi.monthClose.reportNone')}
                ok={!!approved}
              />
            </div>

            {c.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {c.warnings.map((w) => (
                  <li key={w} className={cn('flex items-start gap-2 text-sm', w === 'already_closed' ? 'text-success' : 'text-warning')}>
                    {w === 'already_closed' ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
                    {tKey(`kpi.monthClose.warn_${w}`)}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Checkbox
                label={t('kpi.monthClose.approveNow')}
                checked={approve}
                onChange={(e) => setApprove(e.target.checked)}
                disabled={!c.can_close}
              />
              <div className="ml-auto flex flex-wrap gap-2">
                {c.reports.length > 0 && (
                  <Button variant="outline" size="sm" leftIcon={<FileText size={14} />} onClick={onOpenReports}>
                    {t('kpi.monthClose.openReports')}
                  </Button>
                )}
                {c.can_reopen && (
                  <Button variant="outline" size="sm" leftIcon={<LockOpen size={14} />} onClick={() => setReopening(true)}>
                    {t('kpi.monthClose.reopenButton')}
                  </Button>
                )}
                <Button size="sm" leftIcon={<Lock size={14} />} disabled={!c.can_close} onClick={() => setConfirming(true)}>
                  {t('kpi.monthClose.closeButton')}
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </Card>

      {month && <KpiFactGrid month={month} branchId={iv?.organization_branch_id} onSaved={() => check.refetch()} />}

      <Modal
        open={reopening}
        onClose={() => setReopening(false)}
        title={t('kpi.monthClose.reopenButton')}
        description={t('kpi.monthClose.reopenText')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReopening(false)}>{t('common.cancel')}</Button>
            <Button
              leftIcon={<LockOpen size={14} />}
              disabled={reason.trim().length < 3}
              loading={reopenBusy}
              onClick={reopen}
            >
              {t('kpi.monthClose.reopenButton')}
            </Button>
          </div>
        }
      >
        <Field label={t('kpi.monthClose.reopenReason')} required hint={t('kpi.monthClose.reopenReasonHint')}>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={close}
        loading={closing}
        title={t('kpi.monthClose.closeButton')}
        description={t('kpi.monthClose.confirmText')}
        confirmLabel={t('kpi.monthClose.closeButton')}
      />
    </div>
  )
}

function Stat({ label, value, ok, warn }: { label: string; value: string; ok?: boolean; warn?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--r-sm)] border px-3 py-2.5',
        ok ? 'border-success/30 bg-success-soft/40' : warn ? 'border-warning/40 bg-warning-soft/40' : 'border-line bg-surface-2',
      )}
    >
      <div className="text-[11px] font-medium text-fg-muted">{label}</div>
      <div className={cn('mt-0.5 text-sm font-semibold tabular-nums', ok ? 'text-success' : warn ? 'text-warning' : 'text-fg')}>
        {value}
      </div>
    </div>
  )
}
