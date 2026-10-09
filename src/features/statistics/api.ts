import { apiClient } from '@/api/client'
import { apiGet, apiPost, apiDelete } from '@/api/http'

/**
 * STATISTIK HISOBOT KONSTRUKTORI — server bilan aloqa qatlami (TZ 4.2.11).
 *
 * ⚠️ MANZILLAR SHU YERDA E'LON QILINGAN, `api/endpoints.ts` DA EMAS.
 * Sabab vaqtinchalik va texnik: bu modul yozilayotgan paytda `endpoints.ts`
 * ni bir vaqtning o'zida boshqa ish oqimlari ham tahrirlayotgan edi, ya'ni
 * bitta faylga to'rt tomondan yozish — kafolatlangan to'qnashuv. Daraxt
 * tinchigach bu beshta doimiy AYNAN shu ko'rinishda `endpoints.ts` ga
 * ko'chiriladi va bu yerda faqat re-export qoladi. Boshqa hech qanday sabab
 * yo'q: qolgan barcha modul manzillari markazda turadi.
 */
const STATISTICS_META = 'statistics/meta'
const STATISTICS_REPORT = 'statistics/report'
const STATISTICS_EXPORT = (kind: ExportKind) => `statistics/export/${kind}`
const STATISTICS_TEMPLATES = 'statistics/templates'
const STATISTICS_TEMPLATE_DETAIL = (id: number) => `statistics/templates/${id}`

export type ExportKind = 'excel' | 'pdf'

/** Hisobotning ikkinchi o'lchovi — TZ ning to'rt holati. Kod BACKENDdan
 *  keladi, bu yerda faqat ustun/qator tartibi uchun sanab o'tilgan. */
export const STATUS_KEYS = ['accepted', 'in_progress', 'done', 'rejected'] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

/** Jadval ustunlari — `label` (kesim nomi) doim birinchi va o'chirilmaydi. */
export const ALL_COLUMNS = ['label', 'total', ...STATUS_KEYS] as const
export type ColumnKey = (typeof ALL_COLUMNS)[number]

export interface MetaOption {
  value: string
  label: string
}

/** `GET /statistics/meta` javobi — filtrlar ro'yxati SERVERDAN keladi, front
 *  ularni qattiq yozib qo'ymaydi (yangi murojaat turi qo'shilsa o'zi paydo
 *  bo'ladi). */
export interface StatisticsMeta {
  sources: MetaOption[]
  types: MetaOption[]
  statuses: MetaOption[]
  group_by: MetaOption[]
  columns: MetaOption[]
}

/** Bitta kesim (oy / tur / filial …) bo'yicha qator. */
export interface ReportRow {
  key: string
  label: string
  total: number
  accepted: number
  in_progress: number
  done: number
  rejected: number
  /** Umumiy hajmdagi ulush, foizda — SERVER hisoblaydi, ekranda ham,
   *  eksportda ham bir xil chiqsin uchun. */
  share: number
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
  /** Oldingi (xuddi shu uzunlikdagi) davr — bo'lmasa `null`. */
  previous_totals: PreviousTotals | null
  /** Har ko'rsatkich uchun o'zgarish foizi; solishtirib bo'lmasa `null`. */
  deltas: Partial<Record<'total' | StatusKey, number | null>>
  done_rate: number
  period: { date_from: string | null; date_to: string | null }
}

/** `POST /statistics/report` tanasi. Bo'sh ro'yxat YUBORILMAYDI — backend
 *  `None` ni «hammasi» deb tushunadi, bo'sh ro'yxatni esa «hech biri» deb. */
export interface ReportParams {
  date_from?: string | null
  date_to?: string | null
  sources?: string[] | null
  types?: string[] | null
  statuses?: string[] | null
  branch_id?: number | null
  group_by: string
}

export interface ExportParams extends ReportParams {
  columns?: string[] | null
  title?: string
  subtitle?: string
  /** Ekrandagi diagrammaning PNG surati (data-URL) — PDF ga aynan shu tushadi. */
  chart_png_base64?: string | null
}

export interface ReportTemplate {
  id: number
  name: string
  description: string | null
  /** Saqlangan filtrlar to'plami + ustun tanlovi. Shakli — `ReportParams`
   *  ustiga `columns`; eski yozuvlarda maydon yetishmasligi mumkin, shuning
   *  uchun o'qishda har biri alohida tekshiriladi. */
  params: Partial<ExportParams>
  is_shared: boolean
  position: number
  /** Faqat MUALLIF o'chira oladi (backend 403 qaytaradi) — tugma shu bayroqqa
   *  qarab ko'rsatiladi. */
  is_mine: boolean
}

export interface TemplateInput {
  name: string
  description?: string | null
  params: Partial<ExportParams>
  is_shared: boolean
}

export function fetchStatisticsMeta(): Promise<StatisticsMeta> {
  return apiGet<StatisticsMeta>(STATISTICS_META)
}

export function fetchStatisticsReport(params: ReportParams): Promise<StatisticsReport> {
  return apiPost<StatisticsReport>(STATISTICS_REPORT, params)
}

export function fetchTemplates(): Promise<ReportTemplate[]> {
  return apiGet<ReportTemplate[]>(STATISTICS_TEMPLATES)
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
}

/**
 * Excel / PDF ni yuklab olish.
 *
 * ⚠️ NEGA `lib/download.ts` DAGI `downloadFile` ISHLATILMADI: u POST da
 * tanani `null` qilib yuboradi va hamma narsani QUERY ga qo'yadi. Bu ikki
 * manzil esa Pydantic TANASINI kutadi (filtrlar ro'yxati, ustunlar va
 * diagrammaning base64 PNG i — query ga sig'maydi ham). Shuning uchun shu
 * yerda o'sha helper bilan bir xil naqsh takrorlangan: autentifikatsiyalangan
 * klientdan blob olinadi va sun'iy havola bosiladi, obyekt-URL esa DARHOL
 * bo'shatiladi (unutilgani butun faylni tab yopilguncha xotirada ushlab
 * turadi, bular esa kitob hajmidagi fayllar).
 *
 * Daraxt tinchigach to'g'ri yechim — `downloadFile` ga ixtiyoriy `body`
 * parametri qo'shish va bu funksiyani o'chirish.
 */
export async function downloadStatisticsExport(
  kind: ExportKind,
  body: ExportParams,
): Promise<void> {
  const res = await apiClient.post(STATISTICS_EXPORT(kind), body, {
    responseType: 'blob',
    // Katta davrda hisobot bir necha o'n soniya yig'iladi — standart timeout
    // yetmay, foydalanuvchi «xatolik» ko'rardi.
    timeout: 300_000,
  })
  const href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: MIME[kind] }))
  const link = document.createElement('a')
  link.href = href
  link.download = kind === 'pdf' ? 'statistika.pdf' : 'statistika.xlsx'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
