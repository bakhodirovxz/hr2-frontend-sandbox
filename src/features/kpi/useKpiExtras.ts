import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  KPI_BONUSES,
  KPI_INTERVALS,
  KPI_KR_TYPES,
  KPI_JUSTIFICATIONS,
  KPI_STAKEHOLDERS,
} from '@/api/endpoints'
import type { KpiIndicator } from './useKpi'

/** What a bonus/stakeholder can hang off. Entry scope keeps a bonus private to
 *  one employee's KPI — an indicator-scoped one would show up for everybody. */
export type KpiObjectType = 'entry' | 'indicator' | 'performance' | 'objective'

export interface KpiBonus {
  id: number
  object_type?: string
  object_id?: number
  oper_type_name?: string
  bonus_percent?: number | null
  amount?: number | null
}

export interface KpiStakeholder {
  id: number
  object_type?: string
  object_id?: number
  stakeholder_id?: number
  edit_access?: boolean
  fact_insert_access?: boolean
  status_change_access?: boolean
  task_approve_access?: boolean
  stakeholder?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
}

export interface KpiInterval {
  id: number
  name?: string
  begin_date?: string
  end_date?: string
  is_active?: boolean
  organization_branch_id?: number | null
}

export function useBonuses(objectType: KpiObjectType, objectId: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'bonuses', objectType, objectId],
    queryFn: () =>
      apiGet<KpiBonus[]>(KPI_BONUSES, { object_type: objectType, object_id: objectId! }),
    enabled: !!objectId,
  })
  return { bonuses: q.data ?? [], loading: q.isLoading }
}

export function useStakeholders(objectType: KpiObjectType, objectId: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'stakeholders', objectType, objectId],
    queryFn: () =>
      apiGet<KpiStakeholder[]>(KPI_STAKEHOLDERS, { object_type: objectType, object_id: objectId! }),
    enabled: !!objectId,
  })
  /* "Nobody has access" is a claim about permissions; on a failed request the
   * panel must not make it. */
  return { stakeholders: q.data ?? [], loading: q.isLoading, error: q.isError ? q.error : null, refetch: q.refetch }
}

export function useIntervals() {
  const q = useQuery({
    queryKey: ['kpi', 'intervals'],
    queryFn: () => apiGet<KpiInterval[]>(KPI_INTERVALS),
  })
  return { intervals: q.data ?? [], loading: q.isLoading }
}

/** Central justification catalog (scope=global, master-admin only). */
export function useJustifications() {
  const q = useQuery({
    queryKey: ['kpi', 'justifications'],
    queryFn: () => apiGet<KpiIndicator[]>(KPI_JUSTIFICATIONS),
  })
  return { justifications: q.data ?? [], loading: q.isLoading }
}

export interface KeyResultTypeRow {
  id: number
  name?: string | null
  measure?: string | null
  value_input_type?: 'M' | 'T' | 'S' | 'G' | 'F' | string | null
  is_active?: boolean | null
  order_no?: number | null
  organization_branch_id?: number | null
}

/** Every key result type of the branch, inactive ones included (settings list). */
export function useAllKeyResultTypes(branchId: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'kr-types', 'all', branchId],
    queryFn: () => apiGet<KeyResultTypeRow[]>(KPI_KR_TYPES, { organization_branch_id: branchId || undefined }),
    retry: false,
  })
  return { types: q.data ?? [], loading: q.isLoading }
}

export function useKpiExtrasMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi'] })
  return {
    invalidate,
    createBonus: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiBonus>(KPI_BONUSES, body),
    }),
    updateBonus: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiBonus>(`${KPI_BONUSES}/${id}`, body),
    }),
    deleteBonus: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_BONUSES}/${id}`) }),

    // Upsert: POST /stakeholders saves (creates or updates) one grant.
    saveStakeholder: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiStakeholder>(KPI_STAKEHOLDERS, body),
    }),
    deleteStakeholder: useMutation({
      mutationFn: (id: number) => apiDelete(`${KPI_STAKEHOLDERS}/${id}`),
    }),

    createInterval: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiInterval>(KPI_INTERVALS, body),
    }),
    updateInterval: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiInterval>(`${KPI_INTERVALS}/${id}`, body),
    }),
    deleteInterval: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_INTERVALS}/${id}`) }),
    generateScorecards: useMutation({
      mutationFn: (id: number) => apiPost(`${KPI_INTERVALS}/${id}/generate-scorecards`, {}),
    }),
    finalizeInterval: useMutation({
      mutationFn: (id: number) => apiPost(`${KPI_INTERVALS}/${id}/finalize`, {}),
    }),

    // Source `key_result_type` +add/+edit — the catalogue the goals screen
    // picks from. The seed button only filled it; nobody could edit a type.
    createKrType: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KeyResultTypeRow>(KPI_KR_TYPES, body),
    }),
    updateKrType: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KeyResultTypeRow>(`${KPI_KR_TYPES}/${id}`, body),
    }),
    deleteKrType: useMutation({ mutationFn: (id: number) => apiDelete(`${KPI_KR_TYPES}/${id}`) }),

    createJustification: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<KpiIndicator>(KPI_JUSTIFICATIONS, body),
    }),
    updateJustification: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<KpiIndicator>(`${KPI_JUSTIFICATIONS}/${id}`, body),
    }),
    deleteJustification: useMutation({
      mutationFn: (id: number) => apiDelete(`${KPI_JUSTIFICATIONS}/${id}`),
    }),
  }
}

/** The four Verifix stakeholder capability flags, in UI order. */
export const STAKEHOLDER_FLAGS = [
  'edit_access',
  'fact_insert_access',
  'status_change_access',
  'task_approve_access',
] as const
export type StakeholderFlag = (typeof STAKEHOLDER_FLAGS)[number]
