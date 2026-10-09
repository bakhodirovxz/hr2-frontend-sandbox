import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEES_MY_TEAM } from '@/api/endpoints'

export type TeamVia = 'direct' | 'indirect' | 'department'

export interface TeamMemberRow {
  id: number
  legal_name: string
  photo_path?: string | null
  photo_thumb_path?: string | null
  job_position_name?: string | null
  department_name?: string | null
  via: TeamVia
  /** Tabel status for the day (present, late, absent, day_off, leave kinds…). */
  status?: string | null
  first_in?: string | null
  last_out?: string | null
}

interface MyTeamResponse {
  date: string
  items: TeamMemberRow[]
  summary: Record<string, number>
}

/** Direct + indirect reports and headed-department members (server:
 *  `core.scoping.line_manager_scope`), each with the day's status. */
export function useMyTeam(day: string) {
  const q = useQuery({
    queryKey: ['my-team', day],
    queryFn: () => apiGet<MyTeamResponse>(EMPLOYEES_MY_TEAM, { day }),
    placeholderData: (prev) => prev,
  })
  return { data: q.data, loading: q.isLoading, fetching: q.isFetching, error: q.error, refetch: q.refetch }
}
