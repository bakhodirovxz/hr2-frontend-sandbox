import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { toItems, type ListResponse } from '@/types'
import { useDashboardBranchId } from '@/features/dashboard/useKadrBlocks'

/** Ro'yxat yoki sahifalangan javob — ikkalasini ham qabul qiladi. */
function listOf<T>(data: T[] | ListResponse<T> | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : toItems(data)
}

/**
 * Bosh sahifa doskasining qo'shimcha bloklari: bo'limlar bo'yicha davomat va
 * KPI jamlanmasi. 403 (rolga bog'liq) blokni jim qoldiradi, sahifani emas —
 * shuning uchun qayta urinish yo'q.
 */

const DASHBOARD_DEPARTMENTS_ATTENDANCE = 'dashboard/departments-attendance'
const DASHBOARD_KPI_SUMMARY = 'dashboard/kpi-summary'

/* ── Bo'limlar bo'yicha davomat ─────────────────────────────────────────── */

export interface DepartmentAttendance {
  department_id: number
  department_name: string
  /** Passes recorded today for that department — NOT a headcount. */
  total_attendances: number
  gender_stats?: { male: number; female: number; unknown: number }
}

/**
 * Where today's movement actually happened, department by department.
 *
 * The board already answers "how many came in" for the branch as a whole; this
 * is the same day split by the unit that owns it, which is the form a branch
 * head can act on. Sorted by volume — the point of the block is which
 * departments are moving, so the biggest goes first — and truncated by the
 * caller, never by a filter the server does not know about.
 */
export function useDepartmentsAttendance(enabled: boolean) {
  const branchId = useDashboardBranchId()
  const q = useQuery({
    queryKey: ['board', 'departments-attendance', branchId],
    queryFn: () =>
      apiGet<DepartmentAttendance[] | ListResponse<DepartmentAttendance>>(
        DASHBOARD_DEPARTMENTS_ATTENDANCE,
        { organization_branch_id: branchId },
      ),
    enabled,
    retry: false,
  })
  const rows = useMemo(
    () =>
      [...listOf(q.data)].sort((a, b) => (b.total_attendances ?? 0) - (a.total_attendances ?? 0)),
    [q.data],
  )
  return { rows, loading: q.isLoading }
}

/* ── KPI jamlanmasi ─────────────────────────────────────────────────────── */

export interface KpiSummary {
  employee_total_count: number
  good_kpi_employee_count: number
  medium_kpi_employee_count: number
  bad_kpi_employee_count: number
  average_attendance_percentage: number
}

/**
 * How the branch's KPI is distributed, plus the attendance percentage behind
 * it — the roster split into high / middle / low performers rather than one
 * average that hides both tails.
 *
 * ⚠️ `date_from` AND `date_to` ARE REQUIRED. The route declares them as
 * `Query(...)` with no default, so calling it bare answers 422, not an empty
 * summary. The window mirrors web v1's `getDefaultEmployeeKpiDateRange()` —
 * the last month up to today — so the two apps report the same number for the
 * same branch on the same day. The dates are in the query key because they are
 * part of the answer: a cached "last month" would silently go stale at
 * midnight otherwise.
 */
export function useKpiSummary(enabled: boolean) {
  const branchId = useDashboardBranchId()
  const from = dayjs().subtract(1, 'month').format('YYYY-MM-DD')
  const to = dayjs().format('YYYY-MM-DD')
  const q = useQuery({
    queryKey: ['board', 'kpi-summary', branchId, from, to],
    queryFn: () =>
      apiGet<KpiSummary>(DASHBOARD_KPI_SUMMARY, {
        organization_branch_id: branchId,
        date_from: from,
        date_to: to,
      }),
    enabled,
    retry: false,
  })
  return { summary: q.data ?? null, period: { from, to }, loading: q.isLoading }
}
