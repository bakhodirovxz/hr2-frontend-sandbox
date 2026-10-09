import { useDebounce } from '@/hooks/useDebounce'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '@/api/http'

const HEALTH = 'health-checks'
/**
 * The nurse's screen is BRANCH-DRIVEN, not header-driven: it passes its own
 * `branch_id` and opts out of the global injection, exactly as v1 does. Sending
 * the header branch instead would 403 for a nurse whose branch is not the one
 * currently selected in the header.
 */
const NO_BRANCH = { organization_branch_id: null }

/** good | limited | unfit — the keys are the database's, only labels are ours. */
export type HealthStatus = 'good' | 'limited' | 'unfit'

export interface HealthRosterRow {
  employee_id: number
  /** The record that decides this day — needed to delete or amend it. */
  check_id?: number | null
  legal_name?: string | null
  photo_path?: string | null
  position?: string | null
  status?: HealthStatus | null
  label?: string | null
  note?: string | null
  date_from?: string | null
  date_to?: string | null
}

interface HealthAccess {
  can_check: boolean
  nurse_branch_ids: number[]
}

export function useHealthAccess(branchId: number | null) {
  const q = useQuery({
    queryKey: [HEALTH, 'access', branchId],
    queryFn: () => apiGet<HealthAccess>(`${HEALTH}/access`, { organization_branch_id: branchId }),
    staleTime: 5 * 60_000,
  })
  return { access: q.data ?? null, loading: q.isLoading }
}

/** `search` narrows on the SERVER (name / position, with Cyrillic folding). */
export function useHealthRoster(branchId: number | null, day: string, search = '') {
  const term = useDebounce(search.trim(), 300)
  const q = useQuery({
    enabled: !!branchId && !!day,
    queryKey: [HEALTH, 'roster', branchId, day, term],
    queryFn: () => apiGet<HealthRosterRow[]>(`${HEALTH}/roster`, { ...NO_BRANCH, branch_id: branchId, day, search: term || undefined }),
    placeholderData: (prev) => prev,
  })
  return { rows: q.data ?? [], loading: q.isLoading, fetching: q.isFetching }
}

export function useHealthMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [HEALTH] })

  const grade = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(HEALTH, body, { params: NO_BRANCH }),
    onSuccess: done,
  })
  /**
   * The shift's most repeated action is "everyone is fit except two people", so
   * the nurse marks the exceptions first and closes the rest in one press. The
   * server writes each row separately and reports the ones it could not.
   */
  const bulkGrade = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<{ ok?: number[]; failed?: { id: number; error: string }[] }>(`${HEALTH}/bulk-grade`, body, {
        params: NO_BRANCH,
      }),
    onSuccess: done,
  })
  const removeCheck = useMutation({
    mutationFn: (id: number) => apiDelete(`${HEALTH}/${id}`, { params: NO_BRANCH }),
    onSuccess: done,
  })
  return { grade, bulkGrade, removeCheck }
}
