import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  ZOOM_ARCHIVE,
  ZOOM_AVAILABILITY,
  ZOOM_LIVE,
  ZOOM_MEETING_PURGE,
  ZOOM_MEETING_RECORDING,
  ZOOM_MEETING_START,
  ZOOM_MEETING_START_URL,
} from '@/api/endpoints'

/**
 * Zoom meetings — the shared calendar of the company's single Zoom licence.
 *
 * ⚠️ EVERY REQUEST SENDS `organization_branch_id: null`. The axios layer
 * injects the header branch into every call, but a meeting is not a branch
 * record: the licence is company-wide and the list must show what everyone
 * else has already booked, otherwise people pick a slot that is taken.
 */
const ZOOM = 'zoom-meetings'
const NO_BRANCH = { organization_branch_id: null }

interface ZoomConfig {
  enabled: boolean
  can_request: boolean
  can_approve: boolean
  /** true → the meeting opens immediately, there is no approval step. */
  auto_approve: boolean
  max_concurrent: number
  timezone: string
}

export interface ZoomMeeting {
  id: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | string
  topic?: string | null
  agenda?: string | null
  start_at?: string | null
  end_at?: string | null
  duration_minutes?: number | null
  join_url?: string | null
  passcode?: string | null
  host_key?: string | null
  reject_reason?: string | null
  requested_by?: { id?: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null } | null
  approved_by?: { id?: number; legal_name?: string | null } | null
  is_started?: boolean
  can_approve?: boolean
  can_manage?: boolean
  zoom_meeting_id?: number | null
  recording_mode?: 'cloud' | 'none' | string | null
  /** LIVE per Zoom (webhook + per-minute poll) — the red dot. Independent of `status`. */
  is_live?: boolean
  live_since?: string | null
  live_ended_at?: string | null
  participant_count?: number | null
  /** «Boshlash» pressed in HRM — the moment a requested recording is switched on. */
  started_at?: string | null
  started_by?: { id?: number; legal_name?: string | null } | null
  recording_started_at?: string | null
  /** Cloud recording once Zoom has processed it; only sent to `can_manage` callers. */
  recording_url?: string | null
  recording_passcode?: string | null
  recording_ready_at?: string | null
  /** 'hrm' — booked here; 'zoom' — opened straight in Zoom and found by the poll. */
  source?: 'hrm' | 'zoom' | string | null
  /** Recurring series: shared id, this day's Zoom occurrence, the rule, "3/10". */
  series_id?: number | null
  occurrence_id?: string | null
  recurrence?: Record<string, unknown> | null
  series_index?: number | null
  series_total?: number | null
}

export interface ZoomLiveMeeting {
  id: number
  topic?: string | null
  live_since?: string | null
  participant_count: number
  source: string
  requested_by?: string | null
}

export interface ZoomLiveSummary {
  live_count: number
  max_concurrent: number
  is_full: boolean
  meetings: ZoomLiveMeeting[]
  webhook_last_at?: string | null
  poll_last_at?: string | null
}

export interface ZoomStartResult {
  start_url: string
  expires_in_minutes: number
  /** off | armed | started | failed — what happened to the requested recording. */
  recording: string
  warning?: string | null
  meeting?: ZoomMeeting | null
}

/** How often the page re-asks the server what is live. The webhook/poll on the
 *  server side is what makes the dot right; this only carries it to the screen. */
export const ZOOM_LIVE_REFRESH_MS = 15_000

interface ZoomListResponse {
  items: ZoomMeeting[]
  total: number
  page: number
  size: number
}

export function useZoomConfig() {
  const q = useQuery({
    queryKey: [ZOOM, 'config'],
    queryFn: () => apiGet<ZoomConfig>(`${ZOOM}/config`, NO_BRANCH),
    staleTime: 5 * 60_000,
  })
  return { config: q.data ?? null, loading: q.isLoading }
}

export function useZoomMeetings(scope: string, status: string, search: string, page: number, size: number) {
  const q = useQuery({
    queryKey: [ZOOM, { scope, status, search, page, size }],
    queryFn: () =>
      apiGet<ZoomListResponse>(ZOOM, {
        ...NO_BRANCH,
        scope: scope || undefined,
        status: status || undefined,
        search: search || undefined,
        page,
        size,
      }),
    placeholderData: (prev) => prev,
    // The active tab carries the red "live" dot, so it must keep itself
    // current without a reload; the archive does not change under the user.
    refetchInterval: scope === 'active' ? ZOOM_LIVE_REFRESH_MS : false,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    loading: q.isLoading,
    fetching: q.isFetching,
  }
}

/** One meeting already sitting on the chosen day, as the availability probe returns it. */
export interface ZoomBusySlot {
  id: number
  topic?: string | null
  start_at?: string | null
  end_at?: string | null
  /** Legal name of the requester — a plain string here, not an employee object. */
  requested_by?: string | null
}

export interface ZoomAvailability {
  date: string
  max_concurrent: number
  meetings: ZoomBusySlot[]
  overlapping_count: number
  is_free: boolean
  /** Only set when the slot is taken — the first moment a licence frees up. */
  next_free_at?: string | null
}

/**
 * Is the chosen slot bookable — asked WHILE the form is being filled in.
 *
 * The licence limit lives in the server's environment, so the browser cannot
 * work the answer out for itself; without this probe the user only discovered
 * the clash after pressing "Open" and receiving a 409. `is_free` also drives
 * the submit button, so the request is never sent when it is known to fail.
 *
 * The caller passes an already-debounced `startAt`: the field changes on every
 * keystroke of the time input, and each change would otherwise be a request.
 */
export function useZoomAvailability(startAt: string | null, durationMinutes: number, enabled: boolean) {
  const q = useQuery({
    queryKey: [ZOOM, 'availability', startAt, durationMinutes],
    queryFn: () =>
      apiGet<ZoomAvailability>(ZOOM_AVAILABILITY, {
        ...NO_BRANCH,
        start_at: startAt,
        duration_minutes: durationMinutes,
      }),
    enabled: enabled && !!startAt && durationMinutes >= 5 && durationMinutes <= 1440,
    // A stale answer is worse than none: somebody else may have taken the slot
    // while this form was open, so never serve a cached verdict.
    staleTime: 0,
    // A rejected probe must not block the form — the create call is still the
    // authority, and it reports its own error.
    retry: false,
  })
  return { availability: q.data ?? null, loading: q.isFetching }
}

/** What is live RIGHT NOW against the licence — the header chip. */
export function useZoomLive(enabled: boolean) {
  const q = useQuery({
    queryKey: [ZOOM, 'live'],
    queryFn: () => apiGet<ZoomLiveSummary>(ZOOM_LIVE, NO_BRANCH),
    enabled,
    refetchInterval: ZOOM_LIVE_REFRESH_MS,
    staleTime: 5_000,
    retry: false,
  })
  return { live: q.data ?? null }
}

/** Recurrence rule as the server takes it; weekdays are ISO (1=Mon … 7=Sun). */
export interface ZoomRecurrence {
  type: 'daily' | 'weekly' | 'monthly'
  interval: number
  weekdays: number[]
  count: number
}

export interface ZoomCreateBody {
  topic: string
  start_at?: string | null
  duration_minutes: number
  agenda?: string | null
  record?: boolean
  waiting_room?: boolean
  join_before_host?: boolean
  /** One Zoom meeting, one HRM row per day; the server refuses it without `start_at`. */
  recurrence?: ZoomRecurrence | null
}

export function useZoomMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [ZOOM] })
  return {
    invalidate,
    create: useMutation({ mutationFn: (body: ZoomCreateBody) => apiPost<ZoomMeeting>(ZOOM, body) }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<ZoomCreateBody> }) =>
        apiPatch<ZoomMeeting>(`${ZOOM}/${id}`, body),
    }),
    approve: useMutation({ mutationFn: (id: number) => apiPost<ZoomMeeting>(`${ZOOM}/${id}/approve`, {}) }),
    reject: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason: string }) =>
        apiPost<ZoomMeeting>(`${ZOOM}/${id}/reject`, { reason }),
    }),
    cancel: useMutation({ mutationFn: (id: number) => apiDelete<ZoomMeeting>(`${ZOOM}/${id}`) }),
    /** Every remaining day of a recurring series; the Zoom meeting is deleted. */
    cancelSeries: useMutation({
      mutationFn: (id: number) => apiDelete<ZoomMeeting>(`${ZOOM}/${id}`, { params: { ...NO_BRANCH, scope: 'series' } }),
    }),
    hostKey: useMutation({ mutationFn: (id: number) => apiPost<{ host_key: string }>(`${ZOOM}/${id}/host-key`, {}) }),
    /**
     * The host link. Deliberately NOT part of the list payload and never cached:
     * whoever opens it becomes host without a password, so the server mints a
     * fresh one per click and only for `can_manage` callers. Modelled as a
     * mutation rather than a query for exactly that reason — it is an action
     * with a side effect at Zoom, not data the page may hold on to.
     */
    startUrl: useMutation({
      mutationFn: (id: number) =>
        apiGet<{ start_url: string }>(ZOOM_MEETING_START_URL(id), NO_BRANCH),
    }),
    /**
     * «Boshlash» — the server checks the LIVE licence count, switches the
     * requested cloud recording on (the only moment it ever is) and mints the
     * host link. Same secrecy rules as `startUrl`.
     */
    start: useMutation({ mutationFn: (id: number) => apiPost<ZoomStartResult>(ZOOM_MEETING_START(id), {}) }),
    /** In-meeting recording control of a LIVE meeting. */
    recording: useMutation({
      mutationFn: ({ id, action }: { id: number; action: 'start' | 'stop' | 'pause' | 'resume' }) =>
        apiPost<ZoomMeeting>(ZOOM_MEETING_RECORDING(id), { action }),
    }),
    /** Erases ONE archived row for good — cancelling merely keeps it for the audit. */
    purge: useMutation({ mutationFn: (id: number) => apiDelete<ZoomMeeting>(ZOOM_MEETING_PURGE(id), { params: NO_BRANCH }) }),
    /** Empties the whole archive; live meetings are untouched by the server. */
    purgeArchive: useMutation({
      mutationFn: () => apiDelete<{ deleted: number }>(ZOOM_ARCHIVE, { params: NO_BRANCH }),
    }),
  }
}
