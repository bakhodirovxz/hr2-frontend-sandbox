import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { goalStatusAction } from './useKpiOps'
import {
  KPI_GOALS_HIERARCHY,
  KPI_KEY_RESULT,
  KPI_KEY_RESULTS,
  KPI_KEY_RESULT_STATUS,
  KPI_KR_TASK,
  KPI_KR_TASKS,
  KPI_KR_TYPE,
  KPI_KR_TYPES,
  KPI_OBJECTIVE,
  KPI_OBJECTIVES,
  KPI_OBJECTIVE_COPY,
  KPI_OBJECTIVE_STATUS,
} from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'

/**
 * `kpi/goals` — Verifix `all_goal_list`: the FLAT, filterable goal list that
 * sits beside `kpi/goals/hierarchy`. The hierarchy answers "how does this goal
 * hang off the branch target"; this one answers "show me every rejected
 * department goal in the period", which a tree cannot do without the reader
 * expanding every node by hand.
 *
 * ⚠️ Declared HERE and not in `@/api/endpoints` on purpose: that file is being
 * edited by another change in flight today and a second writer would clobber
 * it. Promote this to a `KPI_GOALS` constant there once the tree is quiet —
 * the string is the only thing that needs to move.
 */
const KPI_GOALS = 'kpi/goals'

/**
 * MAQSADLAR — OKR (TZ/Verifix "BOSQICH 4").
 *
 * An objective is a goal with measurable KEY RESULTS under it, and key results
 * carry their own small task lists. The tree matters: a department objective
 * can parent personal ones, which is how a branch target turns into named
 * work — so the screen reads the hierarchy endpoint rather than flat objectives.
 */

export interface KrTask {
  id: number
  key_result_id?: number
  name?: string | null
  status?: string | null
  score?: number | null
}

export interface KeyResult {
  id: number
  objective_id?: number
  title?: string | null
  key_result_type_id?: number | null
  value_input_type?: string | null
  plan?: number | null
  fact?: number | null
  grade?: number | null
  status?: string | null
  tasks?: KrTask[]
}

export interface Objective {
  id: number
  title?: string | null
  description?: string | null
  parent_id?: number | null
  interval_id?: number | null
  /** 'P' = personal, 'D' = department. */
  goal_kind?: string | null
  division_id?: number | null
  owner_id?: number | null
  grade?: number | null
  status?: string | null
  owner?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  key_results?: KeyResult[]
}

interface HierarchyRow {
  level: number
  depth: number
  objective: Objective
}

interface KeyResultType {
  id: number
  name?: string | null
  measure?: string | null
  value_input_type?: string | null
  is_active?: boolean | null
  order_no?: number | null
}

export function useGoalHierarchy(intervalId: string, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['kpi', 'goals-hierarchy', branchId, intervalId],
    queryFn: () =>
      apiGet<HierarchyRow[]>(KPI_GOALS_HIERARCHY, {
        organization_branch_id: branchId || undefined,
        interval_id: intervalId || undefined,
      }),
    enabled,
    retry: false,
  })
  return { rows: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

/** Server-side filters of `GET /kpi/goals`; empty strings mean "no filter". */
export interface GoalListFilters {
  intervalId?: string
  ownerId?: string
  divisionId?: string
  goalKind?: string
  status?: string
  search?: string
}

/**
 * The flat goal list.
 *
 * Every filter is applied by the SERVER, never in the browser: the endpoint
 * already scopes rows to what the caller may see (`scope_query` inside
 * `OkrService.list_all_goals`), so filtering a client-side copy would both
 * duplicate that logic and quietly disagree with it the day the scope rules
 * change. The response is a plain array — this route is deliberately not
 * paginated on the server, so there is no page envelope to unwrap.
 *
 * `selectedBranchId` is part of the cache key because the axios layer injects
 * `organization_branch_id` into every request; the route does not declare that
 * param and FastAPI drops it silently, but the branch still changes WHO the
 * caller is scoped to, so cached rows must not survive a branch switch.
 */
export function useAllGoals(filters: GoalListFilters, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['kpi', 'goals-flat', branchId, filters],
    queryFn: () =>
      apiGet<Objective[]>(KPI_GOALS, {
        interval_id: filters.intervalId || undefined,
        owner_id: filters.ownerId || undefined,
        division_id: filters.divisionId || undefined,
        goal_kind: filters.goalKind || undefined,
        status: filters.status || undefined,
        search: filters.search || undefined,
      }),
    enabled,
    retry: false,
  })
  return { goals: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

export function useKeyResultTypes() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['kpi', 'kr-types', branchId],
    queryFn: () =>
      apiGet<KeyResultType[]>(KPI_KR_TYPES, { organization_branch_id: branchId || undefined }),
    staleTime: 5 * 60_000,
    retry: false,
  })
  return { types: q.data ?? [], loading: q.isLoading }
}

export function useOkrMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi'] })
  return {
    invalidate,
    createObjective: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<Objective>(KPI_OBJECTIVES, body),
      onSuccess: invalidate,
    }),
    updateObjective: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<Objective>(KPI_OBJECTIVE(id), body),
      onSuccess: invalidate,
    }),
    /* The server takes an ACTION verb, never a status letter — see
       `goalStatusAction`. `{status}` was rejected with 422 every time. */
    setObjectiveStatus: useMutation({
      mutationFn: ({ id, current, status }: { id: number; current?: string | null; status: string }) =>
        apiPost<Objective>(KPI_OBJECTIVE_STATUS(id), { action: goalStatusAction(current, status) }),
      onSuccess: invalidate,
    }),
    copyObjective: useMutation({
      // ⚠️ QUERY parameter, not body. The route declares
      // `interval_id: Optional[int] = Query(None)` and takes no body, so a
      // JSON body was silently ignored — the copy always landed in the
      // source interval. Latent today (no caller passes an interval yet), a
      // trap for the first one that does.
      mutationFn: ({ id, intervalId, deep }: { id: number; intervalId?: number; deep?: boolean }) =>
        apiPost<Objective>(KPI_OBJECTIVE_COPY(id), undefined, {
          params: {
            ...(intervalId != null ? { interval_id: intervalId } : {}),
            ...(deep ? { deep: true } : {}),
          },
        }),
      onSuccess: invalidate,
    }),
    removeObjective: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_OBJECTIVE(id)),
      onSuccess: invalidate,
    }),

    createKeyResult: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KeyResult>(KPI_KEY_RESULTS, body),
      onSuccess: invalidate,
    }),
    updateKeyResult: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KeyResult>(KPI_KEY_RESULT(id), body),
      onSuccess: invalidate,
    }),
    setKeyResultStatus: useMutation({
      mutationFn: ({ id, current, status }: { id: number; current?: string | null; status: string }) =>
        apiPost<KeyResult>(KPI_KEY_RESULT_STATUS(id), { action: goalStatusAction(current, status) }),
      onSuccess: invalidate,
    }),
    removeKeyResult: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_KEY_RESULT(id)),
      onSuccess: invalidate,
    }),

    addKrTask: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KeyResult>(KPI_KR_TASKS, body),
      onSuccess: invalidate,
    }),
    updateKrTask: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KeyResult>(KPI_KR_TASK(id), body),
      onSuccess: invalidate,
    }),
    removeKrTask: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_KR_TASK(id)),
      onSuccess: invalidate,
    }),

    createKrType: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KeyResultType>(KPI_KR_TYPES, body),
      onSuccess: invalidate,
    }),
    updateKrType: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KeyResultType>(KPI_KR_TYPE(id), body),
      onSuccess: invalidate,
    }),
    removeKrType: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_KR_TYPE(id)),
      onSuccess: invalidate,
    }),
  }
}
