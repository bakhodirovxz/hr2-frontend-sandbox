import i18n from '@/i18n'
import type { CellStyle } from './types'

/** Symbolic cell style → Tailwind classes (the xlsx renderer mirrors these fills). */
export const CELL_STYLE: Record<CellStyle, string> = {
  root: 'font-semibold',
  header: '',
  header_danger: 'text-danger',
  body: '',
  body_centralized: 'text-center',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
  rest: 'bg-surface-2 text-fg-subtle',
  dismissed: 'bg-fg/[0.08] text-fg-subtle',
  footer: 'font-semibold bg-surface-2',
  muted: 'bg-info-soft text-info',
  section: 'font-semibold bg-brand-soft text-brand-strong',
  bold: 'font-semibold',
}

/** Legend swatch (same palette, as a small square). */
export const SWATCH: Partial<Record<CellStyle, string>> = {
  danger: 'bg-danger-soft ring-danger/40',
  warning: 'bg-warning-soft ring-warning/40',
  success: 'bg-success-soft ring-success/40',
  rest: 'bg-surface-2 ring-line',
  dismissed: 'bg-fg/[0.12] ring-line',
  muted: 'bg-info-soft ring-info/40',
}

/**
 * Translate a server `label_key`. Keys are namespaced on the server
 * (`r.<code>`, `p.<param>`, `pref.<name>`); everything else is a column /
 * info label under `reports.h`. Falls back to the server's own text so a
 * missing dictionary entry never blanks a header.
 */
export function reportLabel(key: string | undefined | null, fallback?: unknown): string {
  if (!key) return fallback == null ? '' : String(fallback)
  const full = /^(r|p|pref)\./.test(key) ? `reports.${key}` : `reports.h.${key}`
  if (i18n.exists(full)) return i18n.t(full as never) as unknown as string
  return fallback == null ? key : String(fallback)
}
