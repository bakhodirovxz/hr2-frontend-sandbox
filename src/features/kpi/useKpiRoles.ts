import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  KPI_BONUSES_DONE,
  KPI_BONUS_OPER_TYPE,
  KPI_BONUS_OPER_TYPES,
  KPI_BONUS_USED,
  KPI_FORMULA_VARIABLES,
  KPI_INDICATOR_CALCULATION,
  KPI_PERMISSION_CATALOG,
  KPI_ROLE,
  KPI_ROLES,
  KPI_ROLE_MEMBER,
  KPI_ROLE_MEMBERS,
  KPI_ROLE_PERMISSIONS,
} from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'

/**
 * KPI ROLLARI, FORMULA va BONUSLAR — the administrative half of the module.
 *
 * ⚠️ Role work is MASTER-ADMIN ONLY on the server (`_assert_kpi_role_admin`):
 * attaching a role hands someone new authority, so the decision was taken in
 * the 2026-08-24 round that it cannot be delegated. The screens still render
 * for others read-only; the buttons simply are not offered.
 */

export interface KpiRole {
  id: number
  code?: string | null
  name?: string | null
  description?: string | null
  is_system?: boolean | null
  is_active?: boolean | null
  order_no?: number | null
  member_count?: number | null
}

interface KpiRoleMember {
  id: number
  employee_id?: number
  role_id?: number
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
}

interface PermissionScreen {
  screen: string
  label: string
  actions: string[]
}

/** `{ role: { screen: [actions] } }` — the whole grant matrix. */
type GrantMatrix = Record<string, Record<string, string[]>>

export function useKpiRoles() {
  const q = useQuery({
    queryKey: ['kpi', 'roles'],
    queryFn: () => apiGet<KpiRole[]>(KPI_ROLES),
    retry: false,
  })
  return { roles: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

export function useKpiRoleMembers(roleId: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'role-members', roleId],
    queryFn: () => apiGet<KpiRoleMember[]>(KPI_ROLE_MEMBERS(roleId as number)),
    enabled: !!roleId,
    retry: false,
  })
  return { members: q.data ?? [], loading: q.isLoading }
}

export function usePermissionCatalog(enabled: boolean) {
  const cat = useQuery({
    queryKey: ['kpi', 'permission-catalog'],
    queryFn: () => apiGet<PermissionScreen[]>(KPI_PERMISSION_CATALOG),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const grants = useQuery({
    queryKey: ['kpi', 'role-permissions'],
    queryFn: () => apiGet<GrantMatrix>(KPI_ROLE_PERMISSIONS),
    enabled,
    retry: false,
  })
  return {
    screens: cat.data ?? [],
    matrix: grants.data ?? {},
    loading: cat.isLoading || grants.isLoading,
    denied: grants.isError,
  }
}

export function useKpiRoleMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi'] })
  return {
    invalidate,
    createRole: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiRole>(KPI_ROLES, body),
      onSuccess: invalidate,
    }),
    updateRole: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiRole>(KPI_ROLE(id), body),
      onSuccess: invalidate,
    }),
    removeRole: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_ROLE(id)),
      onSuccess: invalidate,
    }),
    addMembers: useMutation({
      mutationFn: ({ roleId, employeeIds }: { roleId: number; employeeIds: number[] }) =>
        apiPost<KpiRoleMember[]>(KPI_ROLE_MEMBERS(roleId), { employee_ids: employeeIds }),
      onSuccess: invalidate,
    }),
    removeMember: useMutation({
      mutationFn: ({ roleId, employeeId }: { roleId: number; employeeId: number }) =>
        apiDelete(KPI_ROLE_MEMBER(roleId, employeeId)),
      onSuccess: invalidate,
    }),
    /** Replaces the action list for ONE role × screen cell. */
    saveGrants: useMutation({
      mutationFn: (body: { role: string; screen: string; actions: string[] }) =>
        apiPost(KPI_ROLE_PERMISSIONS, body),
      onSuccess: invalidate,
    }),
  }
}

/* ── Formula o'zgaruvchilari va indikator hisoblashi ───────────────────── */

interface FormulaVariable {
  id: number
  identifier?: string | null
  name?: string | null
  short_name?: string | null
  measure?: string | null
  is_active?: boolean | null
  is_external?: boolean | null
}

interface CalculationType {
  id?: number
  indicator_id?: number
  /** 'P' = plan, 'F' = fact. */
  target?: string | null
  /** M manual · T tasks · G system · F formula · E external. */
  method?: string | null
  formula?: string | null
  source_type?: string | null
  variables?: { id?: number; variable_id?: number; variable?: FormulaVariable }[]
}

export function useFormulaVariables(enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'formula-variables'],
    queryFn: () => apiGet<FormulaVariable[]>(KPI_FORMULA_VARIABLES),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  })
  return { variables: q.data ?? [], loading: q.isLoading }
}

export function useIndicatorCalculation(indicatorId: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'indicator-calculation', indicatorId],
    queryFn: () => apiGet<CalculationType[]>(KPI_INDICATOR_CALCULATION(indicatorId as number)),
    enabled: !!indicatorId,
    retry: false,
  })
  return { rows: q.data ?? [], loading: q.isLoading }
}

export function useCalculationMutations() {
  const qc = useQueryClient()
  return {
    save: useMutation({
      mutationFn: ({ indicatorId, body }: { indicatorId: number; body: Record<string, unknown> }) =>
        apiPost<CalculationType>(KPI_INDICATOR_CALCULATION(indicatorId), body),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['kpi'] }),
    }),
  }
}

/* ── Berilgan bonuslar va operatsiya turlari ───────────────────────────── */

interface DoneBonus {
  id?: number
  object_type?: string | null
  object_id?: number | null
  employee_name?: string | null
  indicator_name?: string | null
  period_start?: string | null
  period_end?: string | null
  oper_type_name?: string | null
  bonus_percent?: number | null
  amount?: number | null
  is_used?: boolean | null
  used_at?: string | null
  used_note?: string | null
}

interface BonusOperType {
  id: number
  name?: string | null
  code?: string | null
  is_active?: boolean | null
  order_no?: number | null
}

/**
 * Awarded bonuses.
 *
 * The `is_used` filter is the point of the screen — "which of these has NOT
 * been paid out yet" is the question payroll actually asks, and v1 has always
 * offered it alongside the operation type and the employee. v2 sent only the
 * branch, so the list could not be narrowed at all.
 */
export function useDoneBonuses(
  enabled = true,
  filters?: { isUsed?: string; operTypeId?: string; employeeId?: string },
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const isUsed = filters?.isUsed
  const operTypeId = filters?.operTypeId
  const employeeId = filters?.employeeId
  const q = useQuery({
    queryKey: ['kpi', 'done-bonuses', branchId, isUsed, operTypeId, employeeId],
    queryFn: () =>
      apiGet<DoneBonus[]>(KPI_BONUSES_DONE, {
        organization_branch_id: branchId || undefined,
        // '' means "either", so it must not collapse into `false`.
        is_used: isUsed === '' || isUsed == null ? undefined : isUsed,
        oper_type_id: operTypeId || undefined,
        employee_id: employeeId || undefined,
      }),
    enabled,
    retry: false,
  })
  return { rows: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

export function useBonusOperTypes(enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'bonus-oper-types'],
    queryFn: () => apiGet<BonusOperType[]>(KPI_BONUS_OPER_TYPES),
    enabled,
    retry: false,
  })
  return { types: q.data ?? [], loading: q.isLoading }
}

export function useBonusAdminMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi'] })
  return {
    invalidate,
    /**
     * ⚠️ `is_used` MUST BE SENT. `KpiBonusUsedSet.is_used` defaults to True, so
     * omitting it made this a one-way switch: an issued bonus could never be
     * taken back. The route sets whatever it is given (`set_bonus_used`).
     */
    markUsed: useMutation({
      mutationFn: ({ id, isUsed = true, note }: { id: number; isUsed?: boolean; note?: string }) =>
        apiPost(KPI_BONUS_USED(id), { is_used: isUsed, note: note || null }),
      onSuccess: invalidate,
    }),
    createOperType: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiPost<BonusOperType>(KPI_BONUS_OPER_TYPES, body),
      onSuccess: invalidate,
    }),
    removeOperType: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_BONUS_OPER_TYPE(id)),
      onSuccess: invalidate,
    }),
  }
}
