import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut } from '@/api/http'

const URL = 'lms'

/**
 * LMS INTEGRATION — the outside learning platform this HR system feeds from.
 *
 * ⚠️ THE API KEY NEVER COMES BACK. The server answers with `has_api_key`, a
 * boolean, and an empty `api_key` on save means "keep the stored one" — so the
 * form must not send an empty string as a deliberate clear, and must never
 * pretend to display the secret it does not have.
 */
export interface LmsSettings {
  provider?: string | null
  base_url?: string | null
  has_api_key?: boolean
  is_enabled?: boolean
  auto_sync?: boolean
  last_sync_at?: string | null
  last_sync_status?: string | null
  last_sync_message?: string | null
  last_sync_stats?: { fetched?: number; created?: number; updated?: number; skipped?: number } | null
  /** The providers this build knows how to talk to. */
  providers?: string[]
}

export interface LmsSyncLog {
  id: number
  started_at?: string | null
  finished_at?: string | null
  status?: string | null
  triggered_by?: string | null
  message?: string | null
  fetched?: number
  created?: number
  updated?: number
  skipped?: number
}

export function useLmsSettings() {
  const q = useQuery({
    queryKey: [URL, 'settings'],
    queryFn: () => apiGet<LmsSettings>(`${URL}/settings`),
    retry: false,
  })
  return { settings: q.data ?? null, loading: q.isLoading, denied: q.isError }
}

export function useLmsLogs(limit = 20) {
  const q = useQuery({
    queryKey: [URL, 'logs', limit],
    queryFn: () => apiGet<LmsSyncLog[]>(`${URL}/logs`, { limit }),
    retry: false,
  })
  return { logs: Array.isArray(q.data) ? q.data : [], loading: q.isLoading }
}

export function useLmsMutations() {
  const qc = useQueryClient()
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: [URL] })
  }
  return {
    refresh,
    save: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPut<LmsSettings>(`${URL}/settings`, body),
      onSuccess: refresh,
    }),
    /** Reaches the platform and reports back; changes nothing. */
    test: useMutation({
      mutationFn: () => apiPost<{ ok?: boolean; message?: string }>(`${URL}/test`, {}),
    }),
    syncNow: useMutation({
      mutationFn: () =>
        apiPost<{ status?: string; message?: string; created?: number; updated?: number }>(
          `${URL}/sync`,
          {},
        ),
      onSuccess: refresh,
    }),
  }
}
