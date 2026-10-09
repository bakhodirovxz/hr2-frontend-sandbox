/* API endpoint paths. Only the subset needed for phase 1 (auth, branches,
 * dashboard, employees, notifications) is listed; extend as pages migrate.
 * Paths are relative to the API base (see api/client.ts). */

// Auth
export const AUTH_LOGIN = 'auth/login'
/** Self-hosted image challenge for the login form (`core/captcha.py`). */
export const AUTH_CAPTCHA = 'auth/captcha'
export const AUTH_REFRESH = 'auth/refresh'
export const AUTH_LOGOUT = 'auth/logout'
export const USER_INFO = 'auth/me'

// Organization
export const ORGANIZATION_BRANCHES = 'organization-branches'
export const ORGANIZATION_BRANCH_DETAIL = (pk: number | string) => `organization-branches/${pk}`
export const ORGANIZATION_BRANCH_LEADERS = (pk: number | string) => `organization-branches/${pk}/leaders`
export const ORGANIZATION_BRANCH_LEADER_DELETE = (pk: number | string, empId: number | string) =>
  `organization-branches/${pk}/leaders/${empId}`
/* The branch's own letterhead image, used on every document it generates. */
export const ORGANIZATION_BRANCH_UPLOAD_LOGO = (pk: number | string) => `organization-branches/${pk}/upload-logo`
export const ORGANIZATION_BRANCH_LOGO = (pk: number | string) => `organization-branches/${pk}/logo`
/* A ready-made .docx blank the branch uploads for one document type. */
export const ORGANIZATION_BRANCH_DOC_TEMPLATE = (pk: number | string, docType: string) =>
  `organization-branches/${pk}/document-template/${docType}`

// Employees
export const EMPLOYEES_LIST = 'employees'
/** A line manager's people with today's status («Mening jamoam»). */
export const EMPLOYEES_MY_TEAM = 'employees/my-team'
// XODIM TANLAGICHLARI uchun yengil ro'yxat (PII'siz), BARCHA filiallar bo'yicha:
// mehmon formasi, loyiha a'zolari, hujjat ulashish. `employees` ro'yxati PII
// sababli filial bilan cheklangan (EMPL-01) va bu tanlagichlar jimgina o'z
// filialiga qamalib qolgan edi (2026-08-22).
export const EMPLOYEE_PICKER_OPTIONS = 'employees/options'
export const EMPLOYEE_BIRTHDAYS = 'employees/birthdays'
/** Dry-run face check against a turnstile — saves nothing. */
export const EMPLOYEE_VALIDATE_PHOTO = 'employees/me/validate-photo'

// Reference data
export const DEPARTMENTS_LIST = 'departments'
export const JOB_POSITIONS_LIST = 'job-positions'

/* Org-chart topology (TZ 4.2.6). Nodes carry their own canvas coordinates, so
   the chart is stored, not re-laid-out on every load. */
export const HIERARCHIES = 'hierarchies'
export const HIERARCHY = (pk: number | string) => `hierarchies/${pk}`
export const HIERARCHY_CONNECTIONS = 'hierarchy-connections'
export const HIERARCHY_CONNECTION = (pk: number | string) => `hierarchy-connections/${pk}`
/* Every write snapshots the structure; these read those snapshots back. */
export const STRUCTURE_HISTORY_AS_OF = 'structure-history/as-of'

// Guests (visitors)
export const VISITORS_LIST = 'visitors'

// Orders (order-acts) — EDO document flow
export const ORDER_ACTS = 'order-acts'

// Order types (order-act categories)
export const ORDER_ACT_CATEGORIES = 'order-act-categories'

// Holidays
export const HOLIDAYS_LIST = 'holidays'

// Phone directory
export const PHONE_DIRECTORY = 'employees/phone-directory'
/** Branch employees in picker form (name, position, department, photo). */
/** PII'siz yengil ro'yxat (tanlagichlar uchun) — `Page[EmployeeOption]`. */
export const EMPLOYEES_PICKER = 'employees/options'

// Audit log
export const AUDIT_LOGS = 'audit-logs'

// Video guides
export const VIDEO_GUIDES = 'video-guides'

// Letters (bildirgi / ariza / xizmat safari) — EDO document flow
export const LETTERS_LIST = 'letters'

// Documents (folders + files)
export const FOLDERS_LIST = 'folders'
export const FILES_LIST = 'files'
export const FILE_BLANK = 'files/blank'
export const FILE_UPLOAD = 'files/upload'

// Attendance / turnstile
export const TURNSTILE_ATTENDANCE_EVENTS = 'turnstile-attendance-events'
export const TURNSTILE_DAY_BOARD = 'turnstile-attendance-events/day-board'
export const VISITOR_TURNSTILE_ATTENDANCE = 'turnstile-attendance-events/visitors'

// Employees — KPI overview (rich HR page)
export const DASHBOARD_EMPLOYEE_KPI = 'dashboard/employee-kpi'
export const DASHBOARD_AGE_STATS = 'dashboard/age-stats'
export const DASHBOARD_NATIONALITY_STATS = 'dashboard/nationality-stats'
export const DASHBOARD_KPI_MONTHLY_AVERAGE = 'dashboard/kpi-monthly-average'
export const DASHBOARD_CARDS_SUMMARY = 'dashboard/cards-summary'
export const DASHBOARD_TASK_EXECUTION_ATTENDANCE = 'dashboard/task-execution-attendance'

// Dashboard
export const DASHBOARD_MAIN = 'dashboard/main'
export const DASHBOARD_EMPLOYEES_BY_CATEGORY = 'dashboard/employees-by-category'
export const DASHBOARD_DEPARTMENTS_EMPLOYEE_COUNT = 'dashboard/departments-employee-count'
export const DASHBOARD_JOB_POSITION_STATS = 'dashboard/job-position-stats'
export const DASHBOARD_TODAY_VISITOR_COUNT = 'dashboard/today-visitor-count'

// Projects (kanban workspaces)
export const WORKSPACES_LIST = 'workspaces'
export const COLUMNS_LIST = 'columns'
export const CARDS_LIST = 'cards'

// Content
export const NEWS_POSTS = 'news-posts'

// Notifications
export const NOTIFICATIONS_LIST = 'notifications'
export const NOTIFICATIONS_READ_ALL = 'notifications/read-all'

// Work leaves (pending-signature badge)
export const WORK_LEAVES = 'work-leaves'
export const WORK_LEAVES_EXPORT = 'work-leaves/export/excel'
export const WORK_LEAVES_MY_APPROVERS = 'work-leaves/my-approvers'
export const WORK_LEAVES_RULES = 'work-leaves/rules'
export const WORK_LEAVES_HR_BULK_TRIP = 'work-leaves/hr-bulk-create'

// Telefondan «keldim» — xizmat safaridagi xodim (2026-10-06)
export const MOBILE_CHECKINS = 'mobile-checkins'
export const MOBILE_CHECKIN_CANCEL = (id: number) => `mobile-checkins/${id}/cancel`

// Monitoring (live wall)
export const DASHBOARD_OVERDUE_TASKS = 'dashboard/overdue-tasks'
export const DASHBOARD_LATE_EMPLOYEES_FREQUENT = 'dashboard/late-employees/frequent'
export const TASKS_OVERDUE = 'tasks-overdue'

// Staffing (shtat jadvali / vakansiya) — the kadr headcount truth
export const STAFF_POSITIONS = 'staff-positions'
export const STAFF_POSITIONS_SUMMARY = 'staff-positions/summary'

// Discipline — the month's lateness ranking
export const DASHBOARD_LATE_EMPLOYEES_TOTAL_TIME = 'dashboard/late-employees/most-frequent-total-time'

// ── TZ 4.2.5 — Ma'lumotnomalar ────────────────────────────────────────────
export const DICTIONARIES = 'dictionaries'
export const DICTIONARIES_SYNC = 'dictionaries/sync-catalog'
export const DICTIONARY_ENTRIES = (code: string) => `dictionaries/${code}/entries`
export const DICTIONARY_OPTIONS = (code: string) => `dictionaries/${code}/options`
export const DICTIONARY_IMPORT = (code: string) => `dictionaries/${code}/import`
export const DICTIONARY_EXPORT = (code: string) => `dictionaries/${code}/export`
export const DICTIONARY_ENTRY = (pk: number | string) => `dictionaries/entries/${pk}`
export const DICTIONARY_ENTRY_USAGE = (pk: number | string) => `dictionaries/entries/${pk}/usage`

// ── TZ 4.2.6 / 4.2.10 — Shtat va vakant o'rinlar ──────────────────────────
export const STAFF_POSITION_DETAIL = (pk: number | string) => `staff-positions/${pk}`
export const STAFF_POSITION_CHANGES = (pk: number | string) => `staff-positions/${pk}/changes`
export const STAFF_POSITION_CLOSE = (pk: number | string) => `staff-positions/${pk}/close`
export const STAFF_POSITION_REOPEN = (pk: number | string) => `staff-positions/${pk}/reopen`
export const STAFF_POSITIONS_ISSUES = 'staff-positions/issues'
export const STAFF_POSITIONS_EXPORT_EXCEL = 'staff-positions/export-excel'
export const STAFF_POSITIONS_EXPORT_PDF = 'staff-positions/export-pdf'
export const STAFF_POSITIONS_EXPORT_XML = 'staff-positions/export-xml'

// ── TZ 4.2.7 — T-2 shaxsiy kartochkasi ────────────────────────────────────
export const EMPLOYEE_T2 = (pk: number | string) => `employees/${pk}/t2`
/** section: languages | awards | elective-bodies | merits | relatives */
export const EMPLOYEE_T2_SECTION = (pk: number | string, section: string) =>
  `employees/${pk}/t2/${section}`

// ── TZ 4.2.12 — Interaktiv xizmatlar ──────────────────────────────────────
export const SERVICE_REQUESTS = 'service-requests'
export const SERVICE_REQUESTS_MY = 'service-requests/my'
export const SERVICE_REQUESTS_CATALOG = 'service-requests/catalog'
export const SERVICE_REQUEST = (pk: number | string) => `service-requests/${pk}`
export const SERVICE_REQUEST_CANCEL = (pk: number | string) => `service-requests/${pk}/cancel`
export const SERVICE_REQUEST_STATUS = (pk: number | string) => `service-requests/${pk}/status`
export const SERVICE_REQUEST_DOCUMENT = (pk: number | string) => `service-requests/${pk}/document`

// ── TZ 4.2.7 — Kadrlar hisobi: to'liq CRUD va yordamchi amallar ───────────
export const EMPLOYEE_DETAIL = (pk: number | string) => `employees/${pk}`
export const EMPLOYEE_SET_PASSWORD = (pk: number | string) => `employees/${pk}/set-password`
export const EMPLOYEE_SYNC_TURNSTILE = (pk: number | string) => `employees/${pk}/sync-turnstile`
/**
 * Ish o'rinlari (o'rindoshlik) — bitta shaxs, bir nechta lavozim.
 *
 * `EMPLOYEE_LOOKUP` — JSHSHIR bo'yicha «bu odam tizimda bormi». Xodim
 * qo'shishda takror JSHSHIR endi boshi berk ko'cha emas: forma odamni tanib,
 * uni o'rindosh sifatida biriktirishni taklif qiladi.
 */
export const EMPLOYEE_LOOKUP = 'employees/lookup'
export const EMPLOYEE_ASSIGNMENTS = (pk: number | string) => `employees/${pk}/assignments`
export const EMPLOYEE_ASSIGNMENT = (pk: number | string) => `employees/assignments/${pk}`
export const EMPLOYEE_ASSIGNMENT_CLOSE = (pk: number | string) =>
  `employees/assignments/${pk}/close`
/**
 * Filialdan filialga O'TKAZISH — o'rindoshlikdan farqli: xodimning ASOSIY ish
 * joyi almashadi. Darhol kuchga kiradi, eski filial arxividan qabul qiladi
 * yoki rad etadi (rad etilsa hammasi qaytariladi).
 */
export const EMPLOYEE_TRANSFER = (pk: number | string) => `employees/${pk}/transfer`
export const EMPLOYEE_TRANSFER_ACCEPT = (pk: number | string) =>
  `employees/transfers/${pk}/accept`
export const EMPLOYEE_TRANSFER_REJECT = (pk: number | string) =>
  `employees/transfers/${pk}/reject`
export const EMPLOYEES_EXPORT_EXCEL = 'employees/export-excel'
export const EMPLOYEE_SELF_UPDATE = 'employees/me/self-update'
/**
 * Self-service password change for ANY account type.
 *
 * `employees/me/self-update` 404s for a login with no employee row — the site
 * master admin's password lives on `User` — so that route could not be the one
 * the settings screen uses. This one works off `current_user.id` and demands
 * the current password just the same.
 */
export const AUTH_ME_PASSWORD = 'auth/me/password'
export const ORGANIZATION_BRANCH_SYNC_EMPLOYEES = (pk: number | string) =>
  `organization-branches/${pk}/sync-employees-to-hik`

// ── Sessiyalar (shaxsiy kabinet, TZ 4.2.4) ────────────────────────────────
export const SESSIONS = 'sessions'
export const SESSION_DETAIL = (id: number | string) => `sessions/${id}`

// ── Global qidiruv (TZ 4.1.7) ─────────────────────────────────────────────
export const SEARCH = 'search'
export const SEARCH_SOURCES = 'search/sources'

// ── Ro'yxatdan o'tish moduli (TZ 4.2.2) ───────────────────────────────────
export const REGISTER = 'auth/register'
export const REGISTER_OPTIONS = 'auth/register/options'
export const REGISTRATIONS = 'registrations'
export const REGISTRATION_ME = 'registrations/me'
export const REGISTRATION_APPROVE = (pk: number | string) => `registrations/${pk}/approve`
export const REGISTRATION_REJECT = (pk: number | string) => `registrations/${pk}/reject`

// ── QR orqali kirish (TZ 4.2.3) ───────────────────────────────────────────
export const QR_START = 'auth/qr/start'
export const QR_STATUS = 'auth/qr/status'
export const QR_CLAIM = 'auth/qr/claim'

// ── Foydalanuvchilar (TZ 4.2.1) ─────────────────────────────────
export const ADMINS = 'admins'
export const ADMIN = (pk: number | string) => `admins/${pk}`
export const ADMIN_SEND_PASSWORD = (pk: number | string) => `admins/${pk}/send-password-email`
export const EMPLOYEE_ACTIVATE = (pk: number | string) => `employees/${pk}/activate`
export const EMPLOYEE_DEACTIVATE = (pk: number | string) => `employees/${pk}/deactivate`

// ── Murojaatlar statistikasi (TZ 4.2.11) ──────────────────────────────────
export const SERVICE_REQUEST_STATISTICS = 'service-requests/statistics'

// ── Davomat hodisalari (jonli tashrif paneli kun bo'yicha eksporti) ───────
export const TURNSTILE_NORMALIZED_EXPORT = 'turnstile-attendance-events/normalized/export-excel'

// ── ISAPI qurilmalari (litsenziya tugagan turniketlar uchun qurilma API'si) ─
// Bu turniketlar Hik markaziy serveriga ULANMAYDI; tizim ular bilan
// bevosita gaplashadi, shu bois hisob ma'lumotlari, tirik-tekshiruv va
// xodimlarni qurilmaga yuklash alohida marshrutlarda turadi.
export const ISAPI_DEVICES = 'isapi-devices'
export const ISAPI_DEVICE_CREDENTIALS = (pk: number | string) => `isapi-devices/${pk}/credentials`
export const ISAPI_DEVICE_TEST = (pk: number | string) => `isapi-devices/${pk}/test`
export const ISAPI_DEVICE_POLL = (pk: number | string) => `isapi-devices/${pk}/poll`
export const ISAPI_DEVICE_SYNC_EMPLOYEES = (pk: number | string) => `isapi-devices/${pk}/sync-employees`
export const ISAPI_DEVICE_UNKNOWN_USERS = (pk: number | string) => `isapi-devices/${pk}/unknown-users`

// ── Turniket eshiklari ────────────────────────────────────────────────────
// Bitta turniketda bir nechta eshik bo'ladi va HAR BIRINING yo'nalishi
// (kirish/chiqish) alohida belgilanadi — davomat aynan shu yo'nalishdan
// hisoblanadi, shu bois eshik CRUD'i kerak.
export const TURNSTILE_DOORS = 'turnstile-doors'
export const TURNSTILE_DOOR_DETAIL = (pk: number | string) => `turnstile-doors/${pk}`

// ── Hik markaziy serveri bilan sinxronizatsiya ────────────────────────────
export const HIK_SYNC_ACCESS_LISTS = 'hik-sync/access-lists'
export const HIK_SYNC_DEVICES = 'hik-sync/devices'
export const HIK_SYNC_DOORS = 'hik-sync/doors'

// ── Hik monitoringi ───────────────────────────────────────────────────────
export const HIK_AUDIT_LOGS = 'hik-monitoring/audit-logs'
export const HIK_REFRESH_DEVICES = 'hik-monitoring/refresh-devices'
export const HIK_DEVICE_DETAIL = (turnstileId: number | string) => `hik-monitoring/devices/${turnstileId}`
export const HIK_DEVICE_DOOR_DIRECTION = (turnstileId: number | string, doorId: number | string) =>
  `hik-monitoring/devices/${turnstileId}/doors/${doorId}/direction`

// ── Zoom ──────────────────────────────────────────────────────────────────
// `availability` — tanlangan oraliqda bo'sh Zoom hisobi bormi (yig'ilish
// yaratishdan OLDIN so'raladi); `start-url` faqat mezbonga beriladigan bir
// martalik havola; `archive` esa tugagan yig'ilishlarni ommaviy tozalash.
export const ZOOM_AVAILABILITY = 'zoom-meetings/availability'
export const ZOOM_ARCHIVE = 'zoom-meetings/archive'
export const ZOOM_MEETING_PURGE = (pk: number | string) => `zoom-meetings/${pk}/purge`
export const ZOOM_MEETING_START_URL = (pk: number | string) => `zoom-meetings/${pk}/start-url`
export const ZOOM_LIVE = 'zoom-meetings/live'
export const ZOOM_MEETING_START = (pk: number | string) => `zoom-meetings/${pk}/start`
export const ZOOM_MEETING_RECORDING = (pk: number | string) => `zoom-meetings/${pk}/recording`

// ── Texnik yordam ─────────────────────────────────────────────────────────
export const SUPPORT_TICKET_RATINGS = 'support-tickets/ratings'
export const SUPPORT_TICKET_PARTICIPANTS = (pk: number | string) => `support-tickets/${pk}/participants`
export const SUPPORT_TICKET_PARTICIPANT = (pk: number | string, employeeId: number | string) =>
  `support-tickets/${pk}/participants/${employeeId}`

// ── Loyiha kartasi izohlari ───────────────────────────────────────────────
export const CARD_COMMENTS = (pk: number | string) => `cards/${pk}/comments`
export const CARD_COMMENT_DETAIL = (commentId: number | string) => `cards/comments/${commentId}`
export const CARD_COMMENT_ATTACHMENTS = (commentId: number | string) =>
  `cards/comments/${commentId}/attachments`

// ── Shtat jadvali ─────────────────────────────────────────────────────────
// `bulk-upsert` — jadvalni bir so'rovda ommaviy yangilash; `export-columns`
// eksport uchun mavjud ustunlar ro'yxati; `notify-settings` esa vakansiya
// xabarnomasi kimga borishini boshqaradi.
export const STAFF_POSITIONS_BULK_UPSERT = 'staff-positions/bulk-upsert'
export const STAFF_POSITIONS_EXPORT_COLUMNS = 'staff-positions/export-columns'
export const STAFF_POSITIONS_NOTIFY_SETTINGS = 'staff-positions/notify-settings'

/**
 * KIOSK (multi-modal) ACCOUNTS — the logins a turnstile/monitoring kiosk uses.
 *
 * The backend has offered full CRUD here since the module was written; v2 had
 * no screen for it at all, so a kiosk account could only be created by calling
 * the API directly. Admin / master-admin only: the catalogue carries a PIN
 * (JSHSHIR), which is why the list route is gated too.
 */
export const MULTI_MODAL_USERS = 'multi-modal-users'
export const MULTI_MODAL_USER = (pk: number | string) => `multi-modal-users/${pk}`
export const MULTI_MODAL_USER_SEND_PASSWORD = (pk: number | string) =>
  `multi-modal-users/${pk}/send-password-email`

/**
 * DECREE .docx TEMPLATES. Also full CRUD on the server with no v2 screen —
 * uploads are multipart `Form(...)`, a JSON body is rejected with 422.
 */
export const ORDER_ACT_CATEGORY_TEMPLATES = 'order-act-category-templates'
export const ORDER_ACT_CATEGORY_TEMPLATE = (pk: number | string) =>
  `order-act-category-templates/${pk}`

// Hisobotlar — the generic report engine (backend `api/v1/reports.py`).
export const REPORTS_CATALOG = 'reports/catalog'
export const REPORT_RUN = (code: string) => `reports/${code}/run`
export const REPORT_OPTIONS = (code: string, param: string) => `reports/${code}/options/${param}`
export const REPORT_PREFS = (code: string) => `reports/${code}/preferences`
export const REPORT_TEMPLATES = (code: string) => `reports/${code}/templates`
export const REPORT_TEMPLATE = (code: string, id: number | string) => `reports/${code}/templates/${id}`
