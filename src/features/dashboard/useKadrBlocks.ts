import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import {
  DASHBOARD_LATE_EMPLOYEES_FREQUENT,
  DASHBOARD_LATE_EMPLOYEES_TOTAL_TIME,
} from '@/api/endpoints'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'

/**
 * The kadr block that still ships, and the branch scope the whole board
 * shares. Every figure here comes from an endpoint that already exists on
 * the API — nothing on this board is sampled, derived from a guess, or
 * hard-coded, so an empty block means an empty branch and never a stub.
 */

/** The branch every dashboard query is scoped to (selector → own branch). */
export function useDashboardBranchId(): number | null {
  const user = useAuthStore((s) => s.user)
  const selected = useBranchStore((s) => s.selectedBranchId)
  return selected ?? user?.employee?.department?.organization_branch_id ?? null
}

/* ── Intizom reytingi ───────────────────────────────────────────────────── */

export interface LateRankRow {
  employee_id: number
  employee_name: string
  photo_path?: string | null
  /** 30px avatars — the full-size original is ~100-250 KB per person. */
  photo_thumb_path?: string | null
  job_position_name?: string | null
  department_name?: string | null
  late_count: number
  total_late_minutes?: number
}

/**
 * This month's lateness ranking: how many times, and how much time in total.
 *
 * Two endpoints answer two different questions — "who is late most often" and
 * "who has lost the most time" — and the block shows them as one row per
 * person so a single late-by-two-hours day cannot masquerade as a habit.
 */
export function useDiscipline(enabled: boolean) {
  const branchId = useDashboardBranchId()
  const from = dayjs().startOf('month').format('YYYY-MM-DD')
  const to = dayjs().format('YYYY-MM-DD')

  const frequent = useQuery({
    queryKey: ['dashboard', 'discipline', 'frequent', branchId, from, to],
    queryFn: () =>
      apiGet<LateRankRow[]>(DASHBOARD_LATE_EMPLOYEES_FREQUENT, {
        organization_branch_id: branchId,
        limit: 8,
        date_from: from,
        date_to: to,
      }),
    enabled,
    retry: false,
  })

  const totalTime = useQuery({
    queryKey: ['dashboard', 'discipline', 'total', branchId],
    queryFn: () =>
      apiGet<LateRankRow[]>(DASHBOARD_LATE_EMPLOYEES_TOTAL_TIME, {
        organization_branch_id: branchId,
        limit: 8,
      }),
    enabled,
    retry: false,
  })

  const rows = useMemo<LateRankRow[]>(() => {
    const minutes = new Map<number, number>()
    for (const r of totalTime.data ?? []) {
      minutes.set(r.employee_id, r.total_late_minutes ?? 0)
    }
    const base = frequent.data?.length ? frequent.data : (totalTime.data ?? [])
    return base
      .map((r) => ({ ...r, total_late_minutes: minutes.get(r.employee_id) ?? r.total_late_minutes ?? 0 }))
      .sort((a, b) => b.late_count - a.late_count || (b.total_late_minutes ?? 0) - (a.total_late_minutes ?? 0))
      .slice(0, 8)
  }, [frequent.data, totalTime.data])

  return { rows, loading: frequent.isLoading || totalTime.isLoading }
}
