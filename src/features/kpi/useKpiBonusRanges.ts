import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiPost } from '@/api/http'
import { KPI_BONUS_RANGE, KPI_BONUS_RANGES } from '@/api/endpoints'

/**
 * One step of an indicator's bonus scale: reach a fact between `from_value`
 * and `to_value` and the indicator awards `value`.
 *
 * ⚠️ THERE IS NO LIST ROUTE, AND NONE IS NEEDED. The rows arrive on the
 * indicator itself (`KpiIndicatorRead.bonus_ranges`), so the editor reads them
 * from the indicator it was opened on and invalidates the indicator list after
 * a write — inventing a separate GET here would only add a second source of
 * truth for the same rows.
 */
export interface KpiBonusRange {
  id?: number
  from_value?: number | null
  to_value?: number | null
  value?: number | null
}

export function useBonusRangeMutations() {
  const qc = useQueryClient()
  const done = () => void qc.invalidateQueries({ queryKey: ['kpi', 'indicators'] })

  return {
    create: useMutation({
      mutationFn: (body: {
        indicator_id: number
        from_value: number
        to_value: number
        value: number
      }) => apiPost<KpiBonusRange>(KPI_BONUS_RANGES, body),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(KPI_BONUS_RANGE(id)),
      onSuccess: done,
    }),
  }
}
