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
  organization_branch_name?: string | null
  /**
   * The branch the ACTOR was working in, as distinct from the branch the touched
   * record belongs to. v1 shows both columns; v2 typed only the record's branch,
   * so "HR of branch 1 edited a branch-9 record" was indistinguishable from
   * "HR of branch 9 edited it". Both are on the wire.
   */
  actor_branch_name?: string | null
  ip_address?: string | null
  /** Both are on the wire (AuditLogRead) — the list never showed them. */
  user_agent?: string | null
  /** The request body as the middleware stored it, secrets already masked. */
  details?: unknown
  created_at?: string | null
}

/**
 * The five categories the journal is read by (see the backend's `category`
 * param). A category is not a prettier action filter — it is the QUESTION the
 * reader arrived with: what changed, who signed in, what people did, what
 * broke, what the system did by itself.
 */
export const AUDIT_CATEGORIES = ['changes', 'access', 'activity', 'errors', 'system'] as const

/**
 * `resource_type` values the middleware writes (`_RESOURCE_PATTERNS`). The
 * select offers only these, and a URL carrying anything else is ignored —
 * the server answers an unknown value with 422, so it is never sent.
 */
export const AUDIT_RESOURCE_TYPES = [
  'employee', 'letter', 'order_act', 'work_leave', 'department', 'job_position',
  'organization_branch', 'visitor', 'invitation', 'document', 'card', 'vehicle',
  'holiday', 'news_post', 'support_ticket', 'permission_group', 'medical_checkup',
  'chairman_task', 'admin',
  // 2026-09-22: the other half of what the middleware writes — the select
  // offered 19 of ~45 types and the table printed the rest as raw slugs.
  'auth', 'session', 'hierarchy', 'staff_position', 'work_schedule_day', 'duty_day',
  'location', 'master_admin', 'multi_modal_user', 'module_responsible',
  'medical_specialty', 'kpi', 'health_check', 'zoom_meeting', 'video_guide',
  'task_overdue', 'folder', 'llm', 'attendance', 'turnstile', 'dashboard', 'routing',
  'work_plan', 'training', 'inspection', 'dictionary', 'service_request',
  'custom_field', 'vacancy_application', 'learning', 'report', 'export',
  'registration', 'system', 'statistics', 'notification', 'monitoring',
] as const

interface AuditFilters {
  /** `users.id` of the actor — NOT an employee id. */
  userId?: string
  action?: string
  category?: string
  /** '4xx' | '5xx' — only meaningful inside the errors category. */
  statusGroup?: string
  resourceType?: string
  dateFrom?: string
  dateTo?: string
  search?: string
  branchId?: number | null
  /** `false` while the date range is invalid (from > to is a 422). */
  enabled?: boolean
}

/** Master-admin only, server-paginated. */
/**
 * The audit log's shape under the CURRENT filters: how many entries there are
 * and how they split by category.
 *
 * The table shows one page; this is the whole selection, which is the number
 * that answers "how noisy was yesterday" without paging through it. It takes
 * the same filters as the list, so the two always describe the same set.
 */
export function useAuditStats(filters: AuditFilters, enabled = true) {
  const q = useQuery({
    queryKey: ['audit-logs', 'stats', filters],
    queryFn: () =>
      apiGet<{ total?: number; by_category?: Record<string, number> | null }>(
        `${AUDIT_LOGS}/stats`,
        {
          // Same branch rule as the list: the key is always present so the
          // axios interceptor does NOT inject the header branch. Without it
          // the tiles counted branch 1 only (15 758 errors) while the list
          // and the export covered every branch (21 709) — measured 2026-09-18.
          organization_branch_id: filters.branchId || undefined,
          user_id: filters.userId || undefined,
          action: filters.action || undefined,
          status_group: filters.statusGroup || undefined,
          resource_type: filters.resourceType || undefined,
          date_from: filters.dateFrom || undefined,
          date_to: filters.dateTo || undefined,
          search: filters.search || undefined,
        },
      ),
    // Not asked when the list itself was refused: a role without audit access
    // would otherwise collect a second pointless 403 in the console.
    enabled,
    staleTime: 30_000,
  })
  return { total: q.data?.total ?? 0, byCategory: q.data?.by_category ?? {} }
}

export function useAuditLogs(page: number, size: number, filters: AuditFilters) {
  const query = useQuery({
    queryKey: ['audit-logs', { page, size, ...filters }],
    queryFn: () =>
      apiGet<Page<AuditLog>>(AUDIT_LOGS, {
        page,
        size,
        user_id: filters.userId || undefined,
        action: filters.action || undefined,
        category: filters.category || undefined,
        status_group: filters.statusGroup || undefined,
        resource_type: filters.resourceType || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        search: filters.search || undefined,
        organization_branch_id: filters.branchId || undefined,
      }),
    placeholderData: (prev) => prev,
    // The endpoint is master-admin only. Retrying a 403 three times just makes
    // the same refusal three times slower.
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


/** One signed-in person and the devices they are signed in from. */
interface OnlineUser {
  user_id: number
  name?: string | null
  type?: string | null
  organization_branch_name?: string | null
  devices?: { ip_address?: string | null; user_agent?: string | null; last_seen?: string | null }[]
}

/** HOZIR ONLAYN — who is in the system right this second (Redis presence). */
export function useOnlineNow(enabled = true) {
  const q = useQuery({
    queryKey: ['audit-online'],
    queryFn: () => apiGet<{ count?: number; users?: OnlineUser[] }>(`${AUDIT_LOGS}/online`),
    enabled,
    // Presence is only interesting while it is current.
    refetchInterval: 30_000,
    retry: false,
  })
  return { count: q.data?.count ?? 0, users: q.data?.users ?? [], loading: q.isLoading, denied: q.isError }
}

/** The daily peak, so today's number has something to be compared against. */
export function useOnlineHistory(days = 14, enabled = true) {
  const q = useQuery({
    queryKey: ['audit-online-history', days],
    queryFn: () =>
      apiGet<{ day: string; peak_count: number; avg_count: number }[]>(
        `${AUDIT_LOGS}/online/history`,
        { days },
      ),
    enabled,
    retry: false,
  })
  return { rows: q.data ?? [], loading: q.isLoading }
}
