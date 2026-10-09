import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, PlugZap, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useIsapiActions, useIsapiDevices, type IsapiUnknownUsers } from './useDevices'

/**
 * THE ISAPI TERMINAL BEHIND A TURNSTILE.
 *
 * These devices exist because the HikCentral licence ran out: they are driven
 * straight over the device's own API, so nothing about them reaches HR through
 * the appliance. Everything the platform would normally do for us — pushing
 * employees onto the device, pulling its events — has to be triggerable by hand
 * from here, which is why this panel is a row of verbs rather than a form.
 *
 * The device login is read from `GET /isapi-devices`, NOT from the turnstile
 * record: `GET /turnstiles` is open to every authenticated employee and
 * deliberately omits it. The password is returned by nothing at all, so the
 * field always starts empty and an empty save means "keep the current one".
 */
export function IsapiTerminalPanel({
  turnstileId,
  ip,
  port,
}: {
  turnstileId: number
  ip?: string | null
  port?: number | null
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { devices, loading } = useIsapiDevices(true)
  const actions = useIsapiActions()
  const row = devices.find((d) => d.id === turnstileId)

  const [username, setUsername] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [unknown, setUnknown] = useState<IsapiUnknownUsers | null>(null)

  // The login is seeded from the server the first time it arrives and stays
  // under the operator's control afterwards, so a background refetch can never
  // wipe what they are halfway through typing.
  const login = username ?? row?.username ?? 'admin'

  const runTest = async () => {
    try {
      const res = await actions.test.mutateAsync(turnstileId)
      if (res?.online === false) toast.error(t('turnstiles.isapiTestFailed', { error: res.error || '' }))
      else toast.ok(t('turnstiles.isapiTestOk', { model: [res?.model, res?.firmware_version].filter(Boolean).join(' ') || '—' }))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const runPoll = async () => {
    try {
      const res = await actions.poll.mutateAsync(turnstileId)
      // A held device lock is a normal outcome, not a failure: the periodic
      // poller is mid-run on the same terminal and will finish the job.
      if (res?.skipped) toast.info(res.detail || t('turnstiles.isapiBusy'))
      else toast.ok(t('turnstiles.isapiPollDone', { pulled: res?.pulled ?? 0, created: res?.created ?? 0 }))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const runSync = async () => {
    if (!(await confirm({ kind: 'action', confirmLabel: t('turnstiles.isapiSyncEmployees') }))) return
    try {
      await actions.syncEmployees.mutateAsync(turnstileId)
      toast.ok(t('turnstiles.isapiSyncQueued'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const runUnknown = async () => {
    try {
      setUnknown(await actions.unknownUsers.mutateAsync(turnstileId))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const saveCredentials = async () => {
    if (!login.trim()) {
      toast.error(t('turnstiles.isapiLoginRequired'))
      return
    }
    try {
      await actions.setCredentials.mutateAsync({ id: turnstileId, username: login.trim(), password })
      setPassword('')
      toast.ok(t('turnstiles.isapiCredsSaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const busy =
    actions.test.isPending ||
    actions.poll.isPending ||
    actions.syncEmployees.isPending ||
    actions.setCredentials.isPending ||
    actions.unknownUsers.isPending

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-surface-2 p-3">
        <p className="flex items-center gap-2 text-[13px] font-medium text-fg">
          <PlugZap size={15} className="text-brand" />
          {[ip, port].filter(Boolean).join(':') || '—'}
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-fg-muted">{t('turnstiles.isapiIntro')}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" size="sm" leftIcon={<PlugZap size={14} />} loading={actions.test.isPending} disabled={busy} onClick={runTest}>
          {t('turnstiles.isapiTest')}
        </Button>
        <Button variant="outline" size="sm" leftIcon={<Users size={14} />} loading={actions.syncEmployees.isPending} disabled={busy} onClick={runSync}>
          {t('turnstiles.isapiSyncEmployees')}
        </Button>
        <Button variant="outline" size="sm" leftIcon={<Download size={14} />} loading={actions.poll.isPending} disabled={busy} onClick={runPoll}>
          {t('turnstiles.isapiPoll')}
        </Button>
        <Button variant="outline" size="sm" leftIcon={<Users size={14} />} loading={actions.unknownUsers.isPending} disabled={busy} onClick={runUnknown}>
          {t('turnstiles.isapiUnknown')}
        </Button>
      </div>

      {unknown && (
        <div className="rounded-lg border border-line p-3">
          <p className="text-[13px] font-medium text-fg">
            {t('turnstiles.isapiUnknownSummary', {
              total: unknown.total_on_device ?? 0,
              known: unknown.known ?? 0,
              unknown: unknown.unknown_count ?? unknown.unknown?.length ?? 0,
            })}
          </p>
          <p className="mt-1 text-[11.5px] text-fg-muted">{t('turnstiles.isapiUnknownHint')}</p>
          {(unknown.unknown?.length ?? 0) > 0 && (
            <div className="scroll-thin mt-2 max-h-40 overflow-y-auto">
              <ul className="flex flex-wrap gap-1">
                {unknown.unknown!.map((code) => (
                  <li key={code} className="rounded-pill bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-fg-muted">
                    {code}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="space-y-3 border-t border-line pt-3">
        <p className="text-[13px] font-semibold text-fg">{t('turnstiles.isapiAccount')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('turnstiles.isapiLogin')}>
            <Input value={login} disabled={loading} autoComplete="off" onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label={t('turnstiles.isapiNewPassword')} hint={t('turnstiles.isapiPasswordHint')}>
            <Input type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        <Button size="sm" loading={actions.setCredentials.isPending} disabled={busy} onClick={saveCredentials}>
          {t('turnstiles.isapiSaveCreds')}
        </Button>
        <p className="text-[11.5px] text-fg-muted">{t('turnstiles.isapiCredsHint')}</p>
      </div>
    </div>
  )
}
