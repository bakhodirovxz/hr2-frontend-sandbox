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
