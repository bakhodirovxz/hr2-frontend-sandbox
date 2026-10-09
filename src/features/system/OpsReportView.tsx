import { useTranslation } from 'react-i18next'
import { CheckCircle2, XCircle } from 'lucide-react'
import { componentLabel, localizeDetail, stepLabel, type OpsReport, type Step } from './systemOps'

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
          <span className="min-w-[240px] text-fg">{stepLabel(t, s.step)}</span>
          <span className="min-w-0 flex-1 break-words text-fg-muted">{localizeDetail(t, s.detail)}</span>
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
export function OpsReportView({ report }: { report: OpsReport }) {
  const { t } = useTranslation()
  const steps = Array.isArray(report.steps) ? report.steps : []
  const checks = Array.isArray(report.checks) ? report.checks : []
  const modules = report.modules?.results ?? []
  const hasRecovery = !!report.integrity || !!report.modules
  const empty = steps.length === 0 && checks.length === 0 && !hasRecovery

  if (empty) return <p className="text-[13px] text-fg-subtle">{t('sysHealth.noReportDetails')}</p>

  return (
    <div className="flex flex-col gap-4">
      {steps.length > 0 && <StepList steps={steps} />}

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
                <span className="flex-1 text-fg">{r.module}</span>
                <span className="tabular-nums text-fg-subtle" title={r.error}>
                  {r.status === 'ok' ? r.rows : r.error}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
