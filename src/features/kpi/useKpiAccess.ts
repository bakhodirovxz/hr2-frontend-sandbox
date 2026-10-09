import { useCallback } from 'react'
import { canWriteOrg, isSiteMasterAdmin } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useKpiPermissions } from './api'

/**
 * Who may do what on the KPI screens.
 *
 * `manager` is v1's `canWriteOrg(user, 'kpi')` — management and HR on their
 * level (`KpiService._can_manage`). A write button also needs the action in
 * the KPI grant matrix (`kpi/my-permissions`), which the server checks on
 * top: `may(screen, action)` is the two together.
 */
export function useKpiAccess() {
  const user = useAuthStore((s) => s.user)
  const enabled = !!user?.kpi_enabled
  const manager = enabled && canWriteOrg(user, 'kpi')
  const master = isSiteMasterAdmin(user)
  const perms = useKpiPermissions(enabled)
  const may = useCallback((screen: string, action = '*') => manager && perms.can(screen, action), [manager, perms])
  return {
    user,
    enabled,
    manager,
    master,
    hasEmployee: !!user?.employee?.id,
    can: perms.can,
    may,
    permsLoading: perms.loading,
  }
}
