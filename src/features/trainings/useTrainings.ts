import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'

const URL = 'trainings'

/**
 * MALAKA OSHIRISH (TZ K4 / 4.2.7).
 *
 * Not only courses: attestation and the award of a grade, category or rank live
 * here too, because they share the one thing the screen exists for — an EXPIRY
 * that somebody has to notice before it passes. That is what `expiring_only`
 * and the "expiring soon" figure are for.
 */
export const TRAINING_TYPES = [
  'course', 'training', 'seminar', 'qualification', 'internship', 'attestation', 'grade', 'rank',
] as const
export const TRAINING_STATUSES = ['planned', 'completed', 'cancelled'] as const
export const TRAINING_RESULTS = ['passed', 'failed'] as const

export interface Training {
  id: number
  employee_id: number
  employee_name?: string | null
  employee_photo_thumb_path?: string | null
  employee_photo_path?: string | null
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
  cost?: number | null
  certificate_number?: string | null
  certificate_expires_at?: string | null
  note?: string | null
  file_path?: string | null
}

interface TrainingSummary {
  total: number
  completed: number
  planned: number
  total_hours: number
  total_cost: number
  expiring_soon: number
  by_type?: Record<string, number>
}

interface Page<T> { items?: T[]; total?: number; page?: number; size?: number; pages?: number }

export function useTrainings(params: {
  page: number
  size: number
  search?: string
  type?: string
  status?: string
  expiringOnly?: boolean
}) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, { ...params, branchId }],
    queryFn: () =>
      apiGet<Page<Training>>(URL, {
        page: params.page,
        size: params.size,
        organization_branch_id: branchId || undefined,
        search: params.search || undefined,
        training_type: params.type || undefined,
        status: params.status || undefined,
        expiring_only: params.expiringOnly || undefined,
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

export function useTrainingSummary() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, 'summary', branchId],
    queryFn: () => apiGet<TrainingSummary>(`${URL}/summary`, { organization_branch_id: branchId || undefined }),
  })
  return { summary: q.data ?? null }
}

export function useTrainingMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [URL] })
  return {
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(URL, body), onSuccess: done }),
    /** Group registration — the same course written for many people at once. */
    bulk: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(`${URL}/bulk`, body), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`${URL}/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/${id}`), onSuccess: done }),
  }
}
