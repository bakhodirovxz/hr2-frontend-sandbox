import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCircle2, ShieldAlert, XCircle } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadError } from '@/components/data/LoadError'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { apiGet } from '@/api/http'
import { SystemOpsPanel } from '@/features/system/SystemOpsPanel'
import { formatDateTime } from '@/lib/format'

/*
 * TIZIM HOLATI (TZ E2/E3) — the system checking itself, plus the operator
 * console that stops and recovers it.
 *
 * The write actions live in <SystemOpsPanel>: they shut the product down for
 * everyone and can roll back unfinished transactions, so each one sits behind a
 * dialog that names the consequence. They are never reachable by mistyping a
 * URL — the whole page is wrapped in the master-admin guard below, matching the
 * backend's own `_require_master_admin`.
 */
interface Check {
  component: string
  status: string
  detail?: string | null
  severity?: string | null
}

interface Diagnostics {
  mode?: string
  checks?: Check[]
  failed?: number
  critical?: number
  healthy?: boolean
  elapsed_ms?: number
  checked_at?: string
}

interface Incident {
  id: number
  kind?: string | null
  title?: string | null
  detected_at?: string | null
  resolved_at?: string | null
  acknowledged?: boolean | null
  duration_seconds?: number | null
}

function SystemHealthPageInner() {
  const { t } = useTranslation()

  const state = useQuery({
    queryKey: ['sysops', 'state'],
    queryFn: () =>
      apiGet<{
        mode?: string
        mode_label?: string
        reason?: string | null
        changed_at?: string | null
        changed_by_name?: string | null
      }>('system/ops/state'),
    refetchInterval: 60_000,
  })
  const diag = useQuery({
    queryKey: ['sysops', 'diagnostics'],
    queryFn: () => apiGet<Diagnostics>('system/ops/diagnostics'),
    refetchInterval: 120_000,
  })
  const incidents = useQuery({
    queryKey: ['sysops', 'incidents'],
    queryFn: () => apiGet<Incident[]>('system/ops/incidents', { limit: 30 }),
  })

  const checks = diag.data?.checks ?? []
  /* ⚠️ This was `diag.data?.healthy !== false`, so a FAILED diagnostics call
   * (undefined data) drew the green tick and the word "healthy" — the page
   * whose only job is to say whether the system is in trouble reported
   * "all fine" precisely when it could not tell. Unknown is not healthy. */
  const diagFailed = diag.isError
  const healthy = !diagFailed && diag.data?.healthy !== false

  return (
    <PageContainer>
      <PageHeader title={t('sysHealth.title')} subtitle={t('sysHealth.subtitle')} />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex items-center gap-3 p-card">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${healthy ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}>
            {healthy ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] text-fg-muted">{t('sysHealth.overall')}</span>
            <span className="block truncate text-[16px] font-semibold text-fg">
              {diagFailed ? t('list.loadFailed') : healthy ? t('sysHealth.healthy') : t('sysHealth.degraded')}
            </span>
          </span>
        </Card>
        <Card className="flex items-center gap-3 p-card">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">
            <Activity size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] text-fg-muted">{t('sysHealth.mode')}</span>
            <span className="block truncate text-[16px] font-semibold text-fg">{state.data?.mode_label ?? '—'}</span>
          </span>
        </Card>
        <Card className="flex items-center gap-3 p-card">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${diag.data?.failed ? 'bg-warning-soft text-warning' : 'bg-surface-2 text-fg-muted'}`}>
            <AlertTriangle size={17} />
          </span>
          <span className="min-w-0">
            <span className="block text-[12px] text-fg-muted">{t('sysHealth.failedChecks')}</span>
            <span className="block truncate text-[16px] font-semibold tabular-nums text-fg">
              {diag.data?.failed ?? 0} / {checks.length}
            </span>
          </span>
        </Card>
      </div>

      <SystemOpsPanel state={state.data} />

      <Card className="mb-4 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h3 className="text-[14px] font-semibold text-fg">{t('sysHealth.checks')}</h3>
          {diag.data?.checked_at && (
            <span className="ml-auto text-[11.5px] text-fg-subtle">
              {formatDateTime(diag.data.checked_at)} · {diag.data.elapsed_ms} ms
            </span>
          )}
        </div>
        {diag.isLoading ? (
          <div className="space-y-2 p-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : diag.isError ? (
          <LoadError error={diag.error} onRetry={() => diag.refetch()} />
        ) : checks.length === 0 ? (
          <EmptyState icon={<Activity size={20} />} title={t('sysHealth.noChecks')} />
        ) : (
          <ul className="divide-y divide-line/60">
            {checks.map((c) => (
              <li key={c.component} className="flex items-center gap-3 px-4 py-2.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${c.status === 'ok' ? 'bg-success' : c.severity === 'warning' ? 'bg-warning' : 'bg-danger'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{t(`sysHealth.comp_${c.component}` as never, { defaultValue: c.component })}</span>
                  {c.detail && <span className="block truncate text-[11.5px] text-fg-subtle">{c.detail}</span>}
                </span>
                <Badge tone={(c.status === 'ok' ? 'success' : c.severity === 'warning' ? 'warning' : 'danger') as BadgeTone}>
                  {c.status === 'ok' ? t('sysHealth.ok') : t('sysHealth.fail')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-[14px] font-semibold text-fg">{t('sysHealth.incidents')}</h3>
          <p className="text-[11.5px] text-fg-subtle">{t('sysHealth.incidentsHint')}</p>
        </div>
        {incidents.isLoading ? (
          <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : incidents.isError ? (
          <LoadError error={incidents.error} onRetry={() => incidents.refetch()} />
        ) : (incidents.data ?? []).length === 0 ? (
          <EmptyState icon={<ShieldAlert size={20} />} title={t('sysHealth.noIncidents')} description={t('sysHealth.noIncidentsHint')} />
        ) : (
          <ul className="divide-y divide-line/60">
            {(incidents.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-fg">{i.title || i.kind || `#${i.id}`}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {formatDateTime(i.detected_at)}
                    {i.duration_seconds != null ? ` · ${Math.round(i.duration_seconds / 60)} min` : ''}
                  </span>
                </span>
                <Badge tone={i.resolved_at ? 'success' : 'danger'}>
                  {i.resolved_at ? t('sysHealth.resolved') : t('sysHealth.open')}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageContainer>
  )
}


/**
 * Route guard. The sidebar already hides this entry; the wrapper is what stops
 * the page from rendering for someone who reached the URL another way.
 */
export function SystemHealthPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={roles.isSiteMasterAdmin(user)} title={t('sysHealth.title')}>
      <SystemHealthPageInner />
    </RequireRole>
  )
}

