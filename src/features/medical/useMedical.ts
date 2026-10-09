import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
import { fetchAllPages } from '@/api/fetchAll'

const MED = 'medical'

export interface MedicalRow {
  id: number
  legal_name?: string | null
  photo_thumb_path?: string | null
  photo_path?: string | null
  branch_name?: string | null
  department_name?: string | null
  job_position_name?: string | null
  last_checkup_date?: string | null
  checkup_count: number
  /** passed | due_soon | overdue */
  status?: string | null
  annual_index?: string | null
  annual_index_year?: number | null
}

export interface CheckupFile {
  id: number
  original_filename?: string | null
  content_type?: string | null
  file_url?: string | null
}

export interface Checkup {
  id: number
  employee_id?: number | null
  checkup_date?: string | null
  conclusion?: string | null
  recommendation?: string | null
  specialty_id?: number | null
  specialty_name?: string | null
  doctor_name?: string | null
  /** Scans and lab results attached to the record. */
  files?: CheckupFile[] | null
  /** The server decides who may touch the record; the UI must not re-derive it. */
  can_edit?: boolean
  can_delete?: boolean
}

interface AnnualIndex {
  id?: number
  employee_id?: number | null
  year?: number | null
  health_index?: string | null
  index_note?: string | null
  set_by_name?: string | null
  set_at?: string | null
}

interface MedicalDetail {
  employee: MedicalRow
  checkups: Checkup[]
  annual_indexes: AnnualIndex[]
  can_add_checkup: boolean
  can_set_annual_index: boolean
}

interface Specialty {
  id: number
  name?: string | null
  is_active?: boolean | null
}

/**
 * ⚠️ `PaginatedList` carries `items/total/page/size` and NO `pages` — reading a
 * `pages` that never arrives left it at 1, so the "next page" button sat
 * disabled with 2 363 rows behind it. The page count is derived here.
 */
interface Paginated<T> { items: T[]; total?: number; page?: number; size?: number }

/**
 * The checkup register.
 *
 * `organization_branch_id` is a FILTER here, not a fence: a doctor legitimately
 * sees every organisation, so the header branch is passed only when the user
 * narrowed it themselves — sending it always would hide most of the register
 * from the one role that needs all of it.
 */
/** Screen filters → the query the server expects. Shared by the list and the
 *  Excel export so the file can never be wider than the table. */
export function medicalExportParams(p: {
  search?: string
  status?: string
  branchId?: string
  departmentId?: string
  jobPositionId?: string
  healthIndex?: string
  year?: string
}) {
  return {
    search: p.search || undefined,
    status: p.status || undefined,
    organization_branch_id: p.branchId || undefined,
    department_id: p.departmentId || undefined,
    job_position_id: p.jobPositionId || undefined,
    health_index: p.healthIndex || undefined,
    year: p.year || undefined,
  }
}

export function useMedicalEmployees(params: {
  page: number
  size: number
  search?: string
  status?: string
  branchId?: string
  departmentId?: string
  jobPositionId?: string
  healthIndex?: string
  year?: string
  /** Server-side order (`legal_name` | `last_checkup_date` | `checkup_count`):
   *  the list is paged on the server, so a client sort only reordered the
   *  visible page (measured 2026-09-11: 50 of 2 363 rows). */
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}) {
  const q = useQuery({
    queryKey: ['medical-employees', params],
    queryFn: () =>
      apiGet<Paginated<MedicalRow>>(`${MED}/employees`, {
        page: params.page,
        size: params.size,
        ...medicalExportParams(params),
        sort_by: params.sortBy || undefined,
        sort_dir: params.sortBy ? params.sortDir || undefined : undefined,
      }),
    placeholderData: (prev) => prev,
  })
  const total = q.data?.total ?? 0
  return {
    rows: q.data?.items ?? [],
    total,
    pages: Math.max(1, Math.ceil(total / (params.size || 1))),
    /** Every employee id the filter matches — «select all N» of the BulkBar.
     *  500 is the endpoint's own `size` ceiling. */
    loadAllIds: () =>
      fetchAllPages<MedicalRow>(`${MED}/employees`, medicalExportParams(params), 500, 60).then((r) => r.map((x) => x.id)),
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    fetching: q.isFetching,
  }
}

export function useMedicalDetail(employeeId: number | null) {
  const q = useQuery({
    enabled: !!employeeId,
    queryKey: ['medical-detail', employeeId],
    queryFn: () => apiGet<MedicalDetail>(`${MED}/employees/${employeeId}`),
  })
  return { detail: q.data ?? null, loading: q.isLoading, refetch: q.refetch }
}

export function useSpecialties(enabled = true) {
  const q = useQuery({
    enabled,
    queryKey: ['medical-specialties'],
    queryFn: () => apiGet<Specialty[]>(`${MED}/specialties`),
    staleTime: 10 * 60_000,
  })
  return { specialties: q.data ?? [], loading: q.isLoading }
}

export function useMedicalMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['medical-employees'] })
    qc.invalidateQueries({ queryKey: ['medical-detail'] })
  }
  return {
    invalidate,
    addCheckup: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<Checkup>(`${MED}/checkups`, body),
    }),
    updateCheckup: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<Checkup>(`${MED}/checkups/${id}`, body),
    }),
    removeCheckup: useMutation({ mutationFn: (id: number) => apiDelete(`${MED}/checkups/${id}`) }),
    /**
     * Attachments on a checkup record — the scan or lab result behind the
     * conclusion. v2 could neither add nor see them, so a record's evidence
     * lived only in the doctor's own folder.
     *
     * One file per request: the route takes a single `file`, not a list.
     */
    addCheckupFile: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost(`${MED}/checkups/${id}/files`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
    }),
    removeCheckupFile: useMutation({ mutationFn: (fileId: number) => apiDelete(`${MED}/files/${fileId}`) }),
    setAnnualIndex: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<AnnualIndex>(`${MED}/annual-index`, body),
    }),
  }
}

/** A doctor of the clinic: an employee plus the specialties they cover. */
export interface Doctor {
  employee_id?: number
  id?: number
  legal_name?: string | null
  photo_thumb_path?: string | null
  department_name?: string | null
  job_position_name?: string | null
  specialties?: { id: number; name?: string | null }[]
  is_labor_safety?: boolean | null
}

export function useDoctors(enabled: boolean) {
  const q = useQuery({
    enabled,
    queryKey: ['medical-doctors'],
    queryFn: () => apiGet<Doctor[]>(`${MED}/doctors`),
  })
  return { doctors: q.data ?? [], loading: q.isLoading }
}

/**
 * Managing WHO examines and WHAT they examine.
 *
 * Both lists belong to the clinic's own HR (`is_medical_manager`), which is why
 * the screens sit inside this module rather than in the general employee card —
 * the doctor flag is refused on `PATCH /employees/{id}` on purpose.
 */
export function useMedicalAdminMutations() {
  const qc = useQueryClient()
  const doneDoctors = () => qc.invalidateQueries({ queryKey: ['medical-doctors'] })
  const doneSpecialties = () => {
    qc.invalidateQueries({ queryKey: ['medical-specialties'] })
    doneDoctors()
  }
  return {
    setDoctor: useMutation({
      mutationFn: ({ employeeId, body }: { employeeId: number; body: Record<string, unknown> }) =>
        apiPut(`${MED}/doctors/${employeeId}`, body),
      onSuccess: doneDoctors,
    }),
    removeDoctor: useMutation({
      mutationFn: (employeeId: number) => apiDelete(`${MED}/doctors/${employeeId}`),
      onSuccess: doneDoctors,
    }),
    addSpecialty: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<Specialty>(`${MED}/specialties`, body),
      onSuccess: doneSpecialties,
    }),
    updateSpecialty: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<Specialty>(`${MED}/specialties/${id}`, body),
      onSuccess: doneSpecialties,
    }),
    removeSpecialty: useMutation({
      mutationFn: (id: number) => apiDelete(`${MED}/specialties/${id}`),
      onSuccess: doneSpecialties,
    }),
    /** One checkup written for many people at once. */
    bulkCheckup: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiPost<{ created?: number; failed?: { id: number; error: string }[] }>(`${MED}/checkups/bulk`, body),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['medical-employees'] }),
    }),
  }
}
