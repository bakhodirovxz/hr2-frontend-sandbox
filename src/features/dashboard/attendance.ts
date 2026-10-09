import dayjs from 'dayjs'
import type { Employee } from '@/types'
import type {
  AttendanceCategory,
  AttendanceRow,
  AttendanceStatusKey,
  EmployeesByCategory,
  TurnstileEvent,
} from '@/types/dashboard'
import type { BadgeTone } from '@/components/ui'

/** entry=1, exit=2, unknown=0 — mirrors the v1 direction detection. */
function eventType(e: TurnstileEvent): 0 | 1 | 2 {
  if (e.direction_type === 'entrance' || e.check_in_out_type === 1) return 1
  if (e.direction_type === 'exit' || e.check_in_out_type === 2) return 2
  const dev = (e.turnstile?.acs_dev_name || '').toLowerCase()
  if (dev.includes('chiqish') || dev.includes('exit')) return 2
  return 1
}

interface Grouped {
  id: number
  employee: Employee
  turnstile: string | null
  entry: TurnstileEvent | null
  exit: TurnstileEvent | null
  lastEventType: 'entry' | 'exit' | null
  lastEventTime: string | null
}

/** Group raw turnstile events into one entry/exit record per employee. */
function groupByEmployee(events: TurnstileEvent[]): Map<string, Grouped> {
  const groups = new Map<string, Grouped>()
  for (const e of events) {
    const empId = e.employee_id
    if (!empId) continue
    const key = String(empId)
    let g = groups.get(key)
    if (!g) {
      g = {
        id: empId,
        employee: e.employee || ({ id: empId } as Employee),
        turnstile: e.turnstile?.acs_dev_name || e.turnstile_name || e.turnstile?.name || null,
        entry: null,
        exit: null,
        lastEventType: null,
        lastEventTime: null,
      }
      groups.set(key, g)
    }
    const t = eventType(e)
    if (t === 1) {
      if (!g.entry || dayjs(e.happen_time).isBefore(dayjs(g.entry.happen_time))) g.entry = e
    } else if (t === 2) {
      if (!g.exit || dayjs(e.happen_time).isAfter(dayjs(g.exit.happen_time))) g.exit = e
    }
    if (!g.lastEventTime || dayjs(e.happen_time).isAfter(dayjs(g.lastEventTime))) {
      g.lastEventTime = e.happen_time
      g.lastEventType = t === 2 ? 'exit' : 'entry'
    }
  }
  return groups
}

/**
 * Merge turnstile events with the per-category employee lists into one row per
 * employee, carrying an attendance category. Ported from the v1
 * unifiedAttendance logic so counts match the donut exactly.
 */
export function buildAttendanceRows(
  events: TurnstileEvent[],
  categorized: EmployeesByCategory | undefined,
): AttendanceRow[] {
  const grouped = groupByEmployee(events.filter((e) => !!e.employee_id))

  const rows = new Map<string, AttendanceRow>()
  const away = new Set(categorized?.away_employee_ids ?? [])
  const consume = (list: Employee[] | undefined, category: AttendanceCategory) => {
    if (!list) return
    for (const emp of list) {
      const key = String(emp.id)
      if (rows.has(key)) continue
      const attended = grouped.get(key)
      const hasEvent = !!(attended?.entry || attended?.exit)
      rows.set(key, {
        id: emp.id,
        employee: emp,
        turnstile: attended?.turnstile ?? null,
        entry: attended?.entry ?? null,
        exit: attended?.exit ?? null,
        hasExited: attended?.lastEventType === 'exit',
        // present list members with no event stay 'Kelmagan' only via absent list;
        // here a present-with-event stays their category.
        category: hasEvent && category === 'absent' ? 'present' : category,
        note: emp.category_name ?? null,
        ...(category === 'trip' && away.has(emp.id) ? { away: true } : {}),
      })
      grouped.delete(key)
    }
  }

  // Order matters: specialized statuses before 'present' (that list overlaps them).
  consume(categorized?.late_employees, 'late')
  consume(categorized?.on_vacation_employees, 'vacation')
  consume(categorized?.on_business_trip_employees, 'trip')
  consume(categorized?.on_sick_leave_employees, 'sick')
  consume(categorized?.on_dekret_employees, 'dekret')
  consume(categorized?.on_leave_employees, 'leave')
  consume(categorized?.present_employees, 'present')
  consume(categorized?.absent_employees, 'absent')

  // Anyone with events but not in any category list → present.
  grouped.forEach((g, key) => {
    if (rows.has(key)) return
    rows.set(key, {
      id: g.id,
      employee: g.employee,
      turnstile: g.turnstile,
      entry: g.entry,
      exit: g.exit,
      hasExited: g.lastEventType === 'exit',
      category: 'present',
    })
  })

  return Array.from(rows.values()).sort((a, b) =>
    (a.employee.legal_name || '').toLowerCase().localeCompare(
      (b.employee.legal_name || '').toLowerCase(),
      'uz',
    ),
  )
}

/**
 * HOZIR ISHDA — arrived today (on time or late) and the last pass was NOT an
 * exit. Someone who entered last night and is still inside is in
 * `present_employees` with no pass today (`still_inside_since`), so
 * `hasExited` is false and they count too.
 */
export function isInside(row: AttendanceRow): boolean {
  return (row.category === 'present' || row.category === 'late') && !row.hasExited
}

/** Counts per donut slice, derived from the same rows the table shows. */
export interface StatusCounts {
  present: number // vaqtida kelganlar (late alohida)
  arrived: number // present + late
  /** Arrived and not yet gone — the "Hozir ishda" filter. */
  inside: number
  late: number
  absent: number
  vacation: number
  trip: number
  sick: number
  leave: number
  dekret: number
  /** "Boshqa" — buyruq/ariza asosida yo'q bo'lganlar (ta'til+safar+kasallik+dekret+leave). */
  other: number
  total: number
}

export function countByStatus(rows: AttendanceRow[]): StatusCounts {
  const c = { present: 0, late: 0, absent: 0, vacation: 0, trip: 0, sick: 0, leave: 0, dekret: 0 }
  let inside = 0
  for (const r of rows) {
    c[r.category]++
    if (isInside(r)) inside++
  }
  const arrived = c.present + c.late
  const other = c.vacation + c.trip + c.sick + c.leave + c.dekret
  return {
    ...c,
    arrived,
    inside,
    other,
    total: arrived + c.absent + other,
  }
}

/** Bugungi KIRISH/CHIQISH urinishlari soni (xom oqim, xodim bo'yicha emas). */
export function countDirections(events: TurnstileEvent[]): { entries: number; exits: number } {
  let entries = 0
  let exits = 0
  for (const e of events) {
    const t = eventType(e)
    if (t === 1) entries++
    else if (t === 2) exits++
  }
  return { entries, exits }
}

/** Derive the badge status KEY (+ tone) for a row. The visible text is resolved
 *  from the i18n dictionary: t(`status.${key}`). */
export function getDisplayStatus(row: AttendanceRow): {
  key: AttendanceStatusKey
  tone: BadgeTone
  chart?: number
} {
  const denied =
    (row.entry && row.entry.is_granted === false) || (row.exit && row.exit.is_granted === false)
  if (denied) return { key: 'denied', tone: 'danger' }

  switch (row.category) {
    case 'present':
      return row.hasExited ? { key: 'left', tone: 'neutral' } : { key: 'present', tone: 'success' }
    case 'late':
      return row.hasExited ? { key: 'left', tone: 'neutral' } : { key: 'arrived', tone: 'success' }
    case 'absent':
      return { key: 'absent', tone: 'danger' }
    case 'vacation':
      return { key: 'vacation', tone: 'info' }
    case 'trip':
      return row.away ? { key: 'away', tone: 'brand', chart: 2 } : { key: 'trip', tone: 'brand', chart: 2 }
    case 'sick':
      return { key: 'sick', tone: 'brand', chart: 5 }
    case 'leave':
      return { key: 'leave', tone: 'info', chart: 4 }
    case 'dekret':
      return { key: 'dekret', tone: 'brand', chart: 6 }
  }
}

export function formatTime(iso?: string | null): string {
  return iso ? dayjs(iso).format('HH:mm') : '—:—'
}

export function jobTitle(emp: Employee): string {
  const jp = emp.job_position
  if (!jp) return ''
  return typeof jp === 'object' ? jp.name || '' : jp
}
