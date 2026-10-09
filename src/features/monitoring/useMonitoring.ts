import { useEffect, useMemo, useRef, useState } from 'react'
import { workWeekdaysOn } from '@/lib/workCycle'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import {
  DASHBOARD_EMPLOYEE_KPI,
  DASHBOARD_LATE_EMPLOYEES_FREQUENT,
  DASHBOARD_MAIN,
  DASHBOARD_OVERDUE_TASKS,
  EMPLOYEE_BIRTHDAYS,
  TASKS_OVERDUE,
  VISITOR_TURNSTILE_ATTENDANCE,
} from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import type { Birthday, MainStats, TurnstileEvent } from '@/types/dashboard'
import { useAttendanceSocket, type LiveEvent } from './useAttendanceSocket'
import { useAuthStore } from '@/store/authStore'
import { canSeeLateness } from '@/auth/roles'

const MAX_EMPLOYEE_EVENTS = 100
const MAX_VISITOR_EVENTS = 50
/** Live events are frequent; refetching the aggregate on each one would hammer
 *  the API during the morning rush. The backend caches it for 30s anyway. */
const MAIN_STATS_THROTTLE_MS = 30_000
const POLL_MS = 120_000

const eventKey = (e: LiveEvent | TurnstileEvent) =>
  (e as LiveEvent).event_id ?? e.id ?? null

/** Turnstile location carrying coordinates, if any. */
function turnstileLocation(e: Record<string, unknown>): Record<string, unknown> | null {
  const t = (e?.turnstile ?? (e as { last_event?: { turnstile?: unknown } })?.last_event?.turnstile) as
    | Record<string, unknown>
    | undefined
  if (!t) return null
  const list = Array.isArray(t.locations)
    ? (t.locations as Record<string, unknown>[])
    : t.location
      ? [t.location as Record<string, unknown>]
      : []
  if (list.length === 0) return null
  return list.find((l) => l?.latitude != null && l?.longitude != null) ?? list[0]
}

/**
 * Branch an event belongs to. The employee's HOME branch wins over the
 * turnstile's, so someone who badged in at another branch still counts as late
 * at their own — matching the dashboard.
 */
function eventBranchId(e: Record<string, any>): number | null {
  if (e?.organization_branch_id) return e.organization_branch_id
  if (e?.employee?.department?.organization_branch?.id) return e.employee.department.organization_branch.id
  if (e?.employee?.department?.organization_branch_id) return e.employee.department.organization_branch_id
  if (e?.employee?.organization_branches?.[0]?.id) return e.employee.organization_branches[0].id
  if (e?.employee?.organization_branch_id) return e.employee.organization_branch_id
  const loc = turnstileLocation(e)
  if (loc?.organization_branch_id) return loc.organization_branch_id as number
  if ((loc?.organization_branch as { id?: number })?.id) return (loc!.organization_branch as { id: number }).id
  return null
}

/** Minutes late for a first entrance, or null when it isn't a late arrival. */
export function latenessMinutes(e: Record<string, any>): number | null {
  const employee = e?.employee ?? (e?.legal_name ? e : null)
  if (!employee || employee.ignore_lateness) return null

  let isEntrance = e.direction_type === 'entrance' || e.check_in_out_type === 1
  if (!e.direction_type && (!e.check_in_out_type || e.check_in_out_type === 0)) {
    const dev = String(e.turnstile?.acs_dev_name ?? e.last_event?.turnstile?.acs_dev_name ?? '').toLowerCase()
    isEntrance = !(dev.includes('chiqish') || dev.includes('exit'))
  }
  if (!isEntrance && (e.direction_type || e.check_in_out_type)) return null

  const happenStr = e.happen_time ?? e.last_event?.happen_time
  if (!happenStr) return null

  const firstEntrance = e.is_first_entrance ?? e.last_event?.is_first_entrance
  if (firstEntrance === false) return null

  const happen = dayjs(happenStr)
  const dow = (happen.day() + 6) % 7
  // Two-week-cycle part-timers: that week's own days (working_days is the union).
  if (!employee.working_days?.length || !workWeekdaysOn(employee, happen.format('YYYY-MM-DD')).includes(dow) || !employee.working_hours_start) return null

  const start = dayjs(`${happen.format('YYYY-MM-DD')} ${employee.working_hours_start}`)
  // Arriving after the day has ended isn't "late to work" — an 18:53 entry on a
  // 09:00–18:00 schedule must not read as 593 minutes late.
  if (employee.working_hours_end) {
    const end = dayjs(`${happen.format('YYYY-MM-DD')} ${employee.working_hours_end}`)
    if (happen.isAfter(end)) return null
  }
  const diff = happen.diff(start, 'minute')
  return diff > 0 ? diff : null
}


export interface Latecomer {
  id: number
  employee: Record<string, any>
  happen_time?: string
  minutes: number
  isLive?: boolean
}


interface OverdueTasksSummary {
  total?: number
  by_department?: { department_name: string; count: number }[]
}
export interface OverdueTask {
  id: number
  name?: string
  title?: string
  deadline?: string
  employee?: { legal_name?: string; photo_thumb_path?: string | null } | null
  department?: { name?: string } | null
}
/**
 * `GET /dashboard/late-employees/frequent`.
 *
 * ⚠️ The name arrives as `employee_name` and the picture as `photo_path`. The
 * panel used to read `legal_name` / `photo_thumb_path` — fields this endpoint
 * does not send — so the "most frequently late" list rendered a numbered
 * column of BLANK names with a count beside each one.
 */
interface FrequentLate {
  employee_id?: number
  employee_name?: string | null
  job_position_name?: string | null
  department_name?: string | null
  organization_branch_name?: string | null
  photo_path?: string | null
  late_count?: number
}

/** Everything the live wall needs: socket feed + polled aggregates. */
/**
 * v1's Ijro month tabs (2026-09-26): tab M is the REPORT for month M and shows
 * the deadlines of the month BEFORE it — a month's compliance is judged once
 * it has passed (the «Sentyabr» tab lists August). 0 = every task.
 */
export function ijroTabRange(tab: number): { from: string; to: string } | null {
  if (!tab) return null
  // From January 1st: `.month()` on the 31st would roll into the next month.
  const data = dayjs().startOf('year').month(tab - 1).subtract(1, 'month')
  return { from: data.format('YYYY-MM-DD'), to: data.endOf('month').format('YYYY-MM-DD') }
}

export function useMonitoring(branchId: number | null, ijroTab = 0) {
  const enabled = !!branchId
  // The frequent-late list is a discipline view: the server answers 403 to
  // anyone else, which read as «nobody was late» (v1 hid the panel too).
  const seesLateness = canSeeLateness(useAuthStore((s) => s.user))
  const { status: wsStatus, lastMessage } = useAttendanceSocket(enabled)

  const [liveEmployeeEvents, setLiveEmployeeEvents] = useState<LiveEvent[]>([])
  const [liveVisitorEvents, setLiveVisitorEvents] = useState<LiveEvent[]>([])

  // A branch switch invalidates the accumulated feed.
  useEffect(() => {
    setLiveEmployeeEvents([])
    setLiveVisitorEvents([])
  }, [branchId])

  useEffect(() => {
    if (!lastMessage) return
    const msg = lastMessage as LiveEvent & Record<string, any>

    if (msg.visitor_id) {
      // Visitors have no home branch — filter by the turnstile's, and keep the
      // event when it can't be resolved (otherwise guests silently vanish).
      if (branchId) {
        const loc = turnstileLocation(msg)
        const msgBranch = loc?.organization_branch_id as number | undefined
        if (msgBranch && msgBranch !== branchId) return
      }
      setLiveVisitorEvents((prev) => {
        const key = eventKey(msg)
        if (key && prev.some((e) => eventKey(e) === key)) return prev
        return [{ ...msg, is_live: true }, ...prev].slice(0, MAX_VISITOR_EVENTS)
      })
      return
    }

    if (branchId && eventBranchId(msg) !== branchId) return
    setLiveEmployeeEvents((prev) => {
      const key = eventKey(msg)
      if (key && prev.some((e) => eventKey(e) === key)) return prev
      return [{ ...msg, is_live: true }, ...prev].slice(0, MAX_EMPLOYEE_EVENTS)
    })
  }, [lastMessage, branchId])

  const today = dayjs().format('YYYY-MM-DD')

  const mainQuery = useQuery({
    queryKey: ['monitoring', 'main', branchId],
    queryFn: () =>
      apiGet<MainStats>(DASHBOARD_MAIN, {
        organization_branch_id: branchId,
        date_from: today,
        date_to: today,
      }),
    enabled,
    refetchInterval: POLL_MS,
  })

  /* ⚠️ The HTTP list of today's employee passes (limit 1 500, re-polled every
     two minutes) was removed 2026-09-25: the page drew nothing from it — the
     latecomers panel reads `/dashboard/late-employees`, and the pass list was
     only used as a «something happened» trigger, which the live socket
     already gives. On a busy day that was ~4 000 rows a poll for a counter. */

  const visitorsQuery = useQuery({
    queryKey: ['monitoring', 'visitors', branchId],
    queryFn: () =>
      apiGet<ListResponse<TurnstileEvent>>(VISITOR_TURNSTILE_ATTENDANCE, {
        organization_branch_id: branchId,
        date_from: today,
        date_to: today,
      }),
    enabled,
    refetchInterval: POLL_MS,
  })

  const birthdaysQuery = useQuery({
    queryKey: ['monitoring', 'birthdays', branchId],
    /* The panel draws 8. Asking for 60 cost 73 KB to throw 52 rows away;
       unlimited is 2.7 MB (the whole roster). */
    queryFn: () => apiGet<Birthday[]>(EMPLOYEE_BIRTHDAYS, { organization_branch_id: branchId, limit: 12 }),
    enabled,
  })

  const overdueQuery = useQuery({
    queryKey: ['monitoring', 'overdue-summary', branchId],
    queryFn: () => apiGet<OverdueTasksSummary>(DASHBOARD_OVERDUE_TASKS, { organization_branch_id: branchId }),
    enabled,
  })

  // The month is filtered on the SERVER (deadline window), so the mobile app
  // and this page read the same answer (2026-09-26).
  const ijroRange = ijroTabRange(ijroTab)
  const overdueListQuery = useQuery({
    queryKey: ['monitoring', 'overdue-list', branchId, ijroTab],
    queryFn: () =>
      apiGet<ListResponse<OverdueTask>>(TASKS_OVERDUE, {
        organization_branch_id: branchId,
        date_from: ijroRange?.from,
        date_to: ijroRange?.to,
      }),
    enabled,
    placeholderData: (prev) => prev,
  })

  // Counts on the month chips: tasks by deadline month over the twelve
  // report months of this year (December of last year … November).
  const byMonthQuery = useQuery({
    queryKey: ['monitoring', 'overdue-by-month', branchId],
    queryFn: () =>
      apiGet<Record<string, number>>(`${TASKS_OVERDUE}/by-month`, {
        organization_branch_id: branchId,
        date_from: dayjs().startOf('year').subtract(1, 'month').format('YYYY-MM-DD'),
        date_to: dayjs().startOf('year').month(10).endOf('month').format('YYYY-MM-DD'),
      }),
    enabled,
  })

  const frequentLateQuery = useQuery({
    queryKey: ['monitoring', 'frequent-late', branchId],
    queryFn: () =>
      apiGet<FrequentLate[]>(DASHBOARD_LATE_EMPLOYEES_FREQUENT, {
        organization_branch_id: branchId,
        limit: 5,
        date_from: dayjs().startOf('month').format('YYYY-MM-DD'),
        date_to: dayjs().endOf('month').format('YYYY-MM-DD'),
      }),
    enabled: enabled && seesLateness,
  })

  const topKpiQuery = useQuery({
    queryKey: ['monitoring', 'top-kpi', branchId],
    queryFn: () =>
      apiGet<ListResponse<Record<string, any>>>(DASHBOARD_EMPLOYEE_KPI, {
        organization_branch_id: branchId,
        // v1 (getDefaultEmployeeKpiDateRange): the LAST 30 DAYS, not the
        // calendar month — early in a month that is nearly empty.
        date_from: dayjs().subtract(1, 'month').format('YYYY-MM-DD'),
        date_to: dayjs().format('YYYY-MM-DD'),
        sort: 'best_kpi',
        page: 1,
        size: 5,
      }),
    enabled,
  })

  // Refetch the aggregate on live activity, at most once per throttle window.
  const lastReload = useRef(0)
  const pendingReload = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!lastMessage || !enabled) return
    if (pendingReload.current) return
    const wait = Math.max(2_000, MAIN_STATS_THROTTLE_MS - (Date.now() - lastReload.current))
    pendingReload.current = setTimeout(() => {
      pendingReload.current = null
      lastReload.current = Date.now()
      void mainQuery.refetch()
    }, wait)
  }, [lastMessage, enabled, mainQuery])
  useEffect(
    () => () => {
      if (pendingReload.current) clearTimeout(pendingReload.current)
    },
    [],
  )


  // Live guest passages on top of today's API list (deduped by event id).
  const visitorEvents = useMemo(() => {
    const api = toItems(visitorsQuery.data)
    const liveKeys = new Set(liveVisitorEvents.map(eventKey).filter(Boolean))
    return [
      ...liveVisitorEvents,
      ...api.filter((e) => {
        const k = eventKey(e)
        return !k || !liveKeys.has(k)
      }),
    ].slice(0, MAX_VISITOR_EVENTS) as (TurnstileEvent & { is_live?: boolean })[]
  }, [visitorsQuery.data, liveVisitorEvents])

  // Live passes, newest first — the latecomers panel refreshes on them.
  const employeeEvents = useMemo(
    () => liveEmployeeEvents.slice(0, MAX_EMPLOYEE_EVENTS) as (TurnstileEvent & { is_live?: boolean })[],
    [liveEmployeeEvents],
  )

  return {
    wsStatus,
    stats: mainQuery.data ?? {},
    statsLoading: mainQuery.isLoading,
    employeeEvents,
    visitorEvents,
    liveLateCount: liveEmployeeEvents.filter((e) => latenessMinutes(e) != null).length,
    birthdays: birthdaysQuery.data ?? [],
    overdueSummary: overdueQuery.data ?? {},
    overdueTasks: toItems(overdueListQuery.data),
    /** {"YYYY-MM": count} by deadline month (the chips' numbers). */
    overdueByMonth: byMonthQuery.data ?? {},
    seesLateness,
    frequentLate: frequentLateQuery.data ?? [],
    topEmployees: toItems(topKpiQuery.data),
  }
}
