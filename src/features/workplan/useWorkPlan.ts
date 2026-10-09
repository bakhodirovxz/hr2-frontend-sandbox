import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'
import { useDebounce } from '@/hooks/useDebounce'

const PLANS = 'work-plans'

export interface WorkPlan {
  id: number
  title?: string | null
  description?: string | null
  employee_id?: number | null
  employee_name?: string | null
  employee_photo_thumb_path?: string | null
  employee_photo_path?: string | null
  department_id?: number | null
  department_name?: string | null
  organization_branch_id?: number | null
  period_type?: string | null
  period_label?: string | null
  start_date?: string | null
  end_date?: string | null
  kpi_indicator_id?: number | null
  kpi_indicator_name?: string | null
  planned_result?: string | null
  weight?: number | null
  status?: string | null
  status_label?: string | null
}

interface PlanMeta {
  period_types: { value: string; label: string }[]
  statuses: { value: string; label: string }[]
}

/**
 * Period types and statuses come from the server rather than a copied constant:
 * they carry their own labels, and a client-side list would silently drift the
 * day a status is added.
 */
export function useWorkPlanMeta() {
  const q = useQuery({
    queryKey: ['work-plan-meta'],
    queryFn: () => apiGet<PlanMeta>(`${PLANS}/meta`),
    staleTime: 30 * 60_000,
  })
  // The server's labels are Uzbek only; the dictionary names each known value
  // in the UI language and the server label stays the fallback for a new one.
  const { t } = useTranslation()
  const tr = (prefix: string, o: { value: string; label: string }) =>
    t(`workPlan.${prefix}_${o.value}` as never, { defaultValue: o.label }) as string
  return {
    periods: (q.data?.period_types ?? []).map((o) => ({ ...o, label: tr('period', o) })),
    statuses: (q.data?.statuses ?? []).map((o) => ({ ...o, label: tr('status', o) })),
  }
}

/**
 * `search` goes to the SERVER over plan title + employee name + department
 * name. Plans accumulate period after period, so filtering the fetched array
 * searched a list that never shrinks; the server also folds Cyrillic against
 * Latin and apostrophe glyphs, which a substring test does not.
 */
export function useWorkPlans(
  filters: {
    status?: string
    employeeId?: string
    departmentId?: string
    search?: string
    /** `/work-plans` has always accepted these; the page never sent them. */
    dateFrom?: string
    dateTo?: string
    page?: number
    size?: number
  },
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = useDebounce((filters.search ?? '').trim(), 300)
  const q = useQuery({
    queryKey: ['work-plans', { ...filters, search: term, branchId }],
    queryFn: () =>
      apiGet<{ items: WorkPlan[]; total?: number; pages?: number }>(PLANS, {
        status: filters.status || undefined,
        employee_id: filters.employeeId || undefined,
        department_id: filters.departmentId || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        search: term || undefined,
        page: filters.page,
        size: filters.size,
      }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? q.data?.items?.length ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

/** Tile counts {all, overdue, planned, in_progress, done, cancelled} — `/work-plans/summary`. */
export function useWorkPlanSummary(filters: { employeeId?: string; departmentId?: string; search?: string; dateFrom?: string; dateTo?: string }) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = useDebounce((filters.search ?? '').trim(), 300)
  const q = useQuery({
    queryKey: ['work-plans', 'summary', { ...filters, search: term, branchId }],
    queryFn: () =>
      apiGet<Record<string, number>>(`${PLANS}/summary`, {
        employee_id: filters.employeeId || undefined,
        department_id: filters.departmentId || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        search: term || undefined,
      }),
    placeholderData: (prev) => prev,
  })
  return q.data ?? {}
}

export function useWorkPlanMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['work-plans'] }),
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<WorkPlan>(PLANS, body) }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<WorkPlan>(`${PLANS}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${PLANS}/${id}`) }),
  }
}
