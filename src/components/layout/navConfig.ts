import {
  BarChart3,
  BookMarked,
  Briefcase,
  CalendarCheck,
  CalendarClock,
  Smartphone,
  CalendarDays,
  Car,
  ClipboardCheck,
  ClipboardList,
  FileClock,
  FolderOpen,
  Handshake,
  Home,
  Activity,
  GraduationCap,
  Layers,
  Link2,
  Building2,
  HeartPulse,
  Palette,
  MonitorSmartphone,
  UserCheck,
  Stethoscope,
  KanbanSquare,
  LifeBuoy,
  Newspaper,
  ListChecks,
  Mails,
  MonitorDot,
  Network,
  Phone,
  PieChart,
  Settings,
  ShieldCheck,
  UserCog,
  UserPlus,
  UserRoundCheck,
  Users,
  Video,
  type LucideIcon,
  DoorOpen,
  UsersRound,
} from 'lucide-react'
import i18n from 'i18next'
import type { User } from '@/types'
import type { Translation } from '@/i18n/uz'
import * as roles from '@/auth/roles'

/** i18n key under `nav.*` — the sidebar renders t(`nav.${labelKey}`). */
export type NavKey = keyof Translation['nav']

/** Sidebar section headings (EDO style). These are LABELS ONLY — nothing
 *  collapses, so every entry stays one click away (the flat-nav decision
 *  below still holds); they just break a long list into readable bands. */
export type NavSection = 'main' | 'documents' | 'stats' | 'admin'

/** The sidebar is intentionally FLAT — every entry is a plain top-level link.
 *  No submenus (they made items harder to find). */
export interface NavItem {
  labelKey: NavKey
  path: string
  icon: LucideIcon
  section?: NavSection
  needsSupervisor?: boolean
  needsChairmanTasks?: boolean
}

/**
 * ⚠️ THE MODULE CATALOGUE — one entry per navigable module, and the only
 * place that says who sees it by default.
 *
 * WHY A CATALOGUE INSTEAD OF ONE ARRAY PER ROLE: the menu used to be six
 * hand-maintained arrays. Adding a module meant editing every array that
 * should have it and remembering every array that should not, and the master
 * admin could not change any of it without a deploy. Now each module declares
 * its own default audience, and the master admin overrides that from the
 * settings screen (`nav.modules`), CMS-style.
 *
 * `defaultRoles` is the FALLBACK, not the rule: whatever the admin saves in
 * `nav.modules` wins. Defaults were derived from a live 5-role x 30-route
 * sweep — a role that gets 403 on a page is not given that page here.
 *
 * ROUTES ARE NOT AFFECTED. Hiding a module hides the sidebar entry; the route
 * in `App.tsx` keeps working, so links and bookmarks survive.
 */
interface ModuleDef {
  /** Stable id used by the settings payload. NEVER rename — it is stored. */
  key: string
  labelKey: NavKey
  path: string
  icon: LucideIcon
  section: NavSection
  defaultRoles: roles.RoleKey[]
  /** Extra gates that no setting may override (data or licence bound). */
  needsSupervisor?: boolean
  needsChairmanTasks?: boolean
  /** KPI is open only where the branch has it enabled (see core/scoping). */
  needsKpi?: boolean
  /**
   * Backed by a route that answers `employee_required` — a login with no
   * employee record (monitoring operator, guest account) can only ever get a
   * 400 there, so the module must not appear for one.
   */
  needsEmployee?: boolean
  /**
   * The medical register is open only to clinic staff and leadership — the
   * server computes it (`core.scoping.medical_enabled`) and reports it on
   * `/auth/me`, so no role list here could stand in for it.
   */
  needsMedical?: boolean
  /**
   * The nurse's daily check is a DIFFERENT module from the medical register:
   * it belongs to whoever is a nurse in some branch (`nurse_branch_ids`), plus
   * the site master-admin who configures it.
   */
  needsHealth?: boolean
  /**
   * The duty roster belongs to whoever is actually on one: a member, a viewer,
   * or anyone in a department that runs one. v1 showed «Navbatchilik» to every
   * such employee; v2 had it as ADMIN_HR only, so the people who are ON the
   * roster were the one group that could not see it.
   */
  needsDuty?: boolean
  /** Report engine: privileged roles, or a plain employee who is a line manager / KPI admin. */
  needsReports?: boolean
  /** «Mening jamoam»: only for someone who manages people (`is_line_manager`). */
  needsTeam?: boolean
  /**
   * Avtopark: transport officer or fleet approver of some branch (`/auth/me`
   * transport_branch_ids / transport_approver_branch_ids — the same rows
   * `VehicleService.can_view_fleet` reads). Everyone else was shown the item
   * and then «Avtopark sizga ochiq emas»; cars are requested inside the trip
   * letter, not here.
   */
  needsFleet?: boolean
}

const ALL: roles.RoleKey[] = [
  'masterAdmin', 'ministr', 'deputy', 'hr', 'chancellery',
  'accounting', 'dashboard', 'monitoring', 'kpp', 'nazoratchi', 'employee',
]
const ADMIN_ONLY: roles.RoleKey[] = ['masterAdmin']
const ADMIN_HR: roles.RoleKey[] = ['masterAdmin', 'hr']
const ADMIN_HR_LEAD: roles.RoleKey[] = ['masterAdmin', 'hr', 'ministr', 'deputy']

export const MODULES: ModuleDef[] = [
  /* Asosiy */
  { key: 'home', labelKey: 'home', path: '/', icon: Home, section: 'main', defaultRoles: [...ALL, 'guest'] },
  // ⚠️ Ro'yxat KENG, darvoza `needsChairmanTasks` da (KPI'ning `needsKpi` si kabi):
  // `canAccessChairmanTasks` kotibiyat + rais + master-adminni kiritadi, lekin
  // kotibiyat a'zosining roli `employee` — `ADMIN_ONLY` uni bayroq tekshirilishidan
  // OLDIN kesib tashlardi, ya'ni modul aynan uni yuritadigan bo'limdan yashirin edi.
  { key: 'chairmanTasks', labelKey: 'chairmanTasks', path: '/chairman-tasks', icon: CalendarCheck, section: 'main', defaultRoles: ALL, needsChairmanTasks: true },
  { key: 'kpi', labelKey: 'kpi', path: '/kpi', icon: BarChart3, section: 'main', defaultRoles: ALL, needsKpi: true },
  // Verifix «Руководитель»: subordinates, their cards and their day. Every
  // role may hold people, so the audience is wide and the gate is the flag.
  { key: 'team', labelKey: 'team', path: '/mening-jamoam', icon: UsersRound, section: 'main', defaultRoles: ALL, needsTeam: true },
  { key: 'services', labelKey: 'services', path: '/interaktiv-xizmatlar', icon: Handshake, section: 'main', defaultRoles: [...ALL, 'guest'] },
  { key: 'support', labelKey: 'support', path: '/texnik-yordam', icon: LifeBuoy, section: 'main', defaultRoles: ALL, needsEmployee: true },
  { key: 'zoom', labelKey: 'zoom', path: '/zoom', icon: Video, section: 'main', defaultRoles: ALL },
  { key: 'vehicles', labelKey: 'vehicles', path: '/vehicles', icon: Car, section: 'main', defaultRoles: ALL, needsFleet: true },
  { key: 'projects', labelKey: 'projects', path: '/projects', icon: KanbanSquare, section: 'main', defaultRoles: ALL },
  { key: 'news', labelKey: 'news', path: '/yangiliklar', icon: Newspaper, section: 'main', defaultRoles: ALL },
  { key: 'ijro', labelKey: 'ijro', path: '/ijro', icon: ClipboardCheck, section: 'main', defaultRoles: ALL },
  { key: 'workPlan', labelKey: 'workPlan', path: '/ish-rejasi', icon: CalendarCheck, section: 'main', defaultRoles: ADMIN_HR_LEAD },
  { key: 'medical', labelKey: 'medical', path: '/tibbiy-korik', icon: Stethoscope, section: 'stats', defaultRoles: ALL, needsMedical: true },
  { key: 'health', labelKey: 'health', path: '/sogliq-korigi', icon: HeartPulse, section: 'stats', defaultRoles: ALL, needsHealth: true },
  { key: 'registrationStatus', labelKey: 'registrationStatus', path: '/registratsiya-holati', icon: UserRoundCheck, section: 'main', defaultRoles: ['guest'] },

  /* Hujjatlar (ichki sahifalar) */
  { key: 'orders', labelKey: 'orders', path: '/orders', icon: ClipboardList, section: 'documents', defaultRoles: ALL },
  { key: 'orderTypes', labelKey: 'orderTypes', path: '/order-types', icon: ListChecks, section: 'documents', defaultRoles: ADMIN_HR },
  { key: 'tempOrders', labelKey: 'tempOrders', path: '/vaqtinchalik-buyruqlar', icon: CalendarClock, section: 'documents', defaultRoles: ADMIN_HR },
  /* Xizmat safaridagi xodimning telefondan «keldim» belgilari — kadr ko'radi va bekor qiladi (2026-10-06). Mobil ham shu kalit bilan. */
  { key: 'mobileCheckins', labelKey: 'mobileCheckins', path: '/mobil-belgilar', icon: Smartphone, section: 'documents', defaultRoles: ADMIN_HR },
  { key: 'letters', labelKey: 'letters', path: '/letters', icon: Mails, section: 'documents', defaultRoles: ALL },
  { key: 'documents', labelKey: 'documents', path: '/hujjatlar', icon: FolderOpen, section: 'documents', defaultRoles: ALL },

  /* Xodimlar */
  { key: 'employees', labelKey: 'employees', path: '/employees', icon: Users, section: 'stats', defaultRoles: ADMIN_HR_LEAD },
  { key: 'attendance', labelKey: 'attendance', path: '/employee-attendance', icon: CalendarClock, section: 'stats', defaultRoles: ['masterAdmin', 'hr', 'accounting', 'monitoring', 'nazoratchi', 'deputy', 'ministr'] },
  { key: 'myAttendance', labelKey: 'myAttendance', path: '/my-attendance', icon: CalendarClock, section: 'stats', defaultRoles: ['employee', 'accounting', 'dashboard', 'chancellery', 'kpp', 'deputy', 'ministr'] },
  { key: 'guests', labelKey: 'guests', path: '/guests', icon: UserPlus, section: 'stats', defaultRoles: ALL },
  { key: 'phone', labelKey: 'phone', path: '/tabel', icon: Phone, section: 'stats', defaultRoles: ALL },
  { key: 'duty', labelKey: 'duty', path: '/navbatchilik', icon: CalendarClock, section: 'stats', defaultRoles: ALL, needsDuty: true },
  { key: 'requestPermission', labelKey: 'requestPermission', path: '/request-permission', icon: ShieldCheck, section: 'stats', defaultRoles: ALL },
  { key: 'staffPositions', labelKey: 'staffPositions', path: '/shtat', icon: Briefcase, section: 'stats', defaultRoles: ADMIN_HR_LEAD },
  // Read-only for everyone but structure managers (the page gates writing on
  // `canManageStructure`). Verifix gave all 234 «Сотрудник» users the
  // organisational-structure report; v2 had it for leadership only.
  { key: 'structure', labelKey: 'structure', path: '/tuzilma', icon: Network, section: 'stats', defaultRoles: ALL },
  { key: 'responsibles', labelKey: 'responsibles', path: '/masullar', icon: UserCheck, section: 'stats', defaultRoles: ADMIN_HR },
  { key: 'hrQuality', labelKey: 'hrQuality', path: '/kadr-nazorati', icon: ShieldCheck, section: 'stats', defaultRoles: ADMIN_HR },
  // Malaka oshirish is a person's OWN training record as much as a register —
  // v1 showed it to every employee, and the server scopes the list anyway.
  { key: 'trainings', labelKey: 'trainings', path: '/malaka-oshirish', icon: GraduationCap, section: 'stats', defaultRoles: ALL },
  { key: 'learning', labelKey: 'learning', path: '/oquv-markazi', icon: GraduationCap, section: 'stats', defaultRoles: ALL },
  { key: 'inspections', labelKey: 'inspections', path: '/auditlar', icon: ClipboardCheck, section: 'stats', defaultRoles: ADMIN_HR_LEAD },
  // «Hisobotlar» — 2026-09-04 da menyudan olib tashlangan edi; 2026-09-19 da
  // hisobot dvigateli (tabel, KPI, kadr harakati…) bilan QAYTA yoqildi.
  // Auditoriya keng, darvoza `needsReports` da: oddiy xodim faqat RAHBAR
  // (qo'l ostidagilari bor) yoki KPI administratori bo'lsa ko'radi — server
  // katalogi ham aynan shu qoidani qo'llaydi (`services/reports/access.py`).
  { key: 'reports', labelKey: 'reports', path: '/reports', icon: PieChart, section: 'stats',
    defaultRoles: ['masterAdmin', 'ministr', 'deputy', 'hr', 'accounting', 'employee'], needsReports: true },

  /* Tizim boshqaruvi (ichki sahifalar) */
  // Reference data, not an admin console: the server returns the same 26
  // catalogues to every role and the page gates writing behind
  // `canManageDictionaries`. v1 showed it to all 11 roles; ADMIN_HR hid a
  // read-only page from 10 of them.
  { key: 'dictionaries', labelKey: 'dictionaries', path: '/malumotnomalar', icon: BookMarked, section: 'admin', defaultRoles: ALL },
  { key: 'holidays', labelKey: 'holidays', path: '/holidays', icon: CalendarDays, section: 'admin', defaultRoles: ADMIN_HR },
  { key: 'tabelSettings', labelKey: 'tabelSettings', path: '/tabel-sozlamalari', icon: Settings, section: 'admin', defaultRoles: ADMIN_HR },
  { key: 'monitoring', labelKey: 'monitoring', path: '/monitoring', icon: MonitorDot, section: 'admin', defaultRoles: ['masterAdmin', 'monitoring'] },
  /* KPP posti kioski — nazoratchining butun ish kuni shu ekranda o'tadi. */
  { key: 'kpp', labelKey: 'kpp', path: '/kpp', icon: DoorOpen, section: 'stats', defaultRoles: ['kpp', 'masterAdmin'] },
  { key: 'videoGuide', labelKey: 'videoGuide', path: '/video-qollanma', icon: Video, section: 'admin', defaultRoles: ALL },
  { key: 'users', labelKey: 'users', path: '/foydalanuvchilar', icon: UserCog, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'registrations', labelKey: 'registrations', path: '/registratsiyalar', icon: UserRoundCheck, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'auditLog', labelKey: 'auditLog', path: '/audit-logs', icon: FileClock, section: 'admin', defaultRoles: ADMIN_ONLY },
  /* Infrastructure: the branch → location → turnstile chain, and what
     HikCentral reports back about it. System administrators only. */
  { key: 'branches', labelKey: 'branches', path: '/filiallar', icon: Building2, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'turnstiles', labelKey: 'turnstiles', path: '/turniketlar', icon: MonitorSmartphone, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'hik', labelKey: 'hik', path: '/hik-monitoring', icon: Activity, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'customFields', labelKey: 'customFields', path: '/qoshimcha-maydonlar', icon: Layers, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'sysHealth', labelKey: 'sysHealth', path: '/tizim-holati', icon: HeartPulse, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'lms', labelKey: 'lms', path: '/lms', icon: Link2, section: 'admin', defaultRoles: ADMIN_ONLY },
  { key: 'designSystem', labelKey: 'designSystem', path: '/dizayn-tizimi', icon: Palette, section: 'admin', defaultRoles: ADMIN_ONLY },
]

/** Saved shape of `nav.modules`. Absent module or absent field = default. */
/**
 * What the master admin may change about a module, stored in `nav.modules`.
 *
 * `branches` is the third dimension: an EMPTY list (or none at all) means the
 * module is on everywhere, otherwise only in the branches listed. It is checked
 * against the branch chosen in the header, so a module can be rolled out one
 * branch at a time instead of all at once.
 */
/** The escape hatch — see `isPathAllowed`. */
const SETTINGS_PATH = '/sozlamalar'

/**
 * ⚠️ ROUTES THIS MATRIX MUST NEVER GOVERN.
 *
 * `isPathAllowed` picks the owning module by LONGEST path prefix, which is
 * right for a detail route (`/employees/7` follows `/employees`) and wrong for
 * everything the server sends people to from OUTSIDE the app. A QR stamp
 * printed on paper, a link in a notification e-mail — those must open for
 * whoever holds them, and they cannot know which modules the reader's branch
 * has switched on.
 *
 * Measured before this list existed: `/letters/verify/9` was governed by the
 * `letters` module, so a reader in a branch with letters turned off scanned the
 * stamp on a signed document and got «Sahifa yopilgan». The page itself is
 * already safe — it is behind the login and shows only the signature status.
 */
const UNGOVERNED_PREFIXES = [
  SETTINGS_PATH,
  '/letters/verify',
  '/orders/verify',
  '/letters/report',
  '/kpi/reports',
  '/hujjat/',
]

/** `/letters/{id}/movements/{movementId}` — the guvohnoma's per-leg QR. */
const MOVEMENT_ROUTE = /^\/letters\/\d+\/movements\//

export type NavModuleOverrides = Record<
  string,
  { enabled?: boolean; roles?: string[]; branches?: number[] } | undefined
>

function pruneByFlags(items: NavItem[], user: User | null | undefined): NavItem[] {
  return items
    .map((item): NavItem | null => {
      if (item.needsSupervisor && !roles.hasSupervisor(user)) return null
      if (item.needsChairmanTasks) {
        if (!roles.canAccessChairmanTasks(user)) return null
        if (roles.isMinister(user)) return { ...item, labelKey: 'myAgenda' }
      }
      return item
    })
    .filter((x): x is NavItem => x !== null)
}

/** Section order in the sidebar. */
const NAV_SECTIONS: NavSection[] = ['main', 'documents', 'stats', 'admin']

function navSection(item: NavItem): NavSection {
  return item.section ?? 'main'
}

/** Items grouped into their bands, empty bands dropped, order inside a band
 *  preserved from the catalogue. */
export function groupNav(items: NavItem[]): { section: NavSection; items: NavItem[] }[] {
  return NAV_SECTIONS.map((section) => ({
    section,
    items: items.filter((i) => navSection(i) === section),
  })).filter((g) => g.items.length > 0)
}

/**
 * The sidebar for this user: catalogue filtered by the admin's settings, then
 * by the gates a setting may not override.
 *
 * `overrides` comes from `nav.modules`. Passing `undefined` (settings not
 * loaded yet, or the request failed) falls back to `defaultRoles`, so the menu
 * never goes blank because a settings call was slow.
 */
/**
 * System-administration modules whose PAGE already admits anyone
 * `canAccessSystemAdmin` — an `admin` account or an employee holding the AKT
 * role — while the menu listed them for the master admin alone.
 *
 * ⚠️ TWO GATES DISAGREED AND THE PAGE'S ONE NEVER RAN. `AppShell` wraps the
 * whole outlet in `isPathAllowed`, which is built from THIS matrix, so a module
 * the matrix hides is stopped at the route and its own `RequireRole` is dead
 * code. Measured live for an `admin` account: all five answered "Sahifa
 * yopilgan" (the route gate), never "Ruxsat yo'q" (the page gate). So the
 * account was offered 15 pages it mostly could not use and none of the five it
 * was written to be allowed. v1 hands this group to exactly the same audience
 * (`canAccessSystemAdmin` → SYSTEM_ADMIN_GROUP).
 */
const SYSTEM_ADMIN_KEYS = ['branches', 'turnstiles', 'hik', 'customFields', 'registrations']

export function getNavForUser(
  user: User | null | undefined,
  overrides?: NavModuleOverrides,
  branchId?: number | null,
): NavItem[] {
  const roleKey = roles.getRoleKey(user)
  const systemAdmin = roles.canAccessSystemAdmin(user)
  // A pure `admin` account has no employee card, so the personnel pages are
  // meaningless to it — v1 gives it an empty menu plus this group, and so do we.
  const adminOnlyAccount = roles.isBranchAdmin(user)
  /*
   * POST/KIOSK ACCOUNT — the screens the post actually works on, nothing else.
   *
   * These accounts have no employee card, so the personal pages ("Mening
   * davomatim", "Ruxsat so'rash", "Malaka oshirish") are meaningless for them,
   * and the document modules now return empty because the account is scoped to
   * its branch rather than to a person. v2 handed them the full employee menu —
   * 18 items — because `getRoleKey` could not classify the account type and
   * fell through to `employee`. v1's post menu is exactly these three plus the
   * watch screen (`KPP_NAV`: `/`, phone directory, guests).
   */
  // Shared post screens, plus the ONE watch screen this post actually works on.
  const POST_ACCOUNT_KEYS = [
    'home',
    'phone',
    'guests',
    roles.getRoleKey(user) === 'kpp' ? 'kpp' : 'monitoring',
  ]
  const items = MODULES.filter((m) => {
    const cfg = overrides?.[m.key]
    if (cfg?.enabled === false) return false
    const isSystem = SYSTEM_ADMIN_KEYS.includes(m.key)
    // «Rollar» reads through `require_structure_manager` and writes through
    // admin/master-admin: an AKT-only system admin gets 403 on the list, so
    // the page was a dead entry for that account (measured 2026-09-17; v1 has
    // the same dead entry). Keep it to the two account types the server serves.
    if (adminOnlyAccount) return isSystem && systemAdmin
    if (roles.isSeparateAccount(user)) return POST_ACCOUNT_KEYS.includes(m.key)
    const audience = cfg?.roles ?? m.defaultRoles
    if (!(audience.includes(roleKey) || (isSystem && systemAdmin))) return false
    // Branch-scoped module: an empty list means everywhere. When no branch is
    // chosen ("Barcha filiallar") the module stays visible — hiding it would
    // make the whole menu depend on a picker the user may never touch.
    const onlyIn = cfg?.branches ?? []
    if (onlyIn.length > 0 && branchId != null && !onlyIn.includes(Number(branchId))) return false
    // ⚠️ KPI is branch-bound: `/me` reports `kpi_enabled` and the backend
    // enforces it too. No setting may hand KPI to a branch that has it off.
    if (m.needsKpi && user?.kpi_enabled === false) return false
    if (m.needsEmployee && !user?.employee?.id && !roles.isSiteMasterAdmin(user)) return false
    if (m.needsMedical && user?.medical_enabled !== true) return false
    if (m.needsHealth && !(user?.nurse_branch_ids?.length || roles.isSiteMasterAdmin(user))) return false
    if (m.needsDuty && !roles.canSeeDuty(user)) return false
    if (m.needsReports && !roles.canSeeReports(user)) return false
    if (m.needsTeam && !roles.canSeeTeam(user)) return false
    if (m.needsFleet && !roles.canSeeFleet(user)) return false
    return true
  }).map(
    (m): NavItem => ({
      labelKey: m.labelKey,
      path: m.path,
      icon: m.icon,
      section: m.section,
      needsSupervisor: m.needsSupervisor,
      needsChairmanTasks: m.needsChairmanTasks,
    }),
  )
  return pruneByFlags(items, user)
}


/**
 * Is this path open to this person right now?
 *
 * Hiding a menu entry is not access control on its own — the address bar still
 * works — so the shell asks this before it renders a page. Matching is by
 * LONGEST module path, which makes a detail route follow its list (`/employees/7`
 * is governed by `/employees`).
 */
export function isPathAllowed(
  path: string,
  user: User | null | undefined,
  overrides?: NavModuleOverrides,
  branchId?: number | null,
): boolean {
  // ⚠️ THE WAY BACK IS NEVER CLOSED. The settings screen is what un-hides
  // everything else, so no matrix entry may govern it — otherwise one wrong
  // checkbox locks the master admin out of the only screen that could undo it.
  // The same applies to every link the server hands out on paper or by mail.
  if (UNGOVERNED_PREFIXES.some((p) => path.startsWith(p))) return true
  if (MOVEMENT_ROUTE.test(path)) return true
  const owner = MODULES.filter((m) => m.path !== '/' && path.startsWith(m.path)).sort(
    (a, b) => b.path.length - a.path.length,
  )[0]
  // A route no module claims (the settings screen, a document editor) is not
  // governed by this matrix and stays reachable.
  if (!owner) return true
  const allowed = getNavForUser(user, overrides, branchId)
  return allowed.some((i) => i.path === owner.path)
}

/**
 * The page's name in the audit journal (PAGE_VIEW `title`): the menu label of
 * the longest matching module path, ALWAYS in Uzbek — the journal is read in
 * one language whatever the visitor's UI language was. Null when no module
 * claims the path or the label bundle is not loaded yet; the server still
 * records the path itself.
 */
export function auditPageTitle(path: string): string | null {
  const owner = MODULES.filter((m) =>
    m.path === '/' ? path === '/' : path === m.path || path.startsWith(`${m.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0]
  if (!owner) return null
  const key = `nav.${owner.labelKey}`
  const label = String(i18n.getFixedT('uz')(key as never))
  return label && label !== key ? label : null
}
