import { fetchAllPages } from '@/api/fetchAll'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import {
  DASHBOARD_AGE_STATS,
  DASHBOARD_CARDS_SUMMARY,
  DASHBOARD_EMPLOYEE_KPI,
  DASHBOARD_KPI_MONTHLY_AVERAGE,
  DASHBOARD_NATIONALITY_STATS,
  DASHBOARD_TASK_EXECUTION_ATTENDANCE,
} from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from './useEmployees'

/** One employee row in the KPI overview. */
export interface EmployeeKpiRow {
  id: number
  legal_name: string
  photo_path?: string | null
  /**
   * ⚠️ USE THIS FOR THE ROW AVATAR, not `photo_path`. Measured 2026-09-10: the
   * roster drew 34px avatars from the full-size originals and pulled ~690 KB of
   * photos from MinIO on one page (one of them 254 KB on its own).
   */
  photo_thumb_path?: string | null
  department_id?: number | null
  department_name?: string | null
  job_position_name?: string | null
  /**
   * Filial bo'yicha so'ralgan ro'yxatda shu filialdagi ish o'rnining turi.
   * `internal_concurrent` = o'rindosh: yuqoridagi bo'lim/lavozim ham SHU
   * filialniki (backend almashtiradi), asosiy ish joyi esa boshqa filialda.
   */
  employment_type?: 'main' | 'internal_concurrent' | 'external_concurrent' | null
  /** May the viewer PATCH this card (server: `stamp_can_edit`). */
  can_edit?: boolean | null
  completed_tasks_count: number
  overuded_tasks_counnt: number // (backend spelling)
  late_tasks_count: number
  attendance_percentage: number
  kpi_percentage: number
  kpi_status: { month: string; kpi_percentage: number }[]
}

/** Default KPI window: last month → today (matches v1). */
function defaultKpiRange() {
  return {
    date_from: dayjs().subtract(1, 'month').format('YYYY-MM-DD'),
    date_to: dayjs().format('YYYY-MM-DD'),
  }
}

/** `sort` values `/dashboard/employee-kpi` accepts. */
export const KPI_SORTS = ['best_kpi', 'worst_kpi'] as const
export type KpiSort = (typeof KPI_SORTS)[number]

interface KpiListArgs {
  page: number
  size: number
  search?: string
  departmentId?: string
  jobPositionId?: string
  kpiMin?: number
  kpiMax?: number
  /**
   * Server ordering. NOTE: a sorted roster hides `hidden_from_regular`
   * employees (the API's rule for the ranked views); the unsorted one shows
   * them. There is no supervisor / head-of-department filter on this endpoint
   * — those live on the `/employees`-backed lists (`useEmployees`,
   * `useEmployeeOptions`).
   */
  sort?: KpiSort
  /** Column sorting (server-side, across all pages). */
  orderBy?: EmployeeOrder
  orderDir?: 'asc' | 'desc'
}

export const EMPLOYEE_ORDER = ['name', 'department', 'job', 'kpi', 'done', 'late', 'missed', 'attendance'] as const
export type EmployeeOrder = (typeof EMPLOYEE_ORDER)[number]

export function useEmployeeKpiList(args: KpiListArgs) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const range = defaultKpiRange()

  const filterParams = {
    ...range,
    organization_branch_id: branchId || undefined,
    search: args.search || undefined,
    department_id: args.departmentId || undefined,
    job_position_id: args.jobPositionId || undefined,
    kpi_min: args.kpiMin,
    kpi_max: args.kpiMax,
    sort: args.sort || undefined,
  }
  const query = useQuery({
    queryKey: ['employee-kpi', { ...args, branchId }],
    // `signal`: the roster re-keys on every debounced keystroke and on every
    // filter change. Without it react-query discards the superseded RESULT but
    // the request still runs — and this one is a KPI aggregate, the most
    // expensive read on the screen.
    queryFn: ({ signal }) =>
      apiGet<Page<EmployeeKpiRow>>(
        DASHBOARD_EMPLOYEE_KPI,
        {
          ...range,
          organization_branch_id: branchId || undefined,
          page: args.page,
          size: args.size,
          search: args.search || undefined,
          department_id: args.departmentId || undefined,
          job_position_id: args.jobPositionId || undefined,
          kpi_min: args.kpiMin,
          kpi_max: args.kpiMax,
          sort: args.sort || undefined,
          order_by: args.orderBy || undefined,
          order_dir: args.orderBy ? args.orderDir ?? 'asc' : undefined,
        },
        { signal },
      ),
    placeholderData: (prev) => prev,
  })

  return {
    rows: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    /** Every id matching the current filter, all pages — «select all N». */
    loadAllIds: () =>
      // ⚠️ size 100: the endpoint answers 422 above that (measured 2026-09-24).
      fetchAllPages<EmployeeKpiRow>(DASHBOARD_EMPLOYEE_KPI, filterParams, 100, 60).then((r) => r.map((x) => x.id)),
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetching: query.isFetching,
  }
}

/** Top / bottom 5 by KPI (sorted server-side, hidden employees excluded). */
export function useEmployeeKpiRanked(sort: 'best_kpi' | 'worst_kpi') {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const range = defaultKpiRange()
  const query = useQuery({
    queryKey: ['employee-kpi-ranked', { sort, branchId }],
    queryFn: () =>
      apiGet<Page<EmployeeKpiRow>>(DASHBOARD_EMPLOYEE_KPI, {
        ...range,
        organization_branch_id: branchId || undefined,
        sort,
        page: 1,
        size: 5,
      }),
  })
  return { rows: query.data?.items ?? [], loading: query.isLoading }
}

export interface AgeStats {
  stats: Record<string, number>
  average_age: number
}
export interface NationalityStat {
  nationality: string
  count: number
}
export interface MonthlyKpi {
  month: string
  kpi_percentage: number
}
export interface CardsSummary {
  completed_tasks_count: number
  overuded_tasks_counnt: number
  late_tasks_count: number
}
export interface TaskExecutionStats {
  late_tasks_count: number
  absent_employee_count: number
  late_employee_count: number
  kpi_below_50_employee_count: number
  absent_employee_strike_5_days_count: number
}

/** All the aggregate stats behind the charts + warnings, in one hook. */
export interface HeadcountStats {
  total_count?: number
  gender_stats?: { male?: number; female?: number; unknown?: number } | null
}
/** One hire year and how many people joined in it. */
export interface ExperienceYear { year: number; count: number }

/**
 * The statistics strip's eight dashboard queries.
 *
 * ⚠️ `enabled` IS NOT OPTIONAL PEDANTRY. On `/employees` this strip renders
 * BELOW the table and most readers never scroll to it, yet all eight requests
 * fired on every visit. The caller gates them on the strip actually coming into
 * view (`useInViewOnce`).
 *
 * ⚠️ `range` IS PART OF EVERY AFFECTED queryKey. `defaultKpiRange()` is derived
 * from today's date, so a cache entry keyed on `branchId` alone keeps serving
 * last month's window after midnight — or after the month rolls over.
 */
export function useEmployeeStats(enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const range = defaultKpiRange()
  const branchParam = { organization_branch_id: branchId || undefined }
  const rangeKey = `${range.date_from}:${range.date_to}`

  const age = useQuery({
    queryKey: ['age-stats', branchId],
    queryFn: () => apiGet<AgeStats>(DASHBOARD_AGE_STATS, branchParam),
    enabled,
  })
  const nationality = useQuery({
    queryKey: ['nationality-stats', branchId],
    queryFn: () => apiGet<NationalityStat[]>(DASHBOARD_NATIONALITY_STATS, branchParam),
    enabled,
  })
  const kpiTrend = useQuery({
    queryKey: ['kpi-monthly', branchId],
    queryFn: () => apiGet<MonthlyKpi[]>(DASHBOARD_KPI_MONTHLY_AVERAGE, branchParam),
    enabled,
  })
  const cards = useQuery({
    queryKey: ['cards-summary', branchId, rangeKey],
    queryFn: () => apiGet<CardsSummary>(DASHBOARD_CARDS_SUMMARY, { ...branchParam, ...range }),
    enabled,
  })
  /**
   * Headcount with its gender split, and the year-of-hire distribution.
   *
   * v1 drew both on this screen and v2 drew neither, which left the roster
   * without the two readings personnel actually quote: how many people there
   * are (and of whom), and how the seniority is spread — a wall of recent
   * years means the branch has just been staffed up, a flat one means it has
   * not hired in a decade.
   */
  const headcount = useQuery({
    queryKey: ['employee-count', branchId],
    queryFn: () => apiGet<HeadcountStats>('dashboard/employee-count', branchParam),
    enabled,
  })
  const experience = useQuery({
    queryKey: ['experience-stats', branchId],
    queryFn: () => apiGet<ExperienceYear[]>('dashboard/experience-stats', branchParam),
    enabled,
  })
  const tasks = useQuery({
    queryKey: ['task-exec', branchId, rangeKey],
    queryFn: () =>
      apiGet<TaskExecutionStats>(DASHBOARD_TASK_EXECUTION_ATTENDANCE, { ...branchParam, ...range }),
    enabled,
  })

  return {
    headcount: headcount.data,
    headcountLoading: headcount.isLoading,
    experience: experience.data ?? [],
    experienceLoading: experience.isLoading,
    age: age.data,
    ageLoading: age.isLoading,
    nationality: nationality.data ?? [],
    nationalityLoading: nationality.isLoading,
    kpiTrend: kpiTrend.data ?? [],
    kpiTrendLoading: kpiTrend.isLoading,
    cards: cards.data,
    cardsLoading: cards.isLoading,
    tasks: tasks.data,
    /* The demographics panel drew "no staff data" whenever these failed. It is
     * a dashboard block, so it stays quiet rather than shouting — but it must
     * not assert an empty organisation either. */
    failed: age.isError || nationality.isError || headcount.isError,
  }
}
