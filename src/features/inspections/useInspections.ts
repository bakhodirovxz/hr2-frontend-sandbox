import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'

const URL = 'inspections'

/**
 * AUDITLAR — an internal inspection of an employee, a department or a process.
 *
 * The lifecycle is the point: planned → started → completed (or cancelled), and
 * the FINDINGS are what survives it. A finding carries a severity, someone
 * responsible and a due date, so "the audit is done" and "the problems are
 * fixed" stay two different questions.
 */
export const INSPECTION_STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'] as const
export const INSPECTION_OBJECTS = ['employee', 'department', 'process'] as const
export const FINDING_SEVERITIES = ['low', 'medium', 'high'] as const

export interface Finding {
  id: number
  description?: string | null
  recommendation?: string | null
  severity?: string | null
  status?: string | null
  responsible_id?: number | null
  responsible_name?: string | null
  due_date?: string | null
  resolution_note?: string | null
  /** Server-computed: open and past `due_date`. */
  is_overdue?: boolean
}

export interface Inspection {
  id: number
  /** Caller's rights on this row, computed by the server (`_to_read`). */
  can_manage?: boolean
  is_member?: boolean
  can_add_finding?: boolean
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
  branch_name?: string | null
  status: string
  conclusion?: string | null
  cancel_reason?: string | null
  created_by_name?: string | null
  members?: { id: number; employee_id: number; employee_name?: string | null; role?: string | null }[]
  findings?: Finding[]
  findings_open?: number
  findings_total?: number
}

interface Page<T> { items?: T[]; total?: number; pages?: number }

export function useInspections(params: { page: number; size: number; search?: string; status?: string; objectType?: string }) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, { ...params, branchId }],
    queryFn: () =>
      apiGet<Page<Inspection>>(URL, {
        page: params.page,
        size: params.size,
        organization_branch_id: branchId || undefined,
        search: params.search || undefined,
        status: params.status || undefined,
        object_type: params.objectType || undefined,
      }),
    placeholderData: (prev) => prev,
  })
  const total = q.data?.total ?? 0
  return {
    rows: q.data?.items ?? [],
    total,
    pages: q.data?.pages ?? Math.max(1, Math.ceil(total / (params.size || 1))),
    loading: q.isLoading,
    fetching: q.isFetching,
  }
}

export function useInspection(id: number | null) {
  const q = useQuery({
    enabled: !!id,
    queryKey: [URL, 'detail', id],
    queryFn: () => apiGet<Inspection>(`${URL}/${id}`),
  })
  return { inspection: q.data ?? null, loading: q.isLoading }
}

export function useInspectionMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [URL] })
  return {
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(URL, body), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`${URL}/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/${id}`), onSuccess: done }),
    start: useMutation({ mutationFn: (id: number) => apiPost(`${URL}/${id}/start`, {}), onSuccess: done }),
    complete: useMutation({
      mutationFn: ({ id, conclusion }: { id: number; conclusion?: string | null }) =>
        apiPost(`${URL}/${id}/complete`, { conclusion: conclusion ?? null }),
      onSuccess: done,
    }),
    /* ⚠️ `reason`, and it is REQUIRED (`InspectionCancel`, min_length 1).
       The old payload sent `cancel_reason: null`, which the server rejected
       with 422 — the Cancel button could never cancel anything. */
    cancel: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) =>
        apiPost(`${URL}/${id}/cancel`, { reason }),
      onSuccess: done,
    }),
    addFinding: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPost(`${URL}/${id}/findings`, body),
      onSuccess: done,
    }),
    updateFinding: useMutation({
      mutationFn: ({ id, findingId, body }: { id: number; findingId: number; body: Record<string, unknown> }) =>
        apiPatch(`${URL}/${id}/findings/${findingId}`, body),
      onSuccess: done,
    }),
    removeFinding: useMutation({
      mutationFn: ({ id, findingId }: { id: number; findingId: number }) => apiDelete(`${URL}/${id}/findings/${findingId}`),
      onSuccess: done,
    }),
  }
}
