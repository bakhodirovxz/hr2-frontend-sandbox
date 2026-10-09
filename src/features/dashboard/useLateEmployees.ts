import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'

/**
 * KECH QOLGANLAR — SERVERNING RO'YXATI, brauzernikimi emas.
 *
 * WHY THIS HOOK EXISTS AT ALL. Both boards used to decide who was late by
 * walking the raw turnstile feed in the browser: take the first entrance of
 * the day, compare it against `working_hours_start`, call anything past it
 * "late". That rule is only half of the real one. It does not know the
 * navbatchilik shift a person is actually on, it does not know a rest day, it
 * does not know a night shift that legitimately starts at 20:00, and it does
 * not know the leave/order excuses (`ignore_lateness`, safar, ruxsat) the
 * server already applies. The same person could therefore be "late" on the
 * dashboard and "resting" on the attendance page in the same minute, with
 * nothing on screen to say which was right — the exact regression web v1
 * closed when it moved this list to `GET /dashboard/late-employees`
 * (`late_employees_with_time`). v2 must read the answer, never re-derive it.
 *
 * ⚠️ ENDPOINT INLINED ON PURPOSE. `src/api/endpoints.ts` has
 * `DASHBOARD_LATE_EMPLOYEES_FREQUENT` and `…_TOTAL_TIME` but no constant for
 * the plain day list, and that file belongs to another session today
 * (2026-09-08). The literal lives here so the parity gap can close without
 * touching a file this change does not own; it should be lifted into
 * `endpoints.ts` as `DASHBOARD_LATE_EMPLOYEES` by that file's owner.
 */
const DASHBOARD_LATE_EMPLOYEES = 'dashboard/late-employees'

/** One row of `GET /dashboard/late-employees` (`LateEmployeeRead`).
 *
 *  Deliberately shaped like a turnstile event — `employee` + `happen_time` +
 *  `direction_type` — so the existing row renderers need no special case,
 *  plus `late_minutes`, which is the server's own arithmetic. */
export interface LateEmployeeRow {
  employee_id: number
  employee?: {
    id?: number
    legal_name?: string | null
    photo_path?: string | null
    photo_thumb_path?: string | null
    job_position?: { name?: string } | null
    department?: { name?: string } | null
  } | null
  /** The employee's OWN branch, not the turnstile's — the row prints this. */
  employee_branch_id?: number | null
  happen_time: string
  direction_type?: string
  late_minutes: number
  /** Snapshot taken at the gate; the feed prefers it over the profile photo. */
  photo_path?: string | null
  pic_uri?: string | null
  event_id?: string | null
  turnstile?: { id?: number; acs_dev_name?: string | null } | null
}

interface Options {
  branchId: number | null
  departmentId?: number | string | null
  jobPositionId?: number | string | null
  /** `YYYY-MM-DD`. Omitted = today, which is what both boards want. */
  day?: string | null
  enabled?: boolean
}

/**
 * Today's latecomers for a branch, refreshed on the same 2-minute cadence web
 * v1 polls on. `retry: false` because this list is permission-shaped for some
 * roles — a refused block should go quiet, not throw the board away.
 */
export function useLateEmployees({
  branchId,
  departmentId,
  jobPositionId,
  day,
  enabled = true,
}: Options) {
  const q = useQuery({
    queryKey: [
      'dashboard',
      'late-employees',
      branchId,
      departmentId ?? null,
      jobPositionId ?? null,
      day ?? null,
    ],
    queryFn: () =>
      apiGet<LateEmployeeRow[]>(DASHBOARD_LATE_EMPLOYEES, {
        organization_branch_id: branchId,
        department_id: departmentId || undefined,
        job_position_id: jobPositionId || undefined,
        day: day || undefined,
      }),
    enabled: enabled && branchId != null,
    retry: false,
    // O'tgan kun o'zgarmaydi — faqat BUGUNGI ro'yxat yangilanib turadi.
    refetchInterval: day ? false : 120_000,
  })

  return {
    latecomers: q.data ?? [],
    loading: q.isLoading,
    /** True when the endpoint answered — an empty list is then a real "nobody". */
    loaded: q.isSuccess,
    /** For the live boards: a gate event is a hint to re-ask, never a verdict. */
    refetch: q.refetch,
  }
}
