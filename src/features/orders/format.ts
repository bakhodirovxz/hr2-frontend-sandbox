import { inTashkent } from '@/lib/format'

/** A calendar date as `DD.MM.YYYY` (dates in this module are shown this way). */
export function fmtDate(v?: string | null): string {
  if (!v) return '—'
  const d = inTashkent(v)
  return d.isValid() ? d.format('DD.MM.YYYY') : String(v)
}

/** A moment as `DD.MM.YYYY HH:mm` (Tashkent). */
export function fmtDateTime(v?: string | null): string {
  if (!v) return ''
  const d = inTashkent(v)
  return d.isValid() ? d.format('DD.MM.YYYY HH:mm') : String(v)
}
