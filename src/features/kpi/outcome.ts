/**
 * What a month's KPI result means for a person.
 *
 * Uzgidro's KPI is a list of exceptions, not a percentage of a target: the
 * result is Σ bonus points − Σ penalty points (floored at 0), and in the
 * months imported from Verifix 85–100% of people have both at 0. On the old
 * 0–100 dial that 0 read «Muammoli» in red for almost everyone; 0 with no
 * penalty is simply the normal month.
 */
export type KpiOutcome = 'bonus' | 'penalty' | 'normal'

export function kpiOutcome(result?: number | null, penalty?: number | null): KpiOutcome {
  if ((result ?? 0) > 0) return 'bonus'
  if ((penalty ?? 0) > 0) return 'penalty'
  return 'normal'
}

export const OUTCOME_LABEL_KEY: Record<KpiOutcome, string> = {
  bonus: 'kpi.outcomeBonus',
  penalty: 'kpi.outcomePenalty',
  normal: 'kpi.outcomeNormal',
}

export const OUTCOME_COLOR_VAR: Record<KpiOutcome, string> = {
  bonus: '--success',
  penalty: '--danger',
  normal: '--fg-muted',
}

export const OUTCOME_TEXT: Record<KpiOutcome, string> = {
  bonus: 'text-success',
  penalty: 'text-danger',
  normal: 'text-fg-muted',
}

export const OUTCOME_CHIP: Record<KpiOutcome, string> = {
  bonus: 'bg-success-soft text-success',
  penalty: 'bg-danger-soft text-danger',
  normal: 'bg-surface-2 text-fg-muted',
}
