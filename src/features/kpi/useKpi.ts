import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  KPI_ENTRIES,
  KPI_MY_SCORECARD,
  KPI_MY_TEAM,
  KPI_TASKS,
  KPI_TASK_STATUSES,
} from '@/api/endpoints'

export interface KpiIndicator {
  id?: number
  name?: string
  description?: string | null
  direction?: string
  max_percent?: number | null
  order_no?: number | null
  group_name?: string | null
  has_tasks?: boolean
  /** How the fact / plan are obtained (source list columns «Тип расчёта факта/плана»). */
  fact_source?: 'manual' | 'task' | 'gather' | 'formula' | string | null
  plan_source?: 'manual' | 'formula' | string | null
  plan_formula?: string | null
  measure?: string | null
  is_active?: boolean
  scope?: string | null
  department_id?: number | null
  organization_branch_id?: number | null
  /**
   * The indicator's bonus scale. `KpiIndicatorRead` has returned these all
   * along; the type omitted them, so the editor could not show a scale even
   * though the server was sending one.
   */
  bonus_ranges?: { id?: number; from_value?: number | null; to_value?: number | null; value?: number | null }[]
}

export interface KpiTaskStatus {
  id?: number
  name?: string
  color?: string | null
  order_no?: number | null
  counts_for_fact?: boolean
  is_active?: boolean
}

export interface KpiTask {
  id: number
  entry_id?: number
  name?: string
  score?: number | null
  status?: string | null
  status_id?: number | null
  task_status?: KpiTaskStatus | null
  review_note?: string | null
}

/** Verifix row.*_access — what the current user may do on this entry. */
export interface KpiEntryAccess {
  is_owner?: boolean
  edit_access?: boolean
  fact_insert_access?: boolean
  status_change_access?: boolean
  task_approve_access?: boolean
  manage_access?: boolean
}

export interface KpiEntry {
  id: number
  indicator_id?: number
  employee_id?: number
  period_start?: string
  period_end?: string
  plan_value?: number | null
  fact_value?: number | null
  result_percent?: number | null
  status?: string | null
  note?: string | null
  indicator?: KpiIndicator | null
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  tasks?: KpiTask[]
  my_access?: KpiEntryAccess | null
}

interface ScorecardProfile {
  id?: number
  legal_name?: string
  photo_path?: string | null
  photo_thumb_path?: string | null
  job_position_name?: string | null
  department_name?: string | null
  supervisor_name?: string | null
  period_begin?: string | null
  period_end?: string | null
}

interface MyScorecard {
  employee_id?: number
  result_percent?: number
  /** Parts of result_percent (bonus − penalty); both 0 = a normal month. */
  bonus_points?: number
  penalty_points?: number
  profile?: ScorecardProfile | null
  period?: string
  available_periods?: string[]
  entries?: KpiEntry[]
}

export interface TeamMember {
  employee_id: number
  legal_name?: string
  photo_path?: string | null
  photo_thumb_path?: string | null
  job_position_name?: string | null
  department_name?: string | null
  result_percent?: number
  bonus_points?: number
  penalty_points?: number
  entries_count?: number
  pending_tasks?: number
  all_done?: boolean
}

/** Scorecard for me, or for another employee when `employeeId` is given. */
export function useMyScorecard(employeeId: number | null, period: string | null) {
  const q = useQuery({
    queryKey: ['kpi', 'scorecard', employeeId, period],
    queryFn: () =>
      apiGet<MyScorecard>(KPI_MY_SCORECARD, {
        employee_id: employeeId || undefined,
        period: period || undefined,
      }),
    // The endpoint answers 400 without an employee, and a user account with no
    // employee row (the site master admin) has none — asking anyway produced a
    // console error on every KPI page load.
    enabled: !!employeeId,
    retry: false,
  })
  return {
    scorecard: q.data ?? null,
    loading: q.isLoading && !!employeeId,
    // 403/404 = this scorecard is not yours to read; the caller must say so
    // rather than render an empty one that looks like "no KPI set".
    denied: q.isError,
  }
}

/** Direct reports with their current-month net result (manager screen). */
export function useMyTeam(enabled: boolean) {
  const q = useQuery({
    queryKey: ['kpi', 'my-team'],
    queryFn: () => apiGet<{ employees?: TeamMember[] }>(KPI_MY_TEAM),
    enabled,
  })
  return { team: q.data?.employees ?? [], loading: q.isLoading }
}

export function useKpiEntry(id: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'entry', id],
    queryFn: () => apiGet<KpiEntry>(`${KPI_ENTRIES}/${id}`),
    enabled: !!id,
  })
  return { entry: q.data ?? null, loading: q.isLoading }
}

export function useTaskStatuses(branchId: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'task-statuses', branchId],
    queryFn: () =>
      apiGet<KpiTaskStatus[]>(KPI_TASK_STATUSES, { organization_branch_id: branchId || undefined }),
  })
  return (q.data ?? []).filter((s) => s.is_active !== false)
}

export function useKpiMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kpi'] })
  }
  return {
    invalidate,
    addTask: useMutation({
      mutationFn: (body: { entry_id: number; name: string; score?: number | null }) =>
        apiPost<KpiTask>(KPI_TASKS, body),
    }),
    updateTask: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiTask>(`${KPI_TASKS}/${id}`, body),
    }),
    setTaskStatus: useMutation({
      mutationFn: ({ id, status_id }: { id: number; status_id: number }) =>
        apiPost<KpiTask>(`${KPI_TASKS}/${id}/set-status`, { status_id }),
    }),
    setTaskGrade: useMutation({
      mutationFn: ({ id, score }: { id: number; score: number }) =>
        apiPost<KpiTask>(`${KPI_TASKS}/${id}/set-grade`, { score }),
    }),
    removeTask: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_TASKS}/${id}`) }),
  }
}

/** 'YYYY-MM' → "Iyul 2026". */
const UZ_MONTHS = [
  'Yanvar',
  'Fevral',
  'Mart',
  'Aprel',
  'May',
  'Iyun',
  'Iyul',
  'Avgust',
  'Sentyabr',
  'Oktyabr',
  'Noyabr',
  'Dekabr',
]
export function formatPeriod(period?: string | null): string {
  if (!period) return '—'
  const [y, m] = period.split('-')
  const idx = Number(m) - 1
  return UZ_MONTHS[idx] ? `${UZ_MONTHS[idx]} ${y}` : period
}

/** A penalty indicator (direction 'L') subtracts from the gauge. */
export const isPenalty = (e: KpiEntry) => e.indicator?.direction === 'L'
