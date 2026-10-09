import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { TURNSTILE_ATTENDANCE_EVENTS } from '@/api/endpoints'

export interface TurnstileLocation {
  id?: number
  name?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  organization_branch?: { id?: number; name?: string | null } | null
}

export interface TurnstileEvent {
  id: number
  happen_time?: string | null
  direction_type?: string | null
  check_in_out_type?: number | null
  /** Snapshot the reader took at the moment of the pass. */
  photo_path?: string | null
  /** MinIO thumbnail (2026-09-14+); read `photo_thumb_path || photo_path`. */
  photo_thumb_path?: string | null
  pic_uri?: string | null
  turnstile?: {
    acs_dev_name?: string | null
    display_name?: string | null
    /** A turnstile belongs to a LIST of locations, not one. */
    locations?: TurnstileLocation[] | null
  } | null
  /** Telefondan qo'yilgan belgi (xizmat safari) — joy, manzildan masofa. Turniket o'tishida null. */
}

/**
 * Where the pass happened. Prefers a location that carries coordinates so the
 * map has something to centre on; falls back to the first one.
 */
export function eventLocation(e?: TurnstileEvent | null): TurnstileLocation | null {
  const list = e?.turnstile?.locations ?? []
  return list.find((l) => l?.latitude != null && l?.longitude != null) ?? list[0] ?? null
}

/** Human name of the gate itself. */
export function turnstileName(e?: TurnstileEvent | null): string {
  return e?.turnstile?.display_name || e?.turnstile?.acs_dev_name || ''
}

export interface DayEvents {
  /** Earliest entrance of the day. */
  entry: TurnstileEvent | null
  /** Latest exit of the day. */
  exit: TurnstileEvent | null
  /** Every badge of that day, oldest first. */
  all: TurnstileEvent[]
}

/**
 * Which way the person walked. HikCentral is inconsistent about which field it
 * fills, so fall back to the turnstile's name (v1 does the same) — and treat
 * anything still unknown as an entrance, which is what the reader defaults to.
 */
export function eventDirection(e: TurnstileEvent): 'entry' | 'exit' {
  if (e.direction_type === 'entrance' || e.check_in_out_type === 1) return 'entry'
  if (e.direction_type === 'exit' || e.check_in_out_type === 2) return 'exit'
  const dev = (e.turnstile?.acs_dev_name ?? '').toLowerCase()
  return dev.includes('chiqish') || dev.includes('exit') ? 'exit' : 'entry'
}

/**
 * One month of raw turnstile badges for one employee, grouped by day.
 *
 * The whole month is fetched in a single request and reused for both the "09:12
 * – 18:04" label on each calendar cell and the per-day detail — opening a day
 * costs no extra round-trip.
 *
 * Deliberately NOT branch-scoped: this is the signed-in user's own record, and
 * a badge at another branch (a trip, a meeting) is still their attendance. The
 * endpoint already restricts non-privileged callers to themselves.
 */
export function useMonthEvents(
  employeeId: number | undefined,
  month: dayjs.Dayjs,
  /** The live «Mening kunim» board: new passes are picked up when the tab
   *  regains focus and every 5 minutes while it is visible (never in the
   *  background) — one small request, not a stream. */
  live = false,
) {
  const from = month.startOf('month').format('YYYY-MM-DD')
  const to = month.endOf('month').format('YYYY-MM-DD')

  const query = useQuery({
    queryKey: ['my-turnstile-events', employeeId, from],
    queryFn: () =>
      apiGet<TurnstileEvent[]>(TURNSTILE_ATTENDANCE_EVENTS, {
        employee_id: employeeId,
        happen_time_from: `${from}T00:00:00`,
        happen_time_to: `${to}T23:59:59`,
        _no_branch_inject: true,
      }),
    enabled: !!employeeId,
    placeholderData: (prev) => prev,
    ...(live ? { refetchOnWindowFocus: true, refetchInterval: 5 * 60_000 } : {}),
  })

  const byDay = useMemo(() => {
    const map = new Map<string, DayEvents>()
    for (const e of query.data ?? []) {
      if (!e.happen_time) continue
      const iso = dayjs(e.happen_time).format('YYYY-MM-DD')
      const bucket = map.get(iso) ?? { entry: null, exit: null, all: [] }
      bucket.all.push(e)
      const t = dayjs(e.happen_time)
      if (eventDirection(e) === 'entry') {
        if (!bucket.entry || t.isBefore(dayjs(bucket.entry.happen_time))) bucket.entry = e
      } else if (!bucket.exit || t.isAfter(dayjs(bucket.exit.happen_time))) {
        bucket.exit = e
      }
      map.set(iso, bucket)
    }
    for (const bucket of map.values()) {
      bucket.all.sort((a, b) => dayjs(a.happen_time).valueOf() - dayjs(b.happen_time).valueOf())
    }
    return map
  }, [query.data])

  return { byDay, loading: query.isLoading }
}

/** "09:12 – 18:04", or just the entry when the person hasn't badged out yet. */
export function formatDayRange(day?: DayEvents | null): string {
  if (!day?.entry?.happen_time) return ''
  const inT = dayjs(day.entry.happen_time).format('HH:mm')
  if (!day.exit?.happen_time) return inT
  const outT = dayjs(day.exit.happen_time).format('HH:mm')
  return inT === outT ? inT : `${inT}–${outT}`
}

/** The working day the backend assumes when an employee has no explicit shift. */
const DEFAULT_END = '18:00'
/** A single day never counts as more than a full shift. */

/** Entrance→exit pairs, clamped to the start of the work window. */
/**
 * entrance→exit pairs: the stretches actually spent inside.
 *
 * ⚠️ THE START IS NOT CLAMPED to the work window. It used to be, and that is a
 * decision v1 REVERSED on 2026-08-14 after it was found to destroy the very
 * number this feeds: someone who badged in at 07:54 had those minutes erased,
 * and the figure is called "Ishlangan vaqt (FAKT)" — it must return the fact.
 * Capping to the norm belongs to the downloadable tabel and happens on the
 * SERVER, against each employee's own window.
 *
 * `end` is used for one thing only: closing a day that has no exit at all.
 */
function insideSegments(events: TurnstileEvent[], end: dayjs.Dayjs) {
  const segments: [dayjs.Dayjs, dayjs.Dayjs][] = []
  let open: dayjs.Dayjs | null = null
  for (const e of events) {
    const t = dayjs(e.happen_time)
    if (eventDirection(e) === 'entry') {
      // Consecutive entrances (a re-scan at the same gate) keep the first one.
      if (open === null) open = t
    } else if (open !== null) {
      if (t.isAfter(open)) segments.push([open, t])
      open = null
    }
  }
  // Entered and never scanned out: assume they stayed until the day ended.
  if (open !== null && end.isAfter(open)) segments.push([open, end])
  return segments
}

/**
 * Where a still-open stretch (entered, no exit yet) is closed.
 *
 * A past day: the end of the working window — the exit was simply missed.
 * TODAY: now, if the window has not ended yet. Closing it at 18:00 counted
 * hours that had not happened: someone back in at 15:30 read «6 s 58 daq» at
 * 16:00 (4 entrances, 3 exits — 2026-10-02).
 */
function closeOpenAt(day: string, windowEnd: dayjs.Dayjs): dayjs.Dayjs {
  const now = dayjs()
  return day === now.format('YYYY-MM-DD') && now.isBefore(windowEnd) ? now : windowEnd
}

/**
 * Minutes actually spent INSIDE the building — the FACT.
 *
 * Not `last exit − first entry`: that span counts a mid-day absence as worked
 * (leaving at 10:12 and returning at 18:05 would read as ~11 hours). Entrances
 * are paired with exits instead.
 *
 * ⚠️ NO NORM CAP AND NO WINDOW CLAMP. Both used to be here and both destroyed
 * the number: 07:54–17:01 came out as "8 soat 0 daqiqa", losing five minutes at
 * the start and seven at the end. v1 removed them on 2026-08-14 for exactly
 * that reason; this is the fact, and capping to the norm is the tabel's job,
 * on the server, against each employee's own window.
 *
 * ⚠️ LUNCH COMES FROM THE EMPLOYEE, not from a fixed 13:00–14:00. On this
 * database 1200 people lunch at 12:00 and 1101 at 13:00 — the hard-coded window
 * was wrong for the LARGER half, and doubly wrong for someone who badged out at
 * 12:00: their real hour outside was already excluded, and an hour of 13:00–
 * 14:00 was then deducted on top of it.
 *
 * Deduction happens only when they never scanned out for lunch; if they did,
 * the time outside is already excluded by the pairing.
 */
export function insideMinutes(
  events: TurnstileEvent[],
  workingEnd = DEFAULT_END,
  lunch?: { start?: string | null; end?: string | null } | null,
): number {
  const sorted = [...events].filter((e) => e.happen_time)
  if (sorted.length === 0) return 0

  const day = dayjs(sorted[0].happen_time).format('YYYY-MM-DD')
  const at = (hhmm: string) => dayjs(`${day}T${hhmm}:00`)
  const lunchFrom = (lunch?.start ?? '').slice(0, 5) || '13:00'
  const lunchTo = (lunch?.end ?? '').slice(0, 5) || '14:00'
  const hasLunch = lunchTo > lunchFrom
  const lunchStart = at(lunchFrom)
  const lunchEnd = at(lunchTo)

  const segments = insideSegments(sorted, closeOpenAt(day, at(workingEnd)))
  let seconds = segments.reduce((acc, [s, e]) => acc + e.diff(s, 'second'), 0)
  if (seconds <= 0) return 0
  if (!hasLunch) return Math.floor(seconds / 60)

  const scannedOutForLunch = sorted
    .filter((e) => eventDirection(e) === 'exit')
    .map((e) => dayjs(e.happen_time))
    .some((t) => !t.isBefore(lunchStart) && !t.isAfter(lunchEnd.add(30, 'minute')))

  if (!scannedOutForLunch) {
    let overlap = 0
    for (const [s, e] of segments) {
      const os = s.isAfter(lunchStart) ? s : lunchStart
      const oe = e.isBefore(lunchEnd) ? e : lunchEnd
      if (oe.isAfter(os)) overlap += oe.diff(os, 'second')
    }
    seconds = Math.max(0, seconds - overlap)
  }
  return Math.floor(seconds / 60)
}

interface DayBreak {
  start: string
  end: string
  minutes: number
}

/** The stretches spent OUTSIDE between two in-building segments. */
export function dayBreaks(events: TurnstileEvent[], workingEnd = DEFAULT_END): DayBreak[] {
  const sorted = [...events].filter((e) => e.happen_time)
  if (sorted.length < 2) return []

  const day = dayjs(sorted[0].happen_time).format('YYYY-MM-DD')
  const at = (hhmm: string) => dayjs(`${day}T${hhmm}:00`)

  /* ⚠️ NOT clamped to the work window — paired exactly like `insideMinutes`,
     so the two readings can never contradict each other. They once did: a
     person who left at 10:12 and came back at 18:05 had that absence counted
     against their worked time, yet "Tanaffus" showed nothing at all because
     the window cut the gap off at 17:00. */
  const segments = insideSegments(sorted, closeOpenAt(day, at(workingEnd)))

  const out: DayBreak[] = []
  for (let i = 1; i < segments.length; i++) {
    const gapStart = segments[i - 1][1]
    const gapEnd = segments[i][0]
    const minutes = gapEnd.diff(gapStart, 'minute')
    if (minutes > 0) {
      out.push({ start: gapStart.format('HH:mm'), end: gapEnd.format('HH:mm'), minutes })
    }
  }
  return out
}

/** "7 soat 12 daqiqa" / "45 daqiqa". */
export function formatMinutes(total: number, hourUnit: string, minuteUnit: string): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} ${minuteUnit}`
  return m === 0 ? `${h} ${hourUnit}` : `${h} ${hourUnit} ${m} ${minuteUnit}`
}
