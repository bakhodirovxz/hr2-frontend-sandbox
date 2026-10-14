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
  // K2 · 1385 «Декомпозиция задачи»: the hierarchy (root = depth 1, at most 3).
  parent_id?: number | null
  depth?: number | null
  children_count?: number | null
  // K2 · 1385 «Согласование плана»: draft → submitted → approved | returned.
  approval_status?: ApprovalStatus | null
  approval_status_label?: string | null
  approver_employee_id?: number | null
  approver_name?: string | null
  approval_comment?: string | null
  approved_at?: string | null
  /** K5 · 1475: a corrective task of an audit finding. */
  inspection_finding_id?: number | null
}

export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'returned'
export const APPROVAL_STATUSES: ApprovalStatus[] = ['draft', 'submitted', 'approved', 'returned']
/** The deepest a task tree goes (`MAX_TASK_DEPTH` on the server). */
export const MAX_TASK_DEPTH = 3

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

/** The direct subtasks of a task (`parent_id`), any period. */
export function useWorkPlanChildren(parentId: number | null) {
  const q = useQuery({
    queryKey: ['work-plans', 'children', parentId],
    queryFn: () => apiGet<{ items: WorkPlan[] }>(PLANS, { parent_id: parentId }),
    enabled: parentId != null,
  })
  return { rows: q.data?.items ?? [], loading: q.isLoading, error: q.error }
}

/** K2 · 1385: the plans sent to ME for approval (`approver=me`). */
export function useWorkPlanApprovals(approvalStatus: string, enabled: boolean) {
  const q = useQuery({
    queryKey: ['work-plans', 'approvals', approvalStatus],
    queryFn: () =>
      apiGet<{ items: WorkPlan[] }>(PLANS, {
        approver: 'me',
        approval_status: approvalStatus || undefined,
        parent_id: 0,
        organization_branch_id: null,
      }),
    enabled,
    placeholderData: (prev) => prev,
  })
  return { rows: q.data?.items ?? [], loading: q.isLoading, fetching: q.isFetching, error: q.error, refetch: q.refetch }
}

export interface CopyPlanResult {
  created: number
  skipped: { id: number; title?: string | null; reason: 'exists' | 'out_of_scope'; existing_id?: number }[]
  items: WorkPlan[]
}

export interface WholePlanBody {
  employee_id?: number | null
  department_id?: number | null
  period_start: string
  period_end: string
  approver_employee_id?: number | null
  comment?: string | null
}

export function useWorkPlanMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: ['work-plans'] })
  return {
    copy: useMutation({
      mutationFn: (body: { from_start: string; from_end: string; to_start: string; employee_id?: number; department_id?: number }) =>
        apiPost<CopyPlanResult>(`${PLANS}/copy`, body),
      onSuccess: done,
    }),
    submit: useMutation({
      mutationFn: ({ id, approver_employee_id, comment }: { id: number; approver_employee_id?: number | null; comment?: string | null }) =>
        apiPost<WorkPlan>(`${PLANS}/${id}/submit`, { approver_employee_id: approver_employee_id || null, comment: comment || null }),
      onSuccess: done,
    }),
    decide: useMutation({
      mutationFn: ({ id, approve, comment }: { id: number; approve: boolean; comment?: string | null }) =>
        apiPost<WorkPlan>(`${PLANS}/${id}/${approve ? 'approve' : 'return'}`, { comment: comment || null }),
      onSuccess: done,
    }),
    // TZ K2 1385 «Согласование плана»: the whole plan of one employee / department for a period.
    plan: useMutation({
      mutationFn: ({ action, ...body }: WholePlanBody & { action: 'submit' | 'approve' | 'return' }) =>
        apiPost<{ submitted?: number; decided?: number }>(`${PLANS}/plan/${action}`, body),
      onSuccess: done,
    }),
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
