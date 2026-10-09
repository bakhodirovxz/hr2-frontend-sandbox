import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '@/api/http'
import { KPI_CHILD_SETTING, KPI_OBJECTIVE_CHILD_SETTINGS } from '@/api/endpoints'

/**
 * HOW A PARENT OBJECTIVE'S GRADE IS BUILT FROM ITS CHILDREN.
 *
 * The server's rollup (`_recompute_objective_grade`, a 1:1 port of Verifix's
 * `Calculate_Objective_Grade`) reads exactly these rows:
 *
 *     weight_sum = Σ weight            over NON-subtracting children
 *     grade_sum  = Σ contribution × (operation === 'S' ? −weight_sum : 1) × weight
 *                                     over children whose status is done
 *     grade      = grade_sum / weight_sum
 *
 * ⚠️ A CHILD WITHOUT A ROW STILL COUNTS. The query LEFT JOINs, so an
 * unconfigured child participates with weight 1, direct calculation and
 * addition. Deleting a setting therefore does not remove the child from the
 * parent's grade — it returns it to those defaults, which is why the editor
 * says so rather than calling the action "remove".
 */
export interface KpiChildGradation {
  from_percent: number
  to_percent: number
  result_percent: number
}

export interface KpiChildSetting {
  id?: number
  objective_id?: number | null
  child_type?: string | null
  child_objective_id?: number | null
  child_key_result_id?: number | null
  weight?: number | null
  /** 'D' — the child's own grade; 'G' — mapped through the gradation bands. */
  calc_type?: string | null
  /** 'A' — adds to the parent; 'S' — subtracts (a penalty). */
  operation?: string | null
}

export function useChildSettings(objectiveId: number | null) {
  const q = useQuery({
    queryKey: ['kpi', 'child-settings', objectiveId],
    queryFn: () => apiGet<KpiChildSetting[]>(KPI_OBJECTIVE_CHILD_SETTINGS(objectiveId as number)),
    enabled: !!objectiveId,
  })
  return {
    rows: Array.isArray(q.data) ? q.data : [],
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useChildSettingMutations() {
  const qc = useQueryClient()
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['kpi', 'child-settings'] })
    // The parent's grade is recomputed server-side on every write, so the
    // goals tree has to be refetched too or it keeps showing the old number.
    void qc.invalidateQueries({ queryKey: ['kpi', 'goals-hierarchy'] })
    void qc.invalidateQueries({ queryKey: ['kpi', 'goals-flat'] })
  }

  return {
    save: useMutation({
      mutationFn: ({
        objectiveId,
        body,
      }: {
        objectiveId: number
        body: {
          child_type: string
          child_objective_id?: number | null
          child_key_result_id?: number | null
          weight: number
          calc_type: string
          operation: string
          gradation_rules: KpiChildGradation[]
        }
      }) => apiPost(KPI_OBJECTIVE_CHILD_SETTINGS(objectiveId), body),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_CHILD_SETTING(id)),
      onSuccess: done,
    }),
  }
}
