import { apiClient } from '@/api/client'
import { apiGet, apiPost, apiPut, apiDelete } from '@/api/http'
import { downloadFromUrl } from '@/lib/download'

/**
 * STATISTIK HISOBOT MODULI — server bilan aloqa qatlami (TZ 4.2.11, R1, R2).
 *
 * Uch qism bitta `statistics/*` routeridan foydalanadi:
 *   • «Hisobotlar katalogi» (R1) — `POST statistics/report` `report_code` bilan;
 *   • «Murojaatlar statistikasi» konstruktori — o'sha manzil `report_code` SIZ;
 *   • «Ko'rsatkichlar paneli» (R2) — `GET statistics/dashboard`.
 *
 * ⚠️ FILIAL PARAMETRI `branch_id`, `organization_branch_id` EMAS. Axios
 * interceptori shapkadagi filialni `organization_branch_id` qilib qo'shadi,
 * statistika routeri esa uni o'qimaydi — shuning uchun sahifa filialni
 * `branch_id` sifatida O'ZI yuboradi (`useStatBranch`).
 */
const STATISTICS_META = 'statistics/meta'
const STATISTICS_REPORT = 'statistics/report'
const STATISTICS_DASHBOARD = 'statistics/dashboard'
const STATISTICS_EXPORT = (kind: ExportKind) => `statistics/export/${kind}`
const STATISTICS_TEMPLATES = 'statistics/templates'
const STATISTICS_TEMPLATE_DETAIL = (id: number) => `statistics/templates/${id}`

export type ExportKind = 'excel' | 'pdf' | 'docx'

/** Murojaatlarning besh holati (backend `services/statistics.STATUS_KEYS`).
 *  `cancelled` — arizachining o'zi bekor qilgani, rad etish EMAS (D-D24). */
export const STATUS_KEYS = ['accepted', 'in_progress', 'done', 'rejected', 'cancelled'] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

/** Jadval ustunlari — `label` (kesim nomi) doim birinchi va o'chirilmaydi. */
export const ALL_COLUMNS = ['label', 'total', ...STATUS_KEYS] as const
export type ColumnKey = (typeof ALL_COLUMNS)[number]

export interface MetaOption {
  value: string
  label: string
}

/** Katalog hisobotining bitta parametri (`services/statistics_reports._p`). */
export interface CatalogParam {
  name: string
  label: string
  type: string
  required?: boolean
  options?: { value: string | number; label: string }[]
  multiple?: boolean
  default?: unknown
}

export interface CatalogReport {
  code: string
  category: string
  category_label?: string
  label: string
  params: CatalogParam[]
}

/** `GET statistics/meta` — filtrlar ro'yxati va hisobotlar katalogi SERVERDAN. */
export interface StatisticsMeta {
  report_catalog?: CatalogReport[]
  report_categories?: MetaOption[]
  sources: MetaOption[]
  types: MetaOption[]
  statuses: MetaOption[]
  group_by: MetaOption[]
  columns: MetaOption[]
}

/** Bitta kesim (oy / tur / filial …) bo'yicha qator. */
export interface ReportRow extends Record<StatusKey, number> {
  key: string
  label: string
  total: number
  /** Umumiy hajmdagi ulush, foizda — SERVER hisoblaydi. */
  share: number
  /** TZ 4.2.11 · 2247: with `split_by_type` — the period/group part and the type. */
  group_label?: string
  type?: string
  type_label?: string
}

export type Totals = Record<'total' | StatusKey, number>

export interface PreviousTotals extends Totals {
  date_from: string
  date_to: string
}

export interface StatisticsReport {
  group_by: string
  group_label: string
  rows: ReportRow[]
  totals: Totals
  previous_totals: PreviousTotals | null
  deltas: Partial<Record<'total' | StatusKey, number | null>>
  done_rate: number
  period: { date_from: string | null; date_to: string | null }
  split_by_type?: boolean
}

/** `POST statistics/report` tanasi. Bo'sh ro'yxat YUBORILMAYDI — backend
 *  `None` ni «hammasi» deb tushunadi, bo'sh ro'yxatni esa «hech biri» deb. */
export interface ReportParams {
  date_from?: string | null
  date_to?: string | null
  sources?: string[] | null
  types?: string[] | null
  statuses?: string[] | null
  branch_id?: number | null
  group_by: string
  /** TZ 4.2.11 · 2247–2253: request date AND type in one table. */
  split_by_type?: boolean
}

/** Backend `ExportRequest` (`api/v1/statistics.py`). */
export interface ExportParams extends Partial<ReportParams> {
  report_code?: string
  columns?: string[] | null
  title?: string
  subtitle?: string
  /** Diagrammaning oq fondagi PNG surati (data-URL) — PDF ga aynan shu tushadi. */
  chart_png_base64?: string | null
  /** TZ 2352–2353: shaxsiy ma'lumotlarsiz (taxallus bilan) eksport. */
  anonymize?: boolean
  sort_by?: string
  sort_dir?: 'asc' | 'desc'
  [extra: string]: unknown
}

export interface CatalogColumn {
  key: string
  label: string
  type?: string | null
}

/** Katalog hisobotining natijasi: `{columns, rows, chart:{x, series}}`. */
export interface CatalogResult {
  report_code: string
  label: string
  category: string
  columns: CatalogColumn[]
  rows: Record<string, unknown>[]
  chart?: { x?: string; series?: string[] }
  totals?: Record<string, number>
  group_by?: string | null
  group_label?: string
}

export interface ReportTemplate {
  id: number
  name: string
  description: string | null
  params: Record<string, unknown>
  is_shared: boolean
  position: number
  /** Katalog hisoboti kodi; `null` — «Murojaatlar statistikasi» konstruktori. */
  report_code: string | null
  /** Faqat MUALLIF (va master-admin) o'chira oladi — tugma shu bayroqqa qarab. */
  is_mine: boolean
  /** Avtomatik shakllantirish jadvali (yo'q bo'lsa `null`). */
  schedule?: ReportSchedule | null
  /** Faqat muallifga qaytadi. */
  recipients?: string[] | null
  formats?: DeliveryFormat[] | null
  last_run_at?: string | null
}

export type DeliveryFormat = 'xlsx' | 'pdf' | 'docx'
export const DELIVERY_FORMATS: DeliveryFormat[] = ['xlsx', 'pdf', 'docx']

export interface ReportSchedule {
  enabled: boolean
  frequency: 'daily' | 'weekly' | 'monthly'
  hour: number
  /** 0 = dushanba … 6 = yakshanba */
  weekday: number
  /** Oyning kuni, 1–28 */
  day: number
  /** TZ R1 1503: period of each run relative to its date («fixed» = saved dates). */
  period_preset?: PeriodPreset
}

export const PERIOD_PRESETS = [
  'fixed',
  'last_7_days',
  'last_30_days',
  'previous_week',
  'current_month',
  'previous_month',
  'current_year',
  'previous_year',
] as const
export type PeriodPreset = (typeof PERIOD_PRESETS)[number]

export interface ScheduleInput {
  schedule: ReportSchedule
  recipients: string[]
  formats: DeliveryFormat[]
}

export interface ReportRun {
  id: number
  kind: string
  status: string
  error: string | null
  file_name: string | null
  has_file: boolean
  created_at: string | null
  finished_at: string | null
  result: {
    template_id?: number
    files?: string[]
    delivery?: { status?: string; sent?: string[]; failed?: { email: string; error: string }[] }
  } | null
}

export interface TemplateInput {
  name: string
  description?: string | null
  params: Record<string, unknown>
  is_shared: boolean
  report_code?: string | null
  schedule?: ReportSchedule
  recipients?: string[]
  formats?: DeliveryFormat[]
}

export type DashboardCategory = 'staff' | 'vacancies' | 'kpi' | 'training'

export interface DashboardParams {
  category: DashboardCategory
  period_from?: string
  period_to?: string
  compare_from?: string
  compare_to?: string
  branch_id?: number
  department_id?: number
  job_position_id?: number
  /** TZ R2 1526 «статус» — meaning per category (`status_options`). */
  status?: string
}

export interface DashboardWidget {
  code: string
  label: string
  value: number | null
  previous: number | null
  unit: string | null
  trend: 'up' | 'down' | 'flat'
  delta: number | null
  /** Foydalanuvchi sozlamasi bo'yicha ko'rinishi (eski javobda yo'q). */
  visible?: boolean
}

export interface DashboardChart {
  code: string
  label: string
  data: { label: string; value: number; key?: string | number | null }[]
  visible?: boolean
}

export interface StatisticsDashboard {
  category: DashboardCategory
  period: { from: string; to: string }
  previous_period: { from: string; to: string }
  comparison: 'previous' | 'custom'
  widgets: DashboardWidget[]
  charts: DashboardChart[]
  /** TZ R2 1528: false — nothing for the period («Данные не найдены»). */
  has_data?: boolean
  status?: string | null
  status_options?: { value: string; label: string }[]
  preferences?: { widgets: string[] | null; charts: string[] | null; customized: boolean }
}

export interface DashboardPreferences {
  default_category: DashboardCategory
  widgets: Record<string, string[]>
  charts: Record<string, string[]>
  available: { widgets: Record<string, string[]>; charts: Record<string, string[]> }
  customized: boolean
}

export interface DrillResult {
  category: DashboardCategory
  widget: string
  key: string | null
  columns: { key: string; label: string }[]
  items: Record<string, unknown>[]
  total: number
  page: number
  size: number
  pii_level?: string
}

export function fetchStatisticsMeta(): Promise<StatisticsMeta> {
  return apiGet<StatisticsMeta>(STATISTICS_META)
}

export function fetchStatisticsReport(params: ReportParams): Promise<StatisticsReport> {
  return apiPost<StatisticsReport>(STATISTICS_REPORT, params)
}

export function fetchCatalogReport(body: Record<string, unknown>): Promise<CatalogResult> {
  return apiPost<CatalogResult>(STATISTICS_REPORT, body)
}

export function fetchDashboard(params: DashboardParams): Promise<StatisticsDashboard> {
  return apiGet<StatisticsDashboard>(STATISTICS_DASHBOARD, params as unknown as Record<string, unknown>)
}

/** `report_code` berilsa — faqat shu hisobot shablonlari (server filtri). */
export function fetchTemplates(reportCode?: string): Promise<ReportTemplate[]> {
  return apiGet<ReportTemplate[]>(STATISTICS_TEMPLATES, reportCode ? { report_code: reportCode } : undefined)
}

export function createTemplate(data: TemplateInput): Promise<{ id: number }> {
  return apiPost<{ id: number }>(STATISTICS_TEMPLATES, data)
}

export function deleteTemplate(id: number): Promise<void> {
  return apiDelete<void>(STATISTICS_TEMPLATE_DETAIL(id))
}

const MIME: Record<ExportKind, string> = {
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}
const EXT: Record<ExportKind, string> = { excel: 'xlsx', pdf: 'pdf', docx: 'docx' }

/** `Content-Disposition` dagi fayl nomi (RFC 5987 `filename*` ham). */
function fileNameFrom(header: unknown, fallback: string): string {
  const cd = typeof header === 'string' ? header : ''
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim())
    } catch {
      /* oddiy nomga tushamiz */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd)
  return plain ? plain[1].trim() : fallback
}

/**
 * Excel / PDF / Word ni yuklab olish.
 *
 * ⚠️ NEGA `lib/download.ts` DAGI `downloadFile` EMAS: u POST da tanani `null`
 * qilib hammasini QUERY ga qo'yadi. Bu manzillar esa Pydantic TANASINI kutadi
 * (filtrlar ro'yxati, ustunlar va diagrammaning base64 PNG i — query ga
 * sig'maydi ham). Naqsh o'sha helper bilan bir xil: autentifikatsiyalangan
 * klientdan blob olinadi, obyekt-URL DARHOL bo'shatiladi.
 */
export async function downloadStatisticsExport(
  kind: ExportKind,
  body: ExportParams,
  fallbackName = 'statistika',
): Promise<void> {
  const res = await apiClient.post(STATISTICS_EXPORT(kind), body, {
    responseType: 'blob',
    // Katta davrda hisobot bir necha o'n soniya yig'iladi.
    timeout: 300_000,
  })
  const href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: MIME[kind] }))
  const link = document.createElement('a')
  link.href = href
  link.download = fileNameFrom(res.headers?.['content-disposition'], `${fallbackName}.${EXT[kind]}`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}


// ── R1: e-mail, bir nechta format, jadval ────────────────────────────────

export function sendReportByEmail(body: { params: Record<string, unknown>; formats: DeliveryFormat[]; emails: string[] }) {
  return apiPost<{ files: string[]; sent: string[]; failed: { email: string; error: string }[] }>('statistics/report/send', body)
}

export function setTemplateSchedule(id: number, body: ScheduleInput) {
  return apiPut<unknown>(`statistics/templates/${id}/schedule`, body)
}

export function fetchReportRuns(): Promise<ReportRun[]> {
  return apiGet<ReportRun[]>('jobs', { kind: 'report_schedule', limit: 50 })
}

export async function downloadRunFile(id: number, name: string): Promise<void> {
  const { url } = await apiGet<{ url: string }>(`jobs/${id}/download`)
  await downloadFromUrl(url, name)
}

/** Tanlangan formatlar bitta zip arxivda. */
export async function downloadStatisticsBundle(
  body: ExportParams,
  formats: DeliveryFormat[],
  fallbackName = 'statistika',
): Promise<void> {
  const res = await apiClient.post('statistics/export/bundle', { ...body, formats }, { responseType: 'blob', timeout: 300_000 })
  const href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: 'application/zip' }))
  const link = document.createElement('a')
  link.href = href
  link.download = fileNameFrom(res.headers?.['content-disposition'], `${fallbackName}.zip`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

// ── R2: eksport, batafsil, sozlash ───────────────────────────────────────

export async function downloadDashboardExport(params: DashboardParams, format: 'xlsx' | 'pdf'): Promise<void> {
  const res = await apiClient.get('statistics/dashboard/export', { params: { ...params, format }, responseType: 'blob', timeout: 120_000 })
  const href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: format === 'pdf' ? MIME.pdf : MIME.excel }))
  const link = document.createElement('a')
  link.href = href
  link.download = fileNameFrom(res.headers?.['content-disposition'], `statistika-panel.${format}`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

export function fetchDrill(params: DashboardParams & { widget: string; key?: string | null; page: number; size: number }) {
  return apiGet<DrillResult>('statistics/dashboard/drill', { ...params })
}

export function fetchDashboardPreferences() {
  return apiGet<DashboardPreferences>('statistics/dashboard/preferences')
}

export function saveDashboardPreferences(body: Partial<Pick<DashboardPreferences, 'default_category' | 'widgets' | 'charts'>>) {
  return apiPut<DashboardPreferences>('statistics/dashboard/preferences', body)
}
