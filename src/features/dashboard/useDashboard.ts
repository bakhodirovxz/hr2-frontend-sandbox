import { CHECKIN_CANCELLED_EVENT } from '@/features/mobileCheckins/useMobileCheckins'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import {
  DASHBOARD_EMPLOYEES_BY_CATEGORY,
  DASHBOARD_MAIN,
  DASHBOARD_TODAY_VISITOR_COUNT,
  EMPLOYEE_BIRTHDAYS,
  TURNSTILE_DAY_BOARD,
} from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import { liveEventInBranch, useAttendanceSocket } from '@/features/monitoring/useAttendanceSocket'
import type { Birthday, DayBoard, EmployeesByCategory, MainStats, TurnstileEvent } from '@/types/dashboard'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { buildAttendanceRows, countByStatus, countDirections } from './attendance'

/** Passes the live column shows (and the board asks for in full). */
/** `latest=-1`: every pass of the day. The feed used to hold the newest 60
 *  only — a busy morning scrolled everyone before 08:46 out of reach (user
 *  2026-09-28). The day is fetched once and kept in the query cache; the
 *  socket adds new passes on top. */
const FEED_ALL = -1

const EMPTY_BOARD = { entries: 0, exits: 0, maxId: null as number | null, latest: [] as TurnstileEvent[], personEvents: [] as TurnstileEvent[] }

/** Re-attach the employee and gate each pass refers to by id — the shape the
 *  board's rows and the live column have always read. */
function hydrateBoard(b: DayBoard | undefined) {
  if (!b) return EMPTY_BOARD
  const emps = new Map(b.employees.map((e) => [e.id, e]))
  const gates = new Map(b.turnstiles.map((t) => [t.id, t]))
  const byId = new Map<number, TurnstileEvent>()
  for (const e of b.events) {
    const gate = e.turnstile_id != null ? gates.get(e.turnstile_id) : undefined
    byId.set(e.id, {
      ...e,
      employee: e.employee_id != null ? emps.get(e.employee_id) : undefined,
      turnstile: gate ?? null,
      turnstile_name: gate?.acs_dev_name ?? undefined,
    } as TurnstileEvent)
  }
  const pick = (id: number | null | undefined) => (id != null ? byId.get(id) : undefined)
  const personEvents: TurnstileEvent[] = []
  for (const p of b.people) {
    const seen = new Set<number>()
    for (const id of [p.last_id, p.entry_id, p.exit_id]) {
      const ev = pick(id)
      if (ev && !seen.has(ev.id!)) { seen.add(ev.id!); personEvents.push(ev) }
    }
  }
  return {
    entries: b.entries,
    exits: b.exits,
    maxId: b.max_id ?? null,
    latest: b.latest.map(pick).filter((e): e is TurnstileEvent => !!e),
    personEvents,
  }
}

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

/**
 * @param dayOffset 0 = bugun, 1 = kecha …  FAQAT turniket HODISALARI shu kunga
 *   suriladi: ular o'z vaqt tamg'asini olib yuradi. Qolgan bloklar (jamlanma,
 *   toifalar, tug'ilgan kunlar) sana parametrini QABUL QILMAYDI va bugungi
 *   javobni beradi — shuning uchun jonli tashrif paneli o'tgan kunda faqat
 *   hodisaga tayanadigan tablarni ko'rsatadi (izohi `LiveFeed` da).
 */
export function useDashboard(filters: DashboardFilters, dayOffset = 0) {
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const branchId = selectedBranchId ?? user?.employee?.department?.organization_branch_id ?? null

  const f = clean(filters)
  const keyBase = [branchId, f.department_id, f.job_position_id, f.search]
  const day = dayjs().subtract(dayOffset, 'day')

  const mainQuery = useQuery({
    queryKey: ['dashboard', 'main', ...keyBase],
    queryFn: () => apiGet<MainStats>(DASHBOARD_MAIN, { organization_branch_id: branchId, ...f }),
  })

  const categoriesQuery = useQuery({
    queryKey: ['dashboard', 'categories', ...keyBase],
    queryFn: () =>
      apiGet<EmployeesByCategory>(DASHBOARD_EMPLOYEES_BY_CATEGORY, {
        organization_branch_id: branchId,
        ...f,
      }),
  })

  /* THE DAY, FOLDED ON THE SERVER (2026-09-25).
     Until now this pulled the whole day's feed (`limit: 5000`, every pass
     with its nested employee and turnstile — 1.5 MB for one ordinary day of
     one branch) and folded it here into one row per person. A day past 5000
     passes was silently cut and the cut-off people read as absent.
     `day-board` does the fold server-side with no cap and sends only the
     passes the board draws: each person's first entry / last exit / last
     pass plus every pass of the day (the feed), with every employee and
     gate listed once. */
  const boardQuery = useQuery({
    queryKey: ['dashboard', 'day-board', ...keyBase, dayOffset],
    queryFn: () =>
      apiGet<DayBoard>(TURNSTILE_DAY_BOARD, {
        organization_branch_id: branchId,
        day: day.format('YYYY-MM-DD'),
        /* A guest employee — someone from another branch who badged at THIS
           branch's turnstile — belongs on this feed as well as on their own
           branch's (`project_cross_branch_events`). It does NOT affect the
           attendance counts. */
        include_cross_branch: true,
        latest: FEED_ALL,
        ...f,
      }),
    /* O'tgan kun o'zgarmaydi. BUGUNGI kun WebSocket orqali keladi (pastdagi
       `useAttendanceSocket`), so'rov esa ZAXIRA: soket uzilsa ham lenta
       yangilanadi. */
    refetchInterval: dayOffset === 0 ? 300_000 : false,
  })

  const birthdaysQuery = useQuery({
    queryKey: ['dashboard', 'birthdays', ...keyBase],
    queryFn: () =>
      apiGet<ListResponse<Birthday>>(EMPLOYEE_BIRTHDAYS, {
        organization_branch_id: branchId,
        /* The face draws 6. `limit: 60` cost 72 KB per load for 54 rows
           nobody sees; without a limit the route returns 2.7 MB. */
        limit: 12,
        ...f,
      }),
  })

  // Visitors are branch-scoped but not department-filtered, so the key skips
  // the dept/pos/search filters on purpose.
  const visitorsQuery = useQuery({
    queryKey: ['dashboard', 'visitors', branchId],
    queryFn: () =>
      apiGet<{ count: number }>(DASHBOARD_TODAY_VISITOR_COUNT, {
        organization_branch_id: branchId,
      }),
  })

  /**
   * JONLI TURNIKET OQIMI — bosh sahifa haqiqatan ham jonli bo'ladi.
   *
   * Ilgari doska har 2 daqiqada so'rov yuborardi va yonida «real vaqt» deb
   * turardi: xodim turniketdan o'tgach lentada ikki daqiqagacha ko'rinmasdi.
   * Soket faqat BUGUNGI kun uchun ochiladi — o'tgan kun o'zgarmaydi.
   */
  const { status: wsStatus, lastMessage } = useAttendanceSocket(dayOffset === 0)
  const [liveEvents, setLiveEvents] = useState<TurnstileEvent[]>([])

  // Kun almashsa (yoki filial o'zgarsa) jonli lenta tozalanadi — aks holda
  // kechagi o'tishlar bugungi hisobga qo'shilib ketardi.
  useEffect(() => setLiveEvents([]), [dayOffset, branchId])

  // Kadr telefon belgisini bekor qildi: doska qayta so'raladi, lekin soket
  // orqali kelgan nusxasi shu ro'yxatda qolardi — uni ham olib tashlaymiz.
  useEffect(() => {
    const drop = (ev: Event) => {
      const id = (ev as CustomEvent<{ checkinId: number }>).detail?.checkinId
      if (id == null) return
      setLiveEvents((prev) => prev.filter((e) => e.mobile_checkin?.id !== id))
    }
    window.addEventListener(CHECKIN_CANCELLED_EVENT, drop)
    return () => window.removeEventListener(CHECKIN_CANCELLED_EVENT, drop)
  }, [])

  useEffect(() => {
    const m = lastMessage
    if (!m || dayOffset !== 0) return
    // Mehmon o'tishi alohida lentaga tegishli (`useGuestPasses`).
    if (!m.employee_id) return
    // Only passes this branch's board shows (the REST board applies the
    // same rule, so a reload no longer "removes" foreign passes).
    if (!liveEventInBranch(m, branchId)) return
    setLiveEvents((prev) => {
      const key = m.event_id ?? m.id
      if (key != null && prev.some((e) => (e.id ?? null) === key)) return prev
      return [m as unknown as TurnstileEvent, ...prev].slice(0, 500)
    })
  }, [lastMessage, dayOffset, branchId])

  const board = useMemo(() => hydrateBoard(boardQuery.data), [boardQuery.data])
  /** Socket passes the board has not counted yet (newer than its `max_id`). */
  const fresh = useMemo(
    () => liveEvents.filter((e) => board.maxId == null || e.id == null || Number(e.id) > board.maxId),
    [liveEvents, board.maxId],
  )
  /** The live column: new socket passes on top of the board's newest. */
  const events = useMemo(
    () => (fresh.length ? [...fresh, ...board.latest] : board.latest),
    [fresh, board.latest],
  )

  // Each person's decisive passes (+ anything newer from the socket) fold into
  // the same rows the old full-day fold produced.
  const rows = useMemo(
    () => buildAttendanceRows([...fresh, ...board.personEvents], categoriesQuery.data),
    [fresh, board.personEvents, categoriesQuery.data],
  )
  const counts = useMemo(() => countByStatus(rows), [rows])
  const birthdays = toItems(birthdaysQuery.data)

  // The console strip: raw pass counts + who is in the building right now.
  const directions = useMemo(() => {
    const live = countDirections(fresh)
    return { entries: board.entries + live.entries, exits: board.exits + live.exits }
  }, [fresh, board.entries, board.exits])
  const insideCount = useMemo(
    () => rows.filter((r) => r.entry && !r.hasExited).length,
    [rows],
  )

  // Prefer derived counts (match the table); fall back to server totals early.
  const totalEmployees =
    counts.total || mainQuery.data?.total_employees_count || rows.length || 0

  return {
    branchId,
    /** Raw pass events, newest first — the live register reads these. */
    events,
    /** Soket holati — lentadagi «JONLI/Uzildi» belgisi shuni aytadi. */
    wsStatus,
    rows,
    counts,
    totalEmployees,
    entriesToday: directions.entries,
    exitsToday: directions.exits,
    insideCount,
    /** undefined while loading yoki endpoint bu rol uchun yopiq bo'lsa. */
    visitorsToday: visitorsQuery.data?.count,
    birthdays,
    mainStats: mainQuery.data,
    loading: mainQuery.isLoading || categoriesQuery.isLoading || boardQuery.isLoading,
    tableLoading: categoriesQuery.isLoading || boardQuery.isLoading,
    birthdaysLoading: birthdaysQuery.isLoading,
  }
}
