import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { DASHBOARD_EMPLOYEES_BY_CATEGORY, DASHBOARD_MAIN } from '@/api/endpoints'
import type { EmployeesByCategory, MainStats, TurnstileEvent } from '@/types/dashboard'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { can } from '@/auth/permissions'
import { buildAttendanceRows, countByStatus, countDirections } from './attendance'

interface DashboardFilters {
  departmentId?: string
  jobPositionId?: string
  search?: string
}

function clean(filters: DashboardFilters) {
  return {
    department_id: filters.departmentId || undefined,
    job_position_id: filters.jobPositionId || undefined,
    search: filters.search || undefined,
  }
}

/** `GET /turnstile-attendance-events` bitta chaqiruvda ko'pi bilan 5000 o'tish
 *  qaytaradi (oddiy massiv). Gavjum kun undan oshsa — `offset` bilan davomi. */
const EVENTS_PAGE = 5000

async function fetchDayEvents(params: Record<string, unknown>): Promise<TurnstileEvent[]> {
  const out: TurnstileEvent[] = []
  for (let offset = 0; offset < EVENTS_PAGE * 4; offset += EVENTS_PAGE) {
    const page = await apiGet<TurnstileEvent[]>('turnstile-attendance-events', { ...params, limit: EVENTS_PAGE, offset })
    out.push(...page)
    if (page.length < EVENTS_PAGE) break
  }
  return out
}

/**
 * Bosh sahifa davomati: kunlik jamlanma (`dashboard/main`), xodimlar toifalari
 * (`dashboard/employees-by-category`) va tanlangan kunning turniket o'tishlari.
 *
 * @param dayOffset 0 = bugun, 1 = kecha … Faqat turniket HODISALARI shu kunga
 *   suriladi; jamlanma va toifalar bugungi javobni beradi.
 */
export function useDashboard(filters: DashboardFilters, dayOffset = 0) {
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const branchId = selectedBranchId ?? user?.employee?.department?.organization_branch_id ?? null

  const f = clean(filters)
  const keyBase = [branchId, f.department_id, f.job_position_id, f.search]
  const day = dayjs().subtract(dayOffset, 'day').format('YYYY-MM-DD')

  // GEN#3 / TZ A2: each widget answers only to the module that opens it;
  // the named roster only to the people who act on it (actor flag).
  const canAttendance = can(user, 'attendance')
  const roster = canAttendance && !!user?.actor?.attendance_roster
  const mainQuery = useQuery({
    queryKey: ['dashboard', 'main', ...keyBase],
    queryFn: () => apiGet<MainStats>(DASHBOARD_MAIN, { organization_branch_id: branchId, ...f }),
    enabled: canAttendance,
    refetchInterval: 120_000,
  })

  const categoriesQuery = useQuery({
    enabled: roster,
    queryKey: ['dashboard', 'categories', ...keyBase],
    queryFn: () =>
      apiGet<EmployeesByCategory>(DASHBOARD_EMPLOYEES_BY_CATEGORY, {
        organization_branch_id: branchId,
        ...f,
      }),
    refetchInterval: 120_000,
  })

  const eventsQuery = useQuery({
    queryKey: ['dashboard', 'events', ...keyBase, day],
    queryFn: () =>
      fetchDayEvents({
        organization_branch_id: branchId,
        date_from: day,
        date_to: day,
        ...f,
      }),
    // Turniket o'tishlari — davomat moduli (filial administratorida yo'q).
    enabled: roster,
    // O'tgan kun o'zgarmaydi; bugungi kun 2 daqiqada yangilanadi.
    refetchInterval: dayOffset === 0 ? 120_000 : false,
  })

  const events = useMemo(
    () =>
      [...(eventsQuery.data ?? [])].sort((a, b) =>
        String(b.happen_time ?? '').localeCompare(String(a.happen_time ?? '')),
      ),
    [eventsQuery.data],
  )
  const rows = useMemo(() => buildAttendanceRows(events, categoriesQuery.data), [events, categoriesQuery.data])
  const counts = useMemo(() => countByStatus(rows), [rows])
  const directions = useMemo(() => countDirections(events), [events])
  const insideCount = useMemo(() => rows.filter((r) => r.entry && !r.hasExited).length, [rows])

  // Jadval bilan mos bo'lishi uchun avval hosil qilingan sonlar; yuklanish
  // paytida server jamlanmasi.
  const totalEmployees = counts.total || mainQuery.data?.total_employees_count || rows.length || 0

  return {
    branchId,
    /** False — rank-and-file account: counts only, no named roster. */
    roster,
    /** Kunning o'tishlari, eng yangisi birinchi — jonli lenta shuni o'qiydi. */
    events,
    rows,
    counts,
    totalEmployees,
    entriesToday: directions.entries,
    exitsToday: directions.exits,
    insideCount,
    mainStats: mainQuery.data,
    loading: (mainQuery.isLoading && canAttendance) || (categoriesQuery.isLoading && roster) || (eventsQuery.isLoading && eventsQuery.fetchStatus !== 'idle'),
    tableLoading: (categoriesQuery.isLoading && roster) || (eventsQuery.isLoading && eventsQuery.fetchStatus !== 'idle'),
  }
}
