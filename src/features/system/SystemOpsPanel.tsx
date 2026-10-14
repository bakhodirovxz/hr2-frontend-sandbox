import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, LifeBuoy, Lock, PlayCircle, Power, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { apiGet, apiPost } from '@/api/http'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  FAILURE_TYPES,
  OPS,
  componentLabel,
  localizeMessage,
  modeLabel,
  type Incident,
  type OpsReport,
  type OpsState,
  type TransactionList,
} from './systemOps'
import { JobProgress } from './JobProgress'
import { useJob } from './useJob'

/*
 * TZ E2 «Аварийное завершение» va E3 «Восстановление» — rejim kartasi va
 * boshqaruv amallari.
 *
 *   ish rejimi          → «Avariyaviy to'xtatish» (sabab ≥ 3 belgi, majburiy /
 *                         yumshoq) → hisobot;
 *   to'xtatilgan        → «Tiklash rejimi», «Tiklashni bajarish» (ochiq
 *                         tranzaksiyalar: tegmaslik / rollback, `repair: true`)
 *                         → hisobot, «Ish rejimiga qaytarish» (tasdiq bilan);
 *   zaxira nusxa olinmoqda → «Ish rejimiga qaytarish» only (the server refuses
 *                         while a backup is really running; it releases a
 *                         mode left behind by a crashed backup).
 *
 * Backend `_require_master_admin` bilan himoyalaydi; panel faqat shu
 * darvoza ichida chiziladi.
 */
type Dialog = null | 'shutdown' | 'enter' | 'run' | 'resume'

const MODE_TONE: Record<string, string> = {
  running: 'bg-success-soft text-success ring-success/25',
  maintenance: 'bg-danger-soft text-danger ring-danger/25',
  recovery: 'bg-warning-soft text-warning ring-warning/25',
  backup: 'bg-info-soft text-info ring-info/25',
}
const MODE_ICON = { running: CheckCircle2, maintenance: Power, recovery: LifeBuoy, backup: Lock } as const

export function SystemOpsPanel({
  state,
  onReport,
}: {
  state?: OpsState
  onReport: (r: { title: string; data: OpsReport }) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [force, setForce] = useState(false)
  const [txAction, setTxAction] = useState<'keep' | 'rollback'>('keep')
  // TZ E3 1713: a choice per transaction (key → keep | rollback).
  const [txActions, setTxActions] = useState<Record<string, 'keep' | 'rollback'>>({})
  // TZ E2 1697: failure type / error code, linked to the detected incident.
  const [incidentId, setIncidentId] = useState('')
  const [failureType, setFailureType] = useState('')
  const [errorCode, setErrorCode] = useState('')
  const [grace, setGrace] = useState('20')
  /** TZ E3 1725 «индикация прогресса»: tiklash fon vazifasi sifatida. */
  const [runJobId, setRunJobId] = useState<number | null>(null)
  const runJob = useJob<OpsReport>(runJobId)

  const mode = state?.mode || 'running'
  const stopped = !!state && mode !== 'running' && mode !== 'backup'
  const incidents = useQuery({
    queryKey: ['sysops', 'incidents'],
    queryFn: () => apiGet<Incident[]>(OPS.incidents, { limit: 30 }),
    enabled: dialog === 'shutdown',
  })
  const openIncidents = (incidents.data ?? []).filter((i) => i.kind === 'detected' && !i.resolved_at)
  const Icon = MODE_ICON[mode as keyof typeof MODE_ICON] ?? CheckCircle2

  // E3: the open transactions are listed BEFORE the keep/rollback choice.
  const tx = useQuery({
    queryKey: ['sysops', 'transactions'],
    queryFn: () => apiGet<TransactionList>(OPS.transactions),
    enabled: stopped,
  })
  const openTx = tx.data?.items ?? []
  const endedTx = tx.data?.journal_items ?? []

  const close = () => setDialog(null)
  const reload = () => qc.invalidateQueries({ queryKey: ['sysops'] })

  const run = useMutation({
    mutationFn: async (kind: Exclude<Dialog, null>) => {
      if (kind === 'shutdown') {
        const g = Number(grace)
        return {
          kind,
          data: await apiPost<OpsReport>(
            OPS.shutdown,
            {
              reason: reason.trim(),
              force,
              incident_id: incidentId ? Number(incidentId) : null,
              failure_type: failureType || null,
              error_code: errorCode.trim() || null,
              grace_seconds: force ? 0 : Number.isFinite(g) ? Math.max(0, Math.min(60, g)) : 20,
            },
            // The grace period keeps the request open for up to a minute.
            { timeout: 150_000 },
          ),
        }
      }
      if (kind === 'enter') return { kind, data: await apiPost<OpsReport>(OPS.recoveryEnter) }
      if (kind === 'run') {
        const r = await apiPost<{ job_id: number }>(OPS.recoveryRun, {
          tx_action: txAction,
          tx_actions: txActions,
          repair: true,
          background: true,
        })
        return { kind, data: { job_id: r.job_id } as OpsReport }
      }
      return { kind, data: await apiPost<OpsReport>(OPS.resume) }
    },
    onSuccess: ({ kind, data }) => {
      close()
      void reload()
      if (kind === 'shutdown') {
        setReason('')
        setForce(false)
        setIncidentId('')
        setFailureType('')
        setErrorCode('')
        onReport({ title: t('sysHealth.shutdownReport'), data })
        toast.ok(t('sysHealth.shutdownDone'))
      } else if (kind === 'enter') {
        toast.ok(t('sysHealth.recoveryEnterDone'))
      } else if (kind === 'run') {
        setRunJobId(Number(data.job_id))
      } else {
        toast.ok(t('sysHealth.resumeDone'))
      }
    },
  })

  // Fon vazifasi tugadi — hisobot sahifada, holat qayta o'qiladi.
  const jobStatus = runJob.data?.status
  useEffect(() => {
    if (jobStatus !== 'done' && jobStatus !== 'failed') return
    const job = runJob.data!
    if (jobStatus === 'done') {
      const data = (job.result ?? {}) as OpsReport
      onReport({ title: t('sysHealth.recoveryReport'), data })
      if (data?.ok === false) toast.error(t('sysHealth.recoveryProblems'))
      else toast.ok(t('sysHealth.recoveryOk'))
    } else {
      toast.error(job.error || t('sysOps.jobFailed'))
    }
    setRunJobId(null)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobStatus])

  const busy = run.isPending || runJobId != null
  const reasonShort = reason.trim().length < 3

  return (
    <>
      <Card className="mb-4 p-card">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13.5px] font-bold ring-1 ring-inset',
              MODE_TONE[mode] ?? MODE_TONE.running,
            )}
          >
            <Icon size={16} aria-hidden />
            {state ? modeLabel(t, mode, state.mode_label) : '—'}
          </span>
          {state?.reason && <span className="text-[13px] text-fg-muted">{state.reason}</span>}
          {state?.changed_at && (
            <span className="flex items-center gap-1 text-[12px] text-fg-subtle">
              <Clock size={12} aria-hidden />
              {formatDateTime(state.changed_at)}
              {state.changed_by_name ? ` · ${t('sysHealth.changedBy')}: ${state.changed_by_name}` : ''}
            </span>
          )}

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!state ? null : mode === 'running' ? (
              <Button variant="danger" size="sm" leftIcon={<Power size={14} />} onClick={() => setDialog('shutdown')} disabled={busy}>
                {t('sysHealth.shutdown')}
              </Button>
            ) : mode === 'backup' ? (
              <Button variant="secondary" size="sm" leftIcon={<CheckCircle2 size={14} />} onClick={() => setDialog('resume')} disabled={busy}>
                {t('sysHealth.resume')}
              </Button>
            ) : (
              <>
                {mode !== 'recovery' && (
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<LifeBuoy size={14} />}
                    onClick={() => setDialog('enter')}
                    disabled={busy}
                  >
                    {t('sysHealth.recoveryEnter')}
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  leftIcon={<PlayCircle size={14} />}
                  onClick={() => setDialog('run')}
                  disabled={busy}
                >
                  {t('sysHealth.recoveryRun')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  leftIcon={<CheckCircle2 size={14} />}
                  onClick={() => setDialog('resume')}
                  disabled={busy}
                >
                  {t('sysHealth.resume')}
                </Button>
              </>
            )}
          </div>
        </div>

        {mode === 'backup' && <p className="mt-3 text-[12.5px] text-fg-muted">{t('sysHealth.backupModeHint')}</p>}

        {runJobId != null && (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[13px] font-semibold text-fg">{t('sysHealth.recoveryRun')}</p>
            <JobProgress job={runJob.data} />
          </div>
        )}

        {stopped && (
          <div className="mt-4 flex flex-col gap-2.5 border-t border-line pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-fg">{t('sysHealth.openTx', { count: openTx.length })}</span>
              <IconButton size="sm" label={t('common.refresh')} onClick={() => void tx.refetch()}>
                <RefreshCw size={13} className={cn(tx.isFetching && 'animate-spin')} />
              </IconButton>
            </div>
            {openTx.length === 0 ? (
              <p className="text-[12.5px] text-fg-subtle">{t('sysHealth.noOpenTx')}</p>
            ) : (
              <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
                <table className="w-full min-w-[900px] text-left text-[12.5px]">
                  <thead className="bg-surface-2 text-[11.5px] font-semibold text-fg-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">{t('sysHealth.txColKind')}</th>
                      <th scope="col" className="px-3 py-2">ID</th>
                      <th scope="col" className="px-3 py-2">{t('sysHealth.txColUser')}</th>
                      <th scope="col" className="px-3 py-2">{t('sysHealth.txColState')}</th>
                      <th scope="col" className="px-3 py-2">{t('sysHealth.txColAge')}</th>
                      <th scope="col" className="px-3 py-2">{t('sysHealth.txColTables')}</th>
                      <th scope="col" className="px-3 py-2">{t('sysHealth.txColQuery')}</th>
                      <th scope="col" className="px-3 py-2">{t('sysHealth.txColAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openTx.map((x, i) => (
                      <tr key={`${x.kind}-${x.pid ?? x.gid ?? i}`} className="border-t border-line/60 text-fg">
                        <td className="px-3 py-1.5">{x.kind === 'prepared' ? t('sysHealth.txPrepared') : t('sysHealth.txOpen')}</td>
                        <td className="px-3 py-1.5 font-mono">{x.pid ?? x.gid ?? '—'}</td>
                        <td className="px-3 py-1.5">{x.user || '—'}</td>
                        <td className="px-3 py-1.5">{x.state || '—'}</td>
                        <td className="px-3 py-1.5 tabular-nums">
                          {x.age_seconds != null ? t('sysHealth.seconds', { n: x.age_seconds }) : '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          {x.tables && x.tables.length ? x.tables.join(', ') : x.writes ? t('sysHealth.txWrites') : t('sysHealth.txReadOnly')}
                        </td>
                        <td className="max-w-[300px] truncate px-3 py-1.5 font-mono text-fg-muted" title={x.query ?? undefined}>
                          {x.query || '—'}
                        </td>
                        <td className="px-3 py-1.5">
                          <Select
                            wrapperClassName="w-44"
                            value={(x.key && txActions[x.key]) || txAction}
                            aria-label={`${t('sysHealth.txColAction')}: ${x.pid ?? x.gid ?? ''}`}
                            onChange={(e) =>
                              x.key && setTxActions((m) => ({ ...m, [x.key as string]: e.target.value as 'keep' | 'rollback' }))
                            }
                            options={[
                              { value: 'keep', label: t('sysHealth.txKeep') },
                              { value: 'rollback', label: t('sysHealth.txRollback') },
                            ]}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {endedTx.length > 0 && (
              <p className="text-[12px] text-fg-subtle">
                {t('sysHealth.txEnded', { count: endedTx.length })}{' '}
                {endedTx.map((x) => x.pid ?? x.gid).join(', ')}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-[12.5px] text-fg-muted">{t('sysHealth.txChoiceDefault')}:</span>
              <Select
                wrapperClassName="w-60"
                value={txAction}
                aria-label={t('sysHealth.txChoice')}
                onChange={(e) => setTxAction(e.target.value as 'keep' | 'rollback')}
                options={[
                  { value: 'keep', label: t('sysHealth.txKeep') },
                  { value: 'rollback', label: t('sysHealth.txRollback') },
                ]}
              />
            </div>
            {txAction === 'rollback' && <p className="text-[12px] text-danger">{t('sysHealth.txRollbackWarn')}</p>}
          </div>
        )}
      </Card>

      {/* Shutdown needs a typed reason, so it gets a form rather than a plain confirm. */}
      <Modal
        open={dialog === 'shutdown'}
        onClose={close}
        title={t('sysHealth.shutdown')}
        description={t('sysHealth.shutdownWarn')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={busy} disabled={reasonShort} onClick={() => run.mutate('shutdown')}>
              {t('sysHealth.shutdownConfirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('sysHealth.reason')} required>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('sysHealth.reasonPlaceholder')}
              maxLength={1000}
              aria-label={t('sysHealth.reason')}
            />
          </Field>
          {reason.trim().length > 0 && reasonShort && (
            <p className="text-[12px] text-danger">{t('sysHealth.reasonRequired')}</p>
          )}
          <Field label={t('sysHealth.linkIncident')}>
            <Select
              value={incidentId}
              aria-label={t('sysHealth.linkIncident')}
              onChange={(e) => {
                setIncidentId(e.target.value)
                const inc = openIncidents.find((i) => String(i.id) === e.target.value)
                if (inc) {
                  const comp = (inc.component || '').split(',')[0]
                  setFailureType((FAILURE_TYPES as readonly string[]).includes(comp) ? comp : 'other')
                  setErrorCode(inc.code || '')
                }
              }}
              options={[
                { value: '', label: t('sysHealth.noIncident') },
                ...openIncidents.map((i) => ({
                  value: String(i.id),
                  label: `#${i.id} · ${i.detected_at ? formatDateTime(i.detected_at) : ''} · ${localizeMessage(t, i.message)}`,
                })),
              ]}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t('sysHealth.failureType')}>
              <Select
                value={failureType}
                aria-label={t('sysHealth.failureType')}
                onChange={(e) => setFailureType(e.target.value)}
                options={[
                  { value: '', label: '—' },
                  ...FAILURE_TYPES.map((f) => ({
                    value: f,
                    label: t(`sysHealth.ft_${f}` as never, { defaultValue: componentLabel(t, f) }) as string,
                  })),
                ]}
              />
            </Field>
            <Field label={t('sysHealth.errorCode')}>
              <Input
                value={errorCode}
                maxLength={64}
                onChange={(e) => setErrorCode(e.target.value)}
                aria-label={t('sysHealth.errorCode')}
              />
            </Field>
          </div>
          <Checkbox label={t('sysHealth.force')} checked={force} onChange={(e) => setForce(e.target.checked)} />
          {!force && (
            <Field label={t('sysHealth.graceLabel')} hint={t('sysHealth.graceHint')}>
              <Input
                type="number"
                min={0}
                max={60}
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                aria-label={t('sysHealth.graceLabel')}
              />
            </Field>
          )}
          <p className={cn('text-[12px]', force ? 'text-danger' : 'text-fg-subtle')}>
            {force ? t('sysHealth.forceHint') : t('sysHealth.softHint')}
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={dialog === 'enter'}
        onClose={close}
        onConfirm={() => run.mutate('enter')}
        title={t('sysHealth.recoveryEnter')}
        description={t('sysHealth.recoveryEnterWarn')}
        confirmLabel={t('sysHealth.recoveryEnter')}
        loading={busy}
      />

      <ConfirmDialog
        open={dialog === 'run'}
        onClose={close}
        onConfirm={() => run.mutate('run')}
        title={t('sysHealth.recoveryRun')}
        description={
          <>
            {t('sysHealth.recoveryRunWarn')}
            <span className="mt-2 block font-medium text-fg">
              {t('sysHealth.txChoice')}: {txAction === 'rollback' ? t('sysHealth.txRollback') : t('sysHealth.txKeep')}
            </span>
          </>
        }
        confirmLabel={t('sysHealth.recoveryRunConfirm')}
        danger={txAction === 'rollback'}
        loading={busy}
      />

      <ConfirmDialog
        open={dialog === 'resume'}
        onClose={close}
        onConfirm={() => run.mutate('resume')}
        title={t('sysHealth.resume')}
        description={t('sysHealth.resumeWarn')}
        confirmLabel={t('sysHealth.resumeConfirm')}
        loading={busy}
      />
    </>
  )
}
