import type { CatalogColumn } from './api'

/**
 * Katalog hisoboti natijasi uchun yordamchilar (v1 dagi reportUtils nusxasi).
 * Server javobi `{columns:[{key,label,type}], rows:[{…}], chart:{x, series}}`;
 * har bir o'qish himoyalangan — notanish shakl sahifani yiqitmaydi.
 */

export type Row = Record<string, unknown>

const NUMERIC_TYPES = new Set(['number', 'int', 'integer', 'float', 'decimal', 'percent', 'money', 'currency'])
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Ustunlar serverdan; bo'lmasa — qatorlar kalitlaridan (id'larsiz). */
export function normalizeColumns(columns: CatalogColumn[] | undefined, rows: Row[]): CatalogColumn[] {
  if (Array.isArray(columns) && columns.length) {
    return columns.filter((c) => c && c.key != null).map((c) => ({ key: String(c.key), label: c.label ?? String(c.key), type: c.type ?? null }))
  }
  const seen: string[] = []
  rows.slice(0, 50).forEach((r) => Object.keys(r).forEach((k) => !seen.includes(k) && seen.push(k)))
  return seen.filter((k) => k !== 'id' && !k.endsWith('_id')).map((k) => ({ key: k, label: k, type: null }))
}

export function isNumericColumn(col: CatalogColumn, rows: Row[]): boolean {
  if (col.type && NUMERIC_TYPES.has(String(col.type).toLowerCase())) return true
  let any = false
  for (const r of rows) {
    const v = r[col.key]
    if (v === null || v === undefined || v === '') continue
    if (!isNum(v)) return false
    any = true
  }
  return any
}

export const isPercentColumn = (col: CatalogColumn) =>
  String(col.type ?? '').toLowerCase() === 'percent' || /(^|_)(percent|pct|share|rate)$/.test(col.key)

/** Hujayra matni. Foiz ustuni eksport bilan bir xil «42.9» — sarlavhada «%»
 *  bo'lsa qiymatga qayta qo'shilmaydi (D-D23). `yes`/`no` — tarjima qilingan. */
export function formatCell(value: unknown, col: CatalogColumn | null, yesNo: [string, string]): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? yesNo[0] : yesNo[1]
  if (isNum(value)) {
    if (col && isPercentColumn(col)) {
      const p = String(Math.round(value * 100) / 100)
      return String(col.label ?? '').includes('%') ? p : `${p}%`
    }
    return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
  }
  if (Array.isArray(value)) return value.map((v) => formatCell(v, null, yesNo)).join(', ')
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    return String(o.label ?? o.name ?? o.title ?? JSON.stringify(value))
  }
  return String(value)
}

/** Saralash: bo'sh qiymatlar har doim oxirida, sonlar son sifatida. */
export function compareValues(x: unknown, y: unknown, dir: 'asc' | 'desc'): number {
  if (x === y) return 0
  const ex = x === null || x === undefined || x === ''
  const ey = y === null || y === undefined || y === ''
  if (ex) return 1
  if (ey) return -1
  const cmp = isNum(x) && isNum(y) ? x - y : String(x).localeCompare(String(y), 'uz', { numeric: true })
  return dir === 'asc' ? cmp : -cmp
}

/** Diagramma o'qlari: server `chart` bo'lmasa — birinchi matn ustuni va 3 ta son ustuni. */
export function normalizeChart(chart: { x?: string; series?: string[] } | undefined, columns: CatalogColumn[], rows: Row[]) {
  const numericKeys = columns.filter((c) => isNumericColumn(c, rows)).map((c) => c.key)
  const textKeys = columns.filter((c) => !numericKeys.includes(c.key)).map((c) => c.key)
  let x = chart?.x
  if (!x || !columns.some((c) => c.key === x)) x = textKeys[0] ?? columns[0]?.key ?? ''
  let series = (chart?.series ?? []).filter((k) => numericKeys.includes(k))
  if (!series.length) series = numericKeys.slice(0, 3)
  return { x, series, numericKeys }
}

/** Davr teskari kiritilganmi (boshi oxiridan keyin) — server 422 `invalid_period` dan oldin. */
export const reversed = (from?: unknown, to?: unknown) =>
  typeof from === 'string' && typeof to === 'string' && !!from && !!to && from > to

/** ISO sana → 02.10.2026 (filtr xulosasi va eksport sarlavhasi, D-D24). */
export const dmy = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('.') : '—')

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const yearStart = () => isoDate(new Date(new Date().getFullYear(), 0, 1))

/** Diagramma ranglari — mavzu tokenlari (`--chart-1..6`), qattiq rang yo'q. */
export const CHART_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'] as const
export const tokenColor = (token: string) => `rgb(var(${token}))`
