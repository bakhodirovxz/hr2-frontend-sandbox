import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'

const PLANS = 'work-plans'

export type Priority = 'low' | 'medium' | 'high'
export const PRIORITIES: Priority[] = ['low', 'medium', 'high']

/** One task of the work plan — `WorkPlanService.out` (TZ K2). */
export interface WorkPlan {
  id: number
  title?: string | null
  description?: string | null
  employee_id?: number | null
  employee_name?: string | null
  department_id?: number | null
  department_name?: string | null
  organization_branch_id?: number | null
  period_type?: string | null
  period_label?: string | null
  start_date?: string | null
  end_date?: string | null
  kpi_indicator_id?: number | null
  kpi_indicator_name?: string | null
  kpi_measure?: string | null
  planned_result?: string | null
  weight?: number | null
  status?: string | null
  status_label?: string | null
  priority?: string | null
  priority_label?: string | null
}

/** A task from the 409 `work_plan_overlap` → `params.tasks`. */
export interface OverlapTask {
  id?: number
  title?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
}

type Opt = { value: string; label: string }
interface PlanMeta {
  period_types: Opt[]
  statuses: Opt[]
  priorities: Opt[]
}

/** The server says which priority a row has; an older row without one is «medium». */
export const priorityOf = (row?: { priority?: string | null } | null): Priority =>
  PRIORITIES.includes(row?.priority as Priority) ? (row!.priority as Priority) : 'medium'

/**
 * Period types, statuses and priorities come from `/work-plans/meta`; the
 * dictionary names each known value in the UI language and the server label
 * stays the fallback for a value added later.
 */
export function useWorkPlanMeta() {
  const q = useQuery({
    queryKey: ['work-plan-meta'],
    queryFn: () => apiGet<PlanMeta>(`${PLANS}/meta`),
    staleTime: 30 * 60_000,
  })
  const { t } = useTranslation()
  const tr = (prefix: string, o: Opt) => t(`workPlan.${prefix}_${o.value}` as never, { defaultValue: o.label }) as string
  return {
    periods: (q.data?.period_types ?? []).map((o) => ({ ...o, label: tr('period', o) })),
    statuses: (q.data?.statuses ?? []).map((o) => ({ ...o, label: tr('status', o) })),
    priorities: PRIORITIES.map((value) => ({ value, label: t(`workPlan.priority_${value}`) })),
  }
}

export interface PlanFilters {
  employeeId?: string
  departmentId?: string
  priority?: string
  dateFrom?: string
  dateTo?: string
}

const filterParams = (f: PlanFilters, branchId: number | null) => ({
  organization_branch_id: branchId || undefined,
  employee_id: f.employeeId || undefined,
  department_id: f.departmentId || undefined,
  priority: f.priority || undefined,
})

/**
 * The list view. `GET /work-plans` is not paged — it returns every task that
 * OVERLAPS the period — so the status counts are taken from this one answer
 * and the status filter is applied on the client (see the page).
 */
export function useWorkPlans(f: PlanFilters, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['work-plans', 'list', { ...f, branchId }],
    queryFn: () =>
      apiGet<{ items: WorkPlan[] }>(PLANS, {
        ...filterParams(f, branchId),
        date_from: f.dateFrom || undefined,
        date_to: f.dateTo || undefined,
      }),
    placeholderData: (prev) => prev,
    enabled,
  })
  return { rows: q.data?.items ?? [], loading: q.isLoading, fetching: q.isFetching, error: q.error, refetch: q.refetch }
}

/** K2 «календарь планирования»: `view=calendar&from&to` — tasks overlapping the range. */
export function useWorkPlanCalendar(f: PlanFilters & { status?: string }, from: string, to: string, enabled: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['work-plans', 'calendar', { ...f, branchId, from, to }],
    queryFn: () =>
      apiGet<{ items: WorkPlan[] }>(PLANS, {
        ...filterParams(f, branchId),
        status: f.status || undefined,
        view: 'calendar',
        from,
        to,
      }),
    placeholderData: (prev) => prev,
    enabled,
  })
  return { rows: q.data?.items ?? [], loading: q.isFetching, error: q.error, refetch: q.refetch }
}

export function useWorkPlanMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: ['work-plans'] })
  return {
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<WorkPlan>(PLANS, body), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch<WorkPlan>(`${PLANS}/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${PLANS}/${id}`), onSuccess: done }),
  }
}

/** A KPI indicator as the plan form needs it (`GET /kpi/indicators`). */
export interface PlanIndicator {
  id: number
  name: string
  measure?: string | null
  is_active?: boolean
  scope?: string | null
  organization_branch_id?: number | null
  department_id?: number | null
  assignees?: { employee_ids?: number[]; department_ids?: number[]; position_categories?: string[] } | null
}

/** Asked only while the form is open and only where KPI is on (`/me` kpi_enabled). */
export function usePlanIndicators(enabled: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['work-plans', 'indicators', branchId],
    queryFn: () => apiGet<PlanIndicator[]>('kpi/indicators', { organization_branch_id: branchId || undefined }),
    enabled,
    staleTime: 5 * 60_000,
  })
  return q.data ?? []
}

/** The plan's employee — department, organisation and position category decide which indicators apply. */
export interface PlanEmployee {
  id: number
  department_id?: number | null
  department?: { organization_branch_id?: number | null } | null
  job_position?: { category?: string | null } | null
}

export function usePlanEmployee(id: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['work-plans', 'employee', id],
    queryFn: () => apiGet<PlanEmployee>(`employees/${id}`),
    enabled: enabled && !!id,
    staleTime: 5 * 60_000,
  })
  return q.data && q.data.id === id ? q.data : null
}

/**
 * TZ K2: only the indicators assigned to the chosen employee (or department)
 * — the backend's `assignee_matches` rule plus the indicator's own scope.
 */
export function indicatorApplies(i: PlanIndicator, emp: PlanEmployee | null, deptId: number | null): boolean {
  const dept = emp ? emp.department_id ?? null : deptId
  if (!emp && dept == null) return true
  const empBranch = emp?.department?.organization_branch_id ?? null
  if (i.scope === 'department' && Number(i.department_id) !== Number(dept)) return false
  if (i.scope === 'branch' && empBranch != null && Number(i.organization_branch_id) !== Number(empBranch)) return false
  const a = i.assignees ?? {}
  const ids = (a.employee_ids ?? []).map(Number)
  const depts = (a.department_ids ?? []).map(Number)
  const cats = (a.position_categories ?? []).map(String)
  if (!ids.length && !depts.length && !cats.length) return true
  if (emp && ids.includes(Number(emp.id))) return true
  if (dept != null && depts.includes(Number(dept))) return true
  const cat = emp?.job_position?.category
  return !!(emp && cats.length && cat && cats.includes(String(cat)))
}
