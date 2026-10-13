import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { AUDIT_LOGS } from '@/api/endpoints'
import type { Page } from '@/features/employees/useEmployees'

export interface AuditLog {
  id: number
  action?: string | null
  method?: string | null
  endpoint?: string | null
  resource_type?: string | null
  resource_id?: string | null
  user_id?: number | null
  employee_name?: string | null
  /** Branch of the record the action TOUCHED. */
  organization_branch_name?: string | null
  /** Branch the ACTOR was working in at the time. */
  actor_branch_name?: string | null
  ip_address?: string | null
  user_agent?: string | null
  /** The request body as the middleware stored it, secrets already masked. */
  details?: unknown
  /** TZ A4 «результат» — computed by the server. */
  result?: 'success' | 'failure' | null
  category?: string | null
  created_at?: string | null
}

/**
 * The categories the journal is read by — the server's `ACTION_CATEGORY`
 * (core/audit_middleware). `all` is the page's own «every row» tab.
 */
export const AUDIT_CATEGORIES = ['all', 'changes', 'access', 'activity', 'errors', 'system'] as const
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]

/** Actions per category — the action filter offers only the category's own. */
export const CATEGORY_ACTIONS: Record<Exclude<AuditCategory, 'all'>, string[]> = {
  changes: ['CREATE', 'UPDATE', 'DELETE'],
  access: ['LOGIN', 'LOGOUT', 'PASSWORD'],
  activity: ['PAGE_VIEW', 'SEARCH', 'VIEW', 'EXPORT'],
  errors: ['ERROR', 'EMAIL_FAIL'],
  system: ['EMAIL'],
}

/**
 * `resource_type` values this backend writes (`_RESOURCE_PREFIXES` /
 * `_RESOURCE_SPECIAL` in core/audit_middleware, plus the beacon endpoints'
 * `page` / `search` / `client` and the mailer's `email`).
 */
export const AUDIT_RESOURCE_TYPES = [
  'auth', 'session', 'employee', 'department', 'organization_branch', 'hierarchy',
  'job_position', 'staff_position', 'work_schedule_day', 'holiday', 'order_act',
  'permission_group', 'audit_log', 'notification', 'dictionary', 'registration', 'kpi',
  'work_plan', 'inspection', 'training', 'statistics', 'service_request', 'system_ops',
  'backup', 'attendance', 'dashboard', 'user', 'site', 'feedback', 'page', 'email',
  'search', 'client',
] as const

export interface AuditFilters {
  /** `users.id` of the actor — NOT an employee id. */
  userId?: string
  action?: string
  category?: AuditCategory
  /** '4xx' | '5xx' */
  statusGroup?: string
  resourceType?: string
  result?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  branchId?: number | null
  sort?: string
  order?: string
  /** `false` while the date range is invalid (from > to). */
  enabled?: boolean
}

/**
 * The query string shared by the list, the counters and the export — the
 * three always describe the same selection.
 *
 * ⚠️ THE JOURNAL DOES NOT FOLLOW THE HEADER BRANCH (v1: `_no_branch_inject`).
 * It covers every branch the caller may see; the page's own branch filter
 * narrows it. A branch administrator is scoped by the server anyway.
 */
export function auditParams(f: AuditFilters, { withCategory = true, withSort = true } = {}) {
  const p: Record<string, unknown> = {
    user_id: f.userId || undefined,
    action: f.action || undefined,
    status_group: f.statusGroup || undefined,
    resource_type: f.resourceType || undefined,
    result: f.result || undefined,
    date_from: f.dateFrom || undefined,
    date_to: f.dateTo || undefined,
    search: f.search || undefined,
  }
  if (withCategory && f.category && f.category !== 'all') p.category = f.category
  if (withSort && f.sort && !(f.sort === 'created_at' && f.order !== 'asc')) {
    p.sort = f.sort
    p.order = f.order || 'desc'
  }
  if (f.branchId) p.organization_branch_id = f.branchId
  else p._no_branch_inject = true
  return p
}

/**
 * Counters per category under every filter EXCEPT the category — so «Xatoliklar
 * 12» is exactly what that tab will list.
 */
export function useAuditStats(filters: AuditFilters, enabled = true) {
  const q = useQuery({
    queryKey: ['audit-logs', 'stats', auditParams(filters, { withCategory: false, withSort: false })],
    queryFn: () =>
      apiGet<{ total?: number; by_category?: Record<string, number> | null }>(
        `${AUDIT_LOGS}/stats`,
        auditParams(filters, { withCategory: false, withSort: false }),
      ),
    enabled: enabled && (filters.enabled ?? true),
    staleTime: 30_000,
    meta: { silent: true },
  })
  return { total: q.data?.total, byCategory: q.data?.by_category ?? {} }
}

export function useAuditLogs(page: number, size: number, filters: AuditFilters) {
  const params = auditParams(filters)
  const query = useQuery({
    queryKey: ['audit-logs', 'list', page, size, params],
    queryFn: () => apiGet<Page<AuditLog>>(AUDIT_LOGS, { page, size, ...params }),
    placeholderData: (prev) => prev,
    // The endpoint refuses non-administrators; retrying a 403 only makes the
    // same refusal slower.
    retry: false,
    enabled: filters.enabled ?? true,
  })
  return {
    rows: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetching: query.isFetching,
    denied: query.isError,
  }
}

/** One account in the «Xodim» filter (`GET /audit-logs/actors`, A-D8). */
export interface AuditActor {
  user_id: number
  name?: string | null
  username?: string | null
  type?: string | null
}

export function useAuditActors(branchId: number | null) {
  return useQuery({
    queryKey: ['audit-logs', 'actors', branchId],
    queryFn: () =>
      apiGet<AuditActor[]>(
        `${AUDIT_LOGS}/actors`,
        branchId ? { organization_branch_id: branchId } : { _no_branch_inject: true },
      ),
    staleTime: 5 * 60_000,
    meta: { silent: true },
  })
}

/**
 * TZ A4 919 «Автоматическое обновление журнала — запускается при включённом
 * режиме мониторинга в реальном времени. Система периодически обновляет
 * список событий».
 *
 * Every 5 s (only while the tab is visible) `GET /audit-logs?after_id=N` with
 * the SAME filters asks for rows newer than the newest one on screen; they are
 * prepended to page 1 and stay marked as `fresh` for a few seconds. When the
 * base list itself reloads (or the filters change) the prepended rows are
 * dropped — the reloaded page already contains them.
 */
export function useAuditLive(
  filters: AuditFilters,
  baseRows: AuditLog[],
  { active, ready, onOverflow }: { active: boolean; ready: boolean; onOverflow: () => void },
) {
  const params = auditParams(filters)
  const paramsKey = JSON.stringify(params)
  const [liveRows, setLiveRows] = useState<AuditLog[]>([])
  const [fresh, setFresh] = useState<Set<number>>(() => new Set())
  const [lastPoll, setLastPoll] = useState<Date | null>(null)

  // Filters changed, the base page reloaded or the mode went off — start over.
  const baseTop = baseRows.length ? Math.max(...baseRows.map((r) => r.id)) : 0
  useEffect(() => {
    setLiveRows((prev) => (prev.length ? [] : prev))
  }, [paramsKey, baseTop, active])

  const maxId = useRef<number | null>(null)
  const ids = [...baseRows, ...liveRows].map((r) => r.id)
  maxId.current = ready ? (ids.length ? Math.max(...ids) : 0) : null

  const overflow = useRef(onOverflow)
  overflow.current = onOverflow

  useEffect(() => {
    if (!active) return
    let stopped = false
    const tick = async () => {
      const after = maxId.current
      if (after == null || document.visibilityState !== 'visible') return
      try {
        const page = await apiGet<Page<AuditLog>>(AUDIT_LOGS, { page: 1, size: 100, ...params, after_id: after })
        if (stopped) return
        setLastPoll(new Date())
        const items = (page.items ?? []).filter((r) => r.id > after)
        if (!items.length) return
        if ((page.total ?? items.length) > items.length) {
          // More arrived than one request carries — reload the page instead
          // of leaving a hole between the old and the new rows.
          overflow.current()
          return
        }
        items.sort((a, b) => b.id - a.id)
        setLiveRows((prev) => [...items, ...prev].slice(0, 200))
        setFresh((prev) => new Set([...prev, ...items.map((r) => r.id)]))
        window.setTimeout(() => {
          setFresh((prev) => {
            const next = new Set(prev)
            for (const r of items) next.delete(r.id)
            return next
          })
        }, 4000)
      } catch {
        // A failed poll is retried on the next tick; the list itself shows errors.
      }
    }
    const timer = window.setInterval(() => void tick(), 5000)
    return () => {
      stopped = true
      window.clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, paramsKey])

  const baseIds = new Set(baseRows.map((r) => r.id))
  const extra = active ? liveRows.filter((r) => !baseIds.has(r.id)) : []
  return { rows: extra.length ? [...extra, ...baseRows] : baseRows, added: extra.length, fresh, lastPoll }
}
