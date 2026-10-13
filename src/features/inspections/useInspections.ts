import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'

const URL = 'inspections'

/**
 * AUDITLAR — TZ K5 «Проведение аудитов». Planned → started → completed (or
 * cancelled with a reason); findings carry a severity, someone responsible
 * and a due date. A completed audit is frozen on the server (409
 * `inspection_closed` on edit, no new findings).
 */
export const INSPECTION_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const
export const INSPECTION_OBJECTS = ['department', 'employee', 'process'] as const
export const FINDING_SEVERITIES = ['low', 'medium', 'high'] as const
export const ASSESSMENTS = ['satisfactory', 'partly', 'unsatisfactory'] as const

export interface Finding {
  id: number
  description: string
  recommendation?: string | null
  severity: string
  status: string
  responsible_id?: number | null
  responsible_name?: string | null
  due_date?: string | null
  /** Server-computed: still open and past `due_date`. */
  is_overdue?: boolean
  resolution_note?: string | null
  /** K5 · 1475 «план корректирующих мероприятий»: work-plan tasks of the finding. */
  tasks?: FindingTask[]
  tasks_total?: number
  tasks_done?: number
}

export interface FindingTask {
  id: number
  title: string
  status: string
  status_label?: string | null
  employee_id?: number | null
  department_id?: number | null
  end_date?: string | null
}

export interface SnapshotRow {
  indicator_id?: number
  name?: string | null
  measure?: string | null
  entries?: number | null
  plan?: number | null
  fact?: number | null
  percent?: number | null
  deviation_abs?: number | null
}
/** `kpi_snapshot` — plan / fact of the chosen indicators over the audited period. */
export interface KpiSnapshotData {
  taken_at?: string | null
  period_start?: string | null
  period_end?: string | null
  rows?: SnapshotRow[]
}

export interface Extension {
  at?: string | null
  by?: string | null
  old_end?: string | null
  new_end?: string | null
  reason?: string | null
}

export interface Inspection {
  id: number
  title: string
  purpose?: string | null
  period_start?: string | null
  period_end?: string | null
  object_type: string
  object_label?: string | null
  employee_id?: number | null
  employee_name?: string | null
  department_id?: number | null
  department_name?: string | null
  process_name?: string | null
  organization_branch_id?: number | null
  branch_name?: string | null
  kpi_indicator_ids?: number[] | null
  status: string
  conclusion?: string | null
  cancel_reason?: string | null
  members?: { id: number; employee_id: number; employee_name?: string | null }[]
  findings?: Finding[]
  findings_open?: number
  findings_total?: number
  kpi_snapshot?: KpiSnapshotData | null
  extensions?: Extension[]
  /** K5 · 1475 «Повторный аудит»: the audit this one re-checks, and its own repeats. */
  parent_inspection_id?: number | null
  parent_inspection_title?: string | null
  follow_ups?: { id: number; title: string; status: string; status_label?: string | null }[]
}

interface Page<T> { items?: T[]; total?: number; pages?: number }

export function useInspections(params: { page: number; size: number; search?: string; status?: string }) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, 'list', { ...params, branchId }],
    queryFn: () =>
      apiGet<Page<Inspection>>(URL, {
        page: params.page,
        size: params.size,
        organization_branch_id: branchId || undefined,
        search: params.search || undefined,
        status: params.status || undefined,
      }),
    placeholderData: (prev) => prev,
  })
  const total = q.data?.total ?? 0
  return {
    rows: q.data?.items ?? [],
    total,
    pages: q.data?.pages || Math.max(1, Math.ceil(total / (params.size || 1))),
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useInspection(id: number | null) {
  const q = useQuery({
    enabled: !!id,
    queryKey: [URL, 'detail', id],
    queryFn: () => apiGet<Inspection>(`${URL}/${id}`),
    retry: false,
  })
  return { inspection: q.data ?? null, loading: q.isLoading, error: q.error }
}

export interface AuditIndicator {
  id: number
  name: string
  is_active?: boolean
  organization_branch_id?: number | null
  organization_branch_name?: string | null
}

/** KPI indicators — only where the KPI module is on (`/me` kpi_enabled). */
export function useAuditIndicators(enabled: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, 'indicators', branchId],
    queryFn: () => apiGet<AuditIndicator[]>('kpi/indicators', { organization_branch_id: branchId || undefined }),
    enabled,
    staleTime: 5 * 60_000,
  })
  return q.data ?? []
}

export function useInspectionMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [URL] })
  const action = (path: string) => ({
    mutationFn: ({ id, body }: { id: number; body?: Record<string, unknown> }) => apiPost<Inspection>(`${URL}/${id}/${path}`, body ?? {}),
    onSuccess: done,
  })
  return {
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<Inspection>(URL, body), onSuccess: done }),
    /** Extending the deadline: `{period_end, extension_reason}`. */
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch<Inspection>(`${URL}/${id}`, body),
      onSuccess: done,
    }),
    start: useMutation(action('start')),
    /** `{conclusion, assessment?, recommendations?}` */
    complete: useMutation(action('complete')),
    /** `{reason}` — required. */
    cancel: useMutation(action('cancel')),
    addFinding: useMutation(action('findings')),
    /** K5 · 1475: a corrective task in the work plan (defaults: the finding's responsible and due date). */
    addFindingTask: useMutation({
      mutationFn: ({ id, findingId, body }: { id: number; findingId: number; body: Record<string, unknown> }) =>
        apiPost<{ id: number }>(`${URL}/${id}/findings/${findingId}/tasks`, body),
      onSuccess: () => {
        void done()
        void qc.invalidateQueries({ queryKey: ['work-plans'] })
      },
    }),
    /** K5 · 1475 «Повторный аудит» — completed audits only (409 `inspection_not_completed`). */
    followUp: useMutation(action('follow-up')),
    updateFinding: useMutation({
      mutationFn: ({ id, findingId, body }: { id: number; findingId: number; body: Record<string, unknown> }) =>
        apiPatch(`${URL}/${id}/findings/${findingId}`, body),
      onSuccess: done,
    }),
  }
}
