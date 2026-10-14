import type { Actor, ModuleCode, PermissionLevel } from '@/auth/permissions'
/* Domain types shared across the app. These model the hr-api responses we
 * consume; they intentionally keep optional fields loose where the backend is
 * permissive. Extend as more pages are migrated. */

/** ⚠️ `guest` — TZ 4.2.2 dagi ro'yxatdan o'tgan, ammo shaxsi hali
 *  TASDIQLANMAGAN hisob (backend `User(type='guest')`). U xodim EMAS: xodim
 *  kartochkasi yo'q, shu sababli xodimga bog'liq har qanday ekran unga
 *  bo'sh ko'rinadi va menyusi alohida. */
/**
 * Account types the API actually issues. `admin` is a branch/system admin with
 * no employee card; `monitoring-operator` is a post/kiosk account (KPP or
 * monitoring) — also without an employee card, but scoped to a branch.
 *
 * ⚠️ The union used to list only employee/master-admin/guest, so every check
 * against the other two was untypeable and the classifier silently treated a
 * kiosk account as an ordinary employee.
 */
export type UserType =
  | 'employee'
  | 'master-admin'
  | 'admin'
  | 'guest'
  // Post/kiosk accounts: a KPP checkpoint and a monitoring station.
  | 'monitoring-operator'
  | 'kpp'

export type MultiOrgRole =
  | 'hr'
  | 'kpp'
  | 'ministr'
  | 'deputy'
  | 'chancellery'
  | 'kanselariya'
  | 'monitoring_operator'
  | 'monitoring'
  | 'accounting'
  | 'dashboard'
  | (string & {})

export interface JobPosition {
  id?: number
  name?: string
  short_name?: string | null
  razryad?: number | null
  organization_branch_id?: number
  /** rahbar | mutaxassis | xizmatchi | ishchi — shtat ekrani shu bo'yicha
   *  filtrlaydi, forma esa uni hech qachon qo'ymasdi. */
  category?: string | null
}

export interface Department {
  id?: number
  name?: string
  organization_branch_id?: number
  /** Embedded by DepartmentRead — present on employee payloads. */
  organization_branch?: OrganizationBranch | null
  /** TZ S1 «код подразделения» — filial ichida noyob. */
  code?: string | null
  has_navbatchilik?: boolean
  /** Jadval o'zgargan — bo'lim rahbari tasdiqlashi kutilmoqda. */
  navbatchilik_needs_approval?: boolean
  navbatchilik_approved_at?: string | null
  is_secretariat?: boolean
}

export interface StampCoords {
  number: [number, number]
  day: [number, number]
  month: [number, number]
  year: [number, number]
  font_pct: number
}

export interface TabelConfig {
  approver?: { org?: string; title?: string; name?: string }
  title_prefix?: string
  signers?: { position: string; name: string }[]
  stamp_coords?: Partial<StampCoords>
  registration_start?: number | null
  guvohnoma_number_prefix?: string | null
  guvohnoma_number_start?: number | null
  /**
   * This branch's own lateness tolerance in minutes. `null`/absent means "use
   * the system-wide setting" — an untouched branch keeps behaving exactly as
   * it did, while a branch that starts earlier or works shifts can set its own.
   */
  late_grace_minutes?: number | null
  /**
   * This branch's own working day, "HH:MM". Absent means "use the system-wide
   * setting"; an employee whose card carries hours is unaffected either way.
   */
  default_work_start?: string | null
  default_work_end?: string | null
  default_lunch_start?: string | null
  default_lunch_end?: string | null
  /** Branch-wide «avtomatik to'liq ish kuni» for the general tabel. */
  auto_full_day?: boolean | null
}

export interface OrganizationBranch {
  id: number
  name: string
  employee_count?: number
  latitude?: number | null
  longitude?: number | null
  /** A branch can span several regions; older rows only carry `region`. */
  region?: string | null
  regions?: string[] | null
  address?: string | null
  tabel_config?: TabelConfig | null
  stamp_path?: string | null
  /** The branch's own letterhead image; absent means the shared one is used. */
  logo_path?: string | null
  bildirgi_number_prefix?: string | null
  ariza_number_prefix?: string | null
  /** Per-document-type blank settings — see `features/tabel/useBranchBlank`. */
  document_templates?: Record<string, unknown> | null
  /**
   * TOPOLOGY — which role this branch plays in the system.
   *
   * These used to be literal ids in the backend (`MAIN_BRANCH_ID = 1`,
   * `SIHATGOH_BRANCH_ID = 30`), which binds the rules to one database: on
   * another installation the same number is a different organisation and the
   * mistake is silent. They are now properties of the row, set from the branch
   * form.
   */
  is_head_office?: boolean
  is_medical_center?: boolean
  /** Branches sharing ONE physical turnstile set carry the same label. */
  terminal_group?: string | null
}

export interface Employee {
  id: number
  /** May the viewer PATCH this card — stamped on the `/employees` list
   *  (HR within branch scope, or a line manager over a subordinate). */
  can_edit?: boolean | null
  /**
   * Identity block, shown read-only on the profile. The SERVER decides how much
   * of it travels: `EmployeeService.mask_detail_pii` gives HR and the master
   * admin the full value, ministr/deputy/admin only the last four characters
   * ("*****4567"), everyone else null — and an archived card is masked for all.
   * So the client renders whatever arrives and never re-derives the rule.
   */
  gender?: string | null
  nationality?: string | null
  maritial_status?: string | null
  pasport_series?: string | null
  pasport_number?: string | null
  pasport_individual_number?: string | null
  pasport_issue_by?: string | null
  personal_identification_number?: string | null
  taxpayer_identification_number?: string | null
  individual_accumulative_pension_account_number?: string | null
  address?: string | null
  legal_name?: string
  first_name?: string
  last_name?: string
  photo_path?: string | null
  photo_thumb_path?: string | null
  is_multi_org_user?: boolean
  multi_org_employee_role?: MultiOrgRole | MultiOrgRole[] | null
  organization_branches?: OrganizationBranch[]
  organization_branch_id?: number
  department?: Department | null
  job_position?: JobPosition | string | null
  supervisor_id?: number | null
  /** Direct manager. Work-leave requests route to this person. */
  supervisor?: { id?: number; legal_name?: string | null } | null
  is_head_department?: boolean
  /** Extra KPI-admin flag (separate column from multi_org_employee_role). */
  is_kpi_admin?: boolean
  password_change_warning?: boolean
  /** dashboard/employees-by-category — leave lists carry the specific reason. */
  category_name?: string | null
  /** Present on the paginated employees list (masked for non-privileged viewers). */
  phone_number?: string | null
  /** KPP short-dial. `employees-by-category` returns it on every roster row. */
  internal_phone_number?: string | null
  job_acceptance_date?: string | null
  department_id?: number | null
  job_position_id?: number | null
  /** Shift window, "HH:MM:SS". Attendance compares arrivals against it. */
  working_hours_start?: string | null
  working_hours_end?: string | null
  /** Working weekdays, MONDAY-indexed (0 = Monday) — not dayjs's day(). */
  working_days?: number[] | null
  /**
   * Archived people keep a readable card and lose everything else: the server
   * refuses writes and their login is gone. `EmployeeRead` carries this flag
   * for exactly one reason — so the profile can hide edit and archive rather
   * than offer buttons that answer 400.
   */
  is_archived?: boolean | null
  archived_at?: string | null
}

export interface User {
  id: number
  type: UserType
  username?: string
  /** Hisobdagi F.I.Sh. (xodim kartasi bo'lmagan hisoblar uchun). */
  /** TZ L2: phone and photo of an account (card holders: from the card). */
  phone_number?: string | null
  photo_url?: string | null
  full_name?: string | null
  email?: string | null
  is_active?: boolean
  last_login_at?: string | null
  /** TZ A1/A2 — `{modul: none|view|edit|full}` (`src/auth/permissions.ts`). */
  permissions?: Partial<Record<ModuleCode, PermissionLevel>>
  /** Ssenariy aktyori va modul bo'yicha yozish ko'lami (`core/access_policy.py`). */
  actor?: Actor | null
  /** Tayinlangan rol (`permission_groups`). */
  role?: { id: number; code?: string | null; name: string } | null
  /** U1 — vaqtinchalik parol: almashtirmaguncha boshqa amal yopiq. */
  must_change_password?: boolean
  /** Boshlang'ich parol hali almashtirilmagan (eslatma, majburiy emas). */
  default_password?: boolean
  /** TZ U2 — harakatsizlikda chiqish muddati, daqiqa (0 — o'chirilgan). */
  idle_timeout_minutes?: number
  /** Ikki bosqichli kirish (kod emailga). */
  two_factor_enabled?: boolean
  master_admin?: unknown
  /**
   * Admin profile row, NOT a flag.
   *
   * `/auth/me` returns the whole `AdminRead` object (id, email,
   * `permission_group_id`, `organization_branch_id`, `photo_path`) — verified
   * live: an `admin` account comes back with `organization_branch_id: 1`.
   * Typing it as a boolean cost us the branch: `canRunHikSync` could not tell a
   * branch-scoped admin from a global one, so the button appeared for both and
   * the branch-scoped one got a 403 on press. Truthiness still works
   * (`!!user?.admin`), so existing call sites are unaffected.
   */
  admin?: {
    id?: number
    email?: string | null
    permission_group_id?: number | null
    organization_branch_id?: number | null
    photo_path?: string | null
  } | null
  /** KPI is gated to the head branch (plus master-admin/ministr/kpi_admin). */
  kpi_enabled?: boolean
  /**
   * Module stewardship, computed server-side from `module_responsibles`
   * (`/auth/me`). A department head can be made responsible for News or Ijro
   * without being HR, so the flag is the only honest source for those buttons.
   */
  is_news_manager?: boolean
  is_ijro_manager?: boolean
  /** Medical module flags (`/auth/me`) — see `core.scoping.medical_enabled`. */
  medical_enabled?: boolean
  is_doctor?: boolean
  is_med_head?: boolean
  is_medical_manager?: boolean
  is_labor_safety?: boolean
  medical_can_export?: boolean
  /**
   * Branches where this account is the NURSE (`/auth/me`). Gates the daily
   * health check, which is a separate module from the medical register.
   */
  nurse_branch_ids?: number[]
  /** Branches where the user edits phone-book numbers (`phone_editor`). */
  phone_editor_branch_ids?: number[]
  transport_branch_ids?: number[]
  transport_approver_branch_ids?: number[]
  /** Server verdict: HR bound to the head office (`/me`). */
  is_executive_hr?: boolean
  /** Departments this person heads — a line manager may open a record there. */
  headed_department_ids?: number[]
  /** Server verdict: heads a department or has subordinates (`/me`). Opens «Hisobotlar». */
  is_line_manager?: boolean
  medical_specialties?: { id: number; name?: string | null }[]
  employee?: Employee | null
  password_change_warning?: boolean
  /**
   * Password rotation (`/auth/me`, 2026-09-15). `password_must_change` = the
   * server now refuses every route but the change-password ones (403
   * `password_expired`) — the shell draws the blocking dialog
   * (`features/auth/PasswordGate`). `password_days_left` feeds the warning
   * strip before that happens; null when rotation is off or the login is
   * SSO-only.
   */
  password_expired?: boolean
  password_must_change?: boolean
  password_expires_at?: string | null
  password_days_left?: number | null
  is_secretariat?: boolean
  is_navbatchi?: boolean
  /** In a duty group as a VIEWER only — sees the roster, cannot edit it.
   *  Both flags are computed on `/auth/me` (`app/api/v1/auth.py`). */
  is_navbatchi_viewer?: boolean
  hr_branch_ids?: number[]
  /**
   * The KPP/monitoring kiosk record, when this account is one. It carries the
   * post's branches — the only scoping such an account has, since it has no
   * employee card and therefore no department.
   */
  multi_modal_user?: { id?: number; role?: string | null; organization_branch_ids?: number[] } | null
  deputy_branch_ids?: number[]
  director_branch_ids?: number[]
  akt_branch_ids?: number[]
  accounting_branch_ids?: number[]
  legal_branch_ids?: number[]
  chancellery_branch_ids?: number[]
  support_enabled_branch_ids?: number[]
}

export interface LoginResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  user?: User
}

/** Standard paginated list envelope used by many list endpoints. */
export interface Paginated<T> {
  items: T[]
  count?: number
  page?: number
  pages?: number
  size?: number
}

/** Either a bare array or a paginated envelope. */
export type ListResponse<T> = T[] | Paginated<T>

export function toItems<T>(res: ListResponse<T> | undefined | null): T[] {
  if (!res) return []
  return Array.isArray(res) ? res : res.items ?? []
}
