import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { toItems, type ListResponse, type Paginated } from '@/types'
import { useBranchStore } from '@/store/branchStore'
import { fetchAllPages } from '@/api/fetchAll'

const WORK_LEAVES = 'work-leaves'

export interface LeaveSigner {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
}
export interface LeaveRequest {
  id: number
  type?: string | null
  start_date: string
  end_date: string
  description?: string | null
  status: string
  rejection_reason?: string | null
  /** Set when a decided request was put back to pending (Verifix «reset»). */
  reopen_reason?: string | null
  reopened_at?: string | null
  assigned_signers?: LeaveSigner[] | null
  signers?: LeaveSigner[] | null
  employee_id?: number | null
  reject_by_id?: number | null
  /** Set by the personnel office (`is_hr_order`): the requester cannot
   *  touch it — only HR/admin may. */
  is_hr_order?: boolean | null
  /** Requester's card; `supervisor_id` decides who may sign a request that
   *  names no signer. */
  employee?: { id?: number; legal_name?: string | null; supervisor_id?: number | null; department_id?: number | null; photo_path?: string | null; photo_thumb_path?: string | null } | null
}

/**
 * The current user's own leave/permission requests (dashboard widget): the
 * five latest and how many still wait for a decision.
 *
 * ⚠️ It used to call `/work-leaves` with NO parameters and filter in the
 * browser. For HR, ministr or the master admin the server answers that with
 * the whole branch (or organisation), so «Mening so'rovlarim» listed other
 * people's requests and counted the branch's pending ones — and downloaded
 * the entire table to do it. Both halves are now asked of the server.
 */
export function useMyLeaveRequests(employeeId?: number | null) {
  const enabled = !!employeeId
  const recent = useQuery({
    queryKey: ['work-leaves', 'mine', employeeId, 'recent'],
    queryFn: () => apiGet<ListResponse<LeaveRequest>>(WORK_LEAVES, { employee_id: employeeId, page: 1, size: 5 }),
    enabled,
  })
  const pending = useQuery({
    queryKey: ['work-leaves', 'mine', employeeId, 'pending'],
    queryFn: () => apiGet<{ total?: number }>(WORK_LEAVES, { employee_id: employeeId, status: 'pending', page: 1, size: 1 }),
    enabled,
  })
  return { all: toItems(recent.data), pendingCount: pending.data?.total ?? 0, loading: recent.isLoading }
}

/** Whose requests the list shows. */
export type LeaveScope = 'mine' | 'team' | 'branch'
export const LEAVE_SCOPES: LeaveScope[] = ['mine', 'team', 'branch']

/** UI status → the server's status group (`WorkLeaveService._STATUS_GROUPS`). */
export const LEAVE_STATUS_PARAM: Record<'pending' | 'signed' | 'rejected', string> = {
  pending: 'pending',
  signed: 'approved',
  rejected: 'rejected',
}

interface LeaveListArgs {
  scope: LeaveScope
  /** UI status key; mapped through `LEAVE_STATUS_PARAM`. */
  status?: string
  /** Exact type (csv accepted by the server, case-insensitive). */
  type?: string
  /** Branch scope only. */
  departmentIds?: number[]
  dateFrom?: string
  dateTo?: string
  search?: string
  /** Narrow to the requests one supervisor is responsible for. */
  supervisorId?: string
  page: number
  size: number
  enabled?: boolean
}

/** Query params for the chosen scope — shared by the list and the export. */
function leaveScopeParams(scope: LeaveScope): Record<string, unknown> {
  // `mine` sends nothing extra: the server's default already returns what the
  // person filed AND what is addressed to them for signature. `employee_id=me`
  // would drop the second half, and with it the approve/reject buttons.
  switch (scope) {
    case 'team':
      return { supervised: true }
    default:
      return {}
  }
}

/** Everything the leave list sends, so the Excel export narrows the same way. */
export function leaveListParams(a: Omit<LeaveListArgs, 'page' | 'size' | 'enabled'>) {
  const status = a.status && a.status in LEAVE_STATUS_PARAM
    ? LEAVE_STATUS_PARAM[a.status as keyof typeof LEAVE_STATUS_PARAM]
    : undefined
  return {
    ...leaveScopeParams(a.scope),
    status,
    type: a.type || undefined,
    department_ids: a.departmentIds?.length ? a.departmentIds : undefined,
    date_from: a.dateFrom || undefined,
    date_to: a.dateTo || undefined,
    search: a.search || undefined,
    supervisor_id: a.supervisorId || undefined,
  }
}

/**
 * The people who actually approve leave — those with subordinates.
 *
 * A branch-wide leave list is mostly noise to a department head: what they
 * want is "the requests that come to ME". `/employees/supervisors` is the
 * server's own answer to who those people are, so the filter cannot drift out
 * of step with who the approval routing really picks.
 */
/**
 * WHO IS ON ANNUAL LEAVE right now — the list a temporary-order needs before it
 * can name a stand-in. Without it the person writing the order had to remember
 * or ask.
 */
/**
 * ⚠️ NOT A `LeaveRequest`. The route answers with `OnAnnualLeaveEmployee` —
 * the person plus the window, shaped for a picker, not the leave record. The
 * hook used to declare `LeaveRequest[]`, which nothing caught because nothing
 * called it.
 */
export interface OnAnnualLeaveEmployee {
  id: number
  legal_name?: string | null
  department_name?: string | null
  job_position_name?: string | null
  leave_start_date?: string | null
  leave_end_date?: string | null
}

export function useOnAnnualLeave(enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['work-leaves', 'on-annual-leave', branchId],
    queryFn: () =>
      apiGet<OnAnnualLeaveEmployee[]>(`${WORK_LEAVES}/on-annual-leave`, {
        organization_branch_id: branchId || undefined,
      }),
    enabled,
    staleTime: 5 * 60_000,
  })
  return { rows: Array.isArray(q.data) ? q.data : [], loading: q.isLoading }
}

export function useSupervisorOptions(enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['employees', 'supervisors', branchId],
    queryFn: () =>
      apiGet<ListResponse<{ id: number; legal_name?: string | null; job_position_name?: string | null; photo_path?: string | null }>>(
        'employees/supervisors',
        { organization_branch_id: branchId || undefined, page: 1, size: 200 },
      ),
    enabled,
    staleTime: 10 * 60_000,
  })
  return toItems(q.data).map((e) => ({
    value: String(e.id),
    label: e.legal_name ?? '—',
    subLabel: e.job_position_name ?? undefined,
    photo: e.photo_path ?? undefined,
  }))
}

/**
 * Leave requests, narrowed by the SERVER. The page used to fetch everything
 * and filter the status in JS; now status, type, dates, department and search
 * all travel as query params, and the list is paged (opt-in `page`/`size`
 * envelope; a bare array from an older API still renders).
 */
export function useLeaveRequests(args: LeaveListArgs) {
  const { page, size, enabled = true } = args
  const q = useQuery({
    queryKey: ['work-leaves', 'list', args],
    queryFn: () =>
      apiGet<ListResponse<LeaveRequest>>(WORK_LEAVES, { ...leaveListParams(args), page, size }),
    enabled,
    placeholderData: (prev) => prev,
  })
  const items = toItems(q.data)
  const env = q.data && !Array.isArray(q.data) ? (q.data as Paginated<LeaveRequest> & { total?: number }) : null
  const total = env?.total ?? env?.count ?? items.length
  return {
    rows: items,
    total,
    pages: env?.pages ?? Math.max(1, Math.ceil(total / size)),
    /** Every row matching the same filter, all pages — for «select all N».
     *  Rows, not ids: the page keeps only those this person may act on. */
    loadAllRows: () => fetchAllPages<LeaveRequest>(WORK_LEAVES, leaveListParams(args), 500, 60),
    loading: q.isLoading,
    fetching: q.isFetching,
  }
}

export function useLeaveMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['work-leaves'] }),
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(WORK_LEAVES, body) }),
    /**
     * VAQTNI TUZATISH. v2 da `work-leaves` uchun PATCH umuman yo'q edi, ya'ni
     * noto'g'ri kiritilgan oraliqni tuzatishning yagona yo'li o'chirib qayta
     * yaratish edi — imzolangani esa o'chmaydi.
     *
     * Darvoza serverniki (`_assert_can_mutate`): imtiyozli boshqaruvchi yoki
     * so'rov EGASI. Tugmani shu qoidaga qarab chizamiz, o'zimiznikini
     * o'ylab topmaymiz.
     */
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${WORK_LEAVES}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${WORK_LEAVES}/${id}`) }),
    /**
     * The approval half of the screen. Without these the assigned signer could
     * see a request addressed to them and do nothing about it — the list named
     * the signers but offered no way to act, so every leave request stayed
     * `pending` forever.
     */
    sign: useMutation({ mutationFn: (id: number) => apiPost(`${WORK_LEAVES}/${id}/sign`, {}) }),
    /**
     * Signing several requests in ONE click.
     *
     * A department head comes back from leave to twenty pending requests, and
     * approving them one at a time is twenty round-trips and twenty chances to
     * lose their place. The server still runs each one through the ordinary
     * per-request permission check and reports the ones it refused, so this is
     * a convenience, never a way around the rules.
     */
    bulkSign: useMutation({
      mutationFn: (ids: number[]) =>
        apiPost<{ failed?: { id: number; error?: string }[] }>(`${WORK_LEAVES}/bulk-sign`, { ids }),
    }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) =>
        apiPost(`${WORK_LEAVES}/${id}/reject`, { rejection_reason: reason }),
    }),
    bulkReject: useMutation({
      mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
        apiPost<{ failed?: { id: number; error?: string }[] }>(`${WORK_LEAVES}/bulk-reject`, {
          ids,
          rejection_reason: reason,
        }),
    }),
    reopen: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) =>
        apiPost(`${WORK_LEAVES}/${id}/reopen`, { reason }),
    }),
  }
}

export function leaveStatusKey(status: string): 'pending' | 'signed' | 'rejected' {
  const s = (status || '').toLowerCase()
  if (['signed', 'approved', 'tasdiqlangan'].includes(s)) return 'signed'
  if (['rejected', 'rad_etilgan'].includes(s)) return 'rejected'
  return 'pending'
}
