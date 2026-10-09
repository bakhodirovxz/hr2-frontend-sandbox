import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'
import { useDebounce } from '@/hooks/useDebounce'

const TASKS = 'tasks-overdue'

export interface OverdueTask {
  id: number
  task_index?: string | null
  description?: string | null
  employee_id?: number | null
  deadline_date?: string | null
  task_completed?: string | null
  employee?: { id: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null } | null
}

/**
 * `GET /tasks-overdue` returns a plain array scoped to the header branch.
 *
 * `search` goes to the SERVER over task index + description + employee name.
 * The register only grows, and the server matches all three columns in ONE
 * clause, so a two-word term can find the person by one word and the task by
 * the other — which the old browser-side substring test could not do.
 */
export type IjroStatusFilter = 'open' | 'late' | 'late_done' | 'done'

/**
 * `status` and `employee_id` are filtered on the SERVER too (2026-09-25):
 * the four states used to be derived here from dates over the whole
 * downloaded register. `page`/`size` page the list view; the workload view
 * passes no page and gets every matching row (it needs them all to group).
 */
export function useOverdueTasks(args: { search?: string; status?: string; employeeId?: string; page?: number; size?: number } = {}) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = useDebounce((args.search ?? '').trim(), 300)
  const paged = args.page != null && args.size != null
  const q = useQuery({
    queryKey: ['ijro', branchId, term, args.status ?? '', args.employeeId ?? '', args.page ?? 0, args.size ?? 0],
    queryFn: () =>
      apiGet<OverdueTask[] | { items: OverdueTask[]; total: number; pages: number }>(TASKS, {
        search: term || undefined,
        status: args.status || undefined,
        employee_id: args.employeeId || undefined,
        page: paged ? args.page : undefined,
        size: paged ? args.size : undefined,
      }),
    placeholderData: (prev) => prev,
  })
  const d = q.data
  const rows = Array.isArray(d) ? d : d?.items ?? []
  return {
    rows,
    total: Array.isArray(d) ? d.length : d?.total ?? 0,
    pages: Array.isArray(d) ? 1 : d?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

/** Counts per state for the tiles — `/tasks-overdue/summary`, same filters. */
export function useIjroSummary(args: { search?: string; employeeId?: string } = {}) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = useDebounce((args.search ?? '').trim(), 300)
  const q = useQuery({
    queryKey: ['ijro', 'summary', branchId, term, args.employeeId ?? ''],
    queryFn: () =>
      apiGet<{ open: number; late: number; late_done: number; done: number; all: number }>(`${TASKS}/summary`, {
        search: term || undefined,
        employee_id: args.employeeId || undefined,
      }),
    placeholderData: (prev) => prev,
  })
  return q.data ?? { open: 0, late: 0, late_done: 0, done: 0, all: 0 }
}

export function useIjroMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['ijro'] }),
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<OverdueTask>(TASKS, body) }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<OverdueTask>(`${TASKS}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${TASKS}/${id}`) }),
  }
}
