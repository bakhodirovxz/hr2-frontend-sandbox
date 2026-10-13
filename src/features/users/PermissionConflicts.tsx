import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCheck, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { apiPost } from '@/api/http'
import { errorCode, errorParams } from '@/api/errorMessage'
import { MODULES, PERMISSION_LEVELS, type ModuleCode, type PermissionLevel } from '@/auth/permissions'
import { useLevelLabel, useModuleLabel } from './PermissionLevel'
import type { PermissionMap } from './useUserAdmin'

/**
 * TZ A2 869 «Конфликт прав доступа — запускается при назначении
 * взаимоисключающих прав. Система отображает предупреждение и предлагает
 * разрешить конфликт».
 *
 * Server (`core/permission_conflicts.py`): a module opened at some level
 * that relies on another module the account does not reach (orders ≥ edit
 * needs the employee picker, i.e. employees ≥ view …). Every conflict comes
 * with two fixes — `suggestion` (raise the module it relies on) and
 * `alternative` (lower the dependent module) — and `resolved_permissions` is
 * the matrix with every suggestion applied.
 *
 * The matrix is checked live (`POST /permission-groups/validate`, nothing is
 * saved) while it is edited; saving a conflicting matrix still answers 409
 * `permission_conflict`, which opens the same panel with «Baribir saqlash»
 * (`?force=true`).
 */

export interface PermissionFix {
  action: 'raise' | 'lower'
  module: string
  level: string
}

export interface PermissionConflict {
  module: string
  level: string
  requires: string
  requires_level: string
  current_level: string
  suggestion: PermissionFix
  alternative: PermissionFix
  message?: string
  reason?: string
}

export interface ConflictReport {
  ok: boolean
  conflicts: PermissionConflict[]
  resolved_permissions: Record<string, string>
}

const isModule = (m: string): m is ModuleCode => (MODULES as readonly string[]).includes(m)
const isLevel = (l: string): l is PermissionLevel => (PERMISSION_LEVELS as readonly string[]).includes(l)

/** `{modul: daraja}` without `none` — the shape role forms keep. */
export function compactMatrix(raw: Record<string, string> | undefined): PermissionMap {
  const out: PermissionMap = {}
  for (const [m, lv] of Object.entries(raw ?? {})) if (isModule(m) && isLevel(lv) && lv !== 'none') out[m] = lv
  return out
}

/** The 409 `permission_conflict` body of a failed save, or null for any other error. */
export function conflictFromError(err: unknown): ConflictReport | null {
  if (errorCode(err) !== 'permission_conflict') return null
  const p = errorParams(err)
  const conflicts = Array.isArray(p.conflicts) ? (p.conflicts as PermissionConflict[]) : []
  const resolved = (p.resolved_permissions && typeof p.resolved_permissions === 'object'
    ? p.resolved_permissions
    : {}) as Record<string, string>
  return { ok: !conflicts.length, conflicts, resolved_permissions: resolved }
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  return v
}

/**
 * Live check of a matrix as it is being edited (debounced). `userId` — the
 * matrix is that account's PERSONAL levels (role and head grants stay
 * underneath); otherwise it is a role matrix. An empty matrix cannot
 * conflict, so it is not sent.
 */
export function usePermissionValidation(permissions: PermissionMap, { userId, enabled = true }: { userId?: number | null; enabled?: boolean } = {}) {
  const key = JSON.stringify(Object.entries(permissions).sort(([a], [b]) => a.localeCompare(b)))
  const debounced = useDebounced(key, 400)
  const settled = debounced === key
  const body = Object.fromEntries(JSON.parse(debounced) as [string, string][])
  const q = useQuery({
    queryKey: ['permission-groups', 'validate', userId ?? null, debounced],
    queryFn: () =>
      apiPost<ConflictReport>(
        'permission-groups/validate',
        { permissions: body, ...(userId ? { user_id: userId } : {}) },
        { params: { _no_branch_inject: true } },
      ),
    enabled: enabled && Object.keys(body).length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    retry: false,
    meta: { silent: true },
  })
  const active = enabled && Object.keys(permissions).length > 0
  return {
    report: active ? (q.data ?? null) : null,
    checking: active && (!settled || q.isFetching),
  }
}

/** Translated reason of a dependency (`modul>tayanch`); the server's text otherwise. */
const REASON_KEYS: Record<string, string> = {
  'orders>employees': 'permConflict.reason_orders',
  'kpi>employees': 'permConflict.reason_kpi',
  'work_plans>employees': 'permConflict.reason_work_plans',
  'inspections>employees': 'permConflict.reason_inspections',
  'trainings>employees': 'permConflict.reason_trainings',
  'vacancies>structure': 'permConflict.reason_vacancies',
  'employees>structure': 'permConflict.reason_employees',
  'statistics>employees': 'permConflict.reason_statistics',
}

/**
 * The warning with the fixes. `onFix` applies one fix to the matrix being
 * edited, `onFixAll` — every suggestion at once. `force` is passed after a
 * refused save: the explicit «Baribir saqlash».
 */
export function PermissionConflictPanel({
  report,
  onFix,
  onFixAll,
  force,
  disabled,
}: {
  report: ConflictReport | null
  onFix: (fix: PermissionFix) => void
  onFixAll: () => void
  force?: { onForce: () => void; pending?: boolean } | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const moduleLabel = useModuleLabel()
  const levelLabel = useLevelLabel()
  if (!report || !report.conflicts.length) return null
  const mod = (m: string) => (isModule(m) ? moduleLabel(m) : m)
  const lvl = (l: string) => (isLevel(l) ? levelLabel(l) : l)

  return (
    <section
      role="alert"
      aria-live="polite"
      className="rounded-inner border border-warning/40 bg-warning-soft/60 p-3"
    >
      <div className="flex flex-wrap items-start gap-2">
        <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-fg">
            {force ? t('permConflict.saveBlocked') : t('permConflict.title', { count: report.conflicts.length })}
          </p>
          <p className="m-0 mt-0.5 text-xs text-fg-muted">{t('permConflict.hint')}</p>
        </div>
        <Button type="button" size="sm" variant="secondary" leftIcon={<CheckCheck size={14} />} disabled={disabled} onClick={onFixAll}>
          {t('permConflict.applyAll')}
        </Button>
      </div>

      <ul className="m-0 mt-3 grid list-none gap-2 p-0">
        {report.conflicts.map((c) => {
          const reasonKey = REASON_KEYS[`${c.module}>${c.requires}`]
          return (
            <li key={`${c.module}>${c.requires}`} className="rounded-inner border border-line bg-surface p-2.5">
              <p className="m-0 text-[13px] text-fg">
                {t('permConflict.line', {
                  module: mod(c.module),
                  level: lvl(c.level),
                  requires: mod(c.requires),
                  current: lvl(c.current_level),
                })}
              </p>
              <p className="m-0 mt-0.5 text-xs text-fg-muted">
                {reasonKey ? t(reasonKey as never) : (c.reason ?? '')}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  leftIcon={<ArrowUp size={13} />}
                  disabled={disabled}
                  onClick={() => onFix(c.suggestion)}
                >
                  {t('permConflict.raise', { module: mod(c.suggestion.module), level: lvl(c.suggestion.level) })}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  leftIcon={<ArrowDown size={13} />}
                  disabled={disabled}
                  onClick={() => onFix(c.alternative)}
                >
                  {t('permConflict.lower', { module: mod(c.alternative.module), level: lvl(c.alternative.level) })}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {force && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-warning/30 pt-3">
          <p className="m-0 min-w-0 flex-1 text-xs text-fg-muted">{t('permConflict.forceHint')}</p>
          <Button
            type="button"
            size="sm"
            variant="danger"
            leftIcon={<Save size={14} />}
            loading={force.pending}
            onClick={force.onForce}
          >
            {t('permConflict.force')}
          </Button>
        </div>
      )}
    </section>
  )
}

/** Modules the report names (to mark the matrix rows). */
export function conflictModules(report: ConflictReport | null): Set<string> {
  const out = new Set<string>()
  for (const c of report?.conflicts ?? []) {
    out.add(c.module)
    out.add(c.requires)
  }
  return out
}
