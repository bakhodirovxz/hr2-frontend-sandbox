import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { localizedName, registerRuNames, useRuNamesVersion, type NamedRow } from '@/i18n/localized'
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
  name_ru?: string | null
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
  enabled = true,
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
      }).then((rows) => {
        // Name-only displays (dashboard, statistics) translate through these.
        registerRuNames(rows as unknown as NamedRow[])
        return rows
      }),
    // Departments and job positions are reference data: a 5-minute staleTime
    // made every form that opens twice in an afternoon re-walk both pages.
    ...REFERENCE_QUERY,
    enabled,
  })
  return data ?? (EMPTY as unknown as T[])
}

/**
 * Loads the department and job-position lists for staff accounts once per
 * session (shared cache with the pickers) so name-only displays can show the
 * `name_ru` entered for them, and re-renders the shell when they arrive.
 */
export function useStructureNames(enabled: boolean): void {
  useNamedRecords('departments', DEPARTMENTS_LIST, undefined, enabled)
  useNamedRecords('job-positions', JOB_POSITIONS_LIST, undefined, enabled)
  useRuNamesVersion()
}

function useNamedOptions(key: string, url: string, forBranchId?: number | null): SelectOption[] {
  const rows = useNamedRecords<NamedRef>(key, url, forBranchId)
  const { i18n } = useTranslation()
  return useMemo(
    () => rows.map((d) => ({ value: String(d.id), label: localizedName(d, i18n.language) || `#${d.id}` })),
    [rows, i18n.language],
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
