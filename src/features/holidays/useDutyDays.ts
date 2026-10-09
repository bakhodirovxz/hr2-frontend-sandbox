import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from '@/features/employees/useEmployees'

const URL = 'duty-days'

/**
 * DUTY DAYS — the people who are expected AT WORK on a day off.
 *
 * A separate register from the holidays themselves: a holiday closes the
 * organisation, a duty day names who works through it anyway, and attendance
 * reads both. v2 had the holidays half and no way at all to reach this one, so
 * a period once entered could never be corrected or removed.
 *
 * NOT the `navbatchilik` roster (`work-schedule-days`), which is a shift grid.
 */
export interface DutyDayEmployee {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  job_position?: { id?: number; name?: string | null } | null
}

export interface DutyDay {
  id: number
  date_from: string
  date_to: string
  employees: DutyDayEmployee[]
}

export function useDutyDays(page: number, size: number) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const query = useQuery({
    queryKey: [URL, { page, size, branchId }],
    queryFn: () =>
      apiGet<Page<DutyDay>>(URL, {
        organization_branch_id: branchId || undefined,
        page,
        size,
      }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetching: query.isFetching,
  }
}

export function useDutyDayMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: [URL] }),
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(URL, body) }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPut(`${URL}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/${id}`) }),
  }
}
