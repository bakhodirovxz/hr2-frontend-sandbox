import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, AlertTriangle, CheckCheck, CheckCircle2, ChevronRight, RefreshCw, ShieldAlert } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { LoadError } from '@/components/data/LoadError'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { apiGet, apiPost } from '@/api/http'
import { useToast } from '@/components/ui/Toast'
import { RestoreWizard, type RestoreTarget } from '@/features/system/RestoreWizard'
import { BlockedModulesCard, IntegrityCard, OpsSettingsCard } from '@/features/system/OpsExtras'
import { SystemOpsPanel } from '@/features/system/SystemOpsPanel'
import { OpsReportView } from '@/features/system/OpsReportView'
import {
  OPS,
  componentLabel,
  localizeDetail,
  localizeMessage,
  type Diagnostics,
  type Incident,
  type OpsReport,
  type OpsState,
  type SuggestRestore,
} from '@/features/system/systemOps'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/cn'

/*
 * TIZIM HOLATI — TZ E2 «Завершение работы при сбое» va E3 «Восстановление
 * системы после сбоя». Uch qism (v1 `TizimHolatiPage` bilan bir xil):
 *   1. HOLAT — rejim va boshqaruv amallari (<SystemOpsPanel>);
 *   2. O'Z-O'ZINI TEKSHIRUV — komponentlar bo'yicha diagnostika;
 *   3. HODISALAR — oxirgi 30 ta hodisa va har birining hisoboti.
 * Faqat sayt master-admini (backend `_require_master_admin`).
 */

const SEV_TONE: Record<string, BadgeTone> = { critical: 'danger', warning: 'warning', info: 'neutral' }

function SystemHealthPageInner() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [report, setReport] = useState<{ title: string; data: OpsReport } | null>(null)
  const [openIncident, setOpenIncident] = useState<Incident | null>(null)
  const [restoring, setRestoring] = useState<RestoreTarget | null>(null)
  const toast = useToast()
  const openRestore = (s: SuggestRestore) =>
    setRestoring({ id: s.backup_id, type: 'full', when: s.finished_at, file_name: s.file_name })

  /** TZ E2 1699: tasdiqlangan hodisa eskalatsiya qilinmaydi. */
  const ack = useMutation({
    mutationFn: (id: number) => apiPost<Incident>(OPS.acknowledge(id), {}),
    onSuccess: (inc) => {
      toast.ok(t('sysOps.ackDone'))
      setOpenIncident((cur) => (cur && cur.id === inc.id ? { ...cur, acknowledged: true } : cur))
      void qc.invalidateQueries({ queryKey: ['sysops', 'incidents'] })
    },
  })

  const state = useQuery({ queryKey: ['sysops', 'state'], queryFn: () => apiGet<OpsState>(OPS.state) })
  const diag = useQuery({ queryKey: ['sysops', 'diagnostics'], queryFn: () => apiGet<Diagnostics>(OPS.diagnostics) })
  const incidents = useQuery({
    queryKey: ['sysops', 'incidents'],
    queryFn: () => apiGet<Incident[]>(OPS.incidents, { limit: 30 }),
  })

  const checks = diag.data?.checks ?? []
  const failed = checks.filter((c) => c.status === 'fail')
  const refreshing = state.isFetching || diag.isFetching || incidents.isFetching

  return (
    <PageContainer>
      <PageHeader
        title={t('sysHealth.title')}
        subtitle={t('sysHealth.subtitle')}
        actions={
          <Button
            variant="outline"
            leftIcon={<RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />}
            onClick={() => void qc.invalidateQueries({ queryKey: ['sysops'] })}
          >
            {t('common.refresh')}
          </Button>
        }
      />

      {state.isError ? (
        <Card className="mb-4">
          <LoadError error={state.error} onRetry={() => void state.refetch()} />
        </Card>
      ) : (
        <SystemOpsPanel state={state.data} onReport={setReport} />
      )}

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <IntegrityCard onRestore={openRestore} />
        <BlockedModulesCard />
      </div>

      {/* ── O'z-o'zini tekshiruv ─────────────────────────────────────── */}
      <Card className="mb-4 p-card">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-fg">{t('sysHealth.selfCheck')}</h2>
          {diag.data && (
            <span className="text-[12px] tabular-nums text-fg-subtle">
              {t('sysHealth.elapsed', { ms: diag.data.elapsed_ms ?? 0, sec: diag.data.limit_seconds ?? '—' })}
              {diag.data.checked_at ? ` · ${formatDateTime(diag.data.checked_at)}` : ''}
            </span>
          )}
        </div>
        {diag.isLoading ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : diag.isError ? (
          <LoadError error={diag.error} onRetry={() => void diag.refetch()} />
        ) : checks.length === 0 ? (
          <EmptyState icon={<Activity size={20} />} title={t('sysHealth.noChecks')} />
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {checks.map((c) => {
                const ok = c.status === 'ok'
                return (
                  <li
                    key={c.component}
                    className={cn(
                      'rounded-lg border px-3 py-2.5',
                      ok ? 'border-line bg-surface' : 'border-danger/35 bg-danger-soft',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {ok ? (
                        <CheckCircle2 size={14} className="shrink-0 text-success" aria-hidden />
                      ) : (
                        <AlertTriangle size={14} className="shrink-0 text-danger" aria-hidden />
                      )}
                      <span className="text-[13px] font-semibold text-fg">{componentLabel(t, c.component)}</span>
                    </span>
                    <span className="mt-1 block break-words text-[12px] text-fg-muted">{localizeDetail(t, c.detail)}</span>
                  </li>
                )
              })}
            </ul>
            {failed.length > 0 && (
              <p className="mt-3 text-[13px] text-danger">
                {t('sysHealth.failedSummary', { failed: failed.length, critical: diag.data?.critical ?? 0 })}
              </p>
            )}
          </>
        )}
      </Card>

      {/* ── Oxirgi amal hisoboti ─────────────────────────────────────── */}
      {report && (
        <Card className="mb-4 p-card">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-fg">{report.title}</h2>
            <Button variant="ghost" size="sm" onClick={() => setReport(null)}>
              {t('common.close')}
            </Button>
          </div>
          <OpsReportView report={report.data} onRestore={openRestore} />
        </Card>
      )}

      {/* ── Hodisalar ────────────────────────────────────────────────── */}
      <Card className="overflow-hidden p-0">
        <h2 className="border-b border-line px-4 py-3 text-[15px] font-semibold text-fg">{t('sysHealth.incidents')}</h2>
        {incidents.isLoading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : incidents.isError ? (
          <LoadError error={incidents.error} onRetry={() => void incidents.refetch()} />
        ) : (incidents.data ?? []).length === 0 ? (
          <EmptyState icon={<ShieldAlert size={20} />} title={t('sysHealth.noIncidents')} description={t('sysHealth.noIncidentsHint')} />
        ) : (
          <ul className="divide-y divide-line/60">
            {(incidents.data ?? []).map((i) => (
              <li key={i.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => setOpenIncident(i)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <Badge tone={SEV_TONE[i.severity ?? ''] ?? 'neutral'} className="shrink-0">
                    {t(`sysHealth.sev_${i.severity}` as never, { defaultValue: i.severity_label || i.severity || '—' })}
                  </Badge>
                  <span className="w-36 shrink-0 truncate text-[13px] text-fg">
                    {t(`sysHealth.kind_${i.kind}` as never, { defaultValue: i.kind || '—' })}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg-muted">
                    {localizeMessage(t, i.message) || '—'}
                  </span>
                  <span className="hidden shrink-0 text-[12px] tabular-nums text-fg-subtle sm:inline">
                    {formatDateTime(i.detected_at)}
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-fg-subtle" aria-hidden />
                </button>
                {i.severity === 'critical' && !i.resolved_at && (
                  <span className="shrink-0 pr-3">
                    {i.acknowledged ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-success">
                        <CheckCheck size={13} aria-hidden /> {t('sysOps.acked')}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={ack.isPending && ack.variables === i.id}
                        onClick={() => ack.mutate(i.id)}
                      >
                        {t('sysOps.ack')}
                      </Button>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!openIncident}
        onClose={() => setOpenIncident(null)}
        title={t('sysHealth.incidentReport', { id: openIncident?.id ?? '' })}
        description={
          openIncident ? (
            <>
              {localizeMessage(t, openIncident.message)}
              <span className="mt-1 block text-[12px] text-fg-subtle">
                {formatDateTime(openIncident.detected_at)}
                {openIncident.actor_name ? ` · ${openIncident.actor_name}` : ''}
                {openIncident.resolved_at
                  ? ` · ${t('sysHealth.resolvedAt', { date: formatDateTime(openIncident.resolved_at) })}`
                  : ''}
              </span>
            </>
          ) : undefined
        }
        size="lg"
        footer={
          <>
            {openIncident && !openIncident.acknowledged && (
              <Button
                variant="outline"
                leftIcon={<CheckCheck size={14} />}
                loading={ack.isPending}
                onClick={() => ack.mutate(openIncident.id)}
              >
                {t('sysOps.ack')}
              </Button>
            )}
            <Button variant="ghost" onClick={() => setOpenIncident(null)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        {openIncident && (
          <OpsReportView
            report={openIncident.report ?? {}}
            onRestore={(s) => {
              setOpenIncident(null)
              openRestore(s)
            }}
          />
        )}
      </Modal>

      <div className="mt-4">
        <OpsSettingsCard />
      </div>

      <RestoreWizard target={restoring} onClose={() => setRestoring(null)} />
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
