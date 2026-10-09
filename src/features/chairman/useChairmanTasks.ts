import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { toItems, type ListResponse } from '@/types'
import { useBranchStore } from '@/store/branchStore'

const CHAIRMAN = 'chairman-tasks'

export interface ChairmanTask {
  id: number
  title?: string | null
  description?: string | null
  participants?: string | null
  task_date?: string | null
  start_time?: string | null
  end_time?: string | null
  color?: string | null
  position?: number | null
}

/** Agenda for a single day. */
export function useChairmanTasks(date: string) {
  const q = useQuery({
    queryKey: ['chairman-tasks', date],
    queryFn: () => apiGet<ListResponse<ChairmanTask>>(CHAIRMAN, { from: date, to: date }),
  })
  const tasks = [...(toItems(q.data))].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
  return { tasks, loading: q.isLoading }
}

/**
 * Every event between two dates (inclusive) — the week grid, the list and the
 * month dots each read one range, one request. Sorted by day, then time; an
 * event without a start time («kun davomida») comes first in its day.
 */
export function useChairmanRange(from: string, to: string, enabled = true) {
  const q = useQuery({
    queryKey: ['chairman-tasks', 'range', from, to],
    queryFn: () => apiGet<ListResponse<ChairmanTask>>(CHAIRMAN, { from, to }),
    enabled,
    placeholderData: (prev) => prev,
  })
  const tasks = [...toItems(q.data)].sort(
    (a, b) => (a.task_date || '').localeCompare(b.task_date || '') || (a.start_time || '').localeCompare(b.start_time || ''),
  )
  return { tasks, loading: q.isLoading, fetching: q.isFetching }
}

export function useChairmanMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['chairman-tasks'] }),
    /**
     * The branch travels in the BODY. `get_org_branch_id` derives it from the
     * CALLER, and for a master-admin that is deliberately `None` — so without
     * this the create died on `organization_branch_required` for the only role
     * the menu used to show the module to.
     */
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiPost(CHAIRMAN, { organization_branch_id: useBranchStore.getState().selectedBranchId || null, ...body }),
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`${CHAIRMAN}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${CHAIRMAN}/${id}`) }),
  }
}
