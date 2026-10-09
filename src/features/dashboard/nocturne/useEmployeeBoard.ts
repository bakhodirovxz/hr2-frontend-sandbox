import { useEffect, useMemo, useState } from 'react'
import dayjs from 'dayjs'
import { useAuthStore } from '@/store/authStore'
import { useAttendance } from '@/features/attendance/useAttendance'
import { useMonthEvents, formatDayRange, insideMinutes, eventDirection } from '@/features/attendance/useDayEvents'
import { mapCalStatus, type CalStatus } from '@/features/attendance/attendanceStatus'
import { useMyLeaveRequests, leaveStatusKey } from '@/features/leave/useLeave'
import { useIjroTasks } from './useBoardData'

export interface MyDay {
  iso: string
  status: CalStatus
  /** "09:12–18:04", or just the entry when they have not badged out yet. */
  range: string
  /** No exit yet and it is today — they are still inside. */
  open: boolean
}

/** How the month's days fall across the statuses the tabel ring draws. */
export interface TabelTally {
  present: number
  late: number
  absent: number
  leave: number
  trip: number
  sick: number
  /** Everything above — the days that COUNT, so weekends never inflate it. */
  counted: number
}

const LEAVE_STATUSES: CalStatus[] = [
  'annual_leave',
  'work_leave',
  'unpaid_leave',
  'other_leave',
  'dekret',
]

/**
 * Everything the employee's own board reads, in one hook.
 *
 * It is deliberately built from the endpoints the employee ALREADY reaches on
 * their own screens — the normalized attendance for the month, their raw
 * badges, their leave requests, their execution register —
 * so the board shows nothing a person could not already open, and nothing on
 * it is invented. There is no leave-balance endpoint on this API, which is why
 * this board counts worked days instead of promising a remaining-days figure.
 */
export function useEmployeeBoard() {
  const user = useAuthStore((s) => s.user)
  const employee = user?.employee
  const employeeId = employee?.id

  const today = dayjs()
  const month = today.startOf('month')
  const from = month.format('YYYY-MM-DD')
  const to = today.format('YYYY-MM-DD')

  const { rows, loading: attLoading } = useAttendance({
    from,
    to,
    page: 1,
    size: 1,
    employeeId,
  })
  // Strictly this employee: `?? rows[0]` would show somebody else's month as
  // your own the moment the filter stops being applied.
  const myRow = rows.find((r) => r.id === employeeId)
  const summary = myRow?.attendance
  const calendar = summary?.calendar ?? {}

  const { byDay, loading: eventsLoading } = useMonthEvents(employeeId, month, true)

  /* «Shu hafta» crosses into the previous month on its first days (Mon 28-Sep
     on Fri 2-Oct). The month queries above start on the 1st, so those days had
     neither a status nor a pass and every one of them read «Dam olish» with a
     «—» (2026-10-02). Fetch the week's head separately; the month tallies stay
     on the current month. */
  const monday = today.subtract((today.day() + 6) % 7, 'day').startOf('day')
  const weekCrosses = monday.isBefore(month)
  const { rows: prevRows } = useAttendance({
    from: monday.format('YYYY-MM-DD'),
    to: month.subtract(1, 'day').format('YYYY-MM-DD'),
    page: 1,
    size: 1,
    employeeId,
    enabled: weekCrosses && !!employeeId,
  })
  const prevCalendar = (weekCrosses && prevRows.find((r) => r.id === employeeId)?.attendance?.calendar) || null
  const { byDay: prevByDay } = useMonthEvents(weekCrosses ? employeeId : undefined, monday)
  // ⚠️ No `my-scorecard` here (2026-10-05). The KPI tile reads
  // `/dashboard/my-kpi-sheets` (MyKpiCard); this call fed a `kpiPercent` that
  // nothing rendered, and in a branch with KPI switched off it answered 403
  // «KPI moduli … yoqilmagan» on every board open — journalled as «KPI — Xato».
  const { all: leaves, pendingCount: pendingRequests, loading: leavesLoading } = useMyLeaveRequests(user?.employee?.id)
  const { tasks, counts: taskCounts, loading: tasksLoading } = useIjroTasks({
    employeeId,
    enabled: !!employeeId,
  })

  /* ── Bugun ────────────────────────────────────────────────────────────── */
  const todayIso = today.format('YYYY-MM-DD')
  const todayEvents = byDay.get(todayIso) ?? null
  const arrivedAt = todayEvents?.entry?.happen_time
    ? dayjs(todayEvents.entry.happen_time).format('HH:mm')
    : null
  // Live «Ish vaqti»: while the person is inside (last pass today is an
  // entrance) the figure is recomputed in the browser every 30 s — the open
  // stretch is closed at «now» (insideMinutes). No request is made for it.
  const lastToday = todayEvents?.all.length ? todayEvents.all[todayEvents.all.length - 1] : null
  const insideNow = !!lastToday && eventDirection(lastToday) === 'entry'
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!insideNow) return
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000)
    return () => window.clearInterval(id)
  }, [insideNow])
  // The person's own window end and lunch (as the day modal uses), not the
  // 18:00 / 13:00–14:00 defaults.
  const workedMinutes = todayEvents
    ? insideMinutes(
        todayEvents.all,
        (myRow?.working_hours_end ?? employee?.working_hours_end ?? '').slice(0, 5) || undefined,
        { start: myRow?.lunch_start_time, end: myRow?.lunch_end_time },
      )
    : 0

  /* ── Shu hafta (dushanbadan bugungacha) ───────────────────────────────── */
  const week = useMemo<MyDay[]>(() => {
    const dow = (today.day() + 6) % 7 // Monday = 0
    const monday = today.subtract(dow, 'day')
    const out: MyDay[] = []
    for (let i = 0; i <= dow; i++) {
      const d = monday.add(i, 'day')
      const iso = d.format('YYYY-MM-DD')
      const day = byDay.get(iso) ?? prevByDay.get(iso)
      out.push({
        iso,
        status: mapCalStatus(calendar[iso] ?? prevCalendar?.[iso]),
        range: formatDayRange(day),
        open: iso === todayIso && !!day?.entry && !day?.exit,
      })
    }
    return out.reverse()
    // `today` is a fresh dayjs each render; the day string is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDay, prevByDay, calendar, prevCalendar, todayIso])

  /* ── Tabel (joriy oy) ─────────────────────────────────────────────────── */
  const tabel = useMemo<TabelTally>(() => {
    const tally: TabelTally = {
      present: 0,
      late: 0,
      absent: 0,
      leave: 0,
      trip: 0,
      sick: 0,
      counted: 0,
    }
    for (const raw of Object.values(calendar)) {
      const s = mapCalStatus(raw)
      if (s === 'present' || s === 'early_leave') tally.present++
      else if (s === 'late') tally.late++
      else if (s === 'absent') tally.absent++
      else if (s === 'business_trip') tally.trip++
      else if (s === 'sick_leave') tally.sick++
      else if (LEAVE_STATUSES.includes(s)) tally.leave++
      else continue // day_off / dismissed — not a working day
      tally.counted++
    }
    return tally
  }, [calendar])

  /* ── So'rovlarim ──────────────────────────────────────────────────────── */
  const requests = useMemo(
    () => leaves.map((r) => ({ ...r, statusKey: leaveStatusKey(r.status) })),
    [leaves],
  )

  const attendancePct = tabel.counted
    ? Math.round(((tabel.present + tabel.late) / tabel.counted) * 100)
    : 0

  return {
    employee,
    arrivedAt,
    workedMinutes,
    todayEvents: todayEvents?.all ?? [],
    week,
    tabel,
    attendancePct,
    summary,
    tasks,
    taskCounts,
    requests,
    pendingRequests,
    loading: attLoading || eventsLoading,
    tasksLoading,
    leavesLoading,
  }
}
