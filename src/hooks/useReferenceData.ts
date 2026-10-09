import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAllPages } from '@/api/fetchAll'
import { REFERENCE_QUERY } from '@/api/queryClient'
import { DEPARTMENTS_LIST, JOB_POSITIONS_LIST } from '@/api/endpoints'
import type { SelectOption } from '@/components/ui'
import { useBranchStore } from '@/store/branchStore'

interface NamedRef {
  id: number
  // `| null` because the server's Department/JobPosition rows declare it so —
  // without it every caller with the real row type fails the constraint.
  name?: string | null
}

/**
 * `forBranchId` overrides the branch the list is read for. Screens that assign
 * someone to a branch OTHER than the one currently selected (registration
 * approval, most obviously) must pass it — otherwise the department list
 * belongs to the viewed branch while the record is written against the chosen
 * one, and the backend answers `department_branch_mismatch`.
 */
/** Stable empty array — a fresh `[]` per render would break callers' memos. */
const EMPTY: never[] = []

function useNamedRecords<T extends NamedRef>(
  key: string,
  url: string,
  forBranchId?: number | null,
): T[] {
  const selected = useBranchStore((s) => s.selectedBranchId)
  const branchId = forBranchId ?? selected
  const { data } = useQuery({
    queryKey: [key, branchId],
    // 376 departments / 913 positions in the big branches, and the server caps
    // one page at 500 — so the list is WALKED, not asked for in one gulp.
    queryFn: () =>
      fetchAllPages<T>(url, {
        organization_branch_id: branchId || undefined,
        // Pickers never read a department's `heads` (each with two presigned
        // photo URLs); the brief rows are a fraction of the size.
        brief: key === 'departments' ? true : undefined,
      }),
    // Departments and job positions are reference data: a 5-minute staleTime
    // made every form that opens twice in an afternoon re-walk both pages.
    ...REFERENCE_QUERY,
  })
  return data ?? (EMPTY as unknown as T[])
}

function useNamedOptions(key: string, url: string, forBranchId?: number | null): SelectOption[] {
  const rows = useNamedRecords<NamedRef>(key, url, forBranchId)
  return useMemo(
    () => rows.map((d) => ({ value: String(d.id), label: d.name || `#${d.id}` })),
    [rows],
  )
}

export function useDepartmentOptions(forBranchId?: number | null): SelectOption[] {
  return useNamedOptions('departments', DEPARTMENTS_LIST, forBranchId)
}

export function useJobPositionOptions(forBranchId?: number | null): SelectOption[] {
  return useNamedOptions('job-positions', JOB_POSITIONS_LIST, forBranchId)
}

/**
 * The WHOLE rows, for the few callers that need more than `{value,label}` — a
 * department's `index`, say, or its parent.
 *
 * ⚠️ THIS EXISTS SO THERE IS ONE CACHE ENTRY. Several screens were reading the
 * structure MANAGEMENT hook (`useStructure`) for a dropdown, which (a) fetched
 * the same rows under a different queryKey — `/kpi` asked for `job-positions`
 * twice in one load, once `size=25` and once `size=500` — and (b) handed them
 * only the FIRST PAGE: 25 of 376 departments, so most were unselectable.
 */
export function useDepartmentRecords<T extends NamedRef>(forBranchId?: number | null): T[] {
  return useNamedRecords<T>('departments', DEPARTMENTS_LIST, forBranchId)
}
