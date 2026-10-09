import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch } from '@/api/http'

/**
 * System settings the master admin edits from one screen.
 *
 * WHY IT IS FETCHED FOR EVERY USER: the navigation itself is built from
 * `nav.modules`, so the menu cannot render until these values are known. The
 * payload is tiny and changes rarely, hence the long `staleTime` — the app
 * must not re-ask on every route change.
 */
export interface SettingSpec {
  key: string
  group: string
  /** `branches` — organisation-branch ids a module is switched on for. */
  /** `time` — an "HH:MM" clock value (fallback work/lunch hours). */
  kind: 'int' | 'bool' | 'string' | 'time' | 'enum' | 'object' | 'branches'
  default: unknown
  min: number | null
  max: number | null
  options: string[] | null
}

interface SystemSettings {
  values: Record<string, unknown>
  schema: SettingSpec[]
}

// Exported so the panel can re-read the stored matrix before a whole-object
// write, without a second copy of the path drifting out of step.
export const SETTINGS = 'system-settings'

export function useSystemSettings() {
  const q = useQuery({
    queryKey: [SETTINGS],
    queryFn: () => apiGet<SystemSettings>(SETTINGS),
    staleTime: 10 * 60_000,
    retry: 1,
  })
  return {
    values: q.data?.values ?? {},
    schema: q.data?.schema ?? [],
    loading: q.isLoading,
    // A settings failure must never blank the menu: callers fall back to the
    // built-in defaults when `ready` is false.
    ready: q.isSuccess,
  }
}

export function useSystemSettingsMutation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      apiPatch<{ values: Record<string, unknown> }>(SETTINGS, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [SETTINGS] }),
  })
}
