import {
  Activity,
  BarChart3,
  BookMarked,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  ConciergeBell,
  DatabaseBackup,
  FileClock,
  FileText,
  GraduationCap,
  Home,
  KeyRound,
  Languages,
  Link2,
  Network,
  Shield,
  ShieldCheck,
  UserCircle,
  UserCog,
  UserRoundCheck,
  UsersRound,
  Users,
  type LucideIcon,
} from 'lucide-react'
import i18n from 'i18next'
import type { User } from '@/types'
import type { Translation } from '@/i18n/uz'
import * as perm from '@/auth/permissions'
import type { ModuleCode, PermissionLevel } from '@/auth/permissions'

/**
 * MENYU DARAXTI VA MARSHRUT DARVOZALARI — YAGONA MANBA.
 *
 * TZ 440–441: asosiy menyu gorizontal, guruh bosilganda uning quyi menyusi
 * ikkinchi qatorda ochiladi (`TopNav`); telefon kengligida o'sha daraxt yon
 * panelda (`Sidebar`). Bitta daraxt barcha kirgan rollar uchun — band
 * ko'rinadi, agar `/auth/me` modul darajasi uni ochsa (TZ A2) va boshqaruv
 * sahifalarida ssenariy siyosati ruxsat bersa (`actor.modules`). Mehmonga —
 * alohida qisqa menyu.
 *
 * hr-frontend-sandbox `app/layouts/navConfig.js` + `App.jsx` darvozalari bilan
 * AYNAN bir xil: ikki interfeysning menyusi har bir hisob uchun solishtiriladi.
 * Faqat NAVIGATSIYA shu yerda; sahifa ichidagi amallar sahifaning o'zida.
 */

export type NavKey = keyof Translation['nav']

interface Gate {
  /** TZ moduli va eng kichik daraja (sukut `view`). */
  module?: ModuleCode
  level?: PermissionLevel
  /** Modulni tashkilot darajasida o'qiydi (faqat o'z ma'lumoti emas). */
  orgRead?: ModuleCode
  /** Tashkilot darajasida yozadi. */
  writeOrg?: [ModuleCode, 'edit' | 'full']
  /** Needs the module on the WHOLE system (head-office level). */
  writeGlobal?: [ModuleCode, 'edit' | 'full']
  /** `/auth/me` kpi_enabled — KPI shu tashkilotda yoqilganmi (backend hukmi). */
  needsKpi?: boolean
  /** Xodim kartasi bor hisob. */
  needsCard?: boolean
  /** Faqat butun tizim administratori (`master-admin`). */
  siteMasterOnly?: boolean
  /** `admin` / `master-admin` hisobi (backend `require_system_admin`). */
  systemAdmin?: boolean
  /** Shtat va vakansiyalar: o'qish tashkilot darajasida yoki biror joyda yozish. */
  staffing?: boolean
  /** Davomat jadvali: xuddi shunday. */
  attendanceBoard?: boolean
  /** Mehmon ochmaydi. */
  notGuest?: boolean
  /** Faqat mehmon. */
  guestOnly?: boolean
}

export interface NavLeaf extends Gate {
  key: string
  labelKey: NavKey
  path: string
  icon: LucideIcon
}

export interface NavGroup {
  key: string
  labelKey: NavKey
  icon: LucideIcon
  children: NavLeaf[]
}

export type NavNode = NavLeaf | NavGroup

export const isGroup = (n: NavNode): n is NavGroup => 'children' in n

// TZ V3 «Просмотр вакансий — все пользователи», mehmon ham.
const VACANCIES: NavLeaf = { key: 'vacancies', labelKey: 'vacancies', path: '/vacancies', icon: BriefcaseBusiness }
// TZ 4.2.12 — har rolda kamida «Mening so'rovlarim» bor.
const SERVICES: NavLeaf = { key: 'services', labelKey: 'services', path: '/services', icon: ConciergeBell }

/*
 * TZ 418-435: every functional module is a first-class item of the top row;
 * pages that only serve a module (holidays and timesheet settings serve
 * attendance, the HR quality check serves HR records) sit in that module's
 * submenu instead of the top row (TZ 440-441).
 */

/** TZ 424 «Модуль учета кадров». */
const HR_GROUP: NavGroup = {
  key: 'hr',
  labelKey: 'groupHr',
  icon: Users,
  children: [
    { key: 'employees', labelKey: 'employees', path: '/employees', icon: Users, module: 'employees' },
    { key: 'hrQuality', labelKey: 'hrQuality', path: '/hr-quality', icon: ClipboardCheck, module: 'employees', orgRead: 'employees' },
  ],
}

/** TZ 423 «Модуль штатной структуры». */
const STRUCTURE_GROUP: NavGroup = {
  key: 'org',
  labelKey: 'groupStructure',
  icon: Network,
  children: [
    // TZ S3 «Просмотр структуры — все пользователи».
    { key: 'structure', labelKey: 'structure', path: '/structure', icon: Network, module: 'structure' },
    { key: 'departments', labelKey: 'departments', path: '/departments', icon: Building2, module: 'structure', writeOrg: ['structure', 'edit'] },
    { key: 'jobPositions', labelKey: 'jobPositions', path: '/job-positions', icon: Briefcase, module: 'structure', writeOrg: ['structure', 'edit'] },
    { key: 'staffing', labelKey: 'staffing', path: '/staffing', icon: ClipboardList, module: 'vacancies', staffing: true },
    // TZ 4.2.6 2024–2026 «Учет организаций» — head-office structure editor (S1 actor «Кадры ЦА»).
    { key: 'organizations', labelKey: 'organizations', path: '/organizations', icon: Building2, module: 'structure', writeGlobal: ['structure', 'edit'] },
  ],
}

/** TZ 422 «Справочники» (D2 — hamma o'qiydi, tahrir tugmalari sahifa ichida). */
const DICTIONARIES: NavLeaf = { key: 'dictionaries', labelKey: 'dictionaries', path: '/dictionaries', icon: BookMarked, module: 'dictionaries' }

/**
 * TZ 425-430 «Модуль KPI:» with its sub-modules — administrative/auxiliary
 * staff (426), planned work (427), period reporting (428), professional
 * development (429), audits and inspections (430). 426 and 428 are views of
 * the KPI page (staff-group filter, reports tab), reached by URL query.
 */
const KPI_GROUP: NavGroup = {
  key: 'kpiModule',
  labelKey: 'groupKpi',
  icon: Activity,
  children: [
    { key: 'kpi', labelKey: 'kpi', path: '/kpi', icon: Activity, module: 'kpi', needsKpi: true },
    { key: 'kpiAdminSupport', labelKey: 'kpiAdminSupport', path: '/kpi?tab=results&pg=admin_support', icon: UsersRound, module: 'kpi', needsKpi: true, writeOrg: ['kpi', 'edit'] },
    { key: 'workPlan', labelKey: 'workPlan', path: '/work-plans', icon: ClipboardCheck, module: 'work_plans' },
    { key: 'kpiReports', labelKey: 'kpiReports', path: '/kpi?tab=reports', icon: FileBarChart, module: 'kpi', needsKpi: true, writeOrg: ['kpi', 'edit'] },
    { key: 'trainings', labelKey: 'trainings', path: '/trainings', icon: GraduationCap, module: 'trainings' },
    { key: 'inspections', labelKey: 'inspections', path: '/audits', icon: ShieldCheck, module: 'inspections' },
  ],
}

/** TZ 431 «Модуль учета приказов». */
const ORDERS_GROUP: NavGroup = {
  key: 'orders',
  labelKey: 'groupOrders',
  icon: FileText,
  children: [
    { key: 'orders', labelKey: 'orders', path: '/orders', icon: FileText, module: 'orders' },
    { key: 'orderTypes', labelKey: 'orderTypes', path: '/order-types', icon: ClipboardList, module: 'orders', writeOrg: ['orders', 'full'] },
  ],
}

/** TZ 435 «Модуль посещаемости» (I2) with the calendar and timesheet settings it uses. */
const ATTENDANCE_GROUP: NavGroup = {
  key: 'attendanceModule',
  labelKey: 'groupAttendance',
  icon: CalendarDays,
  children: [
    { key: 'attendance', labelKey: 'attendance', path: '/employee-attendance', icon: CalendarDays, module: 'attendance', attendanceBoard: true },
    { key: 'myAttendance', labelKey: 'myAttendance', path: '/my-attendance', icon: CalendarDays, needsCard: true },
    { key: 'holidays', labelKey: 'holidays', path: '/holidays', icon: CalendarDays, module: 'attendance', writeOrg: ['attendance', 'edit'] },
    { key: 'tabelSettings', labelKey: 'tabelSettings', path: '/timesheet-settings', icon: CalendarRange, module: 'attendance', writeOrg: ['attendance', 'edit'] },
  ],
}

/**
 * Tizim boshqaruvi (TZ A1–A4, 4.2.2, E1–E3, ADM-7, LMS 2206). Filial
 * administratori — o'z filialining foydalanuvchilari, rollari, filiali,
 * arizalari va jurnali; butun tizim administratori — zaxira, lug'at,
 * avariya konsoli va LMS ham.
 */
const SYSTEM_ADMIN_GROUP: NavGroup = {
  key: 'system',
  labelKey: 'groupSystem',
  icon: Shield,
  children: [
    { key: 'users', labelKey: 'users', path: '/users', icon: UserCog, module: 'admin', systemAdmin: true },
    { key: 'roles', labelKey: 'roles', path: '/roles', icon: KeyRound, module: 'admin', systemAdmin: true },
    { key: 'branches', labelKey: 'branches', path: '/branches', icon: Building2, module: 'admin', systemAdmin: true },
    { key: 'registrations', labelKey: 'registrations', path: '/registrations', icon: Users, module: 'registration', systemAdmin: true },
    { key: 'auditLog', labelKey: 'auditLog', path: '/audit-logs', icon: FileClock, module: 'admin', systemAdmin: true },
    { key: 'backups', labelKey: 'backups', path: '/system/backups', icon: DatabaseBackup, siteMasterOnly: true },
    { key: 'uiDictionary', labelKey: 'uiDictionary', path: '/system/dictionary', icon: Languages, siteMasterOnly: true },
    { key: 'sysHealth', labelKey: 'sysHealth', path: '/system-health', icon: Activity, siteMasterOnly: true },
    { key: 'lms', labelKey: 'lms', path: '/lms', icon: Link2, siteMasterOnly: true },
  ],
}

const MAIN_NAV: NavNode[] = [
  { key: 'home', labelKey: 'home', path: '/', icon: Home },
  HR_GROUP,
  STRUCTURE_GROUP,
  DICTIONARIES,
  KPI_GROUP,
  ORDERS_GROUP,
  VACANCIES,
  { key: 'statistics', labelKey: 'statistics', path: '/statistics', icon: BarChart3, module: 'statistics', orgRead: 'statistics' },
  SERVICES,
  ATTENDANCE_GROUP,
]
// TZ 421 «Личный кабинет пользователя» is the account menu at the right end
// of the header («Shaxsiy kabinet»), present on every page and every width.

/**
 * «Mehmon» (TZ 4.2.2 / 4.2.12): ro'yxatdan o'tgan, hali tasdiqlanmagan hisob.
 * Vakansiyalarni ko'radi, xizmat orqali ariza beradi, arizasi holatini kuzatadi
 * va profilini tahrirlaydi.
 */
const GUEST_NAV: NavLeaf[] = [
  VACANCIES,
  SERVICES,
  { key: 'registrationStatus', labelKey: 'registrationStatus', path: '/registration-status', icon: UserRoundCheck, guestOnly: true },
  { key: 'myProfile', labelKey: 'myProfile', path: '/my-profile', icon: UserCircle },
]

/** Mehmon ochadigan yo'llar; qolgani `/vacancies` ga yo'naltiriladi. */
export const GUEST_PATHS = [...GUEST_NAV.map((i) => i.path), '/contacts', '/sitemap', '/qr-approve']

/**
 * Menyuda yo'q, lekin darvozasi bor marshrutlar (`App.jsx` bilan bir xil).
 * Batafsil sahifa o'z ro'yxatining darvozasini oladi (`/employees/7` →
 * `employees`), shu sabab bu yerda faqat menyuga kirmaydiganlari.
 */
const EXTRA_ROUTES: NavLeaf[] = [
  { key: 'kpiPerformance', labelKey: 'kpi', path: '/kpi/performances', icon: Activity, module: 'kpi', needsKpi: true },
  { key: 'myProfile', labelKey: 'myProfile', path: '/my-profile', icon: UserCircle },
  { key: 'search', labelKey: 'search', path: '/search', icon: UserCircle, notGuest: true },
  { key: 'contacts', labelKey: 'contacts', path: '/contacts', icon: UserCircle },
  { key: 'sitemap', labelKey: 'sitemap', path: '/sitemap', icon: UserCircle },
  { key: 'qrApprove', labelKey: 'qrApprove', path: '/qr-approve', icon: UserCircle },
]

export function canOpenStaffing(user: User | null | undefined): boolean {
  return perm.can(user, 'vacancies') && (perm.readsOrg(user, 'vacancies') || perm.canWrite(user, 'vacancies'))
}

export function canOpenAttendanceBoard(user: User | null | undefined): boolean {
  return perm.can(user, 'attendance') && (perm.readsOrg(user, 'attendance') || perm.canWrite(user, 'attendance'))
}

/** Bitta band darvozasi — menyu ham, marshrut ham shundan o'tadi. */
export function passesGate(g: Gate, user: User | null | undefined): boolean {
  const guest = perm.isGuest(user)
  if (g.guestOnly && !guest) return false
  if (g.notGuest && guest) return false
  if (g.needsKpi && !user?.kpi_enabled) return false
  if (g.needsCard && !user?.employee) return false
  if (g.siteMasterOnly && !perm.isSiteMasterAdmin(user)) return false
  if (g.systemAdmin && !perm.canAccessSystemAdmin(user)) return false
  if (g.module && !perm.can(user, g.module, g.level)) return false
  if (g.orgRead && !perm.readsOrg(user, g.orgRead)) return false
  if (g.writeOrg && !perm.canWriteOrg(user, g.writeOrg[0], g.writeOrg[1])) return false
  if (g.writeGlobal && !perm.canWriteGlobal(user, g.writeGlobal[0], g.writeGlobal[1])) return false
  if (g.staffing && !canOpenStaffing(user)) return false
  if (g.attendanceBoard && !canOpenAttendanceBoard(user)) return false
  return true
}

function prune(nodes: NavNode[], user: User | null | undefined): NavNode[] {
  return nodes
    .map((n): NavNode | null => {
      if (isGroup(n)) {
        const children = n.children.filter((c) => passesGate(c, user))
        // A group with a single visible page is that page: a submenu of one
        // item would only add a click.
        if (children.length === 1) return children[0]
        return children.length ? { ...n, children } : null
      }
      return passesGate(n, user) ? n : null
    })
    .filter((n): n is NavNode => n !== null)
}

/** Foydalanuvchining menyu daraxti. */
export function getNavForUser(user: User | null | undefined): NavNode[] {
  if (perm.isGuest(user)) return GUEST_NAV.filter((n) => passesGate(n, user))
  // Tizim boshqaruvi guruhi OXIRIDA: tizimni ham boshqaradigan hisobning
  // qolgan menyusi oldinda qoladi.
  const tree = perm.canAccessSystemAdmin(user) ? [...MAIN_NAV, SYSTEM_ADMIN_GROUP] : MAIN_NAV
  return prune(tree, user)
}

/**
 * The one menu path that represents the current location. Some entries are
 * views of the same page selected by a query (`/kpi?tab=reports`), so the
 * best match is: same pathname and all of the entry's query parameters
 * present; otherwise the entry without a query.
 */
export function pickActivePath(paths: string[], pathname: string, search: string): string | null {
  const current = new URLSearchParams(search)
  let plain: string | null = null
  let best: string | null = null
  let bestScore = -1
  for (const p of paths) {
    const [base, query = ''] = p.split('?')
    const matches = base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`)
    if (!matches) continue
    if (!query) {
      if (!plain || base.length > plain.length) plain = p
      continue
    }
    const wanted = new URLSearchParams(query)
    let ok = true
    let n = 0
    wanted.forEach((v, k) => {
      n += 1
      if (current.get(k) !== v) ok = false
    })
    if (ok && n > bestScore) {
      best = p
      bestScore = n
    }
  }
  return best ?? plain
}

/** Daraxtni barg havolalarga yoyish. */
export function flattenNav(nodes: NavNode[]): NavLeaf[] {
  return nodes.flatMap((n) => (isGroup(n) ? n.children : [n]))
}

const ALL_LEAVES: NavLeaf[] = [...flattenNav(MAIN_NAV), ...SYSTEM_ADMIN_GROUP.children, ...GUEST_NAV, ...EXTRA_ROUTES]

function ownerOf(path: string): NavLeaf | undefined {
  return ALL_LEAVES.filter((m) =>
    m.path === '/' ? path === '/' : path === m.path || path.startsWith(`${m.path}/`),
  ).sort((a, b) => b.path.length - a.path.length)[0]
}

export type PathVerdict = 'ok' | 'forbidden' | 'guest-redirect'

/**
 * Bu yo'l hozir shu foydalanuvchiga ochiqmi? Menyuni yashirish yetarli emas —
 * manzil satri baribir ishlaydi — shuning uchun qobiq sahifani chizishdan
 * oldin shuni so'raydi. Notanish yo'l `App.tsx` da `/` ga yo'naltiriladi.
 */
export function pathVerdict(path: string, user: User | null | undefined): PathVerdict {
  if (perm.isGuest(user)) {
    const open = GUEST_PATHS.some((p) => path === p || path.startsWith(`${p}/`))
    return open ? 'ok' : 'guest-redirect'
  }
  const owner = ownerOf(path)
  if (!owner) return 'ok'
  return passesGate(owner, user) ? 'ok' : 'forbidden'
}

/**
 * Audit jurnalidagi sahifa nomi (PAGE_VIEW `title`) — har doim o'zbekcha,
 * jurnal tashrif buyuruvchining tilidan qat'i nazar bitta tilda o'qiladi.
 */
export function auditPageTitle(path: string): string | null {
  const owner = ownerOf(path)
  if (!owner) return null
  const key = `nav.${owner.labelKey}`
  const label = String(i18n.getFixedT('uz')(key as never))
  return label && label !== key ? label : null
}
