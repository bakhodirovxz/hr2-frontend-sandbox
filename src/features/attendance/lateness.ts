import dayjs from 'dayjs'
import { workWeekdaysOn } from '@/lib/workCycle'

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
