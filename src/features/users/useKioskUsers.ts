import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  MULTI_MODAL_USER,
  MULTI_MODAL_USERS,
  MULTI_MODAL_USER_SEND_PASSWORD,
} from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'

/**
 * KIOSK ACCOUNTS — the logins a monitoring/turnstile kiosk signs in with.
 *
 * ⚠️ THE ROLE IS AN ALLOW-LIST, NOT A FREE FIELD. A kiosk account's `role` is
 * written verbatim into `User.type`, and some `type` values ("master-admin")
 * bypass authorization entirely — so the server accepts exactly the roles in
 * `ALLOWED_MULTI_MODAL_ROLES` and rejects everything else. The picker below
 * mirrors that list rather than offering free text; a typo here would be a
 * 422, but an unvalidated field would be an escalation route.
 */
/**
 * Post/kiosk account types, mirroring the server's `ALLOWED_MULTI_MODAL_ROLES`.
 * ⚠️ A role missing here is a post nobody can provision — `kpp` was exactly
 * that: the `/kpp` screen and the role key both existed, but the account could
 * not be created, so a checkpoint had to borrow a real employee card.
 */
export const KIOSK_ROLES = ['monitoring-operator', 'kpp'] as const

export interface KioskUser {
  id?: number
  role?: string | null
  user_id?: number | null
  username?: string | null
  organization_branch_ids: number[]
  personal_identification_number?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  legal_name?: string | null
  password_change_warning?: boolean | null
}

/** The list route returns a bare array (no page envelope) and is admin-gated. */
export function useKioskUsers(enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['multi-modal-users', branchId],
    queryFn: () =>
      apiGet<KioskUser[]>(MULTI_MODAL_USERS, {
        organization_branch_id: branchId || undefined,
      }),
    enabled,
    retry: false,
  })
  return {
    rows: Array.isArray(q.data) ? q.data : [],
    loading: q.isLoading,
    /** A role without kiosk access gets a 403 — the tab says so rather than
     *  showing an empty catalogue as if none existed. */
    denied: q.isError,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useKioskUserMutations() {
  const qc = useQueryClient()
  const done = () => void qc.invalidateQueries({ queryKey: ['multi-modal-users'] })

  return {
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KioskUser>(MULTI_MODAL_USERS, body),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KioskUser>(MULTI_MODAL_USER(id), body),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(MULTI_MODAL_USER(id)),
      onSuccess: done,
    }),
    sendPassword: useMutation({
      mutationFn: (id: number) => apiPost(MULTI_MODAL_USER_SEND_PASSWORD(id), {}),
    }),
  }
}
