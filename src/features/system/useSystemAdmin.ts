import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { ORGANIZATION_BRANCHES } from '@/api/endpoints'
import { toItems, type ListResponse, type OrganizationBranch } from '@/types'
import { useDebounce } from '@/hooks/useDebounce'

/*
 * The infrastructure screens: branches, the places inside them, the turnstiles
 * standing at those places, and what HikCentral says about all of it.
 *
 * They are one file because they are one chain — a turnstile belongs to a
 * location, a location belongs to a branch, and the Hik panel reports on the
 * turnstiles. Editing them apart is how the four drift out of step.
 */

export interface Location {
  id: number
  name?: string | null
  address?: string | null
  organization_branch_id?: number | null
  organization_branch?: { id?: number; name?: string | null } | null
  latitude?: number | null
  longitude?: number | null
}

export interface Turnstile {
  id: number
  acs_dev_index_code?: string | null
  acs_dev_name?: string | null
  display_name?: string | null
  acs_dev_ip?: string | null
  acs_dev_port?: number | null
  acs_dev_code?: string | null
  treaty_type?: string | null
  /** "1" = online, anything else = offline. HikCentral's own encoding. */
  status?: string | null
  locations?: { id: number; name?: string | null }[]
}

export function useBranchAdmin() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['organization-branches'],
    queryFn: () => apiGet<ListResponse<OrganizationBranch>>(ORGANIZATION_BRANCHES),
  })
  const done = () => qc.invalidateQueries({ queryKey: ['organization-branches'] })
  return {
    branches: toItems(q.data),
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(ORGANIZATION_BRANCHES, body), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${ORGANIZATION_BRANCHES}/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${ORGANIZATION_BRANCHES}/${id}`), onSuccess: done }),
    /**
     * Pushes the branch's people to HikCentral again. It is a QUEUED job, not a
     * synchronous one — the button stays disabled for a while afterwards so the
     * same job is not enqueued three times by someone who saw nothing happen.
     */
    syncEmployees: useMutation({
      mutationFn: (id: number) => apiPost(`${ORGANIZATION_BRANCHES}/${id}/sync-employees-to-hik`, {}),
    }),
  }
}

export function useLocations(branchId?: number | null) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['locations', branchId],
    queryFn: () => apiGet<ListResponse<Location>>('locations', { organization_branch_id: branchId || undefined }),
  })
  const done = () => qc.invalidateQueries({ queryKey: ['locations'] })
  return {
    locations: toItems(q.data),
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost('locations', body), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`locations/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`locations/${id}`), onSuccess: done }),
  }
}

/**
 * `search` is handed to the SERVER (`GET /turnstiles?search=`).
 *
 * The screen used to fetch every device and substring-match four fields in the
 * browser. The backend matches the same four (device name, display name, IP,
 * index code) and matches them better — Cyrillic/Latin and apostrophe folding,
 * word-by-word — so the move both shrinks the payload and widens what a search
 * actually finds.
 */
export function useTurnstiles(search = '') {
  const qc = useQueryClient()
  // Debounced: one request per typing pause, not one per keystroke.
  const term = useDebounce(search.trim(), 300)
  const q = useQuery({
    queryKey: ['turnstiles', term],
    queryFn: () => apiGet<ListResponse<Turnstile>>('turnstiles', { search: term || undefined }),
    placeholderData: (prev) => prev,
  })
  const done = () => qc.invalidateQueries({ queryKey: ['turnstiles'] })
  return {
    turnstiles: toItems(q.data),
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost('turnstiles', body), onSuccess: done }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPatch(`turnstiles/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`turnstiles/${id}`), onSuccess: done }),
  }
}

interface HikSummary {
  devices_online: number
  devices_offline: number
  devices_total: number
  enrollment_verified: number
  enrollment_failed: number
  enrollment_pending: number
}

export interface HikDoor {
  id: number
  door_name?: string | null
  door_index_code?: string | null
  direction_type?: string | null
}

export interface HikDevice {
  id: number
  acs_dev_index_code?: string | null
  acs_dev_name?: string | null
  /** HR-side override; the appliance refuses renames in this edition. */
  display_name?: string | null
  /** `display_name || acs_dev_name`, already resolved by the server. */
  effective_name?: string | null
  acs_dev_ip?: string | null
  acs_dev_port?: number | null
  status?: string | null
  /**
   * The server's own verdict on whether the device is answering. Read this
   * rather than re-deriving it from `status`: the encoding is HikCentral's, and
   * a second copy of the rule in the browser is one more place to get it wrong.
   */
  online?: boolean | null
  last_online_at?: string | null
  last_offline_at?: string | null
  locations?: { id: number; name?: string | null }[]
  doors?: HikDoor[]
}

interface HikEnrollment {
  employee_id?: number
  legal_name?: string | null
  personal_identification_number?: string | null
  hik_central_person_code?: string | null
  status?: string | null
  attempts?: number | null
  /**
   * ⚠️ The API calls these `last_error` / `last_attempt_at`. v2 read `error` /
   * `updated_at`, which exist nowhere in the response, so the reason a person
   * failed to reach the terminals was never shown — the row said "failed" and
   * nothing else.
   */
  last_error?: string | null
  last_attempt_at?: string | null
  /** The ISAPI terminal's own verdict on the face photo (last 3 days) — set even
   *  when HikCentral says «verified», because the device gets the raw file. */
  device_face_error?: string | null
  device_face_error_at?: string | null
}

interface HikPage<T> { items?: T[]; total?: number; pages?: number }

/**
 * `tab` decides which list is fetched, so opening the panel costs one request
 * instead of three. Devices and enrollments are PAGED (both endpoints cap the
 * page size at 500 server-side and 422 anything larger).
 */
export function useHikMonitoring(
  tab: string,
  opts: { page?: number; size?: number; online?: string; sortBy?: 'name' | 'online'; sortDir?: 'asc' | 'desc' } = {},
) {
  const { page = 1, size = 50, online = '', sortBy, sortDir } = opts
  const summary = useQuery({
    queryKey: ['hik', 'summary'],
    queryFn: () => apiGet<HikSummary>('hik-monitoring/summary'),
    refetchInterval: 60_000,
  })
  const devices = useQuery({
    enabled: tab === 'devices',
    queryKey: ['hik', 'devices', page, size, online, sortBy, sortDir],
    queryFn: () =>
      apiGet<HikPage<HikDevice>>('hik-monitoring/devices', {
        page,
        size,
        online: online || undefined,
        // Server-side order: the list is paged, a client sort only reordered
        // the visible page (108 devices, 50 per page — 2026-09-11).
        sort_by: sortBy || undefined,
        sort_dir: sortBy ? sortDir || undefined : undefined,
      }),
    placeholderData: (prev) => prev,
  })
  const enrollments = useQuery({
    enabled: tab === 'enrollments',
    queryKey: ['hik', 'enrollments', page, size],
    queryFn: () => apiGet<HikPage<HikEnrollment>>('hik-monitoring/enrollments', { page, size }),
    placeholderData: (prev) => prev,
  })
  const active = tab === 'devices' ? devices : tab === 'enrollments' ? enrollments : null
  return {
    summary: summary.data ?? null,
    devices: devices.data?.items ?? [],
    enrollments: enrollments.data?.items ?? [],
    total: active?.data?.total ?? 0,
    pages: active?.data?.pages ?? 0,
    loading: summary.isLoading || devices.isLoading || enrollments.isLoading,
    fetching: devices.isFetching || enrollments.isFetching,
    // The tab that is actually on screen owns the error — `summary` is a
    // side panel and its failure must not blank out a healthy device list.
    error: active?.error ?? null,
    refetch: () => void active?.refetch(),
  }
}

export function useHikActions() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: ['hik'] })
  return {
    resync: useMutation({
      mutationFn: (employeeId: number) => apiPost(`hik-monitoring/enrollments/${employeeId}/resync`, {}),
      onSuccess: done,
    }),
    resyncAll: useMutation({
      mutationFn: () => apiPost('hik-monitoring/enrollments/resync-all', {}),
      onSuccess: done,
    }),
  }
}
