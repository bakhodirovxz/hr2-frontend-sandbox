import { useCallback, useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { downloadFile, XLSX_MIME } from '@/lib/download'
import { useBranchStore } from '@/store/branchStore'

/*
 * KPI (TZ 4.2.8, K1, K3) — sandbox backend `app/api/v1/kpi.py`.
 *
 * Six tables behind it: indicators (the «asos» catalogue, branch / department /
 * global justification scope), entries (one person × indicator × period, plan
 * and fact, N → I → D), intervals (evaluation periods), performances (the
 * scorecard of one person in one interval) with their arguments (entries that
 * add to or subtract from the result) and stored reports.
 *
 * Every write is the manager's (`canWriteOrg('kpi')`) AND the KPI grant matrix
 * (`kpi/my-permissions`) — the screens draw a button only when both allow it.
 * The selected organisation travels on its own: the API client adds
 * `organization_branch_id` to every request (`api/branchParam.ts`), so it only
 * has to be part of the query keys.
 */

// ─── Paths ────────────────────────────────────────────────────────────────────

export const KPI = {
  indicators: 'kpi/indicators',
  indicator: (id: number) => `kpi/indicators/${id}`,
  justifications: 'kpi/justifications',
  justification: (id: number) => `kpi/justifications/${id}`,
  entries: 'kpi/entries',
  entry: (id: number) => `kpi/entries/${id}`,
  entryStatus: (id: number) => `kpi/entries/${id}/status`,
  entryRecompute: (id: number) => `kpi/entries/${id}/recompute`,
  intervals: 'kpi/intervals',
  interval: (id: number) => `kpi/intervals/${id}`,
  intervalGenerate: (id: number) => `kpi/intervals/${id}/generate-scorecards`,
  intervalFinalize: (id: number) => `kpi/intervals/${id}/finalize`,
  performances: 'kpi/performances',
  performance: (id: number) => `kpi/performances/${id}`,
  performancesBulk: 'kpi/performances/bulk',
  performancesBulkStatus: 'kpi/performances/bulk-status',
  performanceCopy: (id: number) => `kpi/performances/${id}/copy`,
  performanceStatus: (id: number) => `kpi/performances/${id}/status`,
  performanceRecompute: (id: number) => `kpi/performances/${id}/recompute`,
  performanceArguments: (id: number) => `kpi/performances/${id}/arguments`,
  performanceFillArguments: (id: number) => `kpi/performances/${id}/fill-arguments`,
  argument: (id: number) => `kpi/arguments/${id}`,
  myScorecard: 'kpi/my-scorecard',
  myTeam: 'kpi/my-team',
  myPermissions: 'kpi/my-permissions',
  reports: 'kpi/reports',
  report: (id: number) => `kpi/reports/${id}`,
  reportData: (id: number) => `kpi/reports/${id}/data`,
  reportDownload: (id: number) => `kpi/reports/${id}/download`,
  exportEntries: 'kpi/export/entries',
  exportPerformances: 'kpi/export/performances',
  exportMyScorecard: 'kpi/export/my-scorecard',
  generateMonthEntries: 'kpi/generate-current-month-entries',
  generateMonthScorecards: 'kpi/generate-current-month',
  seedDefaultIndicators: 'kpi/seed-default-indicators',
} as const

// ─── Wire types (schemas/kpi.py) ──────────────────────────────────────────────

export type Direction = 'M' | 'L'
export type PeriodType = 'month' | 'quarter' | 'year'
export type ValueType = 'quantitative' | 'qualitative'
export type IndicatorScope = 'branch' | 'global' | 'department'
/** N/I/D; `draft`/`locked` are the older spellings of N and D. */
export type EntryStatus = 'N' | 'I' | 'D' | 'draft' | 'locked'
export type PerfStatus = 'N' | 'I' | 'D'
export type StatusAction = 'set_in_progress' | 'set_done' | 'clear_done' | 'clear_in_progress'

export interface KpiAssignees {
  employee_ids: number[]
  department_ids: number[]
  position_categories: string[]
}

export interface KpiIndicator {
  id: number
  name: string | null
  description?: string | null
  direction: Direction | null
  measure?: string | null
  unit?: string | null
  value_type?: ValueType | null
  target_value?: number | null
  threshold_low?: number | null
  threshold_high?: number | null
  weight?: number | null
  max_percent?: number | null
  group_name?: string | null
  is_active?: boolean | null
  scope?: IndicatorScope | null
  period_type?: PeriodType | null
  is_justification?: boolean | null
  order_no?: number | null
  organization_branch_id?: number | null
  organization_branch_name?: string | null
  department_id?: number | null
  /** `{employee_ids, department_ids, position_categories, employees:[{id, legal_name}]}` */
  assignees?: (Partial<KpiAssignees> & { employees?: { id: number; legal_name?: string | null }[] }) | null
}

export interface KpiEmployeeMin {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  supervisor_id?: number | null
}

export interface KpiEntryAccess {
  is_owner: boolean
  edit_access: boolean
  fact_insert_access: boolean
  status_change_access: boolean
  task_approve_access: boolean
  manage_access: boolean
}

export interface KpiEntry {
  id: number
  indicator_id: number
  employee_id: number
  period_start: string
  period_end: string
  plan_value: number | null
  fact_value: number | null
  result_coef?: number | null
  result_percent: number | null
  status: EntryStatus | null
  note?: string | null
  organization_branch_id?: number | null
  division_id?: number | null
  department_name?: string | null
  indicator?: KpiIndicator | null
  employee?: KpiEmployeeMin | null
  my_access?: KpiEntryAccess | null
}

export interface KpiInterval {
  id: number
  name: string | null
  begin_date: string
  end_date: string
  is_active?: boolean | null
  organization_branch_id?: number | null
  period_type?: PeriodType | null
}

export interface KpiArgument {
  id: number
  performance_id: number
  source_type: 'K'
  source_entry_id: number | null
  weight: number | null
  operation: 'A' | 'S'
  sort_order?: number | null
  source_entry?: KpiEntry | null
}

export interface KpiPerformance {
  id: number
  employee_id: number
  interval_id: number | null
  result_coef?: number | null
  result_percent: number | null
  weights_sum?: number | null
  live_result_percent?: number | null
  live_fact_weight?: number | null
  status: PerfStatus | null
  organization_branch_id?: number | null
  employee?: KpiEmployeeMin | null
  interval?: KpiInterval | null
  arguments: KpiArgument[]
  department_name?: string | null
}

export interface KpiPerformanceDetail extends KpiPerformance {
  employee_profile?: {
    id?: number | null
    legal_name?: string | null
    photo_path?: string | null
    job_position_name?: string | null
    department_name?: string | null
    supervisor_name?: string | null
  } | null
}

export interface KpiScorecard {
  employee_id: number | null
  result_percent: number | null
  period: string | null
  available_periods: string[]
  entries: KpiEntry[]
  profile?: {
    id?: number | null
    legal_name?: string | null
    photo_path?: string | null
    job_position_name?: string | null
    department_name?: string | null
    supervisor_name?: string | null
    work_schedule?: string | null
    period_begin?: string | null
    period_end?: string | null
  } | null
}

export interface KpiTeamMember {
  employee_id: number
  legal_name: string | null
  photo_path?: string | null
  job_position_name?: string | null
  department_name?: string | null
  result_percent: number | null
  entries_count: number
  pending_tasks: number
  all_done: boolean
}

export interface KpiTeam {
  period_begin: string
  period_end: string
  employees: KpiTeamMember[]
}

export interface KpiPermissions {
  roles: string[]
  /** screen → actions; `*` opens the screen itself. */
  grants: Record<string, string[]>
}

export type ReportType = 'individual' | 'department' | 'summary'
export type ReportGroupBy = '' | 'employee' | 'department' | 'indicator' | 'group'

export interface KpiReport {
  id: number
  title: string | null
  period_start: string
  period_end: string
  filters?: {
    report_type?: ReportType
    period_type?: string | null
    group_by?: ReportGroupBy
    sort?: string | null
    [k: string]: unknown
  } | null
  row_count?: number | null
  created_at?: string | null
}

export interface KpiReportInput {
  title?: string
  period_start: string
  period_end: string
  report_type: ReportType
  period_type?: string
  division_ids?: number[]
  job_position_ids?: number[]
  employee_ids?: number[]
  group_names?: string[]
  indicator_ids?: number[]
  group_by?: ReportGroupBy
  sort?: string
}

export interface KpiReportData {
  report_type: ReportType
  columns: { key: string; label: string; type: 'string' | 'number' }[]
  rows: Record<string, unknown>[]
  chart: {
    x: string
    series: string[]
    data: { label: string | null; plan: number | null; fact: number | null; penalty: number | null; percent: number | null }[]
  }
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

export interface GenerateResult {
  created?: number
  skipped?: number
  total_employees?: number
  failed?: number
  missing?: number
}

// ─── Small helpers ────────────────────────────────────────────────────────────

/** A «jarima» row: «less is better» with no target — the fact IS the penalty (TZ 2162). */
export const isPenalty = (ind?: KpiIndicator | null) =>
  (ind?.direction ?? 'M') === 'L' && (ind?.target_value == null)

export const isDoneStatus = (s?: string | null) => s === 'D' || s === 'locked'

/** Which status moves the lifecycle allows from `status` (KpiStatusMenu in v1). */
export function statusActions(status?: string | null): StatusAction[] {
  if (status === 'I') return ['set_done', 'clear_in_progress']
  if (status === 'D' || status === 'locked') return ['clear_done']
  return ['set_in_progress', 'set_done']
}

/** «YYYY-MM» → the month's first and last day. */
export function monthRange(ym?: string | null): { from?: string; to?: string } {
  if (!ym) return {}
  const d = dayjs(`${ym}-01`)
  if (!d.isValid()) return {}
  return { from: d.format('YYYY-MM-DD'), to: d.endOf('month').format('YYYY-MM-DD') }
}

/** The period of `type` around `anchor` (a date) — begin/end ISO dates. */
export function periodBounds(type: PeriodType, anchor?: string | null): { begin: string; end: string } | null {
  const d = anchor ? dayjs(String(anchor).slice(0, 10)) : dayjs()
  if (!d.isValid()) return null
  if (type === 'year') return { begin: d.startOf('year').format('YYYY-MM-DD'), end: d.endOf('year').format('YYYY-MM-DD') }
  if (type === 'quarter') {
    const q = Math.floor(d.month() / 3)
    const b = d.month(q * 3).startOf('month')
    return { begin: b.format('YYYY-MM-DD'), end: b.add(2, 'month').endOf('month').format('YYYY-MM-DD') }
  }
  return { begin: d.startOf('month').format('YYYY-MM-DD'), end: d.endOf('month').format('YYYY-MM-DD') }
}

/** The period type an interval's dates form (`period_type` when the server gives it). */
export function intervalType(iv?: Pick<KpiInterval, 'period_type' | 'begin_date' | 'end_date'> | null): PeriodType | '' {
  if (!iv) return ''
  if (iv.period_type) return iv.period_type
  const b = String(iv.begin_date ?? '').slice(0, 10)
  const e = String(iv.end_date ?? '').slice(0, 10)
  if (!b || !e) return ''
  return (['month', 'quarter', 'year'] as const).find((t) => {
    const r = periodBounds(t, b)
    return r && r.begin === b && r.end === e
  }) ?? ''
}

export const fmtDay = (iso?: string | null) => (iso ? dayjs(String(iso).slice(0, 10)).format('DD.MM.YYYY') : '—')

export const num = (v?: number | null) => (v == null ? '—' : String(Number(v)))

export const pct = (v?: number | null) => (v == null ? '—' : `${Math.round(Number(v))}%`)

/** Result colour band (v1 `percentColor`): ≥100 success, ≥80 info, ≥50 warning, else danger. */
export function percentTone(v?: number | null): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  if (v == null) return 'neutral'
  if (v >= 100) return 'success'
  if (v >= 80) return 'info'
  if (v >= 50) return 'warning'
  return 'danger'
}

/** Empty `assignees` → full shape. */
export function normalizeAssignees(raw?: KpiIndicator['assignees']): KpiAssignees {
  const a = raw ?? {}
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== '' && x !== undefined) : [])
  return {
    employee_ids: ids(a.employee_ids).map(Number).filter((n) => !Number.isNaN(n)),
    department_ids: ids(a.department_ids).map(Number).filter((n) => !Number.isNaN(n)),
    position_categories: ids(a.position_categories).map(String),
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const useBranch = () => useBranchStore((s) => s.selectedBranchId)

/** The KPI grant matrix of the caller; `can(screen, action)` gates a button. */
export function useKpiPermissions(enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'my-permissions'],
    queryFn: () => apiGet<KpiPermissions>(KPI.myPermissions),
    enabled,
    staleTime: 5 * 60_000,
  })
  const grants = q.data?.grants
  const can = useCallback(
    (screen: string, action = '*') => !!grants?.[screen]?.includes(action),
    [grants],
  )
  return { can, roles: q.data?.roles ?? [], loading: q.isLoading }
}

export function useIndicators(params: { only_active?: boolean } = {}, enabled = true) {
  const branch = useBranch()
  const q = useQuery({
    queryKey: ['kpi', 'indicators', branch, params],
    queryFn: () => apiGet<KpiIndicator[]>(KPI.indicators, { only_active: params.only_active || undefined }),
    enabled,
  })
  return { indicators: q.data ?? [], loading: q.isLoading, error: q.error, refetch: q.refetch }
}

export function useJustifications(enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'justifications'],
    queryFn: () => apiGet<KpiIndicator[]>(KPI.justifications),
    enabled,
  })
  return { rows: q.data ?? [], loading: q.isLoading, error: q.error, refetch: q.refetch }
}

export interface EntryFilters {
  search?: string
  indicator_id?: string
  employee_id?: number | string
  department_id?: string
  job_position_id?: string
  status?: string
  from?: string
  to?: string
}

const entryParams = (f: EntryFilters) => ({
  search: f.search?.trim() || undefined,
  indicator_id: f.indicator_id || undefined,
  employee_id: f.employee_id || undefined,
  department_id: f.department_id || undefined,
  job_position_id: f.job_position_id || undefined,
  status: f.status || undefined,
  from: f.from || undefined,
  to: f.to || undefined,
})

export function useEntries(f: EntryFilters & { page?: number; size?: number }, enabled = true) {
  const branch = useBranch()
  const q = useQuery({
    queryKey: ['kpi', 'entries', branch, f],
    queryFn: () => apiGet<Page<KpiEntry>>(KPI.entries, { ...entryParams(f), page: f.page ?? 1, size: f.size ?? 25 }),
    enabled,
    placeholderData: keepPreviousData,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useEntry(id: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'entry', id],
    queryFn: () => apiGet<KpiEntry>(KPI.entry(id as number)),
    enabled: id != null,
    retry: false,
  })
  return { entry: q.data ?? null, loading: q.isLoading, error: q.error }
}

export function useIntervals(enabled = true) {
  const branch = useBranch()
  const q = useQuery({
    queryKey: ['kpi', 'intervals', branch],
    queryFn: () => apiGet<KpiInterval[]>(KPI.intervals),
    enabled,
  })
  return { intervals: q.data ?? [], loading: q.isLoading, error: q.error }
}

export interface PerformanceFilters {
  interval_id?: string
  search?: string
  department_id?: string
  status?: string
}

const perfParams = (f: PerformanceFilters) => ({
  interval_id: f.interval_id || undefined,
  search: f.search?.trim() || undefined,
  department_id: f.department_id || undefined,
  status: f.status || undefined,
})

export function usePerformances(f: PerformanceFilters & { page?: number; size?: number }, enabled = true) {
  const branch = useBranch()
  const q = useQuery({
    queryKey: ['kpi', 'performances', branch, f],
    queryFn: () => apiGet<Page<KpiPerformance>>(KPI.performances, { ...perfParams(f), page: f.page ?? 1, size: f.size ?? 25 }),
    enabled,
    placeholderData: keepPreviousData,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

export function usePerformance(id: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'performance', id],
    queryFn: () => apiGet<KpiPerformanceDetail>(KPI.performance(id as number)),
    enabled: id != null,
    retry: false,
  })
  return { perf: q.data ?? null, loading: q.isLoading, error: q.error, refetch: q.refetch }
}

/**
 * A person's KPI window (`my-scorecard`). `employeeId` null = the caller —
 * which answers 400 `not_an_employee` for a login without an employee card,
 * so callers pass `enabled` accordingly.
 */
export function useScorecard(employeeId: number | null, period: string | null, enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'scorecard', employeeId, period],
    queryFn: () =>
      apiGet<KpiScorecard>(KPI.myScorecard, {
        employee_id: employeeId ?? undefined,
        period: period ?? undefined,
        organization_branch_id: null,
      }),
    enabled,
    retry: false,
    placeholderData: keepPreviousData,
  })
  const status = (q.error as { response?: { status?: number } } | null)?.response?.status
  return { scorecard: q.data ?? null, loading: q.isLoading, error: q.error, denied: status === 403 || status === 404 }
}

export function useMyTeam(period: string | null, enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'my-team', period],
    queryFn: () => apiGet<KpiTeam>(KPI.myTeam, { period: period ?? undefined, organization_branch_id: null }),
    enabled,
    staleTime: 60_000,
  })
  return { team: q.data ?? null, members: q.data?.employees ?? [], loading: q.isLoading }
}

export function useReports(enabled = true) {
  const branch = useBranch()
  const q = useQuery({
    queryKey: ['kpi', 'reports', branch],
    queryFn: () => apiGet<KpiReport[]>(KPI.reports),
    enabled,
  })
  return { reports: q.data ?? [], loading: q.isLoading, error: q.error, refetch: q.refetch }
}

export function useReportData(id: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'report-data', id],
    queryFn: () => apiGet<KpiReportData>(KPI.reportData(id as number)),
    enabled: id != null,
    retry: false,
  })
  return { data: q.data ?? null, loading: q.isLoading, error: q.error }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export type IndicatorInput = Partial<Omit<KpiIndicator, 'id' | 'assignees'>> & { assignees?: KpiAssignees }

export function useKpiMutations() {
  const qc = useQueryClient()
  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['kpi'] })
    // The dashboard's «my KPI» tile reads the same scorecard.
    void qc.invalidateQueries({ queryKey: ['board', 'my-scorecard'] })
  }, [qc])
  const opts = { onSuccess: invalidate }

  return {
    invalidate,
    // Indicators (K1)
    createIndicator: useMutation({
      mutationFn: (body: IndicatorInput) => apiPost<KpiIndicator>(KPI.indicators, body),
      ...opts,
    }),
    updateIndicator: useMutation({
      mutationFn: ({ id, body }: { id: number; body: IndicatorInput }) => apiPatch<KpiIndicator>(KPI.indicator(id), body),
      ...opts,
    }),
    deleteIndicator: useMutation({ mutationFn: (id: number) => apiDelete(KPI.indicator(id)), ...opts }),
    seedDefaultIndicators: useMutation({
      mutationFn: () => apiPost<{ created_indicators: number; branches: number }>(KPI.seedDefaultIndicators),
      ...opts,
    }),
    // Central justifications (4.2.8 · 2161) — master admin only
    createJustification: useMutation({
      mutationFn: (body: IndicatorInput) => apiPost<KpiIndicator>(KPI.justifications, body, { params: { organization_branch_id: null } }),
      ...opts,
    }),
    updateJustification: useMutation({
      mutationFn: ({ id, body }: { id: number; body: IndicatorInput }) => apiPatch<KpiIndicator>(KPI.justification(id), body),
      ...opts,
    }),
    deleteJustification: useMutation({ mutationFn: (id: number) => apiDelete(KPI.justification(id)), ...opts }),
    // Entries
    createEntry: useMutation({
      mutationFn: (body: {
        indicator_id: number
        employee_id: number
        period_start: string
        period_end: string
        plan_value: number
        fact_value: number
        note?: string | null
      }) => apiPost<KpiEntry>(KPI.entries, body),
      ...opts,
    }),
    updateEntry: useMutation({
      mutationFn: ({ id, body }: { id: number; body: { plan_value?: number; fact_value?: number; note?: string | null } }) =>
        apiPatch<KpiEntry>(KPI.entry(id), body),
      ...opts,
    }),
    deleteEntry: useMutation({ mutationFn: (id: number) => apiDelete(KPI.entry(id)), ...opts }),
    entryStatus: useMutation({
      mutationFn: ({ id, action }: { id: number; action: StatusAction }) => apiPost<KpiEntry>(KPI.entryStatus(id), { action }),
      ...opts,
    }),
    recomputeEntry: useMutation({ mutationFn: (id: number) => apiPost<KpiEntry>(KPI.entryRecompute(id)), ...opts }),
    generateMonthEntries: useMutation({
      mutationFn: () => apiPost<GenerateResult>(KPI.generateMonthEntries),
      ...opts,
    }),
    // Intervals
    createInterval: useMutation({
      mutationFn: (body: Omit<KpiInterval, 'id'>) => apiPost<KpiInterval>(KPI.intervals, body),
      ...opts,
    }),
    updateInterval: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<KpiInterval> }) => apiPatch<KpiInterval>(KPI.interval(id), body),
      ...opts,
    }),
    deleteInterval: useMutation({ mutationFn: (id: number) => apiDelete(KPI.interval(id)), ...opts }),
    generateScorecards: useMutation({
      mutationFn: (intervalId: number) => apiPost<GenerateResult>(KPI.intervalGenerate(intervalId)),
      ...opts,
    }),
    finalizeInterval: useMutation({
      mutationFn: (intervalId: number) =>
        apiPost<{ locked_entries: number; finalized_performances: number }>(KPI.intervalFinalize(intervalId)),
      ...opts,
    }),
    generateMonthScorecards: useMutation({
      mutationFn: () => apiPost<GenerateResult>(KPI.generateMonthScorecards),
      ...opts,
    }),
    // Performances (scorecards)
    createPerformance: useMutation({
      mutationFn: (body: { employee_id: number; interval_id?: number | null }) => apiPost<KpiPerformance>(KPI.performances, body),
      ...opts,
    }),
    createPerformancesBulk: useMutation({
      mutationFn: (body: { employee_ids: number[]; interval_id?: number | null }) => apiPost<GenerateResult>(KPI.performancesBulk, body),
      ...opts,
    }),
    copyPerformance: useMutation({
      mutationFn: ({ id, body }: { id: number; body: { employee_ids?: number[]; interval_id?: number | null } }) =>
        apiPost<GenerateResult>(KPI.performanceCopy(id), body),
      ...opts,
    }),
    deletePerformance: useMutation({ mutationFn: (id: number) => apiDelete(KPI.performance(id)), ...opts }),
    performanceStatus: useMutation({
      mutationFn: ({ id, action }: { id: number; action: StatusAction }) =>
        apiPost<KpiPerformance>(KPI.performanceStatus(id), { action }),
      ...opts,
    }),
    performancesBulkStatus: useMutation({
      mutationFn: (body: { ids: number[]; action: StatusAction }) =>
        apiPost<{ changed: number; total: number }>(KPI.performancesBulkStatus, body),
      ...opts,
    }),
    recomputePerformance: useMutation({
      mutationFn: (id: number) => apiPost<KpiPerformance>(KPI.performanceRecompute(id)),
      ...opts,
    }),
    addArgument: useMutation({
      mutationFn: ({ perfId, body }: { perfId: number; body: { source_entry_id: number; weight?: number | null; operation: 'A' | 'S' } }) =>
        apiPost<KpiPerformance>(KPI.performanceArguments(perfId), { source_type: 'K', ...body }),
      ...opts,
    }),
    fillArguments: useMutation({
      mutationFn: (perfId: number) => apiPost<KpiPerformance>(KPI.performanceFillArguments(perfId)),
      ...opts,
    }),
    updateArgument: useMutation({
      mutationFn: ({ id, body }: { id: number; body: { weight?: number; operation?: 'A' | 'S' } }) =>
        apiPatch<KpiPerformance>(KPI.argument(id), body),
      ...opts,
    }),
    deleteArgument: useMutation({ mutationFn: (id: number) => apiDelete<KpiPerformance>(KPI.argument(id)), ...opts }),
    // Reports (K3)
    createReport: useMutation({
      mutationFn: (body: KpiReportInput) => apiPost<KpiReport>(KPI.reports, body),
      ...opts,
    }),
    deleteReport: useMutation({ mutationFn: (id: number) => apiDelete(KPI.report(id)), ...opts }),
  }
}

// ─── Files ────────────────────────────────────────────────────────────────────

const stamp = () => dayjs().format('DD.MM.YYYY')

/** «Natijalar» as Excel — the list's own filters, so the file is what is on screen. */
export const exportEntries = (f: EntryFilters) =>
  downloadFile({ url: KPI.exportEntries, params: entryParams(f), mime: XLSX_MIME, filename: `kpi_natijalar_${stamp()}.xlsx` })

export const exportPerformances = (f: PerformanceFilters) =>
  downloadFile({
    url: KPI.exportPerformances,
    params: perfParams(f),
    mime: XLSX_MIME,
    filename: `kpi_baholash_varaqalari_${stamp()}.xlsx`,
  })

export const exportScorecard = (employeeId: number | null, period: string | null) =>
  downloadFile({
    url: KPI.exportMyScorecard,
    params: { employee_id: employeeId ?? undefined, period: period ?? undefined, organization_branch_id: null },
    mime: XLSX_MIME,
    filename: `kpi_xodim_${period ?? stamp()}.xlsx`,
  })

const REPORT_MIME: Record<'xlsx' | 'pdf' | 'docx', string> = {
  xlsx: XLSX_MIME,
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export const downloadReport = (id: number, format: 'xlsx' | 'pdf' | 'docx') =>
  downloadFile({
    url: KPI.reportDownload(id),
    params: { format },
    mime: REPORT_MIME[format],
    filename: `kpi_hisobot_${id}.${format}`,
  })

/** Group names come from the indicators themselves (there is no group catalogue). */
export function useGroupNames(indicators: KpiIndicator[]) {
  return useMemo(
    () => [...new Set(indicators.map((i) => i.group_name).filter((g): g is string => !!g))].sort(),
    [indicators],
  )
}
