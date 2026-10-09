import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import {
  DASHBOARD_EMPLOYEE_KPI,
  DASHBOARD_OVERDUE_TASKS,
  DASHBOARD_TODAY_VISITOR_COUNT,
  NEWS_POSTS,
  TASKS_OVERDUE,
  VISITOR_TURNSTILE_ATTENDANCE,
} from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'

/** These endpoints answer with a bare array; a couple are paginated. Accept
 *  both rather than guessing, so a later `Page[...]` wrapper cannot break a
 *  block silently. */
function listOf<T>(data: T[] | ListResponse<T> | undefined): T[] {
  if (!data) return []
  return Array.isArray(data) ? data : toItems(data)
}
import type { NewsPost, TurnstileEvent } from '@/types/dashboard'
import { useDashboardBranchId } from '@/features/dashboard/useKadrBlocks'

/**
 * The blocks the NOCTURNE boards need that the old dashboard never asked for:
 * the company noticeboard, the execution-discipline register, the KPI ranking
 * and today's guest passages.
 *
 * Every one of them is an endpoint that already exists on the API. Nothing on
 * these boards is sampled or seeded — an empty block means an empty branch,
 * and a 403 (some of these are permission-gated per role) leaves the block
 * quiet instead of throwing the page away, which is why none of them retry.
 */

/* ── Yangiliklar ────────────────────────────────────────────────────────── */

export function useNews(limit = 3) {
  const branchId = useDashboardBranchId()
  const q = useQuery({
    queryKey: ['board', 'news', branchId],
    queryFn: () =>
      apiGet<NewsPost[] | ListResponse<NewsPost>>(NEWS_POSTS, {
        organization_branch_id: branchId,
      }),
    retry: false,
  })
  const news = useMemo(() => {
    return [...listOf(q.data)]
      .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))
      .slice(0, limit)
  }, [q.data, limit])
  return { news, loading: q.isLoading }
}

/* ── Ijro intizomi (tasks-overdue) ──────────────────────────────────────── */

interface RawIjroTask {
  id: number
  task_index?: string | null
  description?: string | null
  deadline_date?: string | null
  task_completed?: string | null
  employee?: {
    id?: number
    legal_name?: string | null
    photo_path?: string | null
    photo_thumb_path?: string | null
    job_position?: { name?: string } | string | null
    department?: { name?: string } | null
  } | null
}

/** Where a task stands against its deadline — the one thing the board sorts on. */
export type IjroState = 'overdue' | 'today' | 'soon' | 'done'

export interface IjroTask {
  id: number
  /** The task itself; falls back to its registration number when unnamed. */
  title: string
  reg: string
  deadline: string | null
  employeeName: string
  position: string
  photo?: string | null
  photoFull?: string | null
  state: IjroState
  /** Whole days past the deadline (overdue) or left until it (soon). */
  days: number
  employeeId?: number
  department: string
  /** When a closed task was closed (ISO date), for «N kun kech yopildi». */
  completed: string | null
}

const STATE_ORDER: Record<IjroState, number> = { overdue: 0, today: 1, soon: 2, done: 3 }

function mapTask(r: RawIjroTask): IjroTask {
  const jp = r.employee?.job_position
  const position =
    (typeof jp === 'object' ? jp?.name : jp) || r.employee?.department?.name || ''
  const deadline = r.deadline_date ?? null
  const diff = deadline ? dayjs(deadline).startOf('day').diff(dayjs().startOf('day'), 'day') : 0
  const state: IjroState = r.task_completed
    ? 'done'
    : diff < 0
      ? 'overdue'
      : diff === 0
        ? 'today'
        : 'soon'
  return {
    id: r.id,
    title: (r.description || '').trim() || (r.task_index || '').trim() || '—',
    reg: (r.task_index || '').trim(),
    deadline,
    employeeName: r.employee?.legal_name || '',
    position,
    photo: r.employee?.photo_thumb_path,
    photoFull: r.employee?.photo_path,
    state,
    days: Math.abs(diff),
    employeeId: r.employee?.id,
    department: r.employee?.department?.name ?? '',
    completed: r.task_completed ?? null,
  }
}

/**
 * The execution register, ordered the way it is read: what is already late
 * (worst first), then what is due today, then what is coming, then what is
 * closed. `employeeId` narrows it to one person — that is the employee board's
 * "Mening topshiriqlarim".
 */
export function useIjroTasks({
  employeeId,
  enabled = true,
  limit = 12,
}: {
  employeeId?: number | null
  enabled?: boolean
  limit?: number
} = {}) {
  const branchId = useDashboardBranchId()
  const q = useQuery({
    queryKey: ['board', 'ijro', branchId, employeeId ?? null],
    queryFn: () =>
      apiGet<RawIjroTask[] | ListResponse<RawIjroTask>>(TASKS_OVERDUE, {
        organization_branch_id: employeeId ? undefined : branchId,
        employee_id: employeeId || undefined,
      }),
    enabled,
    retry: false,
  })

  /* ⚠️ COUNT FROM `all`, NOT FROM `tasks`. `tasks` is cut to `limit` for the
     list faces; the discipline summary used to count «Yopilgan» over the cut
     list and printed 10 where there were 13 (TEST, 2026-09-24). */
  const all = useMemo(
    () =>
      listOf(q.data)
        .map(mapTask)
        .sort(
          (a, b) =>
            STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
            (a.state === 'soon' ? a.days - b.days : b.days - a.days),
        ),
    [q.data],
  )
  const tasks = useMemo(() => all.slice(0, limit), [all, limit])

  const counts = useMemo(() => {
    const c = { overdue: 0, today: 0, soon: 0, done: 0 }
    // Over the WHOLE list (the comment above says so; the loop still walked
    // the 12-row cut, so the chip could never pass 12).
    for (const t of all) c[t.state]++
    return c
  }, [all])

  return { tasks, all, counts, loading: q.isLoading }
}

/* ── Eng yaxshi xodimlar (KPI) ──────────────────────────────────────────── */

export interface TopEmployee {
  id: number
  legal_name?: string
  photo_path?: string | null
  photo_thumb_path?: string | null
  job_position_name?: string | null
  department_name?: string | null
  kpi_percentage?: number
}

export function useTopEmployees(enabled: boolean, limit = 5) {
  const branchId = useDashboardBranchId()
  const from = dayjs().startOf('month').format('YYYY-MM-DD')
  const to = dayjs().format('YYYY-MM-DD')
  const q = useQuery({
    queryKey: ['board', 'top-kpi', branchId, from, to, limit],
    queryFn: () =>
      apiGet<ListResponse<TopEmployee>>(DASHBOARD_EMPLOYEE_KPI, {
        organization_branch_id: branchId,
        date_from: from,
        date_to: to,
        sort: 'best_kpi',
        page: 1,
        size: limit,
      }),
    enabled,
    retry: false,
  })
  return { top: toItems(q.data), loading: q.isLoading }
}

/* ── Mehmonlar (bugungi tashriflar) ─────────────────────────────────────── */

export function useGuestPasses(enabled: boolean, limit = 12) {
  const branchId = useDashboardBranchId()
  const today = dayjs().format('YYYY-MM-DD')
  const q = useQuery({
    queryKey: ['board', 'guests', branchId, today],
    queryFn: () =>
      apiGet<ListResponse<TurnstileEvent>>(VISITOR_TURNSTILE_ATTENDANCE, {
        organization_branch_id: branchId,
        date_from: today,
        date_to: today,
      }),
    enabled,
    retry: false,
    refetchInterval: 120_000,
  })
  const guests = useMemo(() => toItems(q.data).slice(0, limit), [q.data, limit])
  return { guests, loading: q.isLoading }
}

/* ── Ijro intizomi bo'yicha jamlanma ────────────────────────────────────── */

export interface OverdueSummary {
  total?: number
  by_department?: { department_name: string; count: number }[]
}

/**
 * Where the missed deadlines are concentrated. The per-task register above
 * answers "which ones"; this answers "whose department", which is the only
 * form of the question a branch head can act on.
 */
export function useOverdueSummary(enabled: boolean) {
  const branchId = useDashboardBranchId()
  const q = useQuery({
    queryKey: ['board', 'overdue-summary', branchId],
    queryFn: () =>
      apiGet<OverdueSummary>(DASHBOARD_OVERDUE_TASKS, { organization_branch_id: branchId }),
    enabled,
    retry: false,
  })
  const worst = useMemo(() => {
    const rows = q.data?.by_department ?? []
    return [...rows].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0] ?? null
  }, [q.data])
  return { summary: q.data ?? {}, worstDepartment: worst, loading: q.isLoading }
}

/* ── Mehmon hisoblagichlari ─────────────────────────────────────────────── */

/**
 * ⚠️ THREE ENDPOINT LITERALS INLINED. `src/api/endpoints.ts` carries
 * `DASHBOARD_TODAY_VISITOR_COUNT` but not the other two, and that file belongs
 * to another session today (2026-09-08), so the constants cannot be added
 * where they belong. They should be lifted into `endpoints.ts` as
 * `DASHBOARD_ALL_VISITOR_COUNT`, `DASHBOARD_VISITOR_SERVICE_TIME`,
 * `DASHBOARD_DEPARTMENTS_ATTENDANCE` and `DASHBOARD_KPI_SUMMARY`.
 */
const DASHBOARD_ALL_VISITOR_COUNT = 'dashboard/all-visitor-count'
const DASHBOARD_VISITOR_SERVICE_TIME = 'dashboard/visitor-service-time-stats'
const DASHBOARD_DEPARTMENTS_ATTENDANCE = 'dashboard/departments-attendance'
const DASHBOARD_KPI_SUMMARY = 'dashboard/kpi-summary'

export interface VisitorCounters {
  /** Everyone on file for this branch — no date filter at all. */
  all?: number
  /** Whose pass is valid today (NOT "who walked in today"). */
  today?: number
  /** How long a visit lasts, gate to gate, in whole minutes. */
  avgServiceMinutes?: number
}

/**
 * The three figures web v1 prints above its guest feed ("Mehmonlar tashrifi"):
 * all guests on file, today's guests, and the average time a guest is served.
 *
 * They are three separate endpoints because they answer three different
 * questions — a branch with 4000 guests on file and 3 today is the normal
 * case, and collapsing them into one number would say nothing. Each is branch
 * scoped and takes no department filter, so the key deliberately carries only
 * the branch.
 */
export function useVisitorCounters(enabled: boolean) {
  const branchId = useDashboardBranchId()
  const common = { enabled, retry: false as const }

  const all = useQuery({
    queryKey: ['board', 'visitors-all', branchId],
    queryFn: () =>
      apiGet<{ count: number }>(DASHBOARD_ALL_VISITOR_COUNT, {
        organization_branch_id: branchId,
      }),
    ...common,
  })

  const today = useQuery({
    queryKey: ['board', 'visitors-today', branchId],
    queryFn: () =>
      apiGet<{ count: number }>(DASHBOARD_TODAY_VISITOR_COUNT, {
        organization_branch_id: branchId,
      }),
    ...common,
  })

  const service = useQuery({
    queryKey: ['board', 'visitor-service-time', branchId],
    queryFn: () =>
      apiGet<{ average_service_time_minutes: number }>(DASHBOARD_VISITOR_SERVICE_TIME, {
        organization_branch_id: branchId,
      }),
    ...common,
  })

  const counters: VisitorCounters = {
    all: all.data?.count,
    today: today.data?.count,
    avgServiceMinutes: service.data?.average_service_time_minutes,
  }
  return { counters, loading: all.isLoading || today.isLoading || service.isLoading }
}

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
