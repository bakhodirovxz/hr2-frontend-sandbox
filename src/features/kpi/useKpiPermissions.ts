import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'

/** `GET /kpi/my-permissions` — the Verifix grant matrix for the current user. */
export interface KpiPermissions {
  roles: string[]
  /** screen → actions; `'*'` in the list means "any action on this screen". */
  grants: Record<string, string[] | null | undefined>
}

/**
 * The server's own answer to "what may I do on KPI screens".
 *
 * ⚠️ This endpoint has existed since the Verifix parity round and its
 * docstring says the UI enables buttons "exactly from this response". v2
 * never called it (`grep my-permissions src/` → 0) and gated everything on
 * `canManageKpi` instead — a role guess that includes the ministr. Measured
 * live 2026-09-11 as the ministr: `roles: [employee, supervisor]`,
 * `goal_list: null`, `kpi_report: [run]` — no `sign_file`. So the ministr
 * saw status changes, copy and "approve report" and got 403
 * `kpi_action_forbidden` on each, while someone handed a KPI role from the
 * catalogue saw nothing at all.
 *
 * Objective/key-result CREATE, EDIT and DELETE are a different gate on the
 * server (`OkrService._assert_can_manage`, which DOES include the ministr),
 * so those keep `canManage`; only grant-gated actions read this.
 */
export function useKpiPermissions(enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'my-permissions'],
    queryFn: () => apiGet<KpiPermissions>('kpi/my-permissions'),
    enabled,
    staleTime: 5 * 60_000,
  })
  const can = (screen: string, action?: string): boolean => {
    const list = q.data?.grants?.[screen]
    if (!list || list.length === 0) return false
    if (!action) return true
    return list.includes('*') || list.includes(action)
  }
  return { can, loading: q.isLoading, error: q.isError ? q.error : null, roles: q.data?.roles ?? [] }
}
