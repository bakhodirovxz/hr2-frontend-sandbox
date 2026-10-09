import type { Translation } from '@/i18n/uz'

export type CalStatus =
  | 'present'
  | 'late'
  | 'absent'
  | 'early_leave'
  | 'day_off'
  | 'business_trip'
  | 'sick_leave'
  | 'annual_leave'
  | 'work_leave'
  | 'unpaid_leave'
  | 'dismissed'
  | 'other_leave'
  | 'dekret'

/**
 * Normalize any backend calendar value to a known status.
 *
 * The API does NOT emit a closed set: `_leave_type_to_calendar` falls through to
 * the raw leave type for a dozen order kinds (`progul`, `harbiy_xizmat`,
 * `tolanmaydigan_tatil` …). Anything unrecognised used to land on `day_off`,
 * which quietly painted a truancy or a dismissal as "Dam olish" — so every type
 * the backend can produce is spelled out here.
 */
export function mapCalStatus(raw?: string | null): CalStatus {
  if (!raw) return 'day_off'
  const k = String(raw).toLowerCase().replace(/\s+/g, '_')
  const direct: Record<string, CalStatus> = {
    present: 'present', keldi: 'present',
    late: 'late', kechikdi: 'late', kech_qoldi: 'late',
    absent: 'absent', kelmadi: 'absent',
    // Unexcused absence with a reason attached is still an absence, not a leave.
    progul: 'absent', noaniq_sabab: 'absent',
    early_leave: 'early_leave', early: 'early_leave', erta_ketdi: 'early_leave',
    day_off: 'day_off', dam_olish: 'day_off', holiday: 'day_off', off: 'day_off',
    // "Otgul" is compensatory time off — a rest day by design (davomatda ОГ).
    otgul: 'day_off',
    business_trip: 'business_trip', sick_leave: 'sick_leave',
    annual_leave: 'annual_leave', work_leave: 'work_leave',
    unpaid_leave: 'unpaid_leave', tolanmaydigan_tatil: 'unpaid_leave',
    dismissed: 'dismissed',
    // Paid, documented absences that are none of the above.
    harbiy_xizmat: 'other_leave', oquv_tatil: 'other_leave',
    malaka_oshirish: 'other_leave', malumotnoma: 'other_leave',
    ish_haqi_saqlangan: 'other_leave',
    dekret: 'dekret', maternity_leave: 'dekret',
  }
  if (direct[k]) return direct[k]
  if (k.includes('haqsiz')) return 'unpaid_leave'
  if (k.includes('ozod') || k.includes('boshatish')) return 'dismissed'
  if (k.includes('business') || k.includes('safari')) return 'business_trip'
  if (k.includes('sick') || k === 'kasal') return 'sick_leave'
  if (k.includes('annual') || k.includes('tatil')) return 'annual_leave'
  if (k.includes('dekret') || k.includes('maternity')) return 'dekret'
  if (k.includes('work_leave')) return 'work_leave'
  if (k.includes('late') || k.includes('kechik')) return 'late'
  if (k.includes('absent') || k.includes('kelmadi')) return 'absent'
  if (k.includes('early') || k.includes('erta')) return 'early_leave'
  if (k.includes('present') || k.includes('keldi')) return 'present'
  return 'day_off'
}

/** Colour token per status (theme-aware). */
export const CAL_COLOR: Record<CalStatus, string> = {
  present: '--success',
  late: '--warning',
  absent: '--danger',
  early_leave: '--info',
  day_off: '--border-strong',
  business_trip: '--chart-2',
  sick_leave: '--chart-5',
  annual_leave: '--chart-4',
  work_leave: '--chart-3',
  unpaid_leave: '--warning',
  dismissed: '--danger',
  other_leave: '--chart-1',
  dekret: '--chart-6',
}

/** i18n label key per status. */
export const CAL_LABEL: Record<CalStatus, keyof Translation['attendance']> = {
  present: 'stPresent',
  late: 'stLate',
  absent: 'stAbsent',
  early_leave: 'stEarly',
  day_off: 'stDayoff',
  business_trip: 'stTrip',
  sick_leave: 'stSick',
  annual_leave: 'stLeave',
  work_leave: 'stWorkLeave',
  unpaid_leave: 'stUnpaid',
  dismissed: 'stDismissed',
  other_leave: 'stOther',
  dekret: 'stDekret',
}

/** Statuses shown in the legend (the common ones). */
export const LEGEND_STATUSES: CalStatus[] = [
  'present', 'late', 'absent', 'early_leave', 'business_trip', 'sick_leave', 'annual_leave', 'work_leave', 'day_off',
]
