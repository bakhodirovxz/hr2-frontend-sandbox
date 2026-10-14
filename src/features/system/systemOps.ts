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
  integrity: 'system/ops/integrity',
  modulesBlocked: 'system/ops/modules/blocked',
  modulesCheck: 'system/ops/modules/check',
  notice: 'system/ops/notice',
  unblock: (m: string) => `system/ops/modules/${m}/unblock`,
  acknowledge: (id: number) => `system/ops/incidents/${id}/acknowledge`,
  settings: 'system/settings/ops',
} as const

/** Avariyaviy to'xtatish hisobotida har xizmat (TZ E2 1690): api / worker / beat / database. */
export interface ServiceStop {
  service: string
  ok: boolean
  action?: string
  detail?: string | null
  workers?: string[]
}

/** Butunlik buzilganda taklif qilinadigan nusxa (TZ E3 1729). */
export interface SuggestRestore {
  backup_id: number
  finished_at?: string | null
  file_name?: string | null
  storage?: string | null
  size_bytes?: number | null
  confirm_phrase?: string
}

export interface IntegrityResult {
  ok: boolean
  problems: { kind?: string; object?: string; detail?: string }[]
  stats?: Record<string, unknown>
  elapsed_ms?: number
  limit_seconds?: number
  suggest_restore?: SuggestRestore | null
}

/** `blocked_modules` sozlamasi: {modul kodi: {reason, module, blocked_at}}. */
export type BlockedModules = Record<string, { reason?: string; module?: string; blocked_at?: string }>

/** `GET/PUT /system/settings/ops` — TZ E2 1699. */
export interface OpsSettings {
  auto_restart: { enabled: boolean; delay_s: number; healthy_checks: number }
  escalation: { enabled: boolean; after_minutes: number; user_ids: number[]; emails: string[] }
}

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
  /** `pid:…` / `gid:…` — the key of the per-transaction choice. */
  key?: string
  pid?: number | string | null
  gid?: string | null
  user?: string | null
  state?: string | null
  age_seconds?: number | null
  query?: string | null
  client?: string | null
  writes?: boolean
  tables?: string[]
  /** `open` (still running) or `ended` (journal entry no longer open). */
  status?: string
  in_journal?: boolean
  action?: string
  result?: string
}

/** `GET /system/ops/transactions` — live list merged with the shutdown journal. */
export interface TransactionList {
  items?: OpenTransaction[]
  journal_items?: OpenTransaction[]
  journal_saved_at?: string | null
}

/** TZ E2 1697 «Тип сбоя» — same list as the server's FAILURE_TYPES. */
export const FAILURE_TYPES = [
  'database', 'storage', 'redis', 'worker', 'disk', 'network', 'application', 'security', 'power', 'other',
] as const

/** `GET /system/ops/notice` — the banner every page shows. */
export interface OpsNotice {
  mode?: string
  notice?: { kind?: string; reason?: string | null; deadline?: string | null; at?: string | null } | null
  server_time?: string
}

export interface Step {
  code?: string
  step?: string
  ok?: boolean
  detail?: unknown
  params?: Record<string, unknown> | null
  ms?: number
  limit_seconds?: number | null
}

export interface ModuleResult {
  module: string
  code?: string | null
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
  transactions?: { total?: number; resolved?: number; kept?: number; items?: OpenTransaction[] }
  integrity_after?: { ok?: boolean; problems?: unknown[] }
  failure_type?: string | null
  error_code?: string | null
  grace_seconds?: number | null
  repaired?: { fixed?: unknown[]; failed?: unknown[] }
  modules?: { ok?: boolean; failed?: number; results?: ModuleResult[]; blocked?: string[] }
  services?: ServiceStop[]
  physical_stop?: string
  suggest_restore?: SuggestRestore | null
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

/** Step codes of `SystemOpsService.emergency_shutdown` → dictionary keys. */
const STEP_CODES: Record<string, string> = {
  notify_users: 'step_notify',
  grace: 'step_grace',
  save_transactions: 'step_tx',
  forced_fallback: 'step_forced',
  set_mode: 'step_mode',
  revoke_sessions: 'step_sessions',
  stop_services: 'step_services',
  close_connections: 'step_connections',
  checkpoint: 'step_checkpoint',
}

/** Older reports carry only the Uzbek step name. */
const STEP_KEYS: Record<string, string> = {
  'Foydalanuvchilarni ogohlantirish': 'step_notify',
  'Tranzaksiyalarni tiklash jurnaliga yozish': 'step_tx',
  "Tizimni avariyaviy rejimga o'tkazish": 'step_mode',
  'Faol sessiyalarni yakunlash': 'step_sessions',
  "Xizmatlarni to'xtatish (API, fon navbati, rejalashtiruvchi)": 'step_services',
  'Buferlarni diskka tushirish (CHECKPOINT)': 'step_checkpoint',
}

export function stepLabel(t: TFunction, step?: string, code?: string): string {
  const key = (code && STEP_CODES[code]) || (step ? STEP_KEYS[step] : undefined)
  return key ? (t(`sysHealth.${key}` as never) as string) : String(step ?? '')
}

/** A step's result in the interface language, from its `code` + `params`. */
export function stepDetail(t: TFunction, s: Step): string {
  const p = (s.params ?? {}) as Record<string, unknown>
  switch (s.code) {
    case 'notify_users':
      return p.failed ? t('sysHealth.detNotifyFailed') : t('sysHealth.detNotify', { n: p.count ?? 0 })
    case 'grace':
      return t('sysHealth.detGrace', { n: p.seconds ?? 0 })
    case 'save_transactions':
      return p.skipped ? t('sysHealth.detTxSkipped') : s.ok ? t('sysHealth.detTx', { n: p.count ?? 0 }) : localizeDetail(t, s.detail)
    case 'forced_fallback':
      return t('sysHealth.detForced')
    case 'set_mode':
      return modeLabel(t, String(p.mode ?? 'maintenance'))
    case 'close_connections':
      return t('sysHealth.detConnections', { n: p.count ?? 0 })
    case 'checkpoint':
      return s.ok ? t('sysHealth.detCheckpoint') : localizeDetail(t, s.detail)
    case 'stop_services':
      return s.ok ? t('sysHealth.detServices') : localizeDetail(t, s.detail)
    default:
      return localizeDetail(t, s.detail)
  }
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
  m = /^(\d+) ta sessiya yakunlandi$/.exec(text)
  if (m) return t('sysHealth.detSessions', { n: m[1] })
  for (const [comp, uz] of Object.entries(COMPONENT_UZ)) {
    if (text === `${uz}: ${FAIL_UZ[comp] ?? ''}`) return t('sysHealth.failText', { comp: componentLabel(t, comp) })
  }
  return text
}

/** Server-side Uzbek component labels and failure texts (system_ops.py). */
const COMPONENT_UZ: Record<string, string> = {
  database: "Ma'lumotlar bazasi", storage: 'Fayl ombori (MinIO)', migrations: 'Migratsiya darajasi',
  redis: 'Redis (kesh)', worker: 'Fon vazifalari (navbat)', disk: 'Server diski',
  db_connections: 'Baza ulanishlari', queue: 'Fon navbati (broker)',
}
const FAIL_UZ: Record<string, string> = {
  database: 'javob bermayapti', storage: 'javob bermayapti', redis: 'javob bermayapti',
  worker: 'hech bir worker javob bermadi', disk: "bo'sh joy kam",
  db_connections: 'ulanishlar chegaraga yaqin', migrations: "migratsiya darajasi noma'lum",
  queue: "fon tekshiruvi to'xtab qolgan (broker yoki worker ishlamayapti)",
}

/** Incident message: «disk: bo'sh 1.8 GB» → «Disk: свободно 1.8 ГБ». */
export function localizeMessage(t: TFunction, v: unknown): string {
  const text = typeof v === 'string' ? v : ''
  const m = /^([a-z_]+): (.*)$/.exec(text)
  if (m) return `${componentLabel(t, m[1])}: ${localizeDetail(t, m[2])}`
  // «Fayl ombori (MinIO): javob bermayapti; Redis (kesh): …»
  return text.split('; ').map((part) => localizeDetail(t, part)).join('; ')
}
