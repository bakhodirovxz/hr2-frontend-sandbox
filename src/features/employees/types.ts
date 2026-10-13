/**
 * Sandbox backend shapes for the personnel module (TZ 4.2.7, C1–C4).
 * Source: hr-backend-sandbox `schemas/employee.py`, `schemas/employee_t2.py`.
 */

export type ContractType = 'permanent' | 'fixed_term' | 'part_time' | 'civil'
export const CONTRACT_TYPES: ContractType[] = ['permanent', 'fixed_term', 'part_time', 'civil']

/** TZ C3 «основание для изменения» — `EditBasis`. */
export type BasisDocType = 'order' | 'application' | 'other'
export interface EditBasis {
  doc_type: BasisDocType
  number: string
  date: string
}
export const EMPTY_BASIS: EditBasis = { doc_type: 'order', number: '', date: '' }
export const isBasisComplete = (b: EditBasis | null | undefined): b is EditBasis =>
  !!b && !!b.doc_type && !!String(b.number || '').trim() && !!b.date
export const cleanBasis = (b: EditBasis): EditBasis => ({ doc_type: b.doc_type, number: b.number.trim(), date: b.date })

export interface NamedRef {
  id: number
  name?: string | null
}

export interface BranchRef extends NamedRef {
  region_code?: string | null
}

export interface DepartmentRef extends NamedRef {
  organization_branch_id?: number | null
  organization_branch?: BranchRef | null
}

export interface JobPositionRef extends NamedRef {
  organization_branch_id?: number | null
}

export interface WorkExperience {
  id: number
  company_name?: string | null
  position?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
}

export interface Education {
  id: number
  institution_name?: string | null
  faculty_name?: string | null
  degree_name?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
}

/** `GET /employees/{pk}` — EmployeeReadFull (PII masked by the viewer's level). */
export interface EmployeeFull {
  id: number
  /** TZ C3 1062: sent back as `expected_updated_at` (naive UTC). */
  updated_at?: string | null
  user_id?: number | null
  tabel_number?: string | null
  legal_name?: string | null
  birth_date?: string | null
  pasport_series?: string | null
  pasport_number?: string | null
  pasport_individual_number?: string | null
  pasport_issue_by?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  email?: string | null
  phone_number?: string | null
  internal_phone_number?: string | null
  personal_identification_number?: string | null
  taxpayer_identification_number?: string | null
  individual_accumulative_pension_account_number?: string | null
  maritial_status?: string | null
  address?: string | null
  department_id?: number | null
  job_position_id?: number | null
  supervisor_id?: number | null
  job_acceptance_date?: string | null
  working_hours_start?: string | null
  working_hours_end?: string | null
  lunch_start_time?: string | null
  lunch_end_time?: string | null
  working_days?: number[] | null
  stavka?: number | null
  weekly_schedule?: Record<string, { start: string; end: string }> | null
  nationality?: string | null
  gender?: number | null
  is_multi_org_user?: boolean | null
  multi_org_employee_role?: string | null
  is_archived?: boolean | null
  archived_at?: string | null
  primary_organization_branch_id?: number | null
  organization_branches?: BranchRef[] | null
  contract_type?: ContractType | null
  residence_country_code?: string | null
  residence_address?: string | null
  department?: DepartmentRef | null
  job_position?: JobPositionRef | null
  supervisor?: { id: number; legal_name?: string | null; job_position?: JobPositionRef | null } | null
  work_experiences?: WorkExperience[] | null
  educations?: Education[] | null
}

/** `GET /dashboard/employee-kpi` row. */
export interface EmployeeKpiRow {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  department_id?: number | null
  department_name?: string | null
  job_position_name?: string | null
  contract_type?: ContractType | null
  attendance_percentage?: number | null
  kpi_percentage?: number | null
  kpi_status?: { month: string; kpi_percentage: number }[] | null
}

/** `GET /employees` row (EmployeeRead, PII masked). */
export interface EmployeeRow {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  birth_date?: string | null
  gender?: number | null
  nationality?: string | null
  contract_type?: ContractType | null
  department_id?: number | null
  supervisor_id?: number | null
  department?: DepartmentRef | null
  job_position?: JobPositionRef | null
}

/** `GET /employees/archived` row. */
export interface ArchivedEmployee {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  department_name?: string | null
  job_position_name?: string | null
  branch_name?: string | null
  archive_reason?: string | null
  archive_reason_label?: string | null
  archive_date?: string | null
  archived_at?: string | null
  archive_note?: string | null
  /** TZ C4 1087: `POST /employees/{pk}/restore` is possible until then (`null` — not possible). */
  restore_until?: string | null
}

// ── T-2 ─────────────────────────────────────────────────────────────────────

export interface T2Values {
  nationality_code?: string | null
  military_obligation_code?: string | null
  military_rank_code?: string | null
  political_party_code?: string | null
  education_level_code?: string | null
  education_specialty_code?: string | null
  education_institution?: string | null
  education_graduation_year?: number | null
  academic_degree_code?: string | null
  academic_title_code?: string | null
  birth_country_code?: string | null
  birth_region_code?: string | null
  birth_district_code?: string | null
  residence_region_code?: string | null
  residence_district_code?: string | null
  residence_country_code?: string | null
  residence_address?: string | null
  pasport_issue_date?: string | null
  pasport_expiry_date?: string | null
  previous_experience_months?: number | null
  extra?: Record<string, unknown> | null
}

export interface PeriodTotal {
  years: number
  months: number
  days: number
  total_days: number
  periods: number
}

export interface ExperiencePeriod {
  kind: 'work' | 'current' | 'study' | string
  title?: string | null
  subtitle?: string | null
  start?: string | null
  end?: string | null
  is_open?: boolean
  years: number
  months: number
  days: number
}

export interface Attestation {
  id: number
  position_name?: string | null
  assigned_at?: string | null
  due_at?: string | null
  status: 'planned' | 'passed' | 'failed' | 'cancelled' | string
  status_label?: string | null
  held_at?: string | null
  result?: string | null
  note?: string | null
  basis?: string | null
  overdue?: boolean
}

export interface T2Language { id: number; language_code: string; language_name?: string | null; level?: string | null; level_name?: string | null }
export interface T2Award { id: number; award_code?: string | null; award_name?: string | null; awarded_year?: number | null; document_number?: string | null }
export interface T2Elective { id: number; body_code?: string | null; body_name?: string | null; position?: string | null; period_from?: string | null; period_to?: string | null }
export interface T2Merit { id: number; kind: string; title: string; order_number?: string | null; order_date?: string | null; issued_by?: string | null; lifted_at?: string | null }
export interface T2Relative {
  id: number
  relation_code?: string | null
  relation_name?: string | null
  full_name?: string | null
  birth_date?: string | null
  birth_place?: string | null
  workplace?: string | null
  position?: string | null
  address?: string | null
}
export interface T2Vacation {
  id: number
  type_name?: string | null
  start_date?: string | null
  end_date?: string | null
  order_act_id?: number | null
  order_number?: string | null
  order_date?: string | null
  order_title?: string | null
}
export interface ExtraAttribute {
  code: string
  name: string
  value_type: 'text' | 'number' | 'date' | 'bool' | string
  value?: unknown
}

export interface T2Card {
  employee_id: number
  /** TZ C3 1062: sent back as `expected_updated_at` (naive UTC). */
  updated_at?: string | null
  values: T2Values
  nationality_name?: string | null
  military_obligation_name?: string | null
  military_rank_name?: string | null
  political_party_name?: string | null
  education_level_name?: string | null
  education_specialty_name?: string | null
  academic_degree_name?: string | null
  academic_title_name?: string | null
  birth_country_name?: string | null
  birth_region_name?: string | null
  birth_district_name?: string | null
  residence_region_name?: string | null
  residence_district_name?: string | null
  residence_country_name?: string | null
  names_ru?: Record<string, string>
  experience_total?: PeriodTotal | null
  study_total?: PeriodTotal | null
  experience_breakdown?: ExperiencePeriod[]
  attestations?: Attestation[]
  attestation_period_years?: number | null
  extra_attributes?: ExtraAttribute[]
  extra?: Record<string, unknown> | null
  archive?: { reason?: string | null; note?: string | null; reason_code?: string | null } | null
  languages?: T2Language[]
  awards?: T2Award[]
  elective_bodies?: T2Elective[]
  incentives?: T2Merit[]
  penalties?: T2Merit[]
  vacations?: T2Vacation[]
  relatives?: T2Relative[] | null
  relatives_visible?: boolean
}

export type T2Section = 'languages' | 'awards' | 'elective-bodies' | 'merits' | 'relatives'

export interface EmployeeDocument {
  id: number
  kind: string
  title?: string | null
  original_name?: string | null
  content_type?: string | null
  size_bytes?: number | null
  uploaded_at?: string | null
  url?: string | null
}

export interface EmployeeOrder {
  id: number
  act_number?: string | null
  act_date?: string | null
  name?: string | null
  summary?: string | null
  short_text?: string | null
  status?: string | null
  details?: { leave_from?: string | null; leave_to?: string | null } | null
  category_rel?: { id: number; name?: string | null; code?: string | null } | null
  effective_start_date?: string | null
  effective_end_date?: string | null
}

export interface EmployeeTraining {
  id: number
  training_type?: string | null
  training_type_label?: string | null
  program_name?: string | null
  provider?: string | null
  start_date?: string | null
  end_date?: string | null
  hours?: number | null
  status?: string | null
  result?: string | null
  certificate_number?: string | null
  file_url?: string | null
}

export interface CareerRow {
  employee?: { id: number; name?: string | null } | null
  job_position?: { id: number; name?: string | null } | null
  department?: { id: number; name?: string | null } | null
  from?: string | null
  to?: string | null
  basis?: string | null
}

export interface AsOfField {
  field: string
  label?: string | null
  value?: unknown
  current?: unknown
  source?: 'history' | 'current' | 'unknown' | string
  changed_after?: boolean
}
export interface AsOfResponse {
  employee_id: number
  as_of: string
  before_hire?: boolean
  hire_date?: string | null
  fields: AsOfField[]
  restored_fields?: number
  unknown_fields?: number
  note?: string | null
}

export interface HistoryItem {
  id: number
  at?: string | null
  action?: string | null
  action_label?: string | null
  actor?: string | null
  summary?: string | null
  basis_label?: string | null
  changes?: { field: string; label?: string | null; old?: unknown; value?: unknown }[]
}

export interface RelatedData {
  items?: { key: string; label: string; count: number }[]
  open_orders?: number
  current_trips?: number
  blocking_orders?: { id: number; number?: string | null; kind_label?: string | null }[]
}
