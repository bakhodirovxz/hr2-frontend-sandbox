import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'

const URL = 'trainings'

/**
 * MALAKA OSHIRISH — TZ K4 «Учёт обучения».
 *
 * The form offers the four TZ types; the API also knows attestation, grade
 * and rank — a row of those still shows its server label.
 */
export const TRAINING_TYPES = ['qualification', 'course', 'training', 'seminar'] as const
export const TRAINING_STATUSES = ['completed', 'planned', 'cancelled'] as const
export const TRAINING_RESULTS = ['passed', 'failed'] as const

export interface Training {
  id: number
  employee_id: number
  employee_name?: string | null
  department_name?: string | null
  job_position_name?: string | null
  branch_name?: string | null
  training_type: string
  training_type_label?: string | null
  program_name: string
  provider?: string | null
  start_date?: string | null
  end_date?: string | null
  hours?: number | null
  status: string
  result?: string | null
  cost?: number | string | null
  certificate_number?: string | null
  certificate_expires_at?: string | null
  /** Server-computed: the certificate has lapsed. */
  is_expired?: boolean
  /** Presigned link to the certificate / diploma scan. */
  file_url?: string | null
  file_original_name?: string | null
  note?: string | null
}

export interface TrainingFilters {
  search?: string
  type?: string
  status?: string
  expiringOnly?: boolean
}

interface TrainingSummary {
  total: number
  completed: number
  planned: number
  total_hours: number
  expiring_soon: number
}

interface Page<T> { items?: T[]; total?: number; page?: number; size?: number; pages?: number }

/** The list's query string — the Excel export takes exactly the same. */
export function trainingParams(f: TrainingFilters, branchId: number | null) {
  return {
    organization_branch_id: branchId || undefined,
    search: f.search || undefined,
    training_type: f.type || undefined,
    status: f.status || undefined,
    expiring_only: f.expiringOnly || undefined,
  }
}

export function useTrainings(f: TrainingFilters & { page: number; size: number }) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, 'list', { ...f, branchId }],
    queryFn: () => apiGet<Page<Training>>(URL, { ...trainingParams(f, branchId), page: f.page, size: f.size }),
    placeholderData: (prev) => prev,
  })
  const total = q.data?.total ?? 0
  return {
    rows: q.data?.items ?? [],
    total,
    pages: q.data?.pages || Math.max(1, Math.ceil(total / (f.size || 1))),
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

/** One record — for a deep link `?open={id}` (notifications, global search). */
export function useTraining(id: number | null) {
  const q = useQuery({
    queryKey: [URL, 'detail', id],
    queryFn: () => apiGet<Training>(`${URL}/${id}`),
    enabled: !!id,
    retry: false,
  })
  return { training: q.data ?? null, error: q.error }
}

export function useTrainingSummary() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, 'summary', branchId],
    queryFn: () => apiGet<TrainingSummary>(`${URL}/summary`, { organization_branch_id: branchId || undefined }),
  })
  return q.data ?? null
}

export function useTrainingMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [URL] })
  return {
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<Training>(URL, body), onSuccess: done }),
    /** Group registration — the same course for many people (`trainings/bulk`). */
    bulk: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<{ created?: unknown[]; failed?: unknown[] }>(`${URL}/bulk`, body),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch<Training>(`${URL}/${id}`, body),
      onSuccess: done,
    }),
    /** The certificate / diploma scan (multipart) — attached to the employee's T-2 documents too. */
    upload: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost<Training>(`${URL}/${id}/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      },
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/${id}`), onSuccess: done }),
  }
}
