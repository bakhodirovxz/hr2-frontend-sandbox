import { fetchAllPages } from '@/api/fetchAll'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { VISITORS_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { toItems, type ListResponse } from '@/types'

export interface Guest {
  id: number
  legal_name?: string | null
  personal_identification_number?: string | null
  organization_name?: string | null
  job_position?: string | null
  phone_number?: string | null
  telegram_username?: string | null
  host_employee_name?: string | null
  host_employee_photo_thumb_path?: string | null
  host_employee_internal_phone?: string | null
  card_no?: string | null
  photo_path?: string | null
  /** Few-KB WebP for the 34px list avatar — the original is ~180 KB per guest. */
  photo_thumb_path?: string | null
  valid_from?: string | null
  valid_until?: string | null
  qr_path?: string | null
  organization_branch_id?: number | null
  organization_branch?: { id?: number; name?: string | null } | null
  is_active?: boolean | null
  last_visit_time?: string | null
  visit_count?: number | null
  created_at?: string | null
}

export interface GuestFilters {
  search: string
  status?: string
  visit?: string
}

const guestParams = (branchId: number | null | undefined, f: GuestFilters) => ({
  organization_branch_id: branchId || undefined,
  search: f.search || undefined,
  is_active: f.status === 'active' ? true : f.status === 'inactive' ? false : undefined,
  visit: f.visit || undefined,
})

/**
 * Search, status, visit and paging all run on the SERVER (2026-09-25). The
 * page used to download the whole visitor table — it only grows — then
 * filter, count and page it in the browser.
 */
export function useGuests(f: GuestFilters, page: number, size: number) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const query = useQuery({
    queryKey: ['visitors', { branchId, ...f, page, size }],
    queryFn: () => apiGet<{ items: Guest[]; total: number; pages: number }>(VISITORS_LIST, { ...guestParams(branchId, f), page, size }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetching: query.isFetching,
    /** Every id matching the filters, all pages — «select all N». */
    loadAllIds: () => fetchAllPages<Guest>(VISITORS_LIST, guestParams(branchId, f), 100, 50).then((r) => r.map((g) => g.id)),
  }
}

/** The stat tiles: `/visitors/summary`, same scope and search. */
export function useGuestSummary(search: string) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['visitors', 'summary', branchId, search],
    queryFn: () => apiGet<{ total: number; active: number; today: number; never: number }>(`${VISITORS_LIST}/summary`, {
      organization_branch_id: branchId || undefined,
      search: search || undefined,
    }),
    placeholderData: (prev) => prev,
  })
  return q.data ?? { total: 0, active: 0, today: 0, never: 0 }
}

/** One guest, for the profile view. */
export function useGuest(id: number | null) {
  const q = useQuery({
    queryKey: ['visitor', id],
    queryFn: () => apiGet<Guest>(`${VISITORS_LIST}/${id}`),
    enabled: !!id,
  })
  return { guest: q.data ?? null, loading: q.isLoading }
}

export function useGuestMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => {
      qc.invalidateQueries({ queryKey: ['visitors'] })
      qc.invalidateQueries({ queryKey: ['visitor'] })
    },
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost(VISITORS_LIST, body),
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${VISITORS_LIST}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${VISITORS_LIST}/${id}`) }),
  }
}


/**
 * A GUEST INVITATION — the QR pass that lets a visitor through the turnstile.
 *
 * TZ 4.2.3. v2 could register a guest but never invite one: there was no way to
 * open a validity window, mint the QR, or mark the visitor as received and gone.
 */
export interface Invitation {
  id: number
  visitor_id?: number | null
  valid_from?: string | null
  valid_until?: string | null
  qr_token?: string | null
  qr_path?: string | null
  status?: string | null
  accepted_at?: string | null
  finished_at?: string | null
  is_invalid?: boolean | null
  invited_by_employee_name?: string | null
  description?: string | null
}

const INVITATIONS = 'invitations'

export function useInvitations(visitorId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['invitations', visitorId],
    queryFn: () =>
      apiGet<Invitation[] | ListResponse<Invitation>>(INVITATIONS, {
        visitor_id: visitorId,
        page: 1,
        size: 50,
      }),
    enabled: enabled && !!visitorId,
    retry: false,
  })
  const raw = q.data
  const rows = Array.isArray(raw) ? raw : toItems(raw)
  return { invitations: rows, loading: q.isLoading, denied: q.isError }
}

export function useInvitationMutations() {
  const qc = useQueryClient()
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['invitations'] })
    // The guest list, its summary tiles and the guest card live under
    // `visitors` / `visitor`; `['guests']` matched nothing.
    void qc.invalidateQueries({ queryKey: ['visitors'] })
    void qc.invalidateQueries({ queryKey: ['visitor'] })
  }
  return {
    create: useMutation({
      mutationFn: (body: {
        visitor_id: number
        valid_from: string
        valid_until: string
        description?: string | null
      }) => apiPost<Invitation>(INVITATIONS, body),
      onSuccess: done,
    }),
    /** Mints the QR image for an invitation that does not have one yet. */
    generateQr: useMutation({
      mutationFn: (id: number) => apiPost<Invitation>(`${INVITATIONS}/${id}/generate-qr`, {}),
      onSuccess: done,
    }),
    /** "Mehmon qabul qildim" — the host records the visitor's arrival. */
    accept: useMutation({
      mutationFn: (id: number) => apiPost<Invitation>(`${INVITATIONS}/${id}/accept`, {}),
      onSuccess: done,
    }),
    /** "Mehmon chiqib ketdi" — closes the visit and the pass with it. */
    finish: useMutation({
      mutationFn: (id: number) => apiPost<Invitation>(`${INVITATIONS}/${id}/finish`, {}),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(`${INVITATIONS}/${id}`),
      onSuccess: done,
    }),
  }
}
