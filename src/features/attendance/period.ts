import dayjs from 'dayjs'
import type { TFunction } from 'i18next'

/** Sana `DD.MM.YYYY` ko'rinishida; bo'sh yoki noto'g'ri bo'lsa «—». */
export function dmy(v?: string | null): string {
  if (!v) return '—'
  const d = dayjs(v)
  return d.isValid() ? d.format('DD.MM.YYYY') : v
}

/** 510 → «8 soat 30 daqiqa». */
export function formatHm(total: number | null | undefined, t: TFunction): string {
  if (total == null || !Number.isFinite(Number(total))) return '—'
  const n = Math.max(0, Math.round(Number(total)))
  return t('davomat.hm', { h: Math.floor(n / 60), m: n % 60 })
}

/** [from, to] oralig'idagi har bir kun (`YYYY-MM-DD`), ko'pi bilan ~13 oy. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  let d = dayjs(from)
  const end = dayjs(to)
  if (!d.isValid() || !end.isValid()) return out
  while (!d.isAfter(end, 'day') && out.length < 400) {
    out.push(d.format('YYYY-MM-DD'))
    d = d.add(1, 'day')
  }
  return out
}

/** «8.5» → «8,5» — v1 ham soatni ru-RU formatida ko'rsatadi. */
export function formatHours(h?: number | null): string {
  return (h ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })
}
