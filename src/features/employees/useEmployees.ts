import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
import { apiClient } from '@/api/client'
import { useBranchStore } from '@/store/branchStore'
import { useAuthStore } from '@/store/authStore'
import type {
  ArchivedEmployee,
  AsOfResponse,
  CareerRow,
  EditBasis,
  EmployeeDocument,
  EmployeeFull,
  EmployeeOrder,
  EmployeeRow,
  EmployeeTraining,
  HistoryItem,
  RelatedData,
} from './types'

/** fastapi-pagination page envelope. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

/**
 * Every cache an employee write can make stale — the roster, its analytics,
 * the card and its T-2 sections. Other screens (registration approval, own
 * profile) invalidate the same list after they write an employee.
 */
export const EMPLOYEE_QUERY_KEYS = [
  ['employee-kpi'],
  ['employee-kpi-ranked'],
  ['employees'],
  ['employee'],
  ['employee-t2'],
  ['employee-docs'],
  ['employee-career'],
  ['employees-archived'],
  ['age-stats'],
  ['nationality-stats'],
  ['employee-count'],
  ['experience-stats'],
  ['kpi-monthly'],
  ['employees-by-category'],
  ['dashboard-main'],
  ['employee-quality'],
] as const

export function invalidateEmployees(qc: QueryClient) {
  for (const key of EMPLOYEE_QUERY_KEYS) void qc.invalidateQueries({ queryKey: key })
}

/**
 * Does the signed-in person supervise anyone? One `size=1` probe of
 * `/employees?supervisor_id=me`; a 403 reads as "no team".
 */
export function useHasSubordinates(): boolean {
  const employeeId = useAuthStore((s) => s.user?.employee?.id)
  const q = useQuery({
    queryKey: ['employees', 'has-subordinates', employeeId],
    queryFn: () => apiGet<Page<EmployeeRow>>('employees', { supervisor_id: employeeId, page: 1, size: 1 }),
    enabled: !!employeeId,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return (q.data?.total ?? 0) > 0
}

// ── lists ───────────────────────────────────────────────────────────────────

export interface RosterFilters {
  page: number
  size: number
  search?: string
  departmentId?: string
  jobPositionId?: string
  contractType?: string
}

/** `GET /employees` — the plain roster (C2 for a rank-and-file employee). */
export function useEmployeeRows(f: RosterFilters, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  return useQuery({
    queryKey: ['employees', 'roster', { ...f, branchId }],
    queryFn: ({ signal }) =>
      apiGet<Page<EmployeeRow>>(
        'employees',
        {
          page: f.page,
          size: f.size,
          search: f.search || undefined,
          department_id: f.departmentId || undefined,
          job_position_id: f.jobPositionId || undefined,
          contract_type: f.contractType || undefined,
          has_department: true,
        },
        { signal },
      ),
    placeholderData: (prev) => prev,
    enabled,
  })
}

/** `GET /employees/archived` — the «Arxiv» tab (HR only). */
export function useArchivedEmployees(f: { page: number; size: number; search?: string; departmentId?: string }, enabled: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  return useQuery({
    queryKey: ['employees-archived', { ...f, branchId }],
    queryFn: ({ signal }) =>
      apiGet<Page<ArchivedEmployee>>(
        'employees/archived',
        { page: f.page, size: f.size, search: f.search || undefined, department_id: f.departmentId || undefined },
        { signal },
      ),
    placeholderData: (prev) => prev,
    enabled,
  })
}

/**
 * TZ C4 1087: the archive row of ONE card — its `restore_until` (the card
 * itself does not carry it). Looked up by name in `/employees/archived`.
 */
export function useArchivedRow(employee: { id: number; legal_name?: string | null; is_archived?: boolean | null } | null | undefined, enabled: boolean) {
  const name = employee?.legal_name?.trim() ?? ''
  return useQuery({
    queryKey: ['employees-archived', 'row', employee?.id, name],
    queryFn: async () => {
      const page = await apiGet<Page<ArchivedEmployee>>('employees/archived', { search: name, page: 1, size: 50, _no_branch_inject: true })
      return page.items.find((r) => r.id === employee?.id) ?? null
    },
    enabled: enabled && !!employee?.is_archived && !!name,
    retry: false,
  })
}

/** TZ C4 1087: `archive.restore_days` — master-only system setting (0 = off). */
export interface ArchiveSettings {
  restore_days: number
}
const ARCHIVE_SETTINGS = 'system/settings/archive'

export function useArchiveSettings(enabled: boolean) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['system-settings', 'archive'],
    queryFn: () => apiGet<ArchiveSettings>(ARCHIVE_SETTINGS),
    enabled,
  })
  const save = useMutation({
    meta: { silent: true },
    mutationFn: (body: ArchiveSettings) => apiPut<ArchiveSettings>(ARCHIVE_SETTINGS, body),
    onSuccess: (data) => {
      qc.setQueryData(['system-settings', 'archive'], data)
      // `restore_until` of every archive row moves with it.
      void qc.invalidateQueries({ queryKey: ['employees-archived'] })
    },
  })
  return { query, save }
}

// ── one card ────────────────────────────────────────────────────────────────

export function useEmployeeDetail(id: number | null) {
  return useQuery({
    queryKey: ['employee', id],
    queryFn: () => apiGet<EmployeeFull>(`employees/${id}`, { _no_branch_inject: true }),
    enabled: !!id,
    retry: false,
  })
}

export function fetchEmployee(id: number) {
  return apiGet<EmployeeFull>(`employees/${id}`, { _no_branch_inject: true })
}

export function useEmployeeOrders(id: number | null) {
  return useQuery({
    queryKey: ['employee', id, 'orders'],
    queryFn: () => apiGet<{ items: EmployeeOrder[] }>(`employees/${id}/orders`, { _no_branch_inject: true }),
    enabled: !!id,
  })
}

export function useEmployeeTrainings(id: number | null) {
  return useQuery({
    queryKey: ['employee', id, 'trainings'],
    queryFn: () => apiGet<{ items: EmployeeTraining[] }>(`employees/${id}/trainings`, { _no_branch_inject: true }),
    enabled: !!id,
  })
}

export function useEmployeeCareer(id: number | null) {
  return useQuery({
    queryKey: ['employee-career', id],
    queryFn: () => apiGet<{ items: CareerRow[] }>(`employees/${id}/career`, { _no_branch_inject: true }),
    enabled: !!id,
  })
}

export function useEmployeeAsOf(id: number | null, on: string | null) {
  return useQuery({
    queryKey: ['employee', id, 'as-of', on],
    queryFn: () => apiGet<AsOfResponse>(`employees/${id}/as-of`, { on, _no_branch_inject: true }),
    enabled: !!id && !!on,
    retry: false,
  })
}

export function useEmployeeHistory(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['employee', id, 'history'],
    queryFn: () => apiGet<{ items: HistoryItem[] }>(`employees/${id}/history`, { limit: 60, _no_branch_inject: true }),
    enabled: !!id && enabled,
  })
}

export function useRelatedData(id: number | null, enabled: boolean) {
  return useQuery({
    queryKey: ['employee', id, 'related-data'],
    queryFn: () => apiGet<RelatedData>(`employees/${id}/related-data`, { _no_branch_inject: true }),
    enabled: !!id && enabled,
    staleTime: 0,
  })
}

export function useEmployeeDocuments(id: number | null, enabled = true) {
  return useQuery({
    queryKey: ['employee-docs', id],
    queryFn: () => apiGet<EmployeeDocument[]>(`employees/${id}/documents`, { _no_branch_inject: true }),
    enabled: !!id && enabled,
    retry: false,
  })
}

// ── writes ──────────────────────────────────────────────────────────────────

export type EmployeePayload = Record<string, unknown>

export function useEmployeeMutations() {
  const qc = useQueryClient()
  const done = () => invalidateEmployees(qc)
  return {
    create: useMutation({
      mutationFn: (body: EmployeePayload) => apiPost<EmployeeFull>('employees', body, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
    update: useMutation({
      // The drawer reports every failure itself (field errors, TZ C3 conflict dialog).
      meta: { silent: true },
      mutationFn: ({ id, body }: { id: number; body: EmployeePayload }) =>
        apiPatch<EmployeeFull>(`employees/${id}`, body, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(`employees/${id}`, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
    deletePhoto: useMutation({
      mutationFn: (id: number) => apiDelete<EmployeeFull>(`employees/${id}/photo`, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
    setPassword: useMutation({
      mutationFn: ({ id, password }: { id: number; password: string }) =>
        apiPost(`employees/${id}/set-password`, { password }, { params: { _no_branch_inject: true } }),
    }),
    archive: useMutation({
      mutationFn: ({ id, reason_code, note }: { id: number; reason_code: string; note: string | null }) =>
        apiPost(`employees/${id}/archive`, { reason_code, note }, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
    rehire: useMutation({
      mutationFn: ({ id, body }: { id: number; body: { hire_date: string; department_id: number; job_position_id: number; basis: EditBasis } }) =>
        apiPost<EmployeeFull>(`employees/${id}/rehire`, body, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
    /** TZ C4 1087 «Восстановление из архива» — back to the pre-archive place. */
    restore: useMutation({
      meta: { silent: true },
      mutationFn: ({ id, basis }: { id: number; basis?: EditBasis | null }) =>
        apiPost<EmployeeFull>(`employees/${id}/restore`, { basis: basis ?? undefined }, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
    migrate: useMutation({
      mutationFn: ({
        id,
        body,
      }: {
        id: number
        body: { organization_branch_id: number; department_id: number; job_position_id: number; date: string; basis: EditBasis }
      }) => apiPost<EmployeeFull>(`employees/${id}/migrate`, body, { params: { _no_branch_inject: true } }),
      onSuccess: done,
    }),
  }
}

export type RecordKind = 'educations' | 'work-experiences'

/** Education / work-experience rows: a new card (C1) writes them `?initial=true`
 *  without a basis; an existing card (C3) needs the basis document. */
export function addEmployeeRecord(id: number, kind: RecordKind, body: Record<string, unknown>, basis?: EditBasis | null) {
  return apiPost(`employees/${id}/${kind}`, { ...body, basis: basis ?? undefined }, {
    params: basis ? { _no_branch_inject: true } : { initial: true, _no_branch_inject: true },
  })
}

export function deleteEmployeeRecord(id: number, kind: RecordKind, rowId: number, basis: EditBasis) {
  return apiDelete(`employees/${id}/${kind}/${rowId}`, {
    params: { basis_doc_type: basis.doc_type, basis_number: basis.number, basis_date: basis.date, _no_branch_inject: true },
  })
}

export function uploadEmployeeDocument(id: number, kind: string, file: File, title?: string) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('kind', kind)
  if (title) fd.append('title', title)
  return apiClient.post<EmployeeDocument>(`employees/${id}/documents`, fd, {
    params: { _no_branch_inject: true },
    timeout: 120_000,
  })
}

export function deleteEmployeeDocument(id: number, docId: number) {
  return apiDelete(`employees/${id}/documents/${docId}`, { params: { _no_branch_inject: true } })
}

/**
 * Login credentials e-mail (`send-password-email`) and its REAL outcome.
 * The POST only queues the letter; the status is polled for up to 45 s.
 */
export async function sendCredentialEmail(id: number): Promise<'sent' | 'superseded' | 'failed' | 'timeout'> {
  let taskId: string | null | undefined
  try {
    const res = await apiPost<{ queued?: boolean; task_id?: string | null }>(`employees/${id}/send-password-email`, {}, {
      params: { _no_branch_inject: true },
    })
    if (res?.queued === false || !res?.task_id) return 'failed'
    taskId = res.task_id
  } catch {
    return 'failed'
  }
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const st = await apiGet<{ status?: string }>(`employees/${id}/password-email-status`, {
        task_id: taskId,
        _no_branch_inject: true,
      })
      if (st?.status === 'sent' || st?.status === 'superseded' || st?.status === 'failed') return st.status
    } catch {
      return 'failed'
    }
  }
  return 'timeout'
}
