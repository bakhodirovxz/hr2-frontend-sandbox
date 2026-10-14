import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'
import { useAuthStore } from '@/store/authStore'
import { can } from '@/auth/permissions'
import type { Page } from './useEmployees'
import type { EmployeeKpiRow, EmployeeRow } from './types'

export type { EmployeeKpiRow } from './types'

/** Default KPI window: last month → today (v1 `getDefaultEmployeeKpiDateRange`). */
export function defaultKpiRange() {
  return {
    date_from: dayjs().subtract(1, 'month').format('YYYY-MM-DD'),
    date_to: dayjs().format('YYYY-MM-DD'),
  }
}

interface KpiListArgs {
  page: number
  size: number
  search?: string
  departmentId?: string
  jobPositionId?: string
  contractType?: string
  kpiMin?: number
  kpiMax?: number
}

/** `GET /dashboard/employee-kpi` — the roster of the HR / management view (C2). */
export function useEmployeeKpiList(args: KpiListArgs, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const range = defaultKpiRange()
  return useQuery({
    queryKey: ['employee-kpi', { ...args, branchId, range }],
    queryFn: ({ signal }) =>
      apiGet<Page<EmployeeKpiRow>>(
        'dashboard/employee-kpi',
        {
          ...range,
          page: args.page,
          size: args.size,
          search: args.search || undefined,
          department_id: args.departmentId || undefined,
          job_position_id: args.jobPositionId || undefined,
          contract_type: args.contractType || undefined,
          kpi_min: args.kpiMin,
          kpi_max: args.kpiMax,
        },
        { signal },
      ),
    placeholderData: (prev) => prev,
    enabled: enabled && can(useAuthStore.getState().user, 'kpi'),
  })
}

/** Best / worst employees by KPI (insights row). */
export function useEmployeeKpiRanked(sort: 'best_kpi' | 'worst_kpi', size: number, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const range = defaultKpiRange()
  const q = useQuery({
    queryKey: ['employee-kpi-ranked', { sort, size, branchId, range }],
    queryFn: () => apiGet<Page<EmployeeKpiRow>>('dashboard/employee-kpi', { ...range, sort, page: 1, size }),
    enabled: enabled && can(useAuthStore.getState().user, 'kpi'),
  })
  return { rows: q.data?.items ?? [], loading: q.isLoading }
}

export interface KpiSummary {
  employee_total_count?: number
  average_attendance_percentage?: number
}

interface CategorizedEmployees {
  present_employees?: EmployeeRow[]
  late_employees?: EmployeeRow[]
  on_leave_employees?: EmployeeRow[]
  on_vacation_employees?: EmployeeRow[]
  on_sick_leave_employees?: EmployeeRow[]
  on_business_trip_employees?: EmployeeRow[]
  absent_employees?: EmployeeRow[]
}

export interface MainStats {
  total_employees_count?: number
  present_employees_count?: number
  absent_employees_count?: number
  late_employees_count?: number
  vacation_count?: number
  business_trip_count?: number
  sick_leave_count?: number
}

/**
 * The KPI row of the roster: head-count (KPI summary), today's attendance
 * categories and the average age (v1 `EmployeesAdminKpiRow`).
 */
export function useRosterHeadline(adminView: boolean) {
  const user = useAuthStore((st) => st.user)
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const range = defaultKpiRange()
  const summary = useQuery({
    queryKey: ['employee-kpi', 'summary', { branchId, range }],
    queryFn: () => apiGet<KpiSummary>('dashboard/kpi-summary', range),
    enabled: adminView && can(user, 'kpi'),
  })
  const categories = useQuery({
    queryKey: ['employees-by-category', branchId],
    queryFn: () => apiGet<CategorizedEmployees>('dashboard/employees-by-category'),
    enabled: adminView && can(user, 'attendance') && !!user?.actor?.attendance_roster,
  })
  const main = useQuery({
    queryKey: ['dashboard-main', branchId],
    queryFn: () => apiGet<MainStats>('dashboard/main'),
    enabled: !adminView && can(user, 'attendance'),
  })
  const c = categories.data
  const other =
    (c?.on_leave_employees?.length ?? 0) +
    (c?.on_vacation_employees?.length ?? 0) +
    (c?.on_sick_leave_employees?.length ?? 0) +
    (c?.on_business_trip_employees?.length ?? 0)
  const m = main.data
  return adminView
    ? {
        total: summary.data?.employee_total_count ?? 0,
        present: c?.present_employees?.length ?? 0,
        late: c?.late_employees?.length ?? 0,
        other,
        absent: c?.absent_employees?.length ?? 0,
        totalLoading: summary.isLoading,
        attendanceLoading: categories.isLoading,
      }
    : {
        total: m?.total_employees_count ?? 0,
        present: m?.present_employees_count ?? 0,
        late: m?.late_employees_count ?? 0,
        other: (m?.vacation_count ?? 0) + (m?.business_trip_count ?? 0) + (m?.sick_leave_count ?? 0),
        absent: m?.absent_employees_count ?? 0,
        totalLoading: main.isLoading,
        attendanceLoading: main.isLoading,
      }
}

export interface AgeStats {
  stats: Record<string, number>
  average_age: number
}
export interface NationalityStat {
  nationality: string
  nationality_ru?: string | null
  count: number
}
export interface MonthlyKpi {
  month: string
  kpi_percentage: number
}
export interface HeadcountStats {
  total_count?: number
  gender_stats?: { male?: number; female?: number; unknown?: number } | null
}
/** One hire year and how many people joined in it. */
export interface ExperienceYear {
  year: number
  count: number
}

/** The demographic charts (age, nationality, KPI trend, head-count, hire years). */
export function useEmployeeStats(enabled = true) {
  const user = useAuthStore((st) => st.user)
  const branchId = useBranchStore((s) => s.selectedBranchId)

  const age = useQuery({
    queryKey: ['age-stats', branchId],
    queryFn: () => apiGet<AgeStats>('dashboard/age-stats'),
    enabled: enabled && can(user, 'employees'),
  })
  const nationality = useQuery({
    queryKey: ['nationality-stats', branchId],
    queryFn: () => apiGet<NationalityStat[]>('dashboard/nationality-stats'),
    enabled: enabled && can(user, 'employees'),
  })
  const kpiTrend = useQuery({
    queryKey: ['kpi-monthly', branchId],
    queryFn: () => apiGet<MonthlyKpi[]>('dashboard/kpi-monthly-average'),
    enabled: enabled && can(user, 'kpi'),
  })
  const headcount = useQuery({
    queryKey: ['employee-count', branchId],
    queryFn: () => apiGet<HeadcountStats>('dashboard/employee-count'),
    enabled: enabled && can(user, 'employees'),
  })
  const experience = useQuery({
    queryKey: ['experience-stats', branchId],
    queryFn: () => apiGet<ExperienceYear[]>('dashboard/experience-stats'),
    enabled: enabled && can(user, 'employees'),
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
    failed: age.isError || nationality.isError || headcount.isError,
  }
}
