import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { useAuthStore } from '@/store/authStore'
import { toItems, type ListResponse } from '@/types'
import type { Employee } from '@/types'
import type { PendingTransferRef } from './useEmployeeAssignments'

/** fastapi-pagination page envelope. */
export interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

interface EmployeeQuery {
  page: number
  size: number
  search?: string
  departmentId?: string
  jobPositionName?: string
  /**
   * Server-side narrowings `/employees` accepts (2026-09-07). The KPI roster
   * on the employees screen comes from `/dashboard/employee-kpi`, which knows
   * none of these — they are for the `/employees`-backed lists and pickers.
   */
  /** Only the direct reports of this employee ("my team"). */
  supervisorId?: number
  /** Only department heads. */
  isHeadDepartment?: boolean
  /** Only people who sit in a department (drops KPP-style accounts). */
  hasDepartment?: boolean
}

export function useEmployees({
  page,
  size,
  search,
  departmentId,
  jobPositionName,
  supervisorId,
  isHeadDepartment,
  hasDepartment,
}: EmployeeQuery) {
  const branchId = useBranchStore((s) => s.selectedBranchId)

  const query = useQuery({
    queryKey: [
      'employees',
      { page, size, search, departmentId, jobPositionName, supervisorId, isHeadDepartment, hasDepartment, branchId },
    ],
    queryFn: ({ signal }) =>
      apiGet<Page<Employee>>(
        EMPLOYEES_LIST,
        {
          page,
          size,
          search: search || undefined,
          department_id: departmentId || undefined,
          job_position_name_search: jobPositionName || undefined,
          supervisor_id: supervisorId || undefined,
          is_head_department: isHeadDepartment || undefined,
          has_department: hasDepartment || undefined,
        },
        { signal },
      ),
    placeholderData: (prev) => prev, // keep the old page visible while the next loads
  })

  return {
    rows: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetching: query.isFetching,
  }
}

/**
 * Does the signed-in person supervise anyone?
 *
 * There is no flag on `/auth/me` for this, and `supervised=true` on the
 * leave / attendance lists simply returns nothing for a person with no
 * reports — so the "my team" controls would be a dead switch for most users.
 * One `size=1` probe of `/employees?supervisor_id=me` answers it; the total
 * is all that is read. A 403 (a role that may not list employees) reads as
 * "no team", which is the safe answer for the switch.
 */
export function useHasSubordinates(): boolean {
  const employeeId = useAuthStore((s) => s.user?.employee?.id)
  const q = useQuery({
    queryKey: ['employees', 'has-subordinates', employeeId],
    queryFn: () =>
      apiGet<Page<Employee>>(EMPLOYEES_LIST, { supervisor_id: employeeId, page: 1, size: 1 }),
    enabled: !!employeeId,
    staleTime: 5 * 60_000,
    retry: false,
  })
  return (q.data?.total ?? 0) > 0
}

/** Fetch FULL employee records (EmployeeReadFull) for a set of ids.
 *
 * The KPI overview endpoint returns only metrics, not passport/phone/schedule,
 * so before editing we pull the complete records here — that way the edit grid
 * shows real current values and never blanks an untouched field. */
export async function fetchEmployeesByIds(ids: number[]): Promise<Employee[]> {
  const results = await Promise.all(
    ids.map((id) => apiGet<Employee>(`${EMPLOYEES_LIST}/${id}`).catch(() => null)),
  )
  return results.filter((e): e is Employee => e != null)
}

/** Per-employee mutations. The API has no bulk endpoints, so bulk operations in
 *  the UI fan these out (see useBulkAction). */
/**
 * Every cache the employees screen is built from.
 *
 * The roster is NOT `/employees` — it is the `dashboard/employee-kpi`
 * aggregate, which the API caches in Redis for five minutes. So invalidating
 * is necessary but NOT sufficient: a refetch inside that window returns the
 * same pre-change rows. That is why the mutations below also PATCH the cached
 * page in place (see `patchCachedRows`), so the person who made the change
 * sees it at once instead of a row they just deleted still sitting there.
 */
/**
 * The roster keys are here because the API now drops its own KPI-roster cache
 * on every employee write (`EmployeeService._invalidate_roster_cache`), so a
 * refetch returns the truth. The local patch below still runs first: it makes
 * the change visible in the same frame instead of one round-trip later.
 */
export const EMPLOYEE_QUERY_KEYS = [
  ['employee-kpi'],
  ['employee-kpi-ranked'],
  ['employees'],
  ['age-stats'],
  ['nationality-stats'],
  ['cards-summary'],
  // `task-execution` matched nothing — the real key is `task-exec`.
  ['task-exec'],
  // Headcount / gender split and the hire-year chart on the same page.
  ['employee-count'],
  ['experience-stats'],
  // HR dashboard demographics (staleTime 10 min).
  ['job-position-stats'],
  ['board', 'roster-summary'],
  ['kpi-monthly'],
  // Phones and internal numbers are edited here too; the phone book kept the
  // old number for its 5-minute staleTime after every save.
  ['phone-directory'],
] as const

interface CachedPage {
  items?: { id: number }[]
  total?: number
}

export function useEmployeeMutations() {
  const qc = useQueryClient()

  const invalidate = () => {
    for (const key of EMPLOYEE_QUERY_KEYS) {
      void qc.invalidateQueries({ queryKey: key })
    }
  }

  /** Apply a local edit to every cached roster page that holds those rows. */
  const patchCachedRows = (
    ids: number[],
    apply: (row: Record<string, unknown>) => Record<string, unknown> | null,
  ) => {
    const idSet = new Set(ids)
    for (const key of [['employee-kpi'], ['employee-kpi-ranked']]) {
      qc.setQueriesData<CachedPage>({ queryKey: key }, (old) => {
        if (!old?.items) return old
        const items: { id: number }[] = []
        let removed = 0
        for (const row of old.items) {
          if (!idSet.has(row.id)) {
            items.push(row)
            continue
          }
          const next = apply(row as unknown as Record<string, unknown>)
          if (next) items.push(next as unknown as { id: number })
          else removed++
        }
        if (!removed && items.length === old.items.length) return { ...old, items }
        return { ...old, items, total: Math.max(0, (old.total ?? items.length) - removed) }
      })
    }
  }

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiPatch(`${EMPLOYEES_LIST}/${id}`, body),
    onSuccess: (_data, { id, body }) => {
      // Only the fields the roster actually renders are worth mirroring; the
      // rest arrive with the next refetch.
      patchCachedRows([id], (row) => ({
        ...row,
        ...(body.legal_name != null ? { legal_name: body.legal_name } : {}),
      }))
      void qc.invalidateQueries({ queryKey: ['employee', id] })
      void qc.invalidateQueries({ queryKey: ['phone-directory'] })
      // HR editing their OWN card: the header, "Mening profilim" and every
      // self-scoped screen read `auth/me`, which otherwise stays 5 min stale.
      if (useAuthStore.getState().user?.employee?.id === id) {
        void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
      }
    },
  })

  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`${EMPLOYEES_LIST}/${id}`),
    // Drop the row immediately: the server keeps answering with the cached
    // roster for up to five minutes, so "deleted" would otherwise be a toast
    // over a row that is still there.
    onSuccess: (_data, id) => patchCachedRows([id], () => null),
  })

  return { update, remove, invalidate, patchCachedRows }
}


/**
 * ARXIV — people whose contract ended or who were moved elsewhere.
 *
 * ⚠️ Deliberately PII-free: one way of archiving nulls the personal fields and
 * the other leaves them, and the register must look the same either way.
 */
export interface ArchivedEmployee {
  id: number
  legal_name?: string | null
  photo_thumb_path?: string | null
  department_name?: string | null
  job_position_name?: string | null
  branch_name?: string | null
  job_acceptance_date?: string | null
  archived_at?: string | null
  archive_reason?: string | null
  archive_reason_label?: string | null
  archive_date?: string | null
  archive_note?: string | null
  /**
   * BOSHQA FILIALGA O'TKAZILGAN xodim. U global arxivlanmagan (yangi filialda
   * ishlayapti) — eski filial uni shu ro'yxatda ko'radi va shu blok orqali
   * qabul qiladi yoki rad etadi.
   */
  transfer?: PendingTransferRef | null
}

/**
 * ⚠️ `departmentId` USED TO BE DROPPED ON THE FLOOR. The Employees page renders
 * its department Combobox on the archive tab too, but this hook never took the
 * value and `/employees/archived` was called without it — so a kadr filtering
 * the archive by department silently got the whole archive back. The endpoint
 * has accepted `department_id` all along.
 *
 * The POSITION filter has no counterpart on this route, which is why the page
 * hides that control while the archive tab is open rather than leaving a second
 * dead one on screen.
 */
export function useArchivedEmployees(
  search: string,
  page: number,
  size: number,
  enabled = true,
  departmentId?: string | number | null,
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['employees-archived', branchId, search, page, size, departmentId],
    queryFn: () =>
      apiGet<ListResponse<ArchivedEmployee>>(`${EMPLOYEES_LIST}/archived`, {
        search: search || undefined,
        department_id: departmentId ? Number(departmentId) : undefined,
        page,
        size,
      }),
    enabled,
    retry: false,
  })
  return {
    rows: toItems(q.data),
    total: (q.data as { total?: number } | undefined)?.total ?? 0,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    denied: q.isError,
  }
}

/** Mail the employee a freshly generated password, and read what became of it. */
export function useCredentialEmail() {
  const qc = useQueryClient()
  return {
    send: useMutation({
      mutationFn: (id: number) =>
        apiPost<{ task_id?: string | null }>(`${EMPLOYEES_LIST}/${id}/send-password-email`, {}),
      onSuccess: (_d, id) => {
        void qc.invalidateQueries({ queryKey: ['password-email-status', id] })
      },
    }),
  }
}

/**
 * DID THE CREDENTIAL MAIL ACTUALLY GO OUT?
 *
 * The POST only queues the job — SMTP here has been measured taking minutes and
 * hanging outright about a third of the time — so its 200 means "accepted", not
 * "delivered". Personnel need the real answer, because if it failed the next
 * step is to set the password by hand. Polled while the task is still pending
 * and stopped as soon as it settles; the server returns nothing sensitive.
 */
export function useCredentialEmailStatus(employeeId: number | null, taskId: string | null) {
  const q = useQuery({
    queryKey: ['password-email-status', employeeId, taskId],
    queryFn: () =>
      apiGet<{ status?: string; state?: string }>(
        `${EMPLOYEES_LIST}/${employeeId}/password-email-status`,
        { task_id: taskId },
      ),
    enabled: !!employeeId && !!taskId,
    refetchInterval: (q) => ((q.state.data?.status ?? 'pending') === 'pending' ? 4000 : false),
  })
  return { status: q.data?.status ?? null, loading: q.isLoading }
}

/**
 * ARCHIVING a person, which is what "removing" one really means here: the row
 * moves to the archive with a stated reason and an audit entry, and nothing is
 * destroyed. `related-data` is read FIRST so the reason dialog can say what is
 * attached to them — v1 showed that count and v2 asked for confirmation with
 * no idea what was at stake.
 */
export function useEmployeeRelatedData(employeeId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['employee-related-data', employeeId],
    queryFn: () =>
      apiGet<{ items?: { key: string; label: string; count: number }[] | null }>(
        `${EMPLOYEES_LIST}/${employeeId}/related-data`,
      ),
    enabled: !!employeeId && enabled,
  })
  return { items: (q.data?.items ?? []).filter((r) => r.count > 0), loading: q.isLoading }
}

export function useEmployeeArchive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiPost(`${EMPLOYEES_LIST}/${id}/archive`, { reason }),
    onSuccess: () => {
      for (const key of EMPLOYEE_QUERY_KEYS) void qc.invalidateQueries({ queryKey: key })
      void qc.invalidateQueries({ queryKey: ['employees-archived'] })
    },
  })
}
