import { useDebounce } from '@/hooks/useDebounce'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toItems, type ListResponse } from '@/types'
import { apiGet, apiPatch } from '@/api/http'
import { EMPLOYEES_LIST, PHONE_DIRECTORY } from '@/api/endpoints'

export interface PhoneEntry {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  phone_number?: string | null
  internal_phone_number?: string | null
  job_position_name?: string | null
  department_name?: string | null
  /** Structure order of the department (Tuzilma) — the phone book's order. */
  department_index?: number | null
  job_position_razryad?: number | null
  branch_id?: number | null
  /** Server-decided: may the viewer correct this row's phones here? */
  can_edit?: boolean
}

/**
 * Whole-org directory in one light list (no PII), open to every role.
 *
 * ⚠️ IT IS BIG: the full list is ~2.6 MB (2321 rows, measured). Callers that
 * only need one person's number must pass `enabled: false` until they actually
 * need it, and narrow with `branchId` where the person's branch is known.
 *
 * ⚠️ The narrowing parameter is `branch_id`, NOT `organization_branch_id` —
 * the request layer stamps the latter onto every call and this endpoint
 * deliberately ignores it (see the route's own comment).
 */
/**
 * `search` and `excludeBranchId` go to the SERVER (2026-09-25). The «system
 * organisations» tab with no branch chosen used to download the whole
 * directory (2 321 rows, 2.5 MB) and drop the executive branch and every
 * non-matching name in the browser.
 */
export function usePhoneDirectory(opts?: { enabled?: boolean; branchId?: number | null; excludeBranchId?: number | null; search?: string }) {
  const enabled = opts?.enabled ?? true
  const branchId = opts?.branchId ?? null
  const exclude = opts?.excludeBranchId ?? null
  const term = useDebounce((opts?.search ?? '').trim(), 300)
  const query = useQuery({
    queryKey: ['phone-directory', branchId, exclude, term],
    queryFn: () =>
      apiGet<ListResponse<PhoneEntry>>(PHONE_DIRECTORY, {
        branch_id: branchId || undefined,
        exclude_branch_id: !branchId && exclude ? exclude : undefined,
        search: term || undefined,
      }),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  })
  return { all: toItems(query.data), loading: query.isLoading }
}

/**
 * ONE person's phone-book card (colleague / calendar popups). These used to
 * load the whole branch directory (~160 KB) to read a single number; the
 * server now filters by `employee_id`. The id match is kept so a server that
 * ignores the parameter still yields the right card.
 */
export function usePhoneContact(employeeId: number | null | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ['phone-directory', 'one', employeeId],
    queryFn: () =>
      apiGet<ListResponse<PhoneEntry>>(PHONE_DIRECTORY, { employee_id: employeeId, size: 1 }),
    enabled: enabled && !!employeeId,
    staleTime: 5 * 60_000,
  })
  return toItems(query.data).find((p) => p.id === employeeId)
}

export interface PhonePatch {
  phone_number?: string | null
  internal_phone_number?: string | null
}

/**
 * Inline phone edit from the phone page (`PATCH employees/{id}/phones`).
 * Allowed for admin, HR and the branch `phone_editor` role — the server
 * decides and marks each row with `can_edit`.
 *
 * The saved row is written into every cached directory page at once, so the
 * new number shows in the same frame; the other screens that show this
 * person's phone are refetched.
 */
export function useUpdatePhones() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: PhonePatch }) =>
      apiPatch<PhoneEntry>(`${EMPLOYEES_LIST}/${id}/phones`, body),
    onSuccess: (saved, { id }) => {
      const merge = (row: PhoneEntry) =>
        row.id === id
          ? { ...row, phone_number: saved.phone_number, internal_phone_number: saved.internal_phone_number }
          : row
      qc.setQueriesData<ListResponse<PhoneEntry>>({ queryKey: ['phone-directory'] }, (old) => {
        if (!old) return old
        if (Array.isArray(old)) return old.map(merge)
        if ('items' in old && Array.isArray(old.items)) return { ...old, items: old.items.map(merge) }
        return old
      })
      void qc.invalidateQueries({ queryKey: ['employee', id] })
      void qc.invalidateQueries({ queryKey: ['employee-kpi'] })
      void qc.invalidateQueries({ queryKey: ['employees'] })
    },
  })
}
