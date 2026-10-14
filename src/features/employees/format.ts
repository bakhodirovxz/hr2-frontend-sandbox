import { useTranslation } from 'react-i18next'
import type { ContractType, PeriodTotal } from './types'

/** ISO date (or datetime) → DD.MM.YYYY; empty → «—». */
export function fmtDate(value?: string | null): string {
  if (!value) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value))
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(value)
}

/** ISO datetime → DD.MM.YYYY HH:mm (local time). */
export function fmtDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtRange(from?: string | null, to?: string | null, openLabel?: string): string {
  if (!from && !to) return '—'
  return `${from ? fmtDate(from) : '…'} — ${to ? fmtDate(to) : openLabel || '…'}`
}

/** Stored marital status values (Uzbek words, v1 form options). */
export const MARITAL = [
  { value: 'Oilali', key: 'married' },
  { value: "Bo'ydoq", key: 'single' },
  { value: 'Ajrashgan', key: 'divorced' },
  { value: 'Turmushga chiqmagan', key: 'unmarried' },
  { value: 'Beva', key: 'widowed' },
] as const

/** Labels that depend on the language: contract type, gender, period length. */
export function usePersonnelLabels() {
  const { t } = useTranslation()
  return {
    contract: (c?: ContractType | string | null) =>
      c ? (['permanent', 'fixed_term', 'part_time', 'civil'].includes(c) ? t(`personnel.contract.${c as ContractType}`) : c) : '',
    gender: (g?: number | null) =>
      g === 1 ? t('personnel.gender.male') : g === 2 ? t('personnel.gender.female') : g === 0 ? t('common.unknown') : '',
    marital: (v?: string | null) => {
      const hit = MARITAL.find((m) => m.value === v)
      return hit ? t(`personnel.marital.${hit.key}`) : v || ''
    },
    period: (p?: Pick<PeriodTotal, 'years' | 'months' | 'days'> | null) =>
      p ? t('personnel.t2.periodYmd', { y: p.years ?? 0, m: p.months ?? 0, d: p.days ?? 0 }) : '',
  }
}

/** Working days → «Du-Ju» / «Du-Sh» / list. */
export function useWorkingDaysLabel() {
  const { t } = useTranslation()
  const names = [
    t('personnel.days.mon'),
    t('personnel.days.tue'),
    t('personnel.days.wed'),
    t('personnel.days.thu'),
    t('personnel.days.fri'),
    t('personnel.days.sat'),
    t('personnel.days.sun'),
  ]
  return (days?: number[] | null): string => {
    if (!Array.isArray(days) || !days.length) return ''
    const sorted = [...days].sort((a, b) => a - b)
    if (sorted.length === 5 && sorted.every((d, i) => d === i)) return `${names[0]}–${names[4]}`
    if (sorted.length === 6 && sorted.every((d, i) => d === i)) return `${names[0]}–${names[5]}`
    return sorted.map((d) => names[d]).filter(Boolean).join(', ')
  }
}

export const hhmm = (v?: string | null) => (v ? String(v).slice(0, 5) : '')
