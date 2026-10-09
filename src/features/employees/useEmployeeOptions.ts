import { useQuery } from '@tanstack/react-query'
import { fetchAllPages } from '@/api/fetchAll'
import { EMPLOYEES_PICKER } from '@/api/endpoints'
import type { Employee } from '@/types'
import type { SelectOption } from '@/components/ui/Select'
import { employeeOption, employeeSubLabel } from './subLabel'

/**
 * Branch employees as Combobox options, highest razryad first (v1 sorts the
 * agreer/approver lists this way so leadership lands at the top).
 *
 * v1 pages these lazily; here the whole branch is fetched once and the
 * Combobox filters locally — one request instead of one per keystroke, and the
 * selected value never falls off an unloaded page.
 */
export function useEmployeeOptions(
  branchId: number | null,
  enabled: boolean,
  opts?: {
    requirePosition?: boolean
    /** Only department heads (server-side `is_head_department`). */
    headsOnly?: boolean
    /** Only the direct reports of this employee (server-side `supervisor_id`). */
    supervisorId?: number
  },
) {
  const requirePosition = opts?.requirePosition ?? false
  const headsOnly = opts?.headsOnly ?? false
  const supervisorId = opts?.supervisorId

  const q = useQuery({
    queryKey: ['employee-options', branchId, { headsOnly, supervisorId }],
    // ⚠️ Not one capped page. The largest branch holds 313 active employees
    // (measured 2026-09-11) and the old `size: 300` silently dropped the
    // lowest-razryad thirteen from every agreer/approver picker. The server
    // caps a page at 500, so the list is walked page by page.
    queryFn: () =>
      // `employees/options`: PII'siz yengil qator, chaqiruvchining o'z
      // darajasida (hr-backend-sandbox `EmployeeService.picker_options_query`).
      fetchAllPages<Employee>(EMPLOYEES_PICKER, {
        organization_branch_id: branchId || undefined,
      }),
    enabled: enabled && !!branchId,
  })

  const employees = q.data ?? []
  const options: SelectOption[] = employees
    // v1 hides employees with no job position from the agreer list — an agreer
    // without a position renders a blank line in the generated document.
    .filter((e) => !requirePosition || !!employeeSubLabel(e))
    .map(employeeOption)

  // `error` so a Combobox can distinguish a failed search from an empty one —
  // an empty employee picker otherwise reads as "no such person exists".
  return { options, employees, loading: q.isLoading, error: q.error }
}
