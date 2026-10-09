import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '@/api/http'

const LOCKS = 'attendance-locks'

/**
 * CLOSING AN ATTENDANCE PERIOD.
 *
 * While a period is closed the server refuses every hand-made change inside it
 * (corrections and leave orders alike), so the month that was reported keeps
 * its figures. Turnstile passes still arrive — they are counted as
 * `late_passes` so it stays visible that the closed month drifted.
 */
export interface AttendanceLock {
  id: number
  organization_branch_id: number
  organization_branch_name?: string | null
  period_start: string
  period_end: string
  note?: string | null
  locked_by_name?: string | null
  locked_at: string
  late_passes: number
  late_corrections: number
}

export function useAttendanceLocks(branchId: number | null, enabled = true) {
  const q = useQuery({
    enabled,
    queryKey: [LOCKS, branchId ?? 'all'],
    queryFn: () =>
      apiGet<AttendanceLock[]>(LOCKS, branchId ? { organization_branch_id: branchId } : undefined),
    staleTime: 60_000,
  })
  return { locks: q.data ?? [], loading: q.isLoading }
}

/** The lock covering `day` (YYYY-MM-DD), if any. */
export function lockForDay(locks: AttendanceLock[], day?: string | null): AttendanceLock | null {
  if (!day) return null
  return locks.find((l) => l.period_start <= day && l.period_end >= day) ?? null
}

/** The first lock overlapping [from, to] — used to warn before editing a range. */
export function lockForRange(
  locks: AttendanceLock[],
  from?: string | null,
  to?: string | null,
): AttendanceLock | null {
  const a = from || to
  const b = to || from
  if (!a || !b) return null
  return locks.find((l) => l.period_start <= b && l.period_end >= a) ?? null
}

export function useAttendanceLockMutations() {
  const qc = useQueryClient()
  // Closing or reopening changes what every attendance screen may do, so the
  // attendance caches are dropped along with the lock list.
  const done = () => {
    qc.invalidateQueries({ queryKey: [LOCKS] })
    qc.invalidateQueries({ queryKey: ['attendance'] })
    qc.invalidateQueries({ queryKey: ['manual-attendance'] })
  }
  return {
    lock: useMutation({
      mutationFn: (body: {
        organization_branch_id: number
        period_start: string
        period_end: string
        note?: string | null
      }) => apiPost<AttendanceLock>(LOCKS, body),
      onSuccess: done,
    }),
    unlock: useMutation({
      mutationFn: (id: number) => apiDelete(`${LOCKS}/${id}`),
      onSuccess: done,
    }),
  }
}
