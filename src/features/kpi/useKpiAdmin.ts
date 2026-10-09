import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { fetchAllPages } from '@/api/fetchAll'
import {
  KPI_ENTRIES,
  KPI_GROUPS,
  KPI_INDICATORS,
  KPI_PERFORMANCES,
  KPI_PERFORMANCE_COPY,
  KPI_PERFORMANCES_BULK_STATUS,
  KPI_SEED_INDICATOR_GROUPS,
  KPI_SEED_TASK_STATUSES,
  KPI_TASK_STATUSES,
} from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { KpiEntry, KpiIndicator, KpiTaskStatus } from './useKpi'

/** Server page envelope used by the paginated KPI lists. */
interface KpiPage<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface KpiIndicatorGroup {
  id?: number
  name?: string
  order_no?: number | null
  weight?: number | null
  organization_branch_id?: number | null
}

export interface KpiPerformance {
  id: number
  employee_id?: number
  interval_id?: number
  result_percent?: number | null
  status?: string | null
  /** Bu varaqa bonusga yaroqlimi (`KpiPerformanceUpdate.bonus_allowed`). The
   *  list already FILTERS on it; the row never showed or changed it. */
  bonus_allowed?: boolean | null
  /** Division snapshot / employee's department, as the source list shows it. */
  department_name?: string | null
  /** «Результат % / Факт вес (независимо от статуса)» — computed over every
   *  argument regardless of status; result_percent counts DONE sources only. */
  live_result_percent?: number | null
  live_fact_weight?: number | null
  weights_sum?: number | null
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  interval?: { id?: number; name?: string | null } | null
}

// ─── Indicators (KPI sozlamalari) ─────────────────────────────────────────────

interface IndicatorFilters {
  group?: string
  direction?: string
  departmentId?: string
}

export function useIndicators(filters: IndicatorFilters = {}, enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'indicators', filters],
    queryFn: () =>
      apiGet<KpiIndicator[]>(KPI_INDICATORS, {
        group: filters.group || undefined,
        direction: filters.direction || undefined,
        department_id: filters.departmentId || undefined,
      }),
    enabled,
  })
  return { indicators: q.data ?? [], loading: q.isLoading }
}

export function useIndicatorGroups() {
  const q = useQuery({
    queryKey: ['kpi', 'groups'],
    queryFn: () => apiGet<KpiIndicatorGroup[]>(KPI_GROUPS),
  })
  return { groups: q.data ?? [], loading: q.isLoading }
}

// ─── Results (Natijalar) ──────────────────────────────────────────────────────

interface EntryFilters {
  search?: string
  indicatorId?: string
  departmentId?: string
  jobPositionId?: string
  status?: string
  from?: string
  to?: string
  page: number
  size: number
}

export function useKpiEntries(f: EntryFilters, { enabled = true }: { enabled?: boolean } = {}) {
  const filterParams = {
    search: f.search || undefined,
    indicator_id: f.indicatorId || undefined,
    department_id: f.departmentId || undefined,
    job_position_id: f.jobPositionId || undefined,
    status: f.status || undefined,
    from: f.from || undefined,
    to: f.to || undefined,
  }
  const q = useQuery({
    // `enabled: false` while the date range is inverted (from > to).
    enabled,
    queryKey: ['kpi', 'entries-list', f],
    queryFn: () => apiGet<KpiPage<KpiEntry>>(KPI_ENTRIES, { ...filterParams, page: f.page, size: f.size }),
  })
  return {
    entries: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    /** Every row matching the current filter, all pages — «select all N».
     *  Rows, not ids: the bulk status action needs each row's current status.
     *  ⚠️ size 100: fastapi-pagination's `Page` answers 422 above that. */
    loadAll: () => fetchAllPages<KpiEntry>(KPI_ENTRIES, filterParams, 100, 60),
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

// ─── Evaluation sheets (Baholash varaqalari) ──────────────────────────────────

/**
 * Scorecard filters. The server has accepted all of these all along and v1
 * sends every one of them; v2 sent only `search`, so the four narrowing
 * controls simply did not exist on this screen.
 */
export interface PerformanceFilters {
  intervalId?: string
  departmentId?: string
  status?: string
  bonusAllowed?: string
}

/** Query params for the list AND for the Excel export — one source, so the
 *  file can never come out wider than the table it was exported from. */
export function performanceParams(search: string, f: PerformanceFilters) {
  return {
    search: search.trim() || undefined,
    interval_id: f.intervalId || undefined,
    department_id: f.departmentId || undefined,
    status: f.status || undefined,
    // A tri-state select: '' means "either", so it must not become `false`.
    bonus_allowed: f.bonusAllowed === '' || f.bonusAllowed == null ? undefined : f.bonusAllowed,
  }
}

export function usePerformances(search: string, page: number, size: number, filters: PerformanceFilters = {}) {
  const params = performanceParams(search, filters)
  const q = useQuery({
    queryKey: ['kpi', 'performances', params, page, size],
    queryFn: () => apiGet<KpiPage<KpiPerformance>>(KPI_PERFORMANCES, { ...params, page, size }),
  })
  return {
    performances: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    /** Every sheet id matching the current filter, all pages — «select all N».
     *  ⚠️ size 100: fastapi-pagination's `Page` answers 422 above that. */
    loadAllIds: () =>
      fetchAllPages<KpiPerformance>(KPI_PERFORMANCES, params, 100, 60).then((r) => r.map((x) => x.id)),
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useKpiAdminMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi'] })

  return {
    invalidate,
    // Indicators. The backend needs ?organization_branch_id= as a fallback when
    // the caller is a master-admin with no home branch — the axios interceptor
    // already injects it from the selected branch, so do NOT add it again here
    // (that produced a duplicated query param).
    /** Source `employee_performance_list.copy`: the sheet's argument settings
     *  go to other employees and/or another interval; facts are not copied. */
    copyPerformance: useMutation({
      mutationFn: ({ id, employee_ids, interval_id }: { id: number; employee_ids?: number[]; interval_id?: number | null }) =>
        apiPost<{ created: { performance_id: number; arguments: number }[]; skipped: number[]; missing: unknown[] }>(
          KPI_PERFORMANCE_COPY(id),
          { employee_ids: employee_ids?.length ? employee_ids : null, interval_id: interval_id ?? null },
        ),
      onSuccess: invalidate,
    }),
    createIndicator: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiIndicator>(KPI_INDICATORS, body),
    }),
    updateIndicator: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiIndicator>(`${KPI_INDICATORS}/${id}`, body),
    }),
    deleteIndicator: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_INDICATORS}/${id}`) }),

    // Indicator groups
    createGroup: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiIndicatorGroup>(KPI_GROUPS, body),
    }),
    updateGroup: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiIndicatorGroup>(`${KPI_GROUPS}/${id}`, body),
    }),
    deleteGroup: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_GROUPS}/${id}`) }),
    seedGroups: useMutation({ mutationFn: () => apiPost(KPI_SEED_INDICATOR_GROUPS, {}) }),

    // Task statuses
    createTaskStatus: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiTaskStatus>(KPI_TASK_STATUSES, body),
    }),
    updateTaskStatus: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiTaskStatus>(`${KPI_TASK_STATUSES}/${id}`, body),
    }),
    deleteTaskStatus: useMutation({
      mutationFn: (id: number) => apiDelete(`${KPI_TASK_STATUSES}/${id}`),
    }),
    seedTaskStatuses: useMutation({ mutationFn: () => apiPost(KPI_SEED_TASK_STATUSES, {}) }),

    /**
     * ENTRY CRUD. v2 could only GENERATE entries for the month and read them —
     * a single plan could not be created, corrected or removed, so any manual
     * KPI row (a penalty, a one-off target) was impossible.
     */
    createEntry: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost(KPI_ENTRIES, body),
    }),
    updateEntry: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${KPI_ENTRIES}/${id}`, body),
    }),
    removeEntry: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_ENTRIES}/${id}`) }),

    /**
     * SCORECARD CRUD. v2 could only GENERATE a whole month of them: one
     * employee's sheet could not be opened, its bonus eligibility could not be
     * switched, and a wrong sheet could not be removed.
     */
    createPerformance: useMutation({
      mutationFn: (body: { employee_id: number; interval_id?: number | null }) =>
        apiPost(KPI_PERFORMANCES, body),
    }),
    updatePerformance: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${KPI_PERFORMANCES}/${id}`, body),
    }),
    removePerformance: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_PERFORMANCES}/${id}`) }),

    // Evaluation sheets — Verifix executeMany
    // Answers `{changed, total}`: rows the server refuses are skipped, not
    // fatal, so the caller must compare the two instead of assuming success.
    bulkStatus: useMutation({
      mutationFn: ({ ids, action }: { ids: number[]; action: string }) =>
        apiPost<{ changed: number; total: number }>(KPI_PERFORMANCES_BULK_STATUS, { ids, action }),
    }),
  }
}

/** All task statuses (including inactive) — the settings tab edits them. */
export function useAllTaskStatuses() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['kpi', 'task-statuses-all', branchId],
    queryFn: () => apiGet<KpiTaskStatus[]>(KPI_TASK_STATUSES, { branch_id: branchId || undefined }),
  })
  return { statuses: q.data ?? [], loading: q.isLoading }
}
