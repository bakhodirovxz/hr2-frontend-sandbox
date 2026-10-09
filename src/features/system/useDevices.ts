import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  HIK_AUDIT_LOGS,
  HIK_DEVICE_DETAIL,
  HIK_DEVICE_DOOR_DIRECTION,
  HIK_REFRESH_DEVICES,
  HIK_SYNC_ACCESS_LISTS,
  HIK_SYNC_DEVICES,
  HIK_SYNC_DOORS,
  ISAPI_DEVICES,
  ISAPI_DEVICE_CREDENTIALS,
  ISAPI_DEVICE_POLL,
  ISAPI_DEVICE_SYNC_EMPLOYEES,
  ISAPI_DEVICE_TEST,
  ISAPI_DEVICE_UNKNOWN_USERS,
  TURNSTILE_DOORS,
  TURNSTILE_DOOR_DETAIL,
} from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import type { User } from '@/types'
import * as roles from '@/auth/roles'

/*
 * THE DEVICE SIDE OF THE TURNSTILE CHAIN.
 *
 * `useSystemAdmin` owns the records (branch → location → turnstile). This file
 * owns everything that talks to the HARDWARE or to HikCentral about it: ISAPI
 * terminals, the physical doors inside a turnstile, the appliance-wide sync and
 * the HikCentral audit trail.
 *
 * They are kept apart because their failure modes are different. The record
 * endpoints answer from our own database in milliseconds; everything here goes
 * out over the network to a device or to the appliance, can take minutes, and
 * can fail for reasons that have nothing to do with our data.
 */

/**
 * No client-side deadline for the calls that reach hardware.
 *
 * The shared axios instance times out after 30s. A HikCentral resync or a
 * device probe over a slow link routinely runs longer than that, and the
 * timeout does NOT stop the server — it only makes the browser report a
 * "network error" while the operation quietly keeps running and succeeds.
 * v1 hit exactly this and settled on an unbounded timeout for the same calls.
 */
const REACHES_HARDWARE = { timeout: 0 } as const

// ── ISAPI terminals ────────────────────────────────────────────────────────

export interface IsapiDevice {
  id: number
  name?: string | null
  ip?: string | null
  port?: number | null
  model?: string | null
  /** Login only. The device password is never returned by the API, by design. */
  username?: string | null
  status?: string | null
  last_online_at?: string | null
  last_offline_at?: string | null
  branch_ids?: number[]
  doors?: { door_index_code?: string | null; direction_type?: string | null }[]
}

export interface IsapiTestResult {
  online?: boolean
  error?: string
  model?: string
  firmware_version?: string
}

export interface IsapiPollResult {
  pulled?: number
  created?: number
  photos?: number
  /** Set when the device lock was held by the periodic poller — nothing ran. */
  skipped?: string
  detail?: string
}

export interface IsapiUnknownUsers {
  total_on_device?: number
  known?: number
  unknown_count?: number
  unknown?: string[]
  skipped?: string
  detail?: string
}

/**
 * The registered ISAPI terminals.
 *
 * `enabled` exists because this list sits behind the system-admin gate while
 * `GET /turnstiles` does not: the panel that needs it is only ever open for one
 * device at a time, so the request is not worth making until it is.
 */
export function useIsapiDevices(enabled = true) {
  const qc = useQueryClient()
  const q = useQuery({
    enabled,
    queryKey: ['isapi-devices'],
    queryFn: () => apiGet<ListResponse<IsapiDevice>>(ISAPI_DEVICES),
  })
  return {
    devices: toItems(q.data),
    loading: q.isLoading,
    /**
     * Registration connects to the device BEFORE anything is written, so a
     * failure here means no half-made turnstile is left behind — which is why
     * the call is slow enough to need the unbounded timeout.
     */
    register: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost(ISAPI_DEVICES, body, REACHES_HARDWARE),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['isapi-devices'] })
        qc.invalidateQueries({ queryKey: ['turnstiles'] })
      },
    }),
  }
}

/** Per-device operations. Each one reaches the terminal over the network. */
export function useIsapiActions() {
  const qc = useQueryClient()
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['isapi-devices'] })
    qc.invalidateQueries({ queryKey: ['turnstiles'] })
  }
  return {
    test: useMutation({
      mutationFn: (id: number) => apiPost<IsapiTestResult>(ISAPI_DEVICE_TEST(id), {}, REACHES_HARDWARE),
      onSuccess: refresh,
    }),
    poll: useMutation({
      mutationFn: (id: number) => apiPost<IsapiPollResult>(ISAPI_DEVICE_POLL(id), {}, REACHES_HARDWARE),
    }),
    /**
     * Queued, not synchronous: writing a branch's people to a terminal is two
     * or three device requests per employee, far past any HTTP deadline. The
     * response only says the job was accepted.
     */
    syncEmployees: useMutation({
      mutationFn: (id: number) => apiPost(ISAPI_DEVICE_SYNC_EMPLOYEES(id), { prune: false }),
    }),
    /**
     * New credentials are tried against the device before they are stored. If
     * they fail nothing is saved and the terminal keeps working with the old
     * ones, so a rejected save is safe to retry.
     */
    setCredentials: useMutation({
      mutationFn: ({ id, username, password }: { id: number; username: string; password?: string | null }) =>
        apiPatch(ISAPI_DEVICE_CREDENTIALS(id), { username, password: password || null }, REACHES_HARDWARE),
      onSuccess: refresh,
    }),
    /**
     * Read-only. The accounts listed here exist on the terminal but match
     * nobody in HR — they must be eyeballed before anyone prunes them, because
     * guards and other legitimate manual entries land in the same list.
     */
    unknownUsers: useMutation({
      mutationFn: (id: number) =>
        apiGet<IsapiUnknownUsers>(ISAPI_DEVICE_UNKNOWN_USERS(id), undefined, REACHES_HARDWARE),
    }),
  }
}

// ── Turnstile doors ────────────────────────────────────────────────────────

export interface TurnstileDoor {
  id: number
  door_index_code?: string | null
  acs_dev_index_code?: string | null
  region_index_code?: string | null
  door_no?: string | null
  door_name?: string | null
  turnstile_id?: number | null
  /** 'entrance' | 'exit' | null. Attendance arrival/exit is read from this. */
  direction_type?: string | null
}

/**
 * The physical doors of ONE turnstile.
 *
 * The direction stored here is what attendance reads to decide whether a pass
 * was an arrival or a departure, so a door left unset silently drops out of the
 * kel-ket calculation — that is why the panel makes it the loudest control.
 */
export function useTurnstileDoors(turnstileId?: number | null) {
  const qc = useQueryClient()
  const q = useQuery({
    enabled: !!turnstileId,
    queryKey: ['turnstile-doors', turnstileId],
    queryFn: () => apiGet<ListResponse<TurnstileDoor>>(TURNSTILE_DOORS, { turnstile_id: turnstileId }),
  })
  const done = () => qc.invalidateQueries({ queryKey: ['turnstile-doors'] })
  return {
    doors: toItems(q.data),
    loading: q.isLoading,
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(TURNSTILE_DOORS, body), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(TURNSTILE_DOOR_DETAIL(id), body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(TURNSTILE_DOOR_DETAIL(id)), onSuccess: done }),
  }
}

// ── HikCentral appliance sync ──────────────────────────────────────────────

export interface TurnstileAccessList {
  id: number
  privilege_group_id?: string | null
  privilege_group_name?: string | null
}

/**
 * Is this account allowed to run the appliance-wide sync?
 *
 * The server admits only a GLOBAL system administrator (`branch_ids_for_user`
 * is GLOBAL): the operation re-reads the whole appliance and rewrites EVERY
 * branch's devices, doors and privilege groups, so a single branch's helpdesk
 * must not be able to fire it. Showing the button to them would produce a
 * guaranteed 403 on click, which is why it is hidden instead of disabled.
 *
 * An `admin` account BOUND to one branch is branch-scoped too, exactly as in
 * v1: `/auth/me` does return `admin.organization_branch_id` (verified live —
 * the payload carries the whole `AdminRead` row). v2 had simply typed that
 * field as a boolean, so the branch was invisible here and such an account saw
 * a button that could only ever answer 403.
 */
export function canRunHikSync(user?: User | null): boolean {
  if (!roles.canAccessSystemAdmin(user)) return false
  if ((user?.akt_branch_ids?.length ?? 0) > 0) return false
  return !user?.admin?.organization_branch_id
}

/**
 * Reading the privilege groups is NOT global-only — a branch helpdesk needs the
 * list to pick their branch's access group — so it is fetched independently of
 * whether the sync buttons are shown.
 */
export function useHikAccessLists(enabled = true) {
  const q = useQuery({
    enabled,
    queryKey: ['hik-access-lists'],
    queryFn: () => apiGet<ListResponse<TurnstileAccessList>>(HIK_SYNC_ACCESS_LISTS),
  })
  return { accessLists: toItems(q.data), loading: q.isLoading, refetch: q.refetch }
}

/**
 * Full appliance sync, in the order v1 runs it: devices, then doors, then
 * privilege groups. The order is not cosmetic — a door row references the
 * device it hangs off, and a privilege group references both, so running them
 * out of order leaves rows pointing at devices that have not been imported yet.
 * A failed step aborts the rest for the same reason.
 */
export function useHikSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiPost(HIK_SYNC_DEVICES, {}, REACHES_HARDWARE)
      await apiPost(HIK_SYNC_DOORS, {}, REACHES_HARDWARE)
      await apiPost(HIK_SYNC_ACCESS_LISTS, {}, REACHES_HARDWARE)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turnstiles'] })
      qc.invalidateQueries({ queryKey: ['turnstile-doors'] })
      qc.invalidateQueries({ queryKey: ['hik-access-lists'] })
      qc.invalidateQueries({ queryKey: ['hik'] })
    },
  })
}

// ── HikCentral audit log & device control ──────────────────────────────────

export interface HikAuditRow {
  id: number
  operation?: string | null
  result?: string | null
  employee_id?: number | null
  employee_name?: string | null
  /** Masked or absent depending on the viewer's PII level — never recomputed here. */
  personal_identification_number?: string | null
  branch_name?: string | null
  turnstile_id?: number | null
  turnstile_name?: string | null
  message?: string | null
  attempts?: number | null
  details?: unknown
  created_at?: string | null
}

interface HikAuditPage {
  items?: HikAuditRow[]
  total?: number
  pages?: number
}

export function useHikAuditLogs(params: {
  page: number
  size: number
  operation?: string
  result?: string
  enabled?: boolean
}) {
  const { page, size, operation, result, enabled = true } = params
  const q = useQuery({
    enabled,
    queryKey: ['hik', 'audit-logs', page, size, operation, result],
    queryFn: () =>
      apiGet<HikAuditPage>(HIK_AUDIT_LOGS, {
        page,
        size,
        operation: operation || undefined,
        result: result || undefined,
      }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 0,
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useHikDeviceActions() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: ['hik'] })
  return {
    /**
     * The HikCentral name is read-only in this edition (the appliance refuses
     * the rename with code 8), so the name set here is an HR-side override that
     * is displayed instead of it. The original stays visible underneath so a
     * device can still be matched to what the appliance calls it.
     */
    rename: useMutation({
      mutationFn: ({ id, displayName }: { id: number; displayName: string | null }) =>
        apiPatch(HIK_DEVICE_DETAIL(id), { display_name: displayName }),
      onSuccess: done,
    }),
    setDoorDirection: useMutation({
      mutationFn: ({ turnstileId, doorId, direction }: { turnstileId: number; doorId: number; direction: string }) =>
        apiPatch(HIK_DEVICE_DOOR_DIRECTION(turnstileId, doorId), { direction_type: direction }),
      onSuccess: () => {
        done()
        qc.invalidateQueries({ queryKey: ['turnstile-doors'] })
      },
    }),
    refreshDevices: useMutation({
      mutationFn: () => apiPost(HIK_REFRESH_DEVICES, {}, REACHES_HARDWARE),
      onSuccess: done,
    }),
  }
}
