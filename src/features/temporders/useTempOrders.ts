import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from '@/features/employees/useEmployees'

const URL = 'work-leaves'

/**
 * TEMPORARY ORDERS — the leave and absence orders HR enters for other people.
 *
 * Same table as an employee's own "Ruxsat so'rash" request, but a different
 * door: `hr-create` writes the order already approved, because it records a
 * signed paper order rather than asking for one. The type is a CATEGORY here
 * (`kasal`, `otgul`, …) — the timesheet reads it and paints the day.
 */
export const ORDER_TYPES = [
  { value: 'kasal', short: 'Б' },
  { value: 'mehnat_tatili', short: 'ОТ' },
  { value: 'xizmat_safari', short: 'К' },
  { value: 'dekret', short: 'DT' },
  { value: 'haqsiz_tatil', short: 'БС' },
  { value: 'ishdan_ozod', short: 'О' },
  { value: 'tolanmaydigan_tatil', short: 'ТТ' },
  { value: 'noaniq_sabab', short: 'НС' },
  { value: 'harbiy_xizmat', short: 'ХХ' },
  { value: 'progul', short: 'ПР' },
  { value: 'malumotnoma', short: 'МА' },
  { value: 'ish_haqi_saqlangan', short: 'ИТ' },
  { value: 'malaka_oshirish', short: 'МО' },
  { value: 'oquv_tatil', short: 'УТ' },
  { value: 'otgul', short: 'ОГ' },
  { value: 'boshqa_ishga_otkazish', short: 'ПO' },
  { value: 'mehnat_tatilidan_chaqirish', short: 'ТЧ' },
  { value: 'homiladorlik', short: 'ҲТ' },
  { value: 'bola_parvarish', short: 'БП' },
  { value: 'qoshimcha_tatil', short: 'ҚТ' },
  { value: 'vaqtincha_otkazish', short: 'ВО' },
  { value: 'vaqtincha_boshatish', short: 'ВБ' },
  { value: 'ruxsat', short: 'Р' },
] as const

/**
 * ⚠️ Two of these ARCHIVE the employee (`ishdan_ozod`,
 * `boshqa_ishga_otkazish`) — they end the employment rather than pause it, so
 * only a start date is asked for and the form says what will happen.
 */
export const ARCHIVING_TYPES = ['ishdan_ozod', 'boshqa_ishga_otkazish']
/** Business trip — the one type that takes a destination and can be set for many at once. */
export const TRIP_TYPE = 'xizmat_safari'

/** The only hour-based order: an interval inside one day, not whole days. */
export const HOURLY_TYPE = 'ruxsat'

/** Recall from annual leave — only somebody currently ON leave can be recalled. */
export const RECALL_TYPE = 'mehnat_tatilidan_chaqirish'

/**
 * «Boshqa doimiy ishga o‘tkazish» has three KINDS (2026-10-05). The type list
 * shows one entry; the form asks which kind and the server stores each as its
 * own type, because only `boshqa` ends the employment:
 *   tashkilot — to another organisation in the system: that branch's HR
 *               accepts and picks the department + position;
 *   lavozim   — new department / position inside the employee's own branch;
 *   boshqa    — to work outside the system: the employee is archived.
 * Every kind takes a date; the move happens on it.
 */
export const PERM_TRANSFER_TYPE = 'boshqa_ishga_otkazish'
export const TRANSFER_KINDS = [
  { kind: 'tashkilot', type: 'boshqa_ishga_otkazish_tashkilot', short: 'ПO-Т' },
  { kind: 'lavozim', type: 'boshqa_ishga_otkazish_lavozim', short: 'ПO-Л' },
  { kind: 'boshqa', type: PERM_TRANSFER_TYPE, short: 'ПO' },
] as const
export type TransferKind = (typeof TRANSFER_KINDS)[number]['kind']
/** The two kinds that MOVE the employee rather than archive them. */
export const MOVE_TYPES: string[] = TRANSFER_KINDS.filter((k) => k.kind !== 'boshqa').map((k) => k.type)
export const transferKindOf = (type?: string | null) => TRANSFER_KINDS.find((k) => k.type === type)

export interface TempOrder {
  id: number
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  employee_id?: number | null
  start_date?: string | null
  end_date?: string | null
  type?: string | null
  description?: string | null
  status?: string | null
  created_at?: string | null
  rejection_reason?: string | null
  /** pending → scheduled → applied, or rejected — only on the move kinds. */
  transfer_status?: 'pending' | 'scheduled' | 'applied' | 'rejected' | null
  transfer_to_branch?: { id: number; name?: string | null } | null
  transfer_to_department?: { id: number; name?: string | null } | null
  transfer_to_job_position?: { id: number; name?: string | null } | null
  /** Xizmat safari manzili (filial/GES) — telefon belgisi masofasi shunga o'lchanadi. */
  destination_branch?: { id: number; name?: string | null } | null
}

/** A transfer waiting for MY branch to take the employee in. */
export interface IncomingTransfer extends TempOrder {
  /** Where the employee works NOW (the sending side). */
  from_branch?: { id: number; name?: string | null } | null
  from_department?: { id: number; name?: string | null } | null
  from_job_position?: { id: number; name?: string | null } | null
}

export interface BulkTripResult {
  created: number[]
  created_employee_ids: number[]
  skipped: { employee_id: number; code: string; message?: string | null }[]
}

export function useIncomingTransfers() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, 'transfers-incoming', branchId],
    queryFn: () =>
      apiGet<IncomingTransfer[]>(`${URL}/transfers/incoming`, {
        organization_branch_id: branchId || undefined,
      }),
  })
  return { rows: q.data ?? [], loading: q.isLoading }
}

export function useTempOrders(
  params: { search?: string; type?: string; from?: string; to?: string; page: number; size: number },
  { enabled = true }: { enabled?: boolean } = {},
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    // `enabled: false` while the date range is inverted (from > to) — the
    // page marks the inputs instead of asking for an impossible window.
    enabled,
    queryKey: [URL, 'hr-list', { ...params, branchId }],
    queryFn: () =>
      // Paged on the server, newest order dates first (2026-09-28): the page
      // used to load every order ever keyed in, in entry order.
      apiGet<Page<TempOrder>>(`${URL}/hr-list`, {
        page: params.page,
        size: params.size,
        organization_branch_id: branchId || undefined,
        search: params.search || undefined,
        date_from: params.from || undefined,
        date_to: params.to || undefined,
        // Order TYPE (sick leave / annual leave / dismissal / …). v1 had this
        // filter, v2 shipped without it, and `hr-list` had no param for it —
        // both sides were added together.
        type: params.type || undefined,
      }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
  }
}

export function useTempOrderMutations() {
  const qc = useQueryClient()
  // The timesheet reads these rows, so its cache has to go along with them.
  const done = () => {
    qc.invalidateQueries({ queryKey: [URL] })
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost(`${URL}/hr-create`, body),
      onSuccess: (_d, body) => {
        done()
        // A position change dated today moves the employee at once.
        if (MOVE_TYPES.includes(String(body.type))) qc.invalidateQueries({ queryKey: ['employees'] })
      },
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`${URL}/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/${id}`), onSuccess: done }),
    /** Bir nechta xodimga xizmat safari — har biri alohida buyruq; o'tmaganlari `skipped` da. */
    bulkTrip: useMutation({
      mutationFn: (body: {
        employee_ids: number[]
        start_date: string
        end_date: string
        note?: string | null
      }) => apiPost<BulkTripResult>(`${URL}/hr-bulk-create`, body),
      onSuccess: done,
    }),
    // The receiving branch's answer. Accepting moves the employee, so the
    // roster caches go too.
    approveTransfer: useMutation({
      mutationFn: ({ id, department_id, job_position_id }: { id: number; department_id: number; job_position_id: number }) =>
        apiPost(`${URL}/${id}/approve-transfer`, { department_id, job_position_id }),
      onSuccess: () => {
        done()
        qc.invalidateQueries({ queryKey: ['employees'] })
      },
    }),
    rejectTransfer: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
        apiPost(`${URL}/${id}/reject-transfer`, { reason: reason || null }),
      onSuccess: done,
    }),
  }
}
