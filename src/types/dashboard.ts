import type { EventMobileCheckin } from '@/features/mobileCheckins/useMobileCheckins'
import type { Employee, JobPosition } from './index'

/** A raw turnstile (gate) access event. */
export interface TurnstileEvent {
  id?: number
  employee_id?: number
  employee?: Employee
  happen_time: string
  direction_type?: 'entrance' | 'exit' | string
  check_in_out_type?: number
  is_granted?: boolean
  /** The reader's snapshot of this pass (presigned) and its 160px copy. */
  photo_path?: string | null
  photo_thumb_path?: string | null
  turnstile?: { acs_dev_name?: string; name?: string } | null
  turnstile_name?: string
  visitor_id?: number
  /** `EventVisitorRead` — the guest is `legal_name`, not `full_name`. */
  visitor?: {
    id?: number
    legal_name?: string | null
    organization_name?: string | null
    job_position?: string | null
    photo_path?: string | null
    photo_thumb_path?: string | null
    host_employee_name?: string | null
  } | null
  invitation?: { invited_by_employee_name?: string } | null
  /** Telefondan qo'yilgan belgi (xizmat safari) — joy, manzildan masofa. Turniket o'tishida null. */
  mobile_checkin?: EventMobileCheckin | null
}

/** turnstile-attendance-events/day-board — the day folded on the server.
 *  Events refer to their employee / gate by id; each is listed once. */
export interface DayBoard {
  day: string
  entries: number
  exits: number
  total: number
  max_id: number | null
  people: {
    employee_id: number
    entry_id: number | null
    exit_id: number | null
    last_id: number
    last_direction: 'entry' | 'exit'
  }[]
  latest: number[]
  events: (Omit<TurnstileEvent, 'employee' | 'turnstile'> & { id: number; turnstile_id?: number | null })[]
  employees: Employee[]
  turnstiles: (NonNullable<TurnstileEvent['turnstile']> & { id: number })[]
}

/** dashboard/main aggregate counters (fields are permissive; we mostly derive
 *  our own from the category lists so the donut matches the table exactly). */
export interface MainStats {
  total_employees_count?: number
  present_employees_count?: number
  absent_employees_count?: number
  late_employees_count?: number
  vacation_count?: number
  business_trip_count?: number
  sick_leave_count?: number
  [key: string]: number | undefined
}

/** dashboard/employees-by-category — one list per status. */
export interface EmployeesByCategory {
  present_employees?: Employee[]
  absent_employees?: Employee[]
  late_employees?: Employee[]
  on_vacation_employees?: Employee[]
  on_business_trip_employees?: Employee[]
  on_sick_leave_employees?: Employee[]
  on_dekret_employees?: Employee[]
  /** Order/leave-based absences carrying a specific `category_name`. */
  on_leave_employees?: Employee[]
  /** At ANOTHER branch right now (today's latest pass was at a foreign
   *  turnstile). Also inside `on_business_trip_employees`. */
  away_employee_ids?: number[]
}

export interface Birthday {
  id: number
  legal_name?: string
  photo_path?: string | null
  photo_thumb_path?: string | null
  job_position?: JobPosition | string | null
  days_left?: number
}

export interface NewsPost {
  id: number
  title?: string
  description?: string
  created_at?: string
}

/** Underlying attendance category — language-neutral internal codes (display
 *  labels live in the i18n dictionary under `status.*`). */
export type AttendanceCategory =
  | 'present'
  | 'late'
  | 'absent'
  | 'vacation'
  | 'trip'
  | 'sick'
  | 'leave' // mehnat ta'tili va boshqa buyruqli ta'tillar (category_name bilan)
  | 'dekret'

/** Derived badge status key — resolves to text via i18n `status.*`. */
export type AttendanceStatusKey =
  | 'present'
  | 'arrived'
  | 'left'
  | 'absent'
  | 'vacation'
  | 'trip'
  | 'sick'
  | 'leave'
  | 'dekret'
  | 'away'
  | 'denied'

/** A normalized per-employee attendance row (one row per person per day). */
export interface AttendanceRow {
  id: number
  employee: Employee
  turnstile: string | null
  entry: TurnstileEvent | null
  exit: TurnstileEvent | null
  hasExited: boolean
  category: AttendanceCategory
  /** Aniq sabab (mehnat ta'tili, ish haqi saqlanmagan…) — 'leave' uchun. */
  note?: string | null
  /** 'trip' because they are at another branch NOW, not by a trip order. */
  away?: boolean
}
