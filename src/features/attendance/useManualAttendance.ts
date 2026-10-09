import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '@/api/http'

const MANUAL = 'manual-attendance'

/**
 * TIMESHEET CORRECTION (TZ I2 «Учёт посещаемости», steps 5–14).
 *
 * A correction is written ON TOP of the turnstile record; the turnstile rows
 * are never deleted, so a correction can be withdrawn at any time and it stays
 * visible who entered it and when. HR only — the server enforces the same.
 */
export interface ManualRow {
  id: number
  employee_id?: number | null
  work_date?: string | null
  day_type?: string | null
  check_in?: string | null
  check_out?: string | null
  comment?: string | null
  created_by_name?: string | null
  created_at?: string | null
}

interface DayTypeOption {
  value: string
  label: string
}

export function useManualMeta(enabled: boolean) {
  const q = useQuery({
    enabled,
    queryKey: [MANUAL, 'meta'],
    queryFn: () => apiGet<{ day_types: DayTypeOption[] }>(`${MANUAL}/meta`),
    staleTime: 30 * 60_000,
  })
  return { dayTypes: q.data?.day_types ?? [] }
}

export function useManualRows(employeeId: number | null) {
  const q = useQuery({
    enabled: !!employeeId,
    queryKey: [MANUAL, 'list', employeeId],
    queryFn: () => apiGet<{ items?: ManualRow[] }>(MANUAL, { employee_id: employeeId }),
  })
  return { rows: q.data?.items ?? [], loading: q.isLoading }
}

export function useManualMutations() {
  const qc = useQueryClient()
  // The correction changes the attendance figures the page is showing, so both
  // caches have to go — otherwise the table keeps the pre-correction numbers.
  const done = () => {
    qc.invalidateQueries({ queryKey: [MANUAL] })
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  return {
    save: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(MANUAL, body), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${MANUAL}/${id}`), onSuccess: done }),
  }
}
