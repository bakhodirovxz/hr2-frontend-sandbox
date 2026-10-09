import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Clock, LifeBuoy, PlayCircle, Power } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { apiPost } from '@/api/http'
import { errorMessage } from '@/api/errorMessage'
import { formatDateTime } from '@/lib/format'

/*
 * TZ E2 «Аварийное завершение» va E3 «Восстановление».
 *
 * These four calls stop the product for everyone and can roll back unfinished
 * transactions, so every one of them goes through a dialog that spells out the
 * consequence in words — not a generic "Are you sure?". The backend gates them
 * on the site master-admin; the page does the same, and this panel is only ever
 * mounted inside that guard.
 */
interface OpsState {
  mode?: string
  mode_label?: string
  reason?: string | null
  changed_at?: string | null
  changed_by_name?: string | null
}

type Dialog = null | 'shutdown' | 'enter' | 'run' | 'resume'

export function SystemOpsPanel({ state }: { state?: OpsState }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()

  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [force, setForce] = useState(false)
  const [txAction, setTxAction] = useState('keep')
  const [report, setReport] = useState<{ title: string; data: unknown } | null>(null)

  const mode = state?.mode || 'running'

  const close = () => setDialog(null)
  const reload = () => qc.invalidateQueries({ queryKey: ['sysops'] })

  const run = useMutation({
    mutationFn: async (kind: Exclude<Dialog, null>) => {
      if (kind === 'shutdown') {
        return {
          kind,
          data: await apiPost<Record<string, unknown>>('system/ops/shutdown', {
            reason: reason.trim(),
            force,
          }),
        }
      }
      if (kind === 'enter') {
        return { kind, data: await apiPost<Record<string, unknown>>('system/ops/recovery/enter') }
      }
      if (kind === 'run') {
        return {
          kind,
          data: await apiPost<Record<string, unknown>>('system/ops/recovery/run', {
            tx_action: txAction,
            repair: true,
          }),
        }
      }
      return { kind, data: await apiPost<Record<string, unknown>>('system/ops/resume') }
    },
    onSuccess: ({ kind, data }) => {
      close()
      reload()
      if (kind === 'shutdown') {
        setReason('')
        setForce(false)
        setReport({ title: t('sysHealth.shutdownReport'), data })
        toast.ok(t('sysHealth.shutdownDone'))
      } else if (kind === 'enter') {
        toast.ok(t('sysHealth.recoveryEnterDone'))
      } else if (kind === 'run') {
        setReport({ title: t('sysHealth.recoveryReport'), data })
        if (data?.ok === false) toast.error(t('sysHealth.recoveryProblems'))
        else toast.ok(t('sysHealth.recoveryOk'))
      } else {
        toast.ok(t('sysHealth.resumeDone'))
      }
    },
    onError: (e) => toast.error(errorMessage(e, t('sysHealth.actionFailed'))),
  })

  const busy = run.isPending

  return (
    <>
      <Card className="mb-4 p-card">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="text-[14px] font-semibold text-fg">{t('sysHealth.ops')}</h3>
          <p className="text-[11.5px] text-fg-subtle">{t('sysHealth.opsHint')}</p>
        </div>

        {(state?.reason || state?.changed_at) && (
          <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
            {state?.reason && <span>{state.reason}</span>}
            {state?.changed_at && (
              <span className="flex items-center gap-1 text-fg-subtle">
                <Clock size={12} />
                {formatDateTime(state.changed_at)}
                {state.changed_by_name ? ` · ${t('sysHealth.changedBy')}: ${state.changed_by_name}` : ''}
              </span>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'running' ? (
            <Button variant="danger" size="sm" onClick={() => setDialog('shutdown')} disabled={busy}>
              <Power size={14} /> {t('sysHealth.shutdown')}
            </Button>
          ) : (
            <>
              {mode !== 'recovery' && (
                <Button variant="outline" size="sm" onClick={() => setDialog('enter')} disabled={busy}>
                  <LifeBuoy size={14} /> {t('sysHealth.recoveryEnter')}
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => setDialog('run')} disabled={busy}>
                <PlayCircle size={14} /> {t('sysHealth.recoveryRun')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDialog('resume')} disabled={busy}>
                <CheckCircle2 size={14} /> {t('sysHealth.resume')}
              </Button>
            </>
          )}
        </div>
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
            <Button
              variant="danger"
              loading={busy}
              disabled={reason.trim().length < 3}
              onClick={() => run.mutate('shutdown')}
            >
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
            />
          </Field>
          {reason.trim().length > 0 && reason.trim().length < 3 && (
            <p className="text-[12px] text-danger">{t('sysHealth.reasonRequired')}</p>
          )}
          <Checkbox
            label={t('sysHealth.force')}
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          <p className={`text-[12px] ${force ? 'text-danger' : 'text-fg-subtle'}`}>
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

      {/* Recovery carries a choice (keep vs rollback), so it is a form too. */}
      <Modal
        open={dialog === 'run'}
        onClose={close}
        title={t('sysHealth.recoveryRun')}
        description={t('sysHealth.recoveryRunWarn')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant={txAction === 'rollback' ? 'danger' : 'primary'}
              loading={busy}
              onClick={() => run.mutate('run')}
            >
              {t('sysHealth.recoveryRunConfirm')}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t('sysHealth.txAction')}>
            <Select
              value={txAction}
              onChange={(e) => setTxAction(e.target.value)}
              options={[
                { value: 'keep', label: t('sysHealth.txKeep') },
                { value: 'rollback', label: t('sysHealth.txRollback') },
              ]}
            />
          </Field>
          {txAction === 'rollback' && (
            <p className="text-[12px] text-danger">{t('sysHealth.txRollbackWarn')}</p>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={dialog === 'resume'}
        onClose={close}
        onConfirm={() => run.mutate('resume')}
        title={t('sysHealth.resume')}
        description={t('sysHealth.resumeWarn')}
        confirmLabel={t('sysHealth.resumeConfirm')}
        loading={busy}
      />

      {/* The server answers shutdown and recovery with a structured report; v1
          shows it verbatim and so does this — it is the only record of what the
          run actually touched. */}
      <Modal
        open={report != null}
        onClose={() => setReport(null)}
        title={report?.title ?? ''}
        size="md"
        footer={
          <Button variant="ghost" onClick={() => setReport(null)}>
            {t('common.close')}
          </Button>
        }
      >
        <pre className="max-h-[50vh] overflow-auto rounded-lg bg-surface-2 p-3 text-[12px] leading-relaxed text-fg-muted">
          {JSON.stringify(report?.data ?? {}, null, 2)}
        </pre>
      </Modal>
    </>
  )
}
