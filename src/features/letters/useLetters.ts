import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { LETTERS_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { toItems, type ListResponse, type Paginated } from '@/types'

export interface LetterAgreer {
  id: number
  employee_id?: number | null
  signer_type?: string | null
  agreed?: boolean | null
  comment?: string | null
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
}
/**
 * PER-USER ACTION FLAGS, computed by the server on the letter DETAIL.
 *
 * The gating rules for signing a trip live in `LetterService` and are far from
 * obvious — the main signer signs, management does not; self-finishing needs a
 * Face ID turnstile pass on the traveller's own branch. Re-deriving them in the
 * browser is how the two drift apart, so the screen reads these flags instead
 * and the server stays the only place the rule is written. It is NOT
 * authorization: every action is checked again on the server.
 */
export interface LetterAvailableActions {
  can_submit_trip?: boolean
  can_sign?: boolean
  can_reject?: boolean
  /** `submit-report` — filing AND correcting go through the same route, so
   *  this is NOT "there is no report yet". */
  can_submit_report?: boolean
  /** Devonxona: ro'yxatga olish / qaytarish (ikkalasi bir xil darvoza). */
  can_register_report?: boolean
  can_reset_report?: boolean
  can_approve_report?: boolean
  can_approve_guvohnoma?: boolean
  /** Extension decision — approve and reject are gated separately because
   *  trip-scoped HR may reject but not approve. */
  can_approve_extension?: boolean
  can_reject_extension?: boolean
  /** Trip registration approval — the letter's management signer or the
   *  branch's `trip_approver` leaders; /me exposes neither, so only the
   *  server can say. */
  can_approve_trip_registration?: boolean
  /** Regenerate document / upload attachment (`assert_can_modify`). */
  can_modify?: boolean
  /** Opens only after the traveller passed their own branch's turnstile. */
  can_self_finish_trip?: boolean
  /** The turnstile date the finish is recorded with. */
  self_finish_date?: string | null
  /** Every day a turnstile saw them — the traveller picks the return day. */
  self_finish_date_options?: string[] | null
  /**
   * Trip mutations. These are NOT one permission: cancelling requires
   * membership of the trip's OWN branch, while extending, the basis decree and
   * the arrival-date correction also accept the DESTINATION branch's HR. The
   * screen used to collapse all four into one `isHR(user)` check, so an HR who
   * could SEE another branch's trip was offered a Cancel button the server
   * answered with 403.
   */
  can_cancel_trip?: boolean
  can_extend_trip?: boolean
  can_fix_return_date?: boolean
  can_set_basis_decree?: boolean
}

export interface LetterListItem {
  id: number
  letter_type?: string | null
  letter_number?: string | null
  letter_date?: string | null
  description?: string | null
  status?: string | null
  is_stamped?: boolean
  /**
   * The author, and the pre-`creator_employee` fallback for older rows. Both are
   * on `LetterListItem` server-side (`schemas/letter.py`) and both are columns in
   * v1's list; v2 fetched them and threw them away.
   */
  creator_employee?: { id?: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null } | null
  submitter?: { id?: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null } | null
}
export interface LetterFull extends LetterListItem {
  work_plan?: string | null
  /** The fleet request this trip carries, when one was asked for. */
  vehicle_request?: {
    id?: number
    status?: string | null
    request_note?: string | null
    approval_note?: string | null
    response_text?: string | null
    vehicle?: { id?: number; model?: string | null; plate_number?: string | null } | null
    assigned_driver?: { id?: number; legal_name?: string | null } | null
  } | null
  attachment_filename?: string | null
  /** Where the uploaded file lives — the fallback when OnlyOffice cannot open it. */
  attachment_path?: string | null
  generated_document_path?: string | null
  rejection_reason?: string | null
  creator_employee?: { id?: number; legal_name?: string | null } | null
  creator_employee_id?: number | null
  submitter_id?: number | null
  decree_number?: string | null
  destination_regions?: string[] | null
  destination_branches?: { id: number; name?: string | null }[] | null
  assigned_signers?: LetterAgreer[] | null
  departure_date?: string | null
  arrival_date?: string | null
  /** Registration stamp (chancellery). */
  registered_number?: string | null
  registered_date?: string | null
  guvohnoma_number?: string | null
  /** KADR marked the traveller as returned — after this the trip cannot be
   *  cancelled and cannot be extended. */
  is_trip_confirmed?: boolean
  /**
   * The date the traveller ACTUALLY came back, as opposed to `arrival_date`
   * (the planned one). v1 printed the two side by side; v2 showed neither in
   * the detail view, so a trip that ran long looked identical to one that did
   * not.
   */
  actual_return_date?: string | null
  /** Why the chancellery sent the document back. Never rendered until now. */
  return_reason?: string | null
  /**
   * The generated .docx no longer matches the record — someone edited the
   * letter after it was produced. v1 warned the reader before they printed a
   * stale document; v2 stayed silent.
   */
  document_out_of_sync?: boolean
  organization_branch_id?: number | null
  basis_decree_number?: string | null
  basis_decree_date?: string | null
  /** The generated certificate file; present once the trip has been sent. */
  guvohnoma_path?: string | null
  /** Trip report. */
  report_number?: string | null
  report_registered_number?: string | null
  report_date?: string | null
  report_summary?: string | null
  /** Presigned URL of an uploaded report file (server: `report_attachment_path`). */
  report_attachment_path?: string | null
  /* Sent by both `LetterRead` and `LetterReadFull`, but never declared here —
     so the edit form could not open on what was already written. */
  report_task?: string | null
  report_content?: string | null
  report_status?: string | null
  available_actions?: LetterAvailableActions | null
}

/** One day of the trip window, as the timesheet sees it. */
export interface TripAttendanceDay {
  date: string
  status?: string | null
  first_entrance?: string | null
  last_exit?: string | null
  work_hours?: number
  late_minutes?: number
  branch_names?: string[] | null
  event_count?: number
}
/** One raw turnstile pass inside the trip window. */
export interface TripAttendanceEvent {
  id: number
  happen_time: string
  direction_type?: string | null
  turnstile_name?: string | null
  branch_name?: string | null
  photo_path?: string | null
}
export interface TripAttendance {
  letter_id: number
  employee_name?: string | null
  date_from?: string | null
  date_to?: string | null
  days?: TripAttendanceDay[] | null
  events?: TripAttendanceEvent[] | null
}

/** One leg of a business trip (departed / arrived at a branch). */
export interface TripMovement {
  id: number
  letter_id?: number
  branch_id?: number | null
  branch?: { id?: number; name?: string | null } | null
  event_type?: string | null
  event_date?: string | null
  sequence_order?: number | null
  note?: string | null
  is_confirmed?: boolean
  turnstile_event_id?: number | null
}

/** Extra list filters — every one of them is applied by the SERVER. */
interface LetterListOptions {
  dateFrom?: string
  dateTo?: string
  /** Filter by the leader a document is ADDRESSED to (v1's «Rahbariyat»). */
  addresseeId?: string
  /** Comma-separated backend statuses (see `LETTER_STATUS_FILTERS`). */
  status?: string
  page?: number
  size?: number
  /** `false` while the date range is invalid — the API answers 422 for
   *  `date_from > date_to`, so the query is simply not sent. */
  enabled?: boolean
}

/**
 * UI status bucket → the backend statuses it stands for, as the csv the list
 * endpoint accepts. The list is the SAME grouping `letterStatusKey` reads a
 * row with, so the badge on a row and the filter that finds it always agree.
 * Only these values are ever sent: the server rejects unknown statuses.
 */
export const LETTER_STATUS_FILTERS: Record<LetterStatusKey, string> = {
  draft: 'draft',
  agreeing: 'pending_agreement,agreements_pending',
  signed: 'signed,pending',
  chancellery: 'review',
  pendingReg: 'pending_registration',
  registered: 'registered,report_approved,management_approved',
  management: 'management_review,extension_review',
  report: 'report_submitted,report_management_review,report_guvohnoma_review',
  rejected: 'rejected,cancelled',
  returned: 'returned,report_returned',
}

/**
 * Letters list.
 *
 * `scopeParams` comes from `features/documents/scopes.ts` and decides WHOSE
 * letters these are (mine / awaiting my signature / the registration queue …).
 * It is spread LAST so a scope that must clear the branch filter — the
 * destination and approval views, where the trip belongs to another branch —
 * can override it with an explicit null.
 *
 * Paging is opt-in on the server: with `page`/`size` the answer is an envelope
 * with `total`, without them a bare array. `toItems` reads both, and `total`
 * falls back to the array length so an older API still renders.
 */
export function useLetters(
  letterType: string,
  search: string,
  scopeParams: Record<string, unknown> = {},
  opts: LetterListOptions = {},
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { dateFrom, dateTo, status, addresseeId, page, size, enabled = true } = opts
  const q = useQuery({
    queryKey: ['letters', { letterType, search, branchId, scopeParams, dateFrom, dateTo, status, addresseeId, page, size }],
    queryFn: () =>
      apiGet<ListResponse<LetterListItem>>(LETTERS_LIST, {
        letter_type: letterType || undefined,
        search: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        status: status || undefined,
        addressee_id: addresseeId || undefined,
        page: page || undefined,
        size: page ? size || undefined : undefined,
        ...scopeParams,
      }),
    enabled,
    placeholderData: (prev) => prev,
  })
  const items = toItems(q.data)
  const env = q.data && !Array.isArray(q.data) ? (q.data as Paginated<LetterListItem> & { total?: number }) : null
  const total = env?.total ?? env?.count ?? items.length
  return {
    letters: items,
    total,
    pages: env?.pages ?? Math.max(1, size ? Math.ceil(total / size) : 1),
    loading: q.isLoading,
    fetching: q.isFetching,
  }
}

/** Full letter detail. */
export function useLetter(id: number | null) {
  const q = useQuery({
    queryKey: ['letter', id],
    queryFn: () => apiGet<LetterFull>(`${LETTERS_LIST}/${id}`),
    enabled: !!id,
    retry: false,
  })
  // `failed` = 404/403 (deleted, or not this reader's) — the panel must say so
  // instead of showing a skeleton forever (a notification about a since-deleted
  // letter used to land exactly there).
  return { letter: q.data ?? null, loading: q.isLoading, failed: q.isError }
}

export function useLetterMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['letters'] })
    qc.invalidateQueries({ queryKey: ['letter'] })
  }
  return {
    invalidate,
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(LETTERS_LIST, body) }),
    /** Edit a draft before it is sent (v1 has this; v2 had no edit at all). */
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${LETTERS_LIST}/${id}`, body),
    }),
    /** Creator sends an agreed letter on for registration. Without this the
     *  flow dead-ended: once every agreer had agreed there was no button left. */
    sendToRegistryFlow: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/send-to-registry`, {}),
    }),
    /** Chancellery turns pending_registration into registered. */
    confirmRegistration: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/confirm-registration`, {}),
    }),
    /**
     * Send a draft on its way.
     *
     * ⚠️ THE ENDPOINT DEPENDS ON THE DOCUMENT TYPE. `submit-agreement` is for
     * a bildirgi/ariza only — the server answers a business trip with
     * `wrong_letter_type` ("Bu amal faqat bildirgi/ariza uchun"), which is why
     * a trip created in v2 could never leave the draft state: the one Send
     * button it had always called the wrong one. A trip goes through
     * `submit-trip`, which also mints its guvohnoma and decree number.
     */
    submit: useMutation({
      mutationFn: ({ id, letterType }: { id: number; letterType?: string | null }) =>
        apiPost(
          `${LETTERS_LIST}/${id}/${
            normalizeLetterType(letterType) === 'business_trip' ? 'submit-trip' : 'submit-agreement'
          }`,
          {},
        ),
    }),
    agree: useMutation({ mutationFn: ({ id, comment }: { id: number; comment: string }) => apiPost(`${LETTERS_LIST}/${id}/agree`, { comment }) }),
    disagree: useMutation({ mutationFn: ({ id, comment }: { id: number; comment: string }) => apiPost(`${LETTERS_LIST}/${id}/disagree`, { comment }) }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${LETTERS_LIST}/${id}`) }),

    /** Build the .docx from the letter's data when none exists yet. */
    generateDocument: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/generate-document`, {}),
    }),

    /** Attachment upload — multipart, field name `file`. */
    uploadAttachment: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost(`${LETTERS_LIST}/${id}/upload-attachment`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
    }),

    // ── Chancellery ────────────────────────────────────────────────────────
    // NOTE: there is no chancellery-side "send to registry" — that endpoint is
    // the AUTHOR's step and is exposed as `sendToRegistryFlow` above. This used
    // to be a second binding to the same URL, which is how the button ended up
    // on the chancellery's own strip.
    /** Register the document — draws number + date onto the branch stamp. */
    stamp: useMutation({
      mutationFn: ({ id, letter_number, letter_date }: { id: number; letter_number?: string; letter_date?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/stamp`, {
          letter_number: letter_number || null,
          letter_date: letter_date || null,
        }),
    }),
    /** Fix a wrong number/date on an already-drawn stamp. */
    updateStamp: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${LETTERS_LIST}/${id}/stamp`, body),
    }),
    /**
     * ⚠️ THE GUVOHNOMA NUMBER HAS ITS OWN ENDPOINT.
     * `PATCH /stamp` accepts the field in its schema but never reads it — it
     * writes only `registered_number` and `registered_date`. The stamp dialog
     * used to send the certificate number in that same body, so a number typed
     * there was answered with "Saqlandi" and silently dropped. Business trips
     * only, and the server refuses an empty value.
     */
    updateGuvohnomaStamp: useMutation({
      mutationFn: ({ id, guvohnoma_number }: { id: number; guvohnoma_number: string }) =>
        apiPatch(`${LETTERS_LIST}/${id}/guvohnoma-stamp`, { guvohnoma_number }),
    }),
    /** Send back to the author — reason is mandatory. */
    returnLetter: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/return`, { reason }),
    }),

    // ── Signing (BUSINESS TRIP) ────────────────────────────────────────────
    /**
     * The trip's main signer signs it: `pending` → `signed`, after which the
     * chancellery registering it makes it `management_approved`.
     *
     * ⚠️ Without this a trip created in v2 could be sent but never signed, so
     * it sat in `pending` for ever — there was no other route out of that
     * state. Bildirgi/ariza never reach here: the server answers 400
     * (`use_agreement_flow`) and points at agree/disagree.
     */
    sign: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/sign`, {}),
    }),
    /** The same signer refuses it instead. Trips only, for the same reason. */
    reject: useMutation({
      // `LetterGenericRejectRequest` (backend, 2026-09-14) stores the reason
      // the signer types; v1 sends it as `rejection_reason`, and the card
      // renders `letter.rejection_reason` — so a body-less reject left the
      // author with a red status and no explanation.
      mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/reject`, reason ? { reason } : {}),
    }),

    // ── Trip report ────────────────────────────────────────────────────────
    submitReport: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPost(`${LETTERS_LIST}/${id}/submit-report`, body),
    }),
    approveReport: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/approve-report`, {}),
    }),
    stampReport: useMutation({
      mutationFn: ({ id, letter_number, letter_date }: { id: number; letter_number?: string; letter_date?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/stamp-report`, {
          letter_number: letter_number || null,
          letter_date: letter_date || null,
        }),
    }),
    returnReport: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/return-report`, { reason }),
    }),

    // ── Trip lifecycle ─────────────────────────────────────────────────────
    /** KADR calls the trip off. Allowed at any live stage except a finished or
     *  already-cancelled one; a reason is optional but recorded. */
    cancelTrip: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/cancel-trip`, { reason: reason || null }),
    }),
    /** KADR pushes the return date out; the letter then waits on management
     *  in `extension_review` before the new date takes effect. */
    extendTrip: useMutation({
      mutationFn: ({ id, arrival_date, note }: { id: number; arrival_date: string; note?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/extend-trip`, { arrival_date, note: note || null }),
    }),
    approveExtension: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/approve-extension`, {}),
    }),
    rejectExtension: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/reject-extension`, {}),
    }),
    /** The certificate approver signs the trip off → `report_approved`, which
     *  is the state accounting looks for. */
    approveGuvohnoma: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/approve-guvohnoma`, {}),
    }),
    /** The decree the certificate cites on its "Asos:" line. */
    setBasisDecree: useMutation({
      mutationFn: ({ id, number, date }: { id: number; number: string; date: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/basis-decree`, {
          basis_decree_number: number,
          basis_decree_date: date,
        }),
    }),
    /** The traveller confirms their own return when no turnstile recorded it. */
    selfConfirmReturn: useMutation({
      mutationFn: ({ id, return_date }: { id: number; return_date?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/self-confirm-return`, { return_date: return_date || null }),
    }),

    // ── Trip movements ─────────────────────────────────────────────────────
    addMovement: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPost(`${LETTERS_LIST}/${id}/trip-movements`, body),
    }),
    updateMovement: useMutation({
      mutationFn: ({ id, mid, body }: { id: number; mid: number; body: Record<string, unknown> }) =>
        apiPatch(`${LETTERS_LIST}/${id}/trip-movements/${mid}`, body),
    }),
    deleteMovement: useMutation({
      mutationFn: ({ id, mid }: { id: number; mid: number }) =>
        apiDelete(`${LETTERS_LIST}/${id}/trip-movements/${mid}`),
    }),
    confirmReturn: useMutation({
      mutationFn: ({ id, return_date, note }: { id: number; return_date: string; note?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/confirm-return`, { return_date, note: note || null }),
    }),
    /**
     * KADR CORRECTS an arrival date that is already recorded. "Keldi" sets the
     * date once; without this a wrong date stayed wrong on the certificate and
     * in the timesheet for good.
     */
    setReturnDate: useMutation({
      mutationFn: ({ id, return_date, note }: { id: number; return_date: string; note?: string }) =>
        apiPatch(`${LETTERS_LIST}/${id}/return-date`, { return_date, note: note || null }),
    }),
    /** "A car is needed" for the trip. Works after submission too — the fleet
     *  desk decides WHICH car, so refusing one can be answered by asking again. */
    setVehicle: useMutation({
      mutationFn: ({ id, needed, note }: { id: number; needed: boolean; note?: string }) =>
        apiPost(`${LETTERS_LIST}/${id}/vehicle`, { needed, note: note || null }),
    }),
    /** P1 (a trip into another branch): after the chancellery, that branch's
     *  head confirms separately — `registered_pending_rahbar` → approved. */
    approveTripRegistration: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/approve-trip-registration`, {}),
    }),
    /** Chancellery edits the REPORT's stamp (number / date) after the fact. */
    updateReportStamp: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${LETTERS_LIST}/${id}/report-stamp`, body),
    }),
    /** Throws the submitted report away so the traveller can file a new one. */
    resetReport: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/reset-report`, {}),
    }),
    /** Rewrites the document's letterhead (number + date) from the database
     *  WITHOUT regenerating the file, so signatures, QR and stamp survive. */
    refreshHeader: useMutation({
      mutationFn: (id: number) => apiPost(`${LETTERS_LIST}/${id}/refresh-header`, {}),
    }),
  }
}

/**
 * The trip's attendance window: the timesheet rows for the trip days plus every
 * raw turnstile pass in that period, from the home branch AND the destination.
 * This is how KADR checks that a trip actually happened.
 */
export function useTripAttendance(id: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['letter', id, 'trip-attendance'],
    queryFn: () => apiGet<TripAttendance>(`${LETTERS_LIST}/${id}/trip-attendance`),
    enabled: !!id && enabled,
  })
  return { data: q.data ?? null, loading: q.isLoading }
}

/**
 * Is this registration number already taken in the branch? Asked while the
 * chancellery types it, so a clash is caught before the save instead of coming
 * back as a 400. `suggested` is the next free number.
 */
export function useRegisteredNumberAvailability(
  branchId: number | null | undefined,
  number: string,
  excludeId?: number,
  enabled = true,
) {
  const q = useQuery({
    queryKey: ['letters', 'number-availability', branchId, number, excludeId],
    queryFn: () =>
      apiGet<{ available?: boolean; suggested?: string | null }>(
        `${LETTERS_LIST}/registered-number/availability`,
        { organization_branch_id: branchId, number: number || undefined, exclude_id: excludeId },
      ),
    // Only someone who may edit the number needs the check — for anyone else
    // (an HR reading a letter bound for another branch) it is a 403.
    enabled: enabled && !!branchId,
  })
  return { available: q.data?.available, suggested: q.data?.suggested ?? null }
}

/** Trip movement legs for one letter. */
/**
 * XODIM HOZIR O'ZI YAKUNLAY OLADIGAN SAFARLAR — `letters/trip-self-finish`.
 *
 * Ro'yxatga BELGI qo'yish uchun: `available_actions` faqat tafsilotda keladi,
 * ya'ni qatorni ochmasdan turib safarni yakunlash mumkinligini bilib
 * bo'lmasdi. Shart serverda hisoblanadi (uy filiali turniketidan Face ID
 * bilan o'tish) — mijoz uni qayta talqin qilmaydi.
 */
export function useMySelfFinishTrips(enabled = true) {
  const q = useQuery({
    queryKey: ['letters', 'trip-self-finish'],
    queryFn: () => apiGet<{ letter_id: number; return_date?: string | null }[]>(`${LETTERS_LIST}/trip-self-finish`),
    enabled,
    staleTime: 60_000,
  })
  const map = new Map<number, string | null>()
  for (const row of q.data ?? []) map.set(row.letter_id, row.return_date ?? null)
  return { selfFinish: map, loading: q.isLoading }
}

export function useTripMovements(id: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['letter', id, 'trip-movements'],
    queryFn: () => apiGet<TripMovement[]>(`${LETTERS_LIST}/${id}/trip-movements`),
    enabled: enabled && !!id,
  })
  return { movements: q.data ?? [], loading: q.isLoading }
}

/** Canonical letter_type. Rows created before the rename carry the legacy
 *  spellings (`bildirgi`, `explanotary`, `notification`) — normalise so tab
 *  counters and labels do not silently miss them (v1 does the same). */
export function normalizeLetterType(type?: string | null): string {
  const s = (type || '').toLowerCase()
  if (['bildirgi', 'explanotary', 'explanatory', 'notification'].includes(s)) return 'explanatory'
  if (['ariza', 'application'].includes(s)) return 'application'
  return s
}

export type LetterStatusKey =
  | 'draft'
  | 'agreeing'
  | 'signed'
  | 'chancellery'
  | 'pendingReg'
  | 'registered'
  | 'management'
  | 'report'
  | 'rejected'
  | 'returned'

/**
 * Backend status → UI bucket.
 *
 * Every status the backend can emit is mapped. The previous version knew six
 * and fell through to 'draft' for the rest, so a letter sitting in
 * `pending_registration` or `review` was labelled "Qoralama" — the single most
 * misleading thing on the screen, because a draft is also the only state with
 * a Delete button.
 */
export function letterStatusKey(status?: string | null): LetterStatusKey {
  const s = (status || '').toLowerCase()
  if (['pending_agreement', 'agreements_pending'].includes(s)) return 'agreeing'
  if (s === 'review') return 'chancellery'
  if (s === 'pending_registration') return 'pendingReg'
  if (['registered', 'report_approved', 'management_approved'].includes(s)) return 'registered'
  if (['management_review', 'extension_review'].includes(s)) return 'management'
  if (['report_submitted', 'report_management_review', 'report_guvohnoma_review'].includes(s))
    return 'report'
  if (['signed', 'pending'].includes(s)) return 'signed'
  if (['rejected', 'cancelled'].includes(s)) return 'rejected'
  if (['returned', 'report_returned'].includes(s)) return 'returned'
  return 'draft'
}

/** Every agreer has agreed (or there are none) — the gate for send-to-registry. */
export function allAgreementsAgreed(letter: LetterFull | null): boolean {
  const rows = (letter?.assigned_signers ?? []).filter((a) => a.signer_type === 'agreement')
  if (rows.length === 0) return true
  return rows.every((a) => a.agreed === true)
}
