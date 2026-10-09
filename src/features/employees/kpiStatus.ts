import type { BadgeTone } from '@/components/ui/Badge'

export type KpiStatusKey = 'excellent' | 'good' | 'average' | 'risk' | 'problem'

/** KPI % → status label key + tone. Thresholds ported verbatim from v1. */
export function kpiStatusKey(kpi: number): KpiStatusKey {
  const v = Math.round(kpi || 0)
  if (v >= 85) return 'excellent'
  if (v >= 70) return 'good'
  if (v >= 50) return 'average'
  if (v >= 40) return 'risk'
  return 'problem'
}

/** The KPI band each status maps to — drives the "Status" filter. */
export const STATUS_KPI_RANGE: Record<KpiStatusKey, { min?: number; max?: number }> = {
  excellent: { min: 85 },
  good: { min: 70, max: 84.99 },
  average: { min: 50, max: 69.99 },
  risk: { min: 40, max: 49.99 },
  problem: { max: 39.99 },
}

export const STATUS_TONE: Record<KpiStatusKey, BadgeTone> = {
  excellent: 'success',
  good: 'success',
  average: 'warning',
  risk: 'warning',
  problem: 'danger',
}

/** Colour token for the KPI bar / sparkline (green ≥70, amber otherwise). */
export function kpiColorVar(kpi: number): string {
  return kpi >= 70 ? '--success' : '--warning'
}
