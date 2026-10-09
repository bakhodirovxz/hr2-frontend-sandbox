/**
 * Part-time two-week cycle on the client — the same arithmetic as the server
 * (hrm-backend services/work_cycle.py).
 *
 * `weekly_schedule` is week 1, `weekly_schedule_alt` week 2, and
 * `schedule_cycle_anchor` the Monday of a week 1. `working_days` holds the
 * UNION of both weeks, so a screen that tests a date against it alone would
 * call a week-2 rest day a work day; `workWeekdaysOn` answers for that week.
 */
type DayWindow = { start?: string | null; end?: string | null } | null | undefined
type WeekMap = Record<string, DayWindow>

export interface WorkScheduleSource {
  working_days?: number[] | null
  stavka?: number | string | null
  weekly_schedule?: unknown
  weekly_schedule_alt?: unknown
  schedule_cycle_anchor?: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`)

/** Monday (YYYY-MM-DD, local) of the week `d` falls in. */
export function mondayOf(d: Date): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return ymd(x)
}

/** 1 or 2 — whole weeks from the anchor's Monday, earlier dates included. */
export function cycleWeekOf(anchor: string, d: Date = new Date()): 1 | 2 {
  const a = parseDay(mondayOf(parseDay(anchor)))
  const b = parseDay(mondayOf(d))
  const weeks = Math.round((b.getTime() - a.getTime()) / (7 * 86_400_000))
  return ((weeks % 2) + 2) % 2 === 0 ? 1 : 2
}

const isMap = (v: unknown): v is WeekMap => !!v && typeof v === 'object' && !Array.isArray(v)

function daysOfMap(m: WeekMap): number[] {
  return Object.entries(m)
    .filter(([, v]) => !!v?.start && !!v?.end)
    .map(([k]) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    .sort((a, b) => a - b)
}

/** Monday-indexed weekdays the person works in the week of `date`. */
export function workWeekdaysOn(src: WorkScheduleSource | null | undefined, date: string | Date): number[] {
  const fallback = src?.working_days?.length ? src.working_days : [0, 1, 2, 3, 4]
  if (!src) return fallback
  const partTime = src.stavka != null && Number(src.stavka) < 1
  const alt = src.weekly_schedule_alt
  if (partTime && isMap(alt) && Object.keys(alt).length && src.schedule_cycle_anchor) {
    const d = typeof date === 'string' ? parseDay(date) : date
    const week = cycleWeekOf(src.schedule_cycle_anchor, d)
    const map = week === 2 ? alt : src.weekly_schedule
    if (isMap(map)) return daysOfMap(map)
  }
  return fallback
}

/** Is `date` (YYYY-MM-DD) a scheduled work weekday for this person? */
export function isScheduledWeekday(src: WorkScheduleSource | null | undefined, date: string): boolean {
  return workWeekdaysOn(src, date).includes((parseDay(date).getDay() + 6) % 7)
}
