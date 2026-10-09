import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  KPI_ARGUMENT,
  KPI_ENTRY_CALC_TRAIL,
  KPI_ENTRY_EXTERNAL_VALUE,
  KPI_ENTRY_HISTORY,
  KPI_AUDIT,
  KPI_ENTRY_RECOMPUTE,
  KPI_ENTRY_STATUS,
  KPI_GENERATE_CURRENT_MONTH,
  KPI_GENERATE_MONTH_ENTRIES,
  KPI_PERFORMANCE_ARGUMENTS,
  KPI_PERFORMANCE_FILL_ARGUMENTS,
  KPI_PERFORMANCE_RECOMPUTE,
  KPI_PERFORMANCE_STATUS,
  KPI_TASK_REVIEW,
  KPI_TASK_SUBMIT,
} from '@/api/endpoints'

/**
 * The KPI operations v2 was missing next to v1: moving an entry through its
 * status chain, recomputing it, reading WHY it came out the way it did, and
 * the same three for a scorecard.
 *
 * The calculation trail matters more than it looks: a KPI figure nobody can
 * explain is a figure nobody accepts, and the whole point of the Verifix
 * engine is that every number can be traced back to its arguments.
 */

/* ── Yozuv (entry) ─────────────────────────────────────────────────────── */

/**
 * One argument the engine used, EXACTLY as `KpiCalcTrailRow` sends it.
 *
 * ⚠️ These names were previously guessed (`variable_code`, `variable_name`,
 * `source`, `is_external`) and the server sends none of them: the panel drew a
 * row number instead of the variable, an em dash for every source, and the
 * in-place edit button — gated on `is_external` — could never appear at all.
 * `target` is the side of the formula the argument feeds ('F' = fact by
 * default); an argument with no `measure` is one the engine cannot read by
 * itself, which is precisely the one a human may type in.
 */
export interface CalcTrailRow {
  target?: string | null
  identifier?: string | null
  name?: string | null
  measure?: string | null
  value?: number | string | null
}

/** A row of `KpiEntryHistoryRead` — the entry's official audit trail. */
export interface EntryHistoryRow {
  id: number
  entry_id?: number | null
  event?: string | null
  note?: string | null
  changed_by_name?: string | null
  status?: string | null
  plan_value?: number | null
  fact_value?: number | null
  plan_manual?: number | null
  fact_manual?: number | null
  result_coef?: number | null
  result_percent?: number | null
  created_at?: string | null
}

/**
 * Status letter the UI shows → the ACTION verb the server accepts.
 *
 * ⚠️ The API never took a status: `KpiStatusAction` carries `action`
 * (`set_in_progress` / `set_done` / `clear_done` / `clear_in_progress`) and
 * rejects anything else with 422. Sending `{status}` meant every status
 * dropdown in KPI failed silently-looking — the row simply never changed.
 * Which verb applies depends on where the row is NOW: reaching 'I' from a
 * finished row is a `clear_done` (an undo), from a draft it is `set_in_progress`.
 */
function entryStatusAction(current: string | null | undefined, next: string): string {
  const from = (current || '').toUpperCase()
  if (next === 'N') return 'clear_in_progress'
  if (next === 'D') return 'set_done'
  return from === 'D' || from === 'LOCKED' ? 'clear_done' : 'set_in_progress'
}

/** Same idea for goals (objectives / key results), which add 'R' = rejected. */
export function goalStatusAction(current: string | null | undefined, next: string): string {
  const from = (current || '').toUpperCase()
  if (next === 'F') return 'clear_in_progress'
  if (next === 'D') return 'set_done'
  if (next === 'R') return 'set_rejected'
  if (from === 'D') return 'clear_done'
  if (from === 'R') return 'clear_rejected'
  return 'set_in_progress'
}

export function useEntryCalcTrail(entryId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'calc-trail', entryId],
    queryFn: () => apiGet<CalcTrailRow[]>(KPI_ENTRY_CALC_TRAIL(entryId as number)),
    enabled: !!entryId && enabled,
    retry: false,
  })
  return { rows: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

export function useEntryHistory(entryId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'entry-history', entryId],
    queryFn: () => apiGet<EntryHistoryRow[]>(KPI_ENTRY_HISTORY(entryId as number)),
    enabled: !!entryId && enabled,
    retry: false,
  })
  return { rows: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

/** A row of the branch-wide journal (`GET /kpi/audit`), history + context. */
export interface KpiAuditRow extends EntryHistoryRow {
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  department_name?: string | null
  indicator_name?: string | null
  period_start?: string | null
  period_end?: string | null
  prev?: {
    status?: string | null
    plan_value?: number | null
    fact_value?: number | null
    plan_manual?: number | null
    fact_manual?: number | null
    result_coef?: number | null
    result_percent?: number | null
  } | null
}

export interface KpiAuditFilters {
  search?: string
  from?: string
  to?: string
  employeeId?: string
  departmentId?: string
  event?: string
  status?: string
  page: number
  size: number
}

/** Source `hpm/audit/kpi_audit`: every KPI change in the branch, newest first. */
export function useKpiAudit(f: KpiAuditFilters, { enabled = true }: { enabled?: boolean } = {}) {
  const q = useQuery({
    enabled,
    queryKey: ['kpi', 'audit', f],
    queryFn: () =>
      apiGet<{ items: KpiAuditRow[]; total: number; pages: number }>(KPI_AUDIT, {
        search: f.search || undefined,
        from: f.from || undefined,
        to: f.to || undefined,
        employee_id: f.employeeId || undefined,
        department_id: f.departmentId || undefined,
        event: f.event || undefined,
        status: f.status || undefined,
        page: f.page,
        size: f.size,
      }),
    retry: false,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useKpiOps() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi'] })

  return {
    invalidate,
    /* Entry */
    setEntryStatus: useMutation({
      mutationFn: ({ id, current, status }: { id: number; current?: string | null; status: string }) =>
        apiPost(KPI_ENTRY_STATUS(id), { action: entryStatusAction(current, status) }),
      onSuccess: invalidate,
    }),
    recomputeEntry: useMutation({
      mutationFn: (id: number) => apiPost(KPI_ENTRY_RECOMPUTE(id), {}),
      onSuccess: invalidate,
    }),
    /* `identifier` + `target` name the argument inside the formula; `value` is
       REQUIRED (float), so an empty box is rejected rather than sent as null. */
    setExternalValue: useMutation({
      mutationFn: ({ id, identifier, target, value }: {
        id: number
        identifier: string
        target?: string | null
        value: number
      }) => apiPost(KPI_ENTRY_EXTERNAL_VALUE(id), { identifier, target: target || 'F', value }),
      onSuccess: invalidate,
    }),
    /* Tasks — v2 only had set-status / set-grade */
    submitTask: useMutation({
      mutationFn: (id: number) => apiPost(KPI_TASK_SUBMIT(id), {}),
      onSuccess: invalidate,
    }),
    /* `KpiTaskReview` wants a verb plus the grade or the reason — a boolean
       `approved` was dropped on the floor and the note with it. */
    reviewTask: useMutation({
      mutationFn: ({ id, approved, score, note }: {
        id: number
        approved: boolean
        score?: number | null
        note?: string
      }) =>
        apiPost(KPI_TASK_REVIEW(id), {
          action: approved ? 'confirm' : 'reject',
          score: approved ? (score ?? null) : null,
          review_note: note || null,
        }),
      onSuccess: invalidate,
    }),
    /* Scorecard (performance) */
    recomputePerformance: useMutation({
      mutationFn: (id: number) => apiPost(KPI_PERFORMANCE_RECOMPUTE(id), {}),
      onSuccess: invalidate,
    }),
    setPerformanceStatus: useMutation({
      mutationFn: ({ id, current, status }: { id: number; current?: string | null; status: string }) =>
        apiPost(KPI_PERFORMANCE_STATUS(id), { action: entryStatusAction(current, status) }),
      onSuccess: invalidate,
    }),
    addArgument: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPost(KPI_PERFORMANCE_ARGUMENTS(id), body),
      onSuccess: invalidate,
    }),
    updateArgument: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(KPI_ARGUMENT(id), body),
      onSuccess: invalidate,
    }),
    removeArgument: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_ARGUMENT(id)),
      onSuccess: invalidate,
    }),
    /** Pulls the arguments the engine can read by itself (attendance, tasks…). */
    fillArguments: useMutation({
      mutationFn: (id: number) => apiPost(KPI_PERFORMANCE_FILL_ARGUMENTS(id), {}),
      onSuccess: invalidate,
    }),
    /* Monthly generation */
    generateMonthScorecards: useMutation({
      mutationFn: () => apiPost<{ created?: number }>(KPI_GENERATE_CURRENT_MONTH, {}),
      onSuccess: invalidate,
    }),
    generateMonthEntries: useMutation({
      mutationFn: () => apiPost<{ created?: number }>(KPI_GENERATE_MONTH_ENTRIES, {}),
      onSuccess: invalidate,
    }),
  }
}
