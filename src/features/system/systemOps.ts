import type { TFunction } from 'i18next'

/** `system/ops/*` — TZ E2/E3 operator console (master-admin only). */
export const OPS = {
  state: 'system/ops/state',
  diagnostics: 'system/ops/diagnostics',
  incidents: 'system/ops/incidents',
  transactions: 'system/ops/transactions',
  shutdown: 'system/ops/shutdown',
  recoveryEnter: 'system/ops/recovery/enter',
  recoveryRun: 'system/ops/recovery/run',
  resume: 'system/ops/resume',
} as const

export interface OpsState {
  mode?: string
  mode_label?: string
  reason?: string | null
  changed_at?: string | null
  changed_by_name?: string | null
}

export interface Check {
  component: string
  status: string
  detail?: string | null
  severity?: string | null
}

export interface Diagnostics {
  mode?: string
  checks?: Check[]
  failed?: number
  critical?: number
  healthy?: boolean
  elapsed_ms?: number
  limit_seconds?: number
  checked_at?: string
}

export interface OpenTransaction {
  kind?: 'open' | 'prepared' | string
  pid?: number | string | null
  gid?: string | null
  user?: string | null
  state?: string | null
  age_seconds?: number | null
  query?: string | null
}

export interface Step {
  step?: string
  ok?: boolean
  detail?: unknown
  ms?: number
  limit_seconds?: number | null
}

export interface ModuleResult {
  module: string
  status: string
  rows?: number
  error?: string
  ms?: number
}

/** The body of a shutdown / recovery answer and of an incident's `report`. */
export interface OpsReport {
  ok?: boolean
  incident_id?: number
  steps?: Step[]
  checks?: Check[]
  diagnostics?: Diagnostics
  integrity?: { ok?: boolean; problems?: unknown[] }
  transactions?: { total?: number; resolved?: number; items?: unknown[] }
  repaired?: { fixed?: unknown[]; failed?: unknown[] }
  modules?: { ok?: boolean; failed?: number; results?: ModuleResult[] }
  elapsed_seconds?: number
  [k: string]: unknown
}

export interface Incident {
  id: number
  kind?: string | null
  severity?: string | null
  severity_label?: string | null
  component?: string | null
  code?: string | null
  message?: string | null
  detected_at?: string | null
  resolved_at?: string | null
  acknowledged?: boolean | null
  actor_name?: string | null
  duration_seconds?: number | null
  report?: OpsReport | null
}

/** The server's mode label is Uzbek; the known modes are translated here. */
export function modeLabel(t: TFunction, mode: string, fallback?: string): string {
  const key = `sysHealth.mode_${mode}`
  return t(key as never, { defaultValue: fallback || mode }) as string
}

export function componentLabel(t: TFunction, component: string): string {
  return t(`sysHealth.comp_${component}` as never, { defaultValue: component }) as string
}

/** Step names of `SystemOpsService.emergency_shutdown` → dictionary keys. */
const STEP_KEYS: Record<string, string> = {
  'Foydalanuvchilarni ogohlantirish': 'step_notify',
  'Tranzaksiyalarni tiklash jurnaliga yozish': 'step_tx',
  "Tizimni avariyaviy rejimga o'tkazish": 'step_mode',
  'Faol sessiyalarni yakunlash': 'step_sessions',
  'Buferlarni diskka tushirish (CHECKPOINT)': 'step_checkpoint',
}

export function stepLabel(t: TFunction, step?: string): string {
  const key = step ? STEP_KEYS[step] : undefined
  return key ? (t(`sysHealth.${key}` as never) as string) : String(step ?? '')
}

/**
 * Check/step details come from the server in Uzbek; the ones with a variable
 * part (disk space, worker count) are re-rendered through the dictionary so
 * they follow the interface language, the rest are shown as sent.
 */
export function localizeDetail(t: TFunction, v: unknown): string {
  const text = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v)
  let m = /^bo'sh ([\d.]+) GB \/ ([\d.]+) GB$/.exec(text)
  if (m) return t('sysHealth.detailDiskFree', { free: m[1], total: m[2] })
  m = /^bo'sh ([\d.]+) GB$/.exec(text)
  if (m) return t('sysHealth.detailDiskFreeShort', { free: m[1] })
  m = /^(\d+) ta worker javob berdi$/.exec(text)
  if (m) return t('sysHealth.detailWorkers', { n: m[1] })
  return text
}

/** Incident message: «disk: bo'sh 1.8 GB» → «Disk: свободно 1.8 ГБ». */
export function localizeMessage(t: TFunction, v: unknown): string {
  const text = typeof v === 'string' ? v : ''
  const m = /^([a-z_]+): (.*)$/.exec(text)
  if (m) return `${componentLabel(t, m[1])}: ${localizeDetail(t, m[2])}`
  return localizeDetail(t, text)
}
