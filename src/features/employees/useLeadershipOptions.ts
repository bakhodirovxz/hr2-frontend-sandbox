import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST, ORGANIZATION_BRANCH_LEADERS } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import type { Employee } from '@/types'
import { employeeOption } from './subLabel'

interface BranchLeaderRow {
  employee?: Employee | null
  leadership_role?: string | null
}

/** Only these two count as "rahbariyat" — the chancellery/accountant/lawyer
 *  leaders configured on the same screen are not signing authorities (v1). */
const LEADER_ROLES = ['director', 'deputy']

/**
 * "Rahbariyat" candidates for a branch: the leaders pinned in Tabel
 * sozlamalari, falling back to multi-org deputy/ministr employees when the
 * branch has none. Mirrors v1's addresseeOptions / rahbariyatOptions.
 */
export function useLeadershipOptions(branchId: number | null, enabled: boolean) {
  const leaders = useQuery({
    queryKey: ['branch-leaders', branchId],
    queryFn: () => apiGet<BranchLeaderRow[]>(ORGANIZATION_BRANCH_LEADERS(branchId!)),
    enabled: enabled && !!branchId,
  })

  const pinned = (leaders.data ?? [])
    .filter((l) => l.employee && LEADER_ROLES.includes(l.leadership_role ?? ''))
    .map((l) => employeeOption(l.employee!))

  // Only pay for the fallback query once we know the branch has no pinned leaders.
  const fallback = useQuery({
    queryKey: ['leadership-fallback', branchId],
    queryFn: async () =>
      toItems(
        await apiGet<ListResponse<Employee>>(EMPLOYEES_LIST, {
          multi_org_employee_role: ['deputy', 'ministr'],
          include_multi_org: true,
          sort_by_razryad: true,
          size: 50,
        }),
      ),
    enabled: enabled && !leaders.isLoading && pinned.length === 0,
  })

  return {
    options: pinned.length > 0 ? pinned : (fallback.data ?? []).map(employeeOption),
    loading: leaders.isLoading || fallback.isLoading,
    error: leaders.error ?? fallback.error,
    /** True when the branch has explicitly pinned leaders. */
    fromBranchLeaders: pinned.length > 0,
  }
}
