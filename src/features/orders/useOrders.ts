import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { ORDER_ACTS } from '@/api/endpoints'
import { apiClient } from '@/api/client'
import { useDebounce } from '@/hooks/useDebounce'
import { PDF_MIME, XLSX_MIME, downloadFile } from '@/lib/download'
import dayjs from 'dayjs'
import { useBranchStore } from '@/store/branchStore'

/**
 * BUYRUQLAR (TZ 4.2.9, O1–O3) — hr-backend-sandbox `api/v1/order_act.py`.
 *
 * `GET /order-acts` is a plain list (no page envelope) already narrowed by the
 * server to what the caller may see; every row carries `action_required`
 * («this order waits for YOU»), which drives the yellow rows and the menu
 * counter. Workflow steps live under `/order-acts/{pk}/decree/*`.
 */

export interface OrderPerson {
  id?: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  department_id?: number | null
}

export interface OrderSigner {
  id?: number
  employee_id?: number | null
  /** `approver` (kelishuvchi) | `leadership` (rahbariyat) | legacy `main`/`ordinary`. */
  signer_type?: string | null
  can_edit_document?: boolean | null
  employee?: OrderPerson | null
  created_at?: string | null
}

export interface OrderCategory {
  id: number
  name?: string | null
  /** Internal `OrderActCategoryType` int. */
  type?: number | null
  /** TZ O1 type code: hire | dismissal | transfer | vacation | business_trip. */
  code?: string | null
  /** `employee` | `hr` = decree workflow; anything else = legacy act. */
  creator_role?: string | null
  organization_branch_id?: number | null
}

export interface OrderDocument {
  id: number
  file_path?: string | null
  /** The original upload name (the object name is a UUID). */
  file_name?: string | null
  document_objectname?: string | null
}

export interface OrderAct {
  id: number
  created_at?: string | null
  category_id?: number | null
  category_rel?: OrderCategory | null
  act_number?: string | null
  act_date?: string | null
  summary?: string | null
  description?: string | null
  effective_start_date?: string | null
  effective_end_date?: string | null
  status?: string | null
  employee_id?: number | null
  employee?: OrderPerson | null
  submitter_id?: number | null
  submitter?: OrderPerson | null
  created_by_id?: number | null
  created_by?: OrderPerson | null
  organization_branch_id?: number | null
  department_id?: number | null
  department_name?: string | null
  /** The generated decree .docx. */
  document?: OrderDocument | null
  /** Generated decree + attachments (attachments: object name not `decree_*`). */
  documents?: OrderDocument[] | null
  assigned_signers?: OrderSigner[] | null
  signers?: OrderSigner[] | null
  rejected_by?: OrderPerson | null
  rejection_reason?: string | null
  /** The order waits for THIS user's action (approve / sign / resubmit …). */
  action_required?: boolean | null
  employee_ids?: number[] | null
  details?: Record<string, unknown> | null
  employees?: { id: number; full_name?: string | null }[] | null
  /** TZ 2173/2204: employees named in the text (linked on save). */
  mentioned_employee_ids?: number[] | null
  mentioned_employees?: { id: number; full_name?: string | null }[] | null
  /** TZ O2 1224: this order corrects that (confirmed / applied) order. */
  corrects_order_act_id?: number | null
  /** TZ O2 1224: orders that correct this one (read of one order only). */
  corrective_orders?: CorrectiveRef[] | null
}

export interface CorrectiveRef {
  id: number
  act_number?: string | null
  status?: string | null
}

/** `GET /order-acts/{pk}/corrective-draft` — a create body built from the locked original. */
export interface CorrectiveDraft {
  corrects_order_act_id: number
  corrects_order_act_number?: string | null
  category_id?: number | null
  summary?: string | null
  description?: string | null
  employee_id?: number | null
  employee_ids?: number[] | null
  organization_branch_id?: number | null
  department_id?: number | null
  effective_start_date?: string | null
  effective_end_date?: string | null
  details?: Record<string, unknown> | null
  assigned_signers?: { employee_id?: number | null; signer_type?: string | null; can_edit_document?: boolean | null }[] | null
}

export const fetchCorrectiveDraft = (id: number) => apiGet<CorrectiveDraft>(`${ORDER_ACTS}/${id}/corrective-draft`)

/** TZ O3 1248 «Экспорт списка» — the list's own filters, xlsx | pdf. */
export const exportOrders = (params: OrderListParams, format: 'xlsx' | 'pdf') => {
  const { light: _light, ...rest } = params
  return downloadFile({
    url: `${ORDER_ACTS}/export`,
    method: 'post',
    mime: format === 'pdf' ? PDF_MIME : XLSX_MIME,
    filename: `Buyruqlar_${dayjs().format('DD.MM.YYYY')}.${format}`,
    params: { ...rest, format },
  })
}

/** `GET /order-acts/as-of` row — the order as it was at the end of `on`. */
export interface OrderAsOfRow {
  id: number
  category_id?: number | null
  category?: OrderCategory | null
  act_number?: string | null
  act_date?: string | null
  summary?: string | null
  description?: string | null
  status?: string | null
  created_by?: { id?: number; full_name?: string | null } | null
}

export interface OrderHistoryRow {
  id: number
  field?: string | null
  old_text?: string | null
  new_text?: string | null
  old_display?: unknown
  new_display?: unknown
  change_reason?: string | null
  created_at?: string | null
  editor?: OrderPerson | null
  editor_name?: string | null
}

export interface OrderStats {
  total?: number
  approved?: number
  pending?: number
  rejected?: number
}

/** Query params of `GET /order-acts` (and the subset `/as-of` accepts). */
export type OrderListParams = Record<string, string | number | boolean | null | undefined>

export function useOrderList(params: OrderListParams, enabled = true) {
  const q = useQuery({
    queryKey: ['orders', 'list', params],
    queryFn: () => apiGet<OrderAct[]>(ORDER_ACTS, params),
    enabled,
    placeholderData: (prev) => prev,
  })
  return {
    rows: Array.isArray(q.data) ? q.data : [],
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

/** TZ O3 — «Sana bo'yicha holat»: the list as it stood on `on` (read-only). */
export function useOrdersAsOf(on: string, params: OrderListParams, enabled: boolean) {
  const q = useQuery({
    queryKey: ['orders', 'as-of', on, params],
    queryFn: () => apiGet<{ on?: string; items?: OrderAsOfRow[]; total?: number }>(`${ORDER_ACTS}/as-of`, { ...params, on }),
    enabled: enabled && !!on,
    placeholderData: (prev) => prev,
  })
  return { rows: q.data?.items ?? [], loading: q.isLoading, fetching: q.isFetching, error: q.error, refetch: q.refetch }
}

export function useOrderStats(enabled = true) {
  // The interceptor stamps the header's branch; the key follows it.
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['orders', 'stats', branchId],
    queryFn: () => apiGet<OrderStats>(`${ORDER_ACTS}/stats`),
    enabled,
    staleTime: 30_000,
  })
  return { stats: q.data ?? null, loading: q.isLoading }
}

/** The whole (light) register for the monthly charts — unfiltered, like v1. */
export function useOrderChartRows(enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['orders', 'chart', branchId],
    queryFn: () => apiGet<OrderAct[]>(ORDER_ACTS, { light: true }),
    enabled,
    staleTime: 30_000,
  })
  return { rows: Array.isArray(q.data) ? q.data : [], loading: q.isLoading }
}

export function useOrder(id: number | null) {
  const q = useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: () => apiGet<OrderAct>(`${ORDER_ACTS}/${id}`),
    enabled: !!id,
    retry: false,
  })
  return { order: q.data ?? null, loading: q.isLoading, error: q.error }
}

export function useOrderHistory(id: number | null) {
  const q = useQuery({
    queryKey: ['orders', 'history', id],
    queryFn: () => apiGet<OrderHistoryRow[]>(`${ORDER_ACTS}/${id}/history`),
    enabled: !!id,
    retry: false,
  })
  return { rows: Array.isArray(q.data) ? q.data : [], loading: q.isLoading }
}

/**
 * Is the typed act number free in the branch? Asked while typing (400 ms
 * debounce) so a clash shows under the field, not as a 400 after Save.
 * The server compares case- and space-insensitively.
 */
export function useActNumberCheck(branchId: number | null | undefined, number: string, excludeId: number | undefined, enabled: boolean) {
  const n = useDebounce(number.trim(), 400)
  const q = useQuery({
    queryKey: ['orders', 'number-availability', branchId, n, excludeId],
    queryFn: () =>
      apiGet<{ available?: boolean; suggested?: string | null }>(`${ORDER_ACTS}/act-number/availability`, {
        organization_branch_id: branchId,
        act_number: n,
        exclude_id: excludeId,
      }),
    enabled: enabled && !!branchId && n !== '',
    retry: false,
  })
  const pending = enabled && !!branchId && number.trim() !== '' && (number.trim() !== n || q.isFetching)
  return {
    taken: enabled && number.trim() !== '' && n === number.trim() && q.data?.available === false,
    checking: pending,
    checked: enabled && n !== '' && n === number.trim() && q.data?.available === true,
  }
}

export const suggestActNumber = (categoryId: number | null, branchId: number | null) =>
  apiGet<{ suggested?: string | null }>(`${ORDER_ACTS}/act-number/suggest`, {
    category_id: categoryId || undefined,
    organization_branch_id: branchId || undefined,
  })

export interface DetectedMention {
  employee_id: number
  full_name?: string | null
  confidence?: 'high' | 'medium' | 'low' | string
}

/** TZ 4.2.9 — employees named in the order text (a suggestion, never auto-linked). */
export const detectEmployees = (text: string, branchId: number | null) =>
  apiPost<DetectedMention[]>(`${ORDER_ACTS}/detect-employees`, {
    text,
    organization_branch_id: branchId || undefined,
  })

export function useOrderMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['orders'] })
    // The red «waits for you» counter in the menu comes from the same flags.
    void qc.invalidateQueries({ queryKey: ['menu-badges'] })
  }
  const post = (path: string) => (id: number) => apiPost(`${ORDER_ACTS}/${id}/${path}`, {})
  return {
    invalidate,
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<OrderAct>(ORDER_ACTS, body) }),
    // Silent: a locked order (409 `order_locked`) opens the corrective-order
    // dialog instead of a toast — the caller reports every other error.
    update: useMutation({
      meta: { silent: true },
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<OrderAct>(`${ORDER_ACTS}/${id}`, body),
    }),
    remove: useMutation({ meta: { silent: true }, mutationFn: (id: number) => apiDelete(`${ORDER_ACTS}/${id}`) }),
    /** TZ O2 1224 «отозвать с согласования» — back to draft, signatures cleared. */
    withdraw: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason?: string | null }) =>
        apiPost<OrderAct>(`${ORDER_ACTS}/${id}/withdraw`, { reason: reason || null }),
    }),
    uploadDocuments: useMutation({
      mutationFn: ({ id, files }: { id: number; files: File[] }) => {
        const fd = new FormData()
        files.forEach((f) => fd.append('files', f))
        return apiPost(`${ORDER_ACTS}/${id}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      },
    }),
    removeDocument: useMutation({
      mutationFn: ({ id, docId }: { id: number; docId: number }) => apiDelete(`${ORDER_ACTS}/${id}/documents/${docId}`),
    }),
    /** Legacy (non-decree) act. */
    sign: useMutation({ mutationFn: post('sign') }),
    reject: useMutation({ mutationFn: post('reject') }),
    // Decree workflow.
    submit: useMutation({ mutationFn: post('decree/submit') }),
    confirmSubmission: useMutation({ mutationFn: post('decree/confirm-submission') }),
    approve: useMutation({ mutationFn: post('decree/approve') }),
    decreeReject: useMutation({
      mutationFn: ({ id, comment }: { id: number; comment: string }) =>
        apiPost(`${ORDER_ACTS}/${id}/decree/reject`, { comment }),
    }),
    resubmit: useMutation({ mutationFn: post('decree/resubmit') }),
    sendToLeadership: useMutation({ mutationFn: post('decree/send-to-leadership') }),
    apply: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPost(`${ORDER_ACTS}/${id}/decree/apply`, body),
    }),
  }
}

/** PDF of the decree as an object URL (the request needs the auth header). */
export function useOrderPdf(id: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['orders', 'pdf', id],
    queryFn: async () => {
      const res = await apiClient.get(`${ORDER_ACTS}/${id}/download-pdf`, { responseType: 'blob', timeout: 120_000 })
      return res.data as Blob
    },
    enabled: enabled && !!id,
    retry: false,
    gcTime: 0,
  })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!q.data) {
      setUrl(null)
      return undefined
    }
    const u = URL.createObjectURL(q.data)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [q.data])
  return { url, loading: q.isLoading, error: q.error }
}
