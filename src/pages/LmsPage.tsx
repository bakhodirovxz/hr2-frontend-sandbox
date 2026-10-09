import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Link2, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import { errorMessage } from '@/api/errorMessage'
import { formatDateTime } from '@/lib/format'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { useLmsLogs, useLmsMutations, useLmsSettings } from '@/features/system/useLms'

/**
 * LMS INTEGRATSIYASI — where the training records come from.
 *
 * Three things in one screen because they are one decision: WHAT to connect
 * to, whether the connection actually works, and what the last runs did. v1
 * splits none of it either — a settings form nobody can test is a form nobody
 * trusts.
 *
 * Gated on the site master admin, mirroring the backend's `_require_master`.
 */
function LmsPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { settings, loading, denied } = useLmsSettings()
  const { logs } = useLmsLogs(10)
  const mut = useLmsMutations()

  const [provider, setProvider] = useState('generic')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [autoSync, setAutoSync] = useState(false)
  const [test, setTest] = useState<{ ok?: boolean; message?: string } | null>(null)

  useEffect(() => {
    if (!settings) return
    setProvider(settings.provider || 'generic')
    setBaseUrl(settings.base_url || '')
    setEnabled(!!settings.is_enabled)
    setAutoSync(!!settings.auto_sync)
    // The key is never sent back; the box stays empty and means "unchanged".
    setApiKey('')
  }, [settings])

  if (loading) return <CenteredSpinner />
  if (denied)
    return (
      <PageContainer>
        <PageHeader title={t('lms.title')} />
        <Card className="p-6">
          <EmptyState icon={<Link2 size={20} />} title={t('common.noAccess')} />
        </Card>
      </PageContainer>
    )

  const save = async () => {
    try {
      await mut.save.mutateAsync({
        provider,
        base_url: baseUrl.trim(),
        // ⚠️ Empty means KEEP. Sending '' would wipe a working key.
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
        is_enabled: enabled,
        auto_sync: autoSync,
      })
      setApiKey('')
      toast.ok(t('common.saved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const runTest = async () => {
    setTest(null)
    try {
      const r = await mut.test.mutateAsync()
      setTest(r)
      if (r?.ok) toast.ok(t('lms.testOk'))
      else toast.error(r?.message || t('lms.testFail'))
    } catch (e) {
      const message = errorMessage(e, t('lms.testFail'))
      setTest({ ok: false, message })
      toast.error(message)
    }
  }

  const runSync = async () => {
    if (!(await confirm({ kind: 'action', confirmLabel: t('lms.syncNow') }))) return
    try {
      const r = await mut.syncNow.mutateAsync()
      if (r?.status === 'ok') {
        toast.ok(t('lms.syncDone', { created: r.created ?? 0, updated: r.updated ?? 0 }))
      } else {
        toast.error(r?.message || t('lms.syncFail'))
      }
    } catch (e) {
      toast.error(errorMessage(e, t('lms.syncFail')))
    }
  }

  const stats = settings?.last_sync_stats
  const lastOk = settings?.last_sync_status === 'ok'

  return (
    <PageContainer>
      <PageHeader
        title={t('lms.title')}
        subtitle={t('lms.subtitle')}
        actions={
          <>
            <Button variant="outline" loading={mut.test.isPending} onClick={runTest} leftIcon={<Link2 size={15} />}>
              {t('lms.testConnection')}
            </Button>
            <Button
              variant="secondary"
              loading={mut.syncNow.isPending}
              onClick={runSync}
              leftIcon={<RefreshCw size={15} />}
            >
              {t('lms.syncNow')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('lms.provider')}>
              <Select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                options={(settings?.providers ?? ['generic']).map((p) => ({ value: p, label: p }))}
              />
            </Field>
            <Field label={t('lms.baseUrl')} hint={t('lms.baseUrlHint')}>
              <Input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…" />
            </Field>
          </div>

          <div className="mt-4">
            <Field
              label={t('lms.apiKey')}
              hint={settings?.has_api_key ? t('lms.apiKeyStored') : t('lms.apiKeyEmpty')}
            >
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.has_api_key ? '••••••••' : ''}
                autoComplete="new-password"
              />
            </Field>
          </div>

          <div className="mt-4 space-y-2.5">
            <Checkbox checked={enabled} onChange={(e) => setEnabled(e.target.checked)} label={t('lms.enabled')} />
            <Checkbox checked={autoSync} onChange={(e) => setAutoSync(e.target.checked)} label={t('lms.autoSync')} />
            <p className="text-[11.5px] text-fg-subtle">{t('lms.autoSyncHint')}</p>
          </div>

          {test && (
            <p
              className={`mt-4 flex items-center gap-2 rounded-control px-3 py-2 text-[12.5px] ${
                test.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
              }`}
            >
              {test.ok ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
              {test.message || (test.ok ? t('lms.testOk') : t('lms.testFail'))}
            </p>
          )}

          <div className="mt-5 flex justify-end">
            <Button loading={mut.save.isPending} onClick={save}>
              {t('common.save')}
            </Button>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="mb-3 text-[13px] font-semibold text-fg">{t('lms.lastSync')}</p>
            {settings?.last_sync_at ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={lastOk ? 'success' : 'danger'}>
                    {lastOk ? t('lms.statusOk') : t('lms.statusFail')}
                  </Badge>
                  <span className="text-[12px] tabular-nums text-fg-muted">
                    {formatDateTime(settings.last_sync_at)}
                  </span>
                </div>
                {settings.last_sync_message && (
                  <p className="mt-2 text-[12px] text-fg-muted">{settings.last_sync_message}</p>
                )}
                {stats && (
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <Stat label={t('lms.fetched')} value={stats.fetched ?? 0} />
                    <Stat label={t('lms.created')} value={stats.created ?? 0} />
                    <Stat label={t('lms.updated')} value={stats.updated ?? 0} />
                    <Stat label={t('lms.skipped')} value={stats.skipped ?? 0} />
                  </div>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-fg-subtle">{t('lms.neverSynced')}</p>
            )}
          </Card>

          <Card className="overflow-hidden p-0">
            <p className="border-b border-line px-4 py-3 text-[13px] font-semibold text-fg">
              {t('lms.history')}
            </p>
            {logs.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-fg-subtle">{t('lms.noRuns')}</p>
            ) : (
              <ul className="divide-y divide-line/60">
                {logs.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Badge tone={l.status === 'ok' ? 'success' : 'danger'}>
                      {l.status === 'ok' ? t('lms.statusOk') : t('lms.statusFail')}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] text-fg">
                        {l.message || '—'}
                      </span>
                      <span className="block text-[11px] tabular-nums text-fg-subtle">
                        {formatDateTime(l.started_at)}
                        {l.triggered_by ? ` · ${l.triggered_by}` : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] tabular-nums text-fg-muted">
                      +{l.created ?? 0} / ~{l.updated ?? 0}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control bg-fg/[0.04] px-2 py-2">
      <p className="text-[15px] font-bold tabular-nums text-fg">{value}</p>
      <p className="text-[10.5px] text-fg-subtle">{label}</p>
    </div>
  )
}

/** Backend gate is `_require_master`; the page mirrors it. */
export function LmsPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.isSiteMasterAdmin(user)} title={t('lms.title')}>
      <LmsPageInner />
    </RequireRole>
  )
}
