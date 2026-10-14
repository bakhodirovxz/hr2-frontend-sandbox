import { useTranslation } from 'react-i18next'
import { CheckCircle2, DatabaseBackup, Lock, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatDateTime } from '@/lib/format'
import {
  componentLabel,
  localizeDetail,
  stepDetail,
  stepLabel,
  type OpenTransaction,
  type OpsReport,
  type ServiceStop,
  type Step,
  type SuggestRestore,
} from './systemOps'

/** Step-by-step result of an emergency shutdown (each step with its ms). */
export function StepList({ steps }: { steps: Step[] }) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col gap-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-[13px]">
          {s.ok ? (
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
          ) : (
            <XCircle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          )}
          <span className="min-w-[240px] text-fg">{stepLabel(t, s.step, s.code)}</span>
          <span className="min-w-0 flex-1 break-words text-fg-muted">{stepDetail(t, s)}</span>
          {s.ms != null && <span className="tabular-nums text-fg-subtle">{t('sysHealth.msValue', { n: s.ms })}</span>}
        </li>
      ))}
    </ul>
  )
}

/**
 * A shutdown / recovery answer, or an incident's stored `report`, in words:
 * the steps, the recovery summary (integrity, transactions, repaired indexes,
 * module test) and the per-module results.
 */
export function OpsReportView({
  report,
  onRestore,
}: {
  report: OpsReport
  /** Butunlik buzilganda taklif qilingan nusxadan tiklash ustasini ochadi. */
  onRestore?: (s: SuggestRestore) => void
}) {
  const { t } = useTranslation()
  const steps = Array.isArray(report.steps) ? report.steps : []
  const services = Array.isArray(report.services) ? report.services : []
  const blocked = Array.isArray(report.modules?.blocked) ? report.modules.blocked : []
  const checks = Array.isArray(report.checks) ? report.checks : []
  const modules = report.modules?.results ?? []
  const hasRecovery = !!report.integrity || !!report.modules
  const txItems: OpenTransaction[] = Array.isArray(report.transactions?.items) ? report.transactions.items : []
  const empty = steps.length === 0 && checks.length === 0 && !hasRecovery && services.length === 0

  if (empty) return <p className="text-[13px] text-fg-subtle">{t('sysHealth.noReportDetails')}</p>

  return (
    <div className="flex flex-col gap-4">
      {(report.failure_type || report.error_code || report.grace_seconds != null) && (
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12.5px]">
          {report.failure_type && (
            <div className="flex gap-1.5">
              <dt className="text-fg-muted">{t('sysHealth.failureType')}:</dt>
              <dd className="text-fg">{t(`sysHealth.ft_${report.failure_type}` as never, { defaultValue: report.failure_type }) as string}</dd>
            </div>
          )}
          {report.error_code && (
            <div className="flex gap-1.5">
              <dt className="text-fg-muted">{t('sysHealth.errorCode')}:</dt>
              <dd className="font-mono text-fg">{report.error_code}</dd>
            </div>
          )}
          {report.grace_seconds != null && (
            <div className="flex gap-1.5">
              <dt className="text-fg-muted">{t('sysHealth.graceLabel')}:</dt>
              <dd className="text-fg">{t('sysHealth.seconds', { n: report.grace_seconds })}</dd>
            </div>
          )}
        </dl>
      )}

      {steps.length > 0 && <StepList steps={steps} />}

      {txItems.length > 0 && <TxTable items={txItems} />}

      {services.length > 0 && <ServiceStopList services={services} physical={report.physical_stop} />}

      {checks.length > 0 && (
        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {checks.map((c) => (
            <li key={c.component} className="flex items-start gap-2 text-[13px]">
              {c.status === 'ok' ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
              ) : (
                <XCircle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              )}
              <span className="text-fg">{componentLabel(t, c.component)}</span>
              <span className="min-w-0 break-words text-fg-muted">{localizeDetail(t, c.detail)}</span>
            </li>
          ))}
        </ul>
      )}

      {hasRecovery && (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
          {report.diagnostics && (
            <Item
              ok={!report.diagnostics.failed}
              label={t('sysHealth.repDiagnostics')}
              value={
                report.diagnostics.failed
                  ? t('sysHealth.failedSummary', {
                      failed: report.diagnostics.failed,
                      critical: report.diagnostics.critical ?? 0,
                    })
                  : t('sysHealth.repIntegrityOk')
              }
            />
          )}
          {report.integrity && (
            <Item
              ok={!!report.integrity.ok}
              label={t('sysHealth.repIntegrity')}
              value={
                report.integrity.ok
                  ? t('sysHealth.repIntegrityOk')
                  : t('sysHealth.repProblems', { count: report.integrity.problems?.length ?? 0 })
              }
            />
          )}
          {report.transactions && (
            <Item
              ok
              label={t('sysHealth.repTransactions')}
              value={t('sysHealth.repTxSummary', {
                total: report.transactions.total ?? 0,
                resolved: report.transactions.resolved ?? 0,
              })}
            />
          )}
          {report.integrity_after && (
            <Item
              ok={!!report.integrity_after.ok}
              label={t('sysHealth.repIntegrityAfter')}
              value={
                report.integrity_after.ok
                  ? t('sysHealth.repIntegrityOk')
                  : t('sysHealth.repProblems', { count: report.integrity_after.problems?.length ?? 0 })
              }
            />
          )}
          {report.repaired && (
            <Item
              ok={!(report.repaired.failed?.length ?? 0)}
              label={t('sysHealth.repRepaired')}
              value={t('sysHealth.repRepairedSummary', {
                fixed: report.repaired.fixed?.length ?? 0,
                failed: report.repaired.failed?.length ?? 0,
              })}
            />
          )}
          {report.modules && (
            <Item
              ok={!!report.modules.ok}
              label={t('sysHealth.repModules')}
              value={
                report.modules.ok
                  ? t('sysHealth.repModulesOk')
                  : t('sysHealth.repModulesFailed', { count: report.modules.failed ?? 0 })
              }
            />
          )}
        </dl>
      )}

      {modules.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-[13px] font-semibold text-fg">{t('sysHealth.modulesTest')}</h4>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {modules.map((r) => (
              <li key={r.module} className="flex items-center gap-2 text-[12.5px]">
                {r.status === 'ok' ? (
                  <CheckCircle2 size={12} className="shrink-0 text-success" aria-hidden />
                ) : (
                  <XCircle size={12} className="shrink-0 text-danger" aria-hidden />
                )}
                <span className="flex-1 text-fg">
                  {r.code ? (t(`sysOps.comp_${r.code}` as never, { defaultValue: r.module }) as string) : r.module}
                </span>
                <span className="tabular-nums text-fg-subtle" title={r.error}>
                  {r.status === 'ok' ? r.rows : r.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocked.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-fg">
          <Lock size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden />
          {t('sysOps.modulesBlockedNow', { modules: blocked.join(', ') })}
        </p>
      )}

      {report.suggest_restore && <SuggestRestoreBox s={report.suggest_restore} onRestore={onRestore} />}

      {report.elapsed_seconds != null && (
        <p className="text-[12px] text-fg-subtle">{t('sysHealth.repElapsed', { n: report.elapsed_seconds })}</p>
      )}
    </div>
  )
}

function Item({ ok, label, value }: { ok: boolean; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
      ) : (
        <XCircle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
      )}
      <dt className="text-fg-muted">{label}:</dt>
      <dd className="text-fg">{value}</dd>
    </div>
  )
}

/** TZ E2 1690 «корректно останавливает службы» — har xizmat bo'yicha natija. */
export function ServiceStopList({ services, physical }: { services: ServiceStop[]; physical?: string }) {
  const { t } = useTranslation()
  return (
    <div>
      <h4 className="mb-1.5 text-[13px] font-semibold text-fg">{t('sysOps.servicesStop')}</h4>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {services.map((x) => (
          <li key={x.service} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-[12.5px]">
            {x.ok ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden />
            ) : (
              <XCircle size={14} className="mt-0.5 shrink-0 text-danger" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block font-semibold text-fg">
                {t(`sysOps.svc_${x.service}` as never, { defaultValue: x.service }) as string}
              </span>
              <span className="block break-words text-fg-muted">
                {x.action ? (t(`sysOps.act_${x.action}` as never, { defaultValue: x.detail || '—' }) as string) : x.detail || '—'}
              </span>
              {x.workers && x.workers.length > 0 && (
                <span className="block break-words font-mono text-[11px] text-fg-subtle">{x.workers.join(', ')}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {physical && <p className="mt-1.5 text-[11.5px] text-fg-subtle">{t('sysOps.physicalStopHint', { how: physical })}</p>}
    </div>
  )
}

/** TZ E3 1729 «Критическое повреждение БД — Система предлагает восстановление из резервной копии». */
export function SuggestRestoreBox({ s, onRestore }: { s: SuggestRestore; onRestore?: (s: SuggestRestore) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/35 bg-danger-soft px-3 py-2.5 text-[12.5px]">
      <DatabaseBackup size={16} className="shrink-0 text-danger" aria-hidden />
      <span className="min-w-0 flex-1 text-fg">
        <b className="font-semibold">{t('sysOps.suggestTitle', { id: s.backup_id })}</b>
        <span className="block text-fg-muted">
          {[s.finished_at ? formatDateTime(s.finished_at) : null, s.file_name].filter(Boolean).join(' · ')}
          {s.confirm_phrase ? ` · ${t('sysOps.suggestPhrase', { phrase: s.confirm_phrase })}` : ''}
        </span>
      </span>
      {onRestore && (
        <Button size="sm" variant="danger" onClick={() => onRestore(s)}>
          {t('sysOps.suggestOpen')}
        </Button>
      )}
    </div>
  )
}

/** TZ E2 1698 / E3 1728: the transactions saved to / resolved from the journal. */
export function TxTable({ items }: { items: OpenTransaction[] }) {
  const { t } = useTranslation()
  return (
    <div>
      <h4 className="mb-1.5 text-[13px] font-semibold text-fg">{t('sysHealth.txReportTitle')}</h4>
      <div className="scroll-thin overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead className="bg-surface-2 text-[11.5px] font-semibold text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-1.5">ID</th>
              <th scope="col" className="px-3 py-1.5">{t('sysHealth.txColUser')}</th>
              <th scope="col" className="px-3 py-1.5">{t('sysHealth.txColTables')}</th>
              <th scope="col" className="px-3 py-1.5">{t('sysHealth.txColAge')}</th>
              <th scope="col" className="px-3 py-1.5">{t('sysHealth.txColResult')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={x.key ?? i} className="border-t border-line/60 text-fg">
                <td className="px-3 py-1 font-mono">{x.pid ?? x.gid ?? '—'}</td>
                <td className="px-3 py-1">{x.user || '—'}</td>
                <td className="px-3 py-1">
                  {x.tables && x.tables.length ? x.tables.join(', ') : x.writes ? t('sysHealth.txWrites') : t('sysHealth.txReadOnly')}
                </td>
                <td className="px-3 py-1 tabular-nums">{x.age_seconds != null ? t('sysHealth.seconds', { n: x.age_seconds }) : '—'}</td>
                <td className="px-3 py-1">
                  {x.result ? (t(`sysHealth.txRes_${x.result}` as never, { defaultValue: x.result }) as string) : t('sysHealth.txSaved')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
