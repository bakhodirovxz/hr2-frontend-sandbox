import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { TURNSTILE_ATTENDANCE_EVENTS } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from '@/features/employees/useEmployees'

/**
 * SOAT BO'YICHA O'RINDOSHLIK — faqat qabul qilgan filial tabelida to'ladi.
 *
 * Xodim bu filialda kun-kun jadval bilan ishlamaydi: kelishuv «oyiga N soat»
 * ko'rinishida, ish kunlari esa uning ASOSIY filialiniki. Haqiqiy soat
 * yuqoridagi `work_duration_hours` da — u turniket yozuvlaridan yig'iladi.
 */
export interface ConcurrentPostSummary {
  employment_type?: string | null
  hours_norm?: number | null
  hours_period?: 'week' | 'month' | null
  norm_hours_for_range?: number | null
}

/** One day the person left before the end of their working window. */
export interface EarlyLeaveDay {
  left_at: string
  work_end: string
  minutes: number
}

export interface AttendanceSummary {
  present_days_count: number
  late_days_count: number
  absent_days_count: number
  work_duration_hours: number
  calendar: Record<string, string>
  daily_late_minutes?: Record<string, number>
  /**
   * Early departures — SEPARATE from `calendar`: a day can be both late and
   * left early, and the calendar status stays present/late for it.
   */
  early_leave_days_count?: number
  daily_early_leave?: Record<string, EarlyLeaveDay>
  concurrent_post?: ConcurrentPostSummary | null
}

export interface AttendanceRow {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  department?: { id?: number; name?: string } | null
  job_position?: { name?: string } | string | null
  /**
   * The person's OWN schedule — the day modal sets the plan against the fact
   * with it. Half the roster does not lunch at 13:00, so a hard-coded window
   * would cut the wrong hour out of their worked time.
   *
   * (PII on this row — passport, PINFL, address — comes back NULL for an
   * ordinary employee; the server masks it. Verified live.)
   */
  working_hours_start?: string | null
  working_hours_end?: string | null
  lunch_start_time?: string | null
  lunch_end_time?: string | null
  working_days?: number[] | null
  attendance: AttendanceSummary
}

/** Default window: 1st of the current month → today. */
export function defaultAttendanceRange() {
  return {
    from: dayjs().startOf('month').format('YYYY-MM-DD'),
    to: dayjs().format('YYYY-MM-DD'),
  }
}

interface Args {
  from: string
  to: string
  page: number
  size: number
  search?: string
  departmentId?: string
  jobPositionId?: string
  /**
   * KO'P TANLOV (2026-09-22): several departments / positions at once. Sent as
   * repeated query params (`department_ids=1&department_ids=2`); the server
   * ANDs them with the singular ones, so passing both is safe.
   */
  departmentIds?: string[]
  jobPositionIds?: string[]
  filterType?: string // 'late' | 'absent' | 'early_leave'
  /** Restrict to one employee (personal "my attendance" view). */
  employeeId?: number
  /**
   * `regular` (default) hides ГПХ staff, `gpx` shows ONLY them. They are paid
   * and reported separately, so mixing them into one list misstates both — the
   * server splits them for that reason and v2 was never asking for the second
   * half.
   */
  workerType?: string
  /** Server-side ordering; only the values the API validates (see `ATTENDANCE_SORT_KEYS`). */
  sortBy?: AttendanceSortKey
  sortDir?: 'asc' | 'desc'
  /** Only the viewer's direct reports. */
  supervised?: boolean
  /** `false` while the range is invalid — from > to is a 422 on the server. */
  enabled?: boolean
}

/** The `sort_by` values `/normalized` accepts; anything else is a 422. */
export const ATTENDANCE_SORT_KEYS = ['present', 'absent', 'late', 'hours', 'early'] as const
export type AttendanceSortKey = (typeof ATTENDANCE_SORT_KEYS)[number]

export function useAttendance({
  from, to, page, size, search, departmentId, jobPositionId, departmentIds, jobPositionIds,
  filterType, employeeId, workerType, sortBy, sortDir, supervised, enabled = true,
}: Args) {
  const branchId = useBranchStore((s) => s.selectedBranchId)

  const query = useQuery({
    queryKey: ['attendance', {
      from, to, page, size, search, departmentId, jobPositionId,
      // Arrays go into the key as text: a new array identity on every render
      // would otherwise refetch on each keystroke elsewhere on the page.
      departmentIds: (departmentIds ?? []).join(','),
      jobPositionIds: (jobPositionIds ?? []).join(','),
      filterType, employeeId, workerType, sortBy, sortDir, supervised, branchId,
    }],
    queryFn: () =>
      apiGet<Page<AttendanceRow>>(`${TURNSTILE_ATTENDANCE_EVENTS}/normalized`, {
        date_from: from,
        date_to: to,
        page,
        size,
        organization_branch_id: branchId || undefined,
        search: search || undefined,
        department_id: departmentId || undefined,
        job_position_id: jobPositionId || undefined,
        department_ids: departmentIds?.length ? departmentIds : undefined,
        job_position_ids: jobPositionIds?.length ? jobPositionIds : undefined,
        filter_type: filterType || undefined,
        employee_id: employeeId || undefined,
        worker_type: workerType || undefined,
        sort_by: sortBy || undefined,
        sort_dir: sortBy ? sortDir || undefined : undefined,
        supervised: supervised || undefined,
      }),
    enabled: enabled && !!from && !!to,
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
