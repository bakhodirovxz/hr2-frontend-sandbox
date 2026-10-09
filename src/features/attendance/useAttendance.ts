import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { TURNSTILE_ATTENDANCE_EVENTS } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from '@/features/employees/useEmployees'

/**
 * Normallashtirilgan tabel (TZ I2) — `GET turnstile-attendance-events/normalized`.
 *
 * hr-backend-sandbox `AttendanceSummary`: kelgan/kechikkan/kelmagan kunlar
 * soni, ish soati, kunma-kun `calendar` va kechikish daqiqalari. Erta ketish
 * alohida maydon emas — u `calendar` dagi `early_leave` holati.
 */
export interface AttendanceSummary {
  present_days_count: number
  late_days_count: number
  absent_days_count: number
  work_duration_hours: number
  calendar: Record<string, string>
  daily_late_minutes?: Record<string, number>
}

export interface AttendanceRow {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  department_id?: number | null
  department?: { id?: number; name?: string; organization_branch_id?: number | null } | null
  job_position?: { name?: string } | string | null
  /** Xodimning O'Z ish vaqti — kun oynasida reja va fakt shu bilan solishtiriladi. */
  working_hours_start?: string | null
  working_hours_end?: string | null
  lunch_start_time?: string | null
  lunch_end_time?: string | null
  working_days?: number[] | null
  stavka?: number | string | null
  weekly_schedule?: unknown
  attendance: AttendanceSummary
}

/** v1 standarti: o'tgan oyning shu kunidan bugungacha (5-iyun → 5-may…5-iyun). */
export function defaultAttendanceRange() {
  const today = dayjs().startOf('day')
  const prev = today.subtract(1, 'month').startOf('month')
  const day = Math.min(today.date(), prev.daysInMonth())
  return {
    from: prev.date(day).format('YYYY-MM-DD'),
    to: today.format('YYYY-MM-DD'),
  }
}

/** `sort_by` qiymatlari (`list_normalized_events`) — boshqasi jim e'tiborsiz qoladi. */
export const ATTENDANCE_SORT_KEYS = ['present', 'absent', 'late', 'early', 'hours'] as const
export type AttendanceSortKey = (typeof ATTENDANCE_SORT_KEYS)[number]

interface Args {
  from: string
  to: string
  page: number
  size: number
  search?: string
  departmentId?: string
  jobPositionId?: string
  /** `late` | `absent` */
  filterType?: string
  /** Bitta xodim (shaxsiy kalendar). */
  employeeId?: number
  sortBy?: AttendanceSortKey
  sortDir?: 'asc' | 'desc'
  /** Faqat bevosita bo'ysunuvchilar. */
  supervised?: boolean
  /** `false` — sana oralig'i noto'g'ri (from > to). */
  enabled?: boolean
}

/** Ro'yxat va eksport bitta parametr to'plamidan quriladi — fayl ekrandagidan farq qilmasin. */
export function attendanceParams(a: Omit<Args, 'page' | 'size' | 'enabled'>, branchId: number | null) {
  return {
    date_from: a.from,
    date_to: a.to,
    // Bitta xodimning tabeli tanlangan filialga bog'lanmaydi: begona filial
    // tanlangan bo'lsa ham o'z qatori qaytadi (server ko'lamni o'zi tekshiradi).
    ...(a.employeeId ? { _no_branch_inject: true } : { organization_branch_id: branchId || undefined }),
    search: a.search || undefined,
    department_id: a.departmentId || undefined,
    job_position_id: a.jobPositionId || undefined,
    filter_type: a.filterType || undefined,
    employee_id: a.employeeId || undefined,
  }
}

export function useAttendance({ page, size, sortBy, sortDir, supervised, enabled = true, ...rest }: Args) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const base = attendanceParams(rest, branchId)

  const query = useQuery({
    queryKey: ['attendance', { ...base, page, size, sortBy, sortDir, supervised }],
    queryFn: () =>
      apiGet<Page<AttendanceRow>>(`${TURNSTILE_ATTENDANCE_EVENTS}/normalized`, {
        ...base,
        page,
        size,
        sort_by: sortBy || undefined,
        sort_dir: sortBy ? sortDir || undefined : undefined,
        supervised: supervised || undefined,
      }),
    enabled: enabled && !!rest.from && !!rest.to,
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
