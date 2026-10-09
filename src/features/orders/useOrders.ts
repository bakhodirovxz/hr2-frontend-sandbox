import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { ORDER_ACTS } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { toItems, type ListResponse, type Paginated } from '@/types'

export interface OrderSigner {
  id: number
  employee_id?: number | null
  signer_type?: string | null
  /** Someone asked for this agreer to be struck off; only they may answer. */
  removal_requested?: boolean
  /** This agreer may also edit the document text (set when they are added). */
  can_edit_document?: boolean | null
  status?: string | null
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
}
export interface OrderFamiliarizer {
  id: number
  order_act_id?: number
  employee_id?: number
  acknowledged?: boolean
  acknowledged_at?: string | null
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
}

export interface OrderAct {
  id: number
  act_number?: string | null
  act_date?: string | null
  summary?: string | null
  description?: string | null
  status?: string | null
  category_id?: number | null
  category_rel?: { id?: number; name?: string | null; creator_role?: string | null; type?: number | null } | null
  /** The branch the order belongs to — the one HR records the arrival for. */
  organization_branch_id?: number | null
  /** Flat FK — `created_by` is absent on HR decrees, this is not. */
  created_by_id?: number | null
  /** Whoever is entering the decree on the author's behalf; they confirm it
   *  at the `pending_submitter` stage before it moves on. */
  submitter_id?: number | null
  is_stamped?: boolean
  is_unseen?: boolean
  rejection_reason?: string | null
  created_by?: { id?: number; legal_name?: string | null } | null
  /** The generated decree .docx (OrderActDocumentRead). There is NO
   *  `original_filename` on this — the object carries bucket/object names and a
   *  computed `file_path`. Gating the OnlyOffice buttons on a field that never
   *  exists is what hid the auto-generated decree. */
  document?: {
    id?: number
    file_path?: string | null
    document_objectname?: string | null
    document_bucketname?: string | null
  } | null
  assigned_signers?: OrderSigner[] | null
  signers?: OrderSigner[] | null
  familiarizers?: OrderFamiliarizer[] | null
  /** Departments whose staff must acknowledge — the edit form reads them back. */
  familiarizer_departments?: { id: number; name?: string | null }[] | null
  /**
   * Whether PATCH is open to THIS reader. Computed server-side by running
   * `update_order_act`'s own two guards (`OrderActService.can_edit`), so the
   * button and the endpoint can never drift apart.
   */
  can_edit?: boolean
  /** Files / familiarizers / movements — server `_assert_can_edit_decree` (no stage lock). */
  can_manage?: boolean | null
  /** Files attached to the decree, separate from the generated `document`. */
  documents?: {
    id: number
    file_path?: string | null
    document_objectname?: string | null
    document_bucketname?: string | null
  }[] | null
  /* ⚠️ There are NO `registered_number` / `registered_date` on an order act.
   * Registration writes `act_number` + `act_date` and sets `is_stamped`
   * (`OrderActService.register`). v2 read the phantom names, so the
   * "№ X from Y" pill never rendered and the stamp-edit prefill fell back
   * every time (2026-09-11 audit). `is_stamped` is the registered signal. */
  /**
   * Trip fields on a decree. `create_order_act` accepts all four and v1's
   * detail modal printed the arrival report, but v2 rendered none of them —
   * so on a business-trip decree the plan, the report and the planned dates
   * were simply invisible, with nothing on screen hinting they existed.
   * Neither frontend offers an INPUT for them (they are filled by the trip
   * flow), so this is display only.
   */
  plans?: string | null
  arrival_report?: string | null
  planned_arrival_date?: string | null
  planned_departure_date?: string | null
  /** The employee the decree is ABOUT — a different FK from `created_by`. */
  employee?: { id?: number; legal_name?: string | null } | null
  /** Who rejected it. Only the reason was shown, never the person. */
  rejected_by?: { id?: number; legal_name?: string | null } | null
  /** A pending deletion request. Invisible in v2 until now. */
  deletion_requested?: boolean | null
}

interface OrderListOptions {
  dateFrom?: string
  dateTo?: string
  /**
   * Narrow the list to the decrees ABOUT one employee. v1 had this filter and
   * v2 dropped it, so "every order concerning this person" — the question a
   * labour dispute or an audit actually asks — had no answer short of reading
   * the whole list.
   */
  employeeId?: string | number | null
  /** Comma-separated backend statuses (see `ORDER_STATUS_FILTERS`). */
  status?: string
  page?: number
  size?: number
  /** `false` while the date range is invalid (the API 422s on from > to). */
  enabled?: boolean
}

/**
 * UI status bucket → backend statuses, as the csv `/order-acts` accepts.
 * Mirrors `orderStatusKey` so a row's badge and the filter that finds it agree.
 * Only these values are sent — the server rejects unknown statuses.
 */
export const ORDER_STATUS_FILTERS: Record<OrderStatusKey, string> = {
  draft: 'draft',
  signing: 'pending,pending_approval,pending_submitter,pending_leadership,pending_chancellery',
  changes: 'changes_requested',
  signed: 'signed,confirmed',
  registered: 'registered,applied,approved,management_approved',
  rejected: 'rejected,returned',
}

/**
 * Orders list. `scopeParams` (see `features/documents/scopes.ts`) narrows the
 * list to the slice the signed-in role actually works with — the registration
 * queue for the chancellery, "awaiting my signature" for a signer, and so on.
 * Paging is opt-in on the server (envelope with `total`); a bare array from an
 * older API still renders, with `total` = its length.
 */
/**
 * The register at a glance: how many decrees there are and how they split
 * between approved, waiting and refused.
 *
 * The page shows a filtered page of rows; this is the whole branch's shape,
 * which is the number people quote in a meeting. Cheap enough to keep fresh —
 * it is four integers.
 */
export function useOrderStats() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['order-acts', 'stats', branchId],
    queryFn: () =>
      apiGet<{ total?: number; approved?: number; pending?: number; rejected?: number }>(
        `${ORDER_ACTS}/stats`,
        { organization_branch_id: branchId || undefined },
      ),
    staleTime: 60_000,
  })
  return { stats: q.data ?? null, loading: q.isLoading }
}

/**
 * Is this decree number free in the branch? Asked while it is being typed, so
 * a clash is caught in the form instead of coming back as a 400 on save.
 * `suggested` is the next free number.
 */
export function useActNumberAvailability(
  branchId: number | null | undefined,
  actNumber: string,
  excludeId?: number,
) {
  const q = useQuery({
    queryKey: ['order-acts', 'number-availability', branchId, actNumber, excludeId],
    queryFn: () =>
      apiGet<{ available?: boolean; suggested?: string | null }>(
        `${ORDER_ACTS}/act-number/availability`,
        { organization_branch_id: branchId, act_number: actNumber || undefined, exclude_id: excludeId },
      ),
    enabled: !!branchId && !!actNumber,
  })
  return { available: q.data?.available, suggested: q.data?.suggested ?? null }
}

export function useOrders(
  categoryId: string,
  search: string,
  scopeParams: Record<string, unknown> = {},
  opts: OrderListOptions = {},
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { dateFrom, dateTo, status, page, size, employeeId, enabled = true } = opts
  const q = useQuery({
    queryKey: ['orders', { categoryId, search, branchId, scopeParams, dateFrom, dateTo, status, page, size, employeeId }],
    queryFn: () =>
      apiGet<ListResponse<OrderAct>>(ORDER_ACTS, {
        category_id: categoryId || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status || undefined,
        employee_id: employeeId ? Number(employeeId) : undefined,
        page: page || undefined,
        size: page ? size || undefined : undefined,
        ...scopeParams,
      }),
    enabled,
    placeholderData: (prev) => prev,
  })
  const items = toItems(q.data)
  const env = q.data && !Array.isArray(q.data) ? (q.data as Paginated<OrderAct> & { total?: number }) : null
  const total = env?.total ?? env?.count ?? items.length
  return {
    orders: items,
    total,
    pages: env?.pages ?? Math.max(1, size ? Math.ceil(total / size) : 1),
    loading: q.isLoading,
    fetching: q.isFetching,
  }
}

export function useOrder(id: number | null) {
  const q = useQuery({
    queryKey: ['order', id],
    queryFn: () => apiGet<OrderAct>(`${ORDER_ACTS}/${id}`),
    enabled: !!id,
    retry: false,
  })
  return { order: q.data ?? null, loading: q.isLoading, failed: q.isError }
}

/** A note anyone who can see the decree may leave; it changes no status. */
interface OrderComment {
  id: number
  employee_id?: number | null
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  action?: string | null
  text?: string | null
  created_at?: string | null
}

/** One recorded edit to the decree's text — who changed what, and when. */
interface OrderHistoryRow {
  id: number
  editor_employee_id?: number | null
  editor?: { id?: number; legal_name?: string | null } | null
  field?: string | null
  old_text?: string | null
  new_text?: string | null
  created_at?: string | null
}

export function useOrderComments(id: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['order-comments', id],
    queryFn: () => apiGet<OrderComment[]>(`${ORDER_ACTS}/${id}/comments`),
    enabled: enabled && !!id,
    retry: false,
  })
  return { comments: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

export function useOrderHistory(id: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['order-history', id],
    queryFn: () => apiGet<OrderHistoryRow[]>(`${ORDER_ACTS}/${id}/history`),
    enabled: enabled && !!id,
    retry: false,
  })
  return { rows: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

export function useOrderMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['order'] })
    // The stat tiles above the list («Jami / Tasdiqlangan / Kutilmoqda / Rad
    // etilgan») and the act-number availability check live under
    // `['order-acts', …]`, which neither key above matches; with staleTime
    // 60s the tiles kept their old numbers for up to a minute after a change
    // made on that very screen.
    qc.invalidateQueries({ queryKey: ['order-acts'] })
    // Edits and sign/approve steps append to the audit trail too.
    qc.invalidateQueries({ queryKey: ['order-history'] })
  }
  return {
    invalidate,
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(ORDER_ACTS, body) }),
    /** Edit an existing order — v2 had no PATCH at all until now. */
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${ORDER_ACTS}/${id}`, body),
    }),
    submit: useMutation({ mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/submit`, {}) }),
    /**
     * Put a `changes_requested` decree back into the flow. Without it a
     * rejected decree was a dead end for its author — the backend clears every
     * signature and restarts at the approver stage.
     */
    resubmit: useMutation({ mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/resubmit`, {}) }),
    /** The submitter's own confirmation — without it a decree parked in
     *  `pending_submitter` had no button at all and could not move. */
    confirmSubmission: useMutation({
      mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/confirm-submission`, {}),
    }),
    addComment: useMutation({
      mutationFn: ({ id, text }: { id: number; text: string }) =>
        apiPost(`${ORDER_ACTS}/${id}/comments`, { text }),
      // The thread lives under its own key, which `invalidate()` never
      // matched: the box cleared, the toast said "added", the list did not
      // show the comment until a reload.
      onSuccess: (_d, { id }) => {
        void qc.invalidateQueries({ queryKey: ['order-comments', id] })
        void qc.invalidateQueries({ queryKey: ['order-history', id] })
      },
    }),
    /** An agreer answering a request to strike them off the decree. Rejecting
     *  keeps them on it; confirming can delete the decree outright. */
    confirmRemoval: useMutation({
      mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/removal/confirm`, {}),
    }),
    rejectRemoval: useMutation({
      mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/removal/reject`, {}),
    }),
    sign: useMutation({ mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/sign`, {}) }),
    reject: useMutation({ mutationFn: ({ id, reason }: { id: number; reason: string }) => apiPost(`${ORDER_ACTS}/${id}/reject`, { reason }) }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${ORDER_ACTS}/${id}`) }),

    // ── Decree flow (Verifix-style multi-stage) ────────────────────────────
    approve: useMutation({
      mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
        apiPost(`${ORDER_ACTS}/${id}/decree/approve`, { comment: comment || null }),
    }),
    decreeReject: useMutation({
      mutationFn: ({ id, comment }: { id: number; comment: string }) =>
        apiPost(`${ORDER_ACTS}/${id}/decree/reject`, { comment }),
    }),
    sendToLeadership: useMutation({
      mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/send-to-leadership`, {}),
    }),
    sendToChancellery: useMutation({
      mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/send-to-chancellery`, {}),
    }),
    /** Register the decree — assigns the act number and draws the stamp. */
    register: useMutation({
      mutationFn: ({ id, act_number, act_date }: { id: number; act_number?: string; act_date?: string }) =>
        apiPost(`${ORDER_ACTS}/${id}/decree/register`, {
          act_number: act_number || null,
          act_date: act_date || null,
        }),
    }),
    updateStamp: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${ORDER_ACTS}/${id}/stamp`, body),
    }),
    /** Put the decree into effect for one employee (dates / permanent). */
    apply: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPost(`${ORDER_ACTS}/${id}/decree/apply`, body),
    }),
    assignFamiliarizers: useMutation({
      mutationFn: ({ id, employee_ids }: { id: number; employee_ids: number[] }) =>
        apiPost(`${ORDER_ACTS}/${id}/decree/assign-familiarizers`, { employee_ids }),
    }),
    /** "I have read it" — the current user acknowledges the decree. */
    acknowledge: useMutation({
      mutationFn: (id: number) => apiPost(`${ORDER_ACTS}/${id}/decree/acknowledge`, {}),
    }),
  }
}

export type OrderStatusKey = 'draft' | 'signing' | 'changes' | 'signed' | 'registered' | 'rejected'
/**
 * `stamped` tells apart the two meanings of the terminal `confirmed` status:
 * `decree_register` leaves an employee decree at `confirmed` after the
 * chancellery stamps it, exactly like the leadership step leaves an HR decree
 * — so without the stamp flag a registered decree wore the plain "signed"
 * badge and the chancellery could not see, from the list, what it had already
 * registered.
 */
export function orderStatusKey(status?: string | null, stamped?: boolean): OrderStatusKey {
  const s = (status || '').toLowerCase()
  if (s === 'draft') return 'draft'
  // ⚠️ «Tuzatish so'raldi» — the decree came BACK to its author. It used to be
  // bucketed with «Imzolanmoqda», so the one status that asks the author to act
  // looked like ordinary waiting (v1 draws it red with its own label).
  if (s === 'changes_requested') return 'changes'
  if (['registered', 'applied', 'management_approved'].includes(s)) return 'registered'
  if (['signed', 'confirmed'].includes(s)) return stamped ? 'registered' : 'signed'
  if (['rejected', 'returned'].includes(s)) return 'rejected'
  return 'signing'
}
