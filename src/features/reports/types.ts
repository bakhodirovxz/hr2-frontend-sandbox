/* Report engine wire types — mirror `services/reports/base.py` / `table.py`. */

export type ParamKind =
  | 'date_range' | 'month' | 'date' | 'branch_multi' | 'division_tree' | 'job_multi'
  | 'employee_multi' | 'enum' | 'bool' | 'int' | 'time_range' | 'text'

export interface ParamDef {
  name: string
  kind: ParamKind
  label_key: string
  required: boolean
  default: unknown
  options_source: string | null
  depends_on: string[]
  multiple: boolean
  choices: { value: string; label_key: string }[]
}

export interface PrefDef {
  name: string
  label_key: string
  group: string
  default: unknown
  kind: 'bool' | 'enum'
  choices: { value: string; label_key: string }[]
}

export type ReportCategory = 'hr' | 'attendance' | 'kpi'

export interface ReportCatalogItem {
  code: string
  title_key: string
  category: ReportCategory
  params: ParamDef[]
  prefs: PrefDef[]
  formats: string[]
  supports_templates: boolean
  drills: string[]
  hidden: boolean
}

export interface ReportOption {
  value: string | number
  label: string
  sub?: string | null
  parent?: string | number | null
  branch_id?: number | null
  is_branch?: boolean | null
  tabel_number?: string | null
  photo?: string | null
  photo_fallback?: string | null
}

export type CellStyle =
  | 'root' | 'header' | 'header_danger' | 'body' | 'body_centralized' | 'danger' | 'warning'
  | 'success' | 'rest' | 'dismissed' | 'footer' | 'muted' | 'section' | 'bold'

export interface DrillRef {
  report: string
  params: Record<string, unknown>
}

export interface CellJson {
  v: unknown
  s?: CellStyle
  cs?: number
  rs?: number
  f?: 'str' | 'int' | 'num' | 'hhmm' | 'date' | 'time' | 'pct'
  p?: DrillRef
  k?: string
  a?: 'left' | 'center' | 'right'
  t?: string
}

export interface RowJson {
  kind: 'body' | 'section' | 'footer'
  s?: CellStyle | null
  c: CellJson[]
}

export interface SheetJson {
  name: string
  name_key?: string | null
  ncols: number
  widths: number[]
  header: CellJson[][]
  rows: RowJson[]
  footer: RowJson[]
  freeze_rows: number
  freeze_cols: number
  legend: { s: CellStyle; k: string; v: string }[]
}

export interface ReportTableJson {
  title: string
  title_key: string
  info: { k: string; v: string }[]
  generated_at: string
  qr_png_b64: string | null
  signature: { label?: string; name?: string; position?: string | null; at?: string | null; verify_url?: string } | null
  sheets: SheetJson[]
  body_rows: number
}

export interface ReportTemplate {
  id: number
  name: string
  params: Record<string, unknown>
  prefs: Record<string, unknown>
  updated_at?: string | null
}

export type ReportParams = Record<string, unknown>
export type ReportPrefs = Record<string, unknown>
