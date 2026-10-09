import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { apiGet } from '@/api/http'
import { queryClient } from '@/api/queryClient'
import { useDashboardBranchId } from './useKadrBlocks'

/**
 * One request for the board's fifteen small statistics.
 *
 * ⚠️ THE BOARD MADE 32–35 API REQUESTS ON EVERY OPEN (measured 2026-09-10),
 * fifteen of them 0.5–1 KB statistics — the request COUNT was the cost, not
 * the bytes. `GET dashboard/board` returns all fifteen at once, computed by
 * the same server functions.
 *
 * THIS IS A CACHE PRIME. The panels keep their own hooks and keys; the answer
 * is written under the EXACT key each hook reads, so they render from cache
 * and never fire. The keys below are therefore a contract with:
 *   `useDashboard` (['dashboard','main',…] / ['dashboard','visitors',…]),
 *   `useBoardData` (['board',…]), `DemographicsPanel` (['job-position-stats']),
 *   `useEmployeeStats` (['age-stats'] … ['task-exec']).
 * A key that drifts primes an entry nobody reads and the hook fetches as
 * before — slower, never wrong.
 *
 * ⚠️ MUST RESOLVE BEFORE THE PANELS MOUNT. A hook that mounts against an empty
 * cache fires immediately; the aggregate would then merely duplicate it. The
 * page gates the boards on `primed`, exactly as it already gates them on
 * `branchReady`. On failure the page renders anyway and the hooks fetch
 * individually — the aggregate can only remove requests, never add a wait
 * the old path did not have.
 */
interface Board {
  main: unknown
  today_visitor_count: unknown
  all_visitor_count: unknown
  visitor_service_time: unknown
  employee_count: unknown
  age_stats: unknown
  nationality_stats: unknown
  experience_stats: unknown
  job_position_stats: unknown
  kpi_monthly_average: unknown
  cards_summary: unknown
  kpi_summary: unknown
  task_execution: unknown
  departments_attendance: unknown
  overdue_tasks: unknown
}

function seed(b: Board, branchId: number | null, from: string, to: string) {
  const set = (key: unknown[], value: unknown) => {
    if (value != null) queryClient.setQueryData(key, value)
  }
  const rangeKey = `${from}:${to}`
  // useDashboard({}) → keyBase = [branchId, undefined, undefined, undefined]
  set(['dashboard', 'main', branchId, undefined, undefined, undefined], b.main)
  set(['dashboard', 'visitors', branchId], b.today_visitor_count)
  set(['board', 'visitors-today', branchId], b.today_visitor_count)
  set(['board', 'visitors-all', branchId], b.all_visitor_count)
  set(['board', 'visitor-service-time', branchId], b.visitor_service_time)
  set(['board', 'departments-attendance', branchId], b.departments_attendance)
  set(['board', 'kpi-summary', branchId, from, to], b.kpi_summary)
  set(['board', 'overdue-summary', branchId], b.overdue_tasks)
  set(['job-position-stats', branchId], b.job_position_stats)
  set(['age-stats', branchId], b.age_stats)
  set(['nationality-stats', branchId], b.nationality_stats)
  set(['kpi-monthly', branchId], b.kpi_monthly_average)
  set(['cards-summary', branchId, rangeKey], b.cards_summary)
  set(['employee-count', branchId], b.employee_count)
  set(['experience-stats', branchId], b.experience_stats)
  set(['task-exec', branchId, rangeKey], b.task_execution)
}

/** `true` once the board caches are primed — or the prime has failed. */
export function useBoardPrime(enabled: boolean): boolean {
  const branchId = useDashboardBranchId()
  // Same window `useKpiSummary` and `defaultKpiRange` derive: a month to today.
  const from = dayjs().subtract(1, 'month').format('YYYY-MM-DD')
  const to = dayjs().format('YYYY-MM-DD')
  const q = useQuery({
    queryKey: ['board', 'aggregate', branchId, from, to],
    queryFn: async () => {
      const b = await apiGet<Board>('dashboard/board', {
        organization_branch_id: branchId,
        date_from: from,
        date_to: to,
      })
      seed(b, branchId, from, to)
      return true
    },
    enabled,
    staleTime: 30_000,
    retry: false,
  })
  return !enabled || q.isSuccess || q.isError
}
