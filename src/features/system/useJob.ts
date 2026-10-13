import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'

/** `GET /jobs/{id}` — `BackgroundJobService.to_read`. */
export interface BackgroundJob<R = Record<string, unknown>> {
  id: number
  kind?: string
  status: 'queued' | 'running' | 'done' | 'failed'
  progress?: number | null
  result?: (R & { stage?: string; stages?: { stage: string; at?: string; [k: string]: unknown }[] }) | null
  error?: string | null
  row_count?: number | null
  created_at?: string | null
  started_at?: string | null
  finished_at?: string | null
}

export const isJobFinished = (j?: BackgroundJob | null) => j?.status === 'done' || j?.status === 'failed'

/**
 * Fon vazifasining holati — tugaguncha har 1.5 soniyada (TZ E3 1725
 * «индикация прогресса обязательна»: zaxiradan tiklash, tizimni tiklash).
 */
export function useJob<R = Record<string, unknown>>(id: number | null) {
  return useQuery({
    queryKey: ['jobs', id],
    queryFn: () => apiGet<BackgroundJob<R>>(`jobs/${id}`, { _no_branch_inject: true }),
    enabled: id != null,
    refetchInterval: (q) => (isJobFinished(q.state.data as BackgroundJob | undefined) ? false : 1500),
    // Tiklash paytida tizim `recovery` rejimida — bir martalik uzilish toast bermasin.
    meta: { silent: true },
    retry: 3,
  })
}
