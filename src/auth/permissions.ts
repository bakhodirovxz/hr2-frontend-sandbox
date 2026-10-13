import type { User } from '@/types'

/**
 * MODUL RUXSATLARI (TZ A1/A2) va SSENARIY AKTYORLARI (TZ 534–748).
 *
 * `/auth/me` ikki narsa qaytaradi:
 *   - `permissions: {modul: none|view|edit|full}` — rol darajasi, bo'lim
 *     boshlig'i / filial rahbari grantlari va foydalanuvchiga alohida berilgan
 *     daraja (`core/permissions.py::effective_permissions`);
 *   - `actor.modules[modul] = {org_read, edit, full}` — QAYERDA yoza oladi:
 *     'global' (barcha tashkilotlar), 'org' (o'z tashkiloti), 'unit' (bo'lim
 *     boshlig'i — o'z bo'linmasi) yoki null (`core/access_policy.py`).
 *
 * Backend aynan shu qoidani majburlaydi (`require_module` + servis ko'lami),
 * shuning uchun menyu, sahifa darvozasi va tugmalar SHU YERDAN olinadi. Bu —
 * qulaylik qatlami; xavfsizlik chegarasi backendda.
 *
 * hr-frontend-sandbox `shared/utils/roleHelpers.js` bilan AYNAN bir xil
 * semantika (menyu ikkala interfeysda bir xil chiqishi tekshiriladi).
 */

export const MODULES = [
  'admin',
  'registration',
  'dictionaries',
  'structure',
  'employees',
  'kpi',
  'work_plans',
  'trainings',
  'inspections',
  'orders',
  'vacancies',
  'statistics',
  'services',
  'attendance',
] as const
export type ModuleCode = (typeof MODULES)[number]

export const PERMISSION_LEVELS = ['none', 'view', 'edit', 'full'] as const
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number]
/** Yozish ko'lami: butun tizim / o'z tashkiloti / o'z bo'linmasi. */
export type WriteScope = 'global' | 'org' | 'unit' | null

export interface ModuleAccess {
  org_read: boolean
  edit: WriteScope
  full: WriteScope
}

export interface Actor {
  master_admin?: boolean
  branch_admin?: boolean
  management?: boolean
  hr?: boolean
  central_hr?: boolean
  department_head?: boolean
  leadership_branch_ids?: number[]
  /** null — global (barcha filiallar). */
  own_branch_ids?: number[] | null
  statistics_dashboard?: boolean
  has_subordinates?: boolean
  unit_department_ids?: number[]
  modules?: Partial<Record<ModuleCode, ModuleAccess>>
}

type U = User | null | undefined

/** Faqat `type === 'master-admin'` hisobi (butun tizim administratori). */
export function isSiteMasterAdmin(user: U): boolean {
  return user?.type === 'master-admin'
}

/** Filial administratori (`type === 'admin'`). Master-admin bunga kirmaydi. */
export function isBranchAdmin(user: U): boolean {
  return String(user?.type) === 'admin'
}

/** «Tizim boshqaruvi» bo'limi — backend `require_system_admin` bilan mos. */
export function canAccessSystemAdmin(user: U): boolean {
  return isBranchAdmin(user) || isSiteMasterAdmin(user)
}

/** «Mehmon» (TZ 4.2.2) — ro'yxatdan o'tgan, hali tasdiqlanmagan hisob. */
export function isGuest(user: U): boolean {
  return user?.type === 'guest'
}

/** Oddiy xodim (kadr / rahbariyat roli yo'q). */
export function isPlainEmployee(user: U): boolean {
  return user?.type === 'employee' && !user?.employee?.is_multi_org_user
}

/** TZ «Руководители» — bo'lim boshlig'i yoki kimningdir rahbari. */
export function isLineManager(user: U): boolean {
  return (
    (user?.headed_department_ids || []).length > 0 ||
    !!user?.actor?.department_head ||
    !!user?.actor?.has_subordinates
  )
}

function hasModulePermissions(user: U): boolean {
  const p = user?.permissions
  return !!p && typeof p === 'object' && !Array.isArray(p)
}

/** Modul bo'yicha samarali daraja. */
export function moduleLevel(user: U, module: ModuleCode): PermissionLevel {
  if (isSiteMasterAdmin(user)) return 'full'
  if (!hasModulePermissions(user)) return 'none'
  const lv = user!.permissions![module]
  return (PERMISSION_LEVELS as readonly string[]).includes(lv ?? '') ? (lv as PermissionLevel) : 'none'
}

const rank = (lv: PermissionLevel) => PERMISSION_LEVELS.indexOf(lv)

/** Modulni kamida `minLevel` darajada ochadimi? Modulsiz band — doim ochiq. */
export function can(user: U, module: ModuleCode | undefined | null, minLevel: PermissionLevel = 'view'): boolean {
  if (!module) return true
  return rank(moduleLevel(user, module)) >= rank(minLevel)
}

export function moduleAccess(user: U, module: ModuleCode): ModuleAccess | null {
  return user?.actor?.modules?.[module] ?? null
}

/** Modulda BIROR JOYDA yozadi (o'z tashkiloti yoki o'z bo'linmasi). */
export function canWrite(user: U, module: ModuleCode, level: 'edit' | 'full' = 'edit'): boolean {
  if (isSiteMasterAdmin(user)) return true
  const a = moduleAccess(user, module)
  if (!a) return can(user, module, level)
  return !!a[level]
}

/** Tashkilot (yoki butun tizim) darajasida yozadi — kadrlar, rahbariyat. */
export function canWriteOrg(user: U, module: ModuleCode, level: 'edit' | 'full' = 'edit'): boolean {
  if (isSiteMasterAdmin(user)) return true
  const a = moduleAccess(user, module)
  if (!a) return can(user, module, level) && !isPlainEmployee(user)
  return a[level] === 'global' || a[level] === 'org'
}

/** Butun tizim darajasida yozadi (umumtizim ma'lumotnomalari, umumiy bayram). */
export function canWriteGlobal(user: U, module: ModuleCode, level: 'edit' | 'full' = 'edit'): boolean {
  if (isSiteMasterAdmin(user)) return true
  return moduleAccess(user, module)?.[level] === 'global'
}

/** Modulni tashkilot darajasida o'qiydi (ro'yxat, nazorat sahifalari). */
export function readsOrg(user: U, module: ModuleCode): boolean {
  if (isSiteMasterAdmin(user)) return true
  const a = moduleAccess(user, module)
  if (!a) return can(user, module) && !isPlainEmployee(user)
  return !!a.org_read
}

/** R2 «Просмотр статистики» — statistika = to'liq daraja (rahbariyat). */
export function canSeeStatisticsDashboard(user: U): boolean {
  return can(user, 'statistics', 'full')
}

/** Xodim kartalarini tashkilot darajasida boshqaradi (C1/C3/C4). */
export function canManageEmployees(user: U): boolean {
  return canWriteOrg(user, 'employees')
}

/**
 * BITTA xodim kartasini boshqarish (TZ C1/C3 «Кадры ЦА, Руководители»).
 * Kadr — o'z tashkilotidagi hammani; rahbar — faqat o'z bo'linmasi va bevosita
 * bo'ysunuvchilarini. O'z kartasi bu yerdan EMAS («Mening profilim»).
 */
export function canManageEmployee(
  user: U,
  employee: { id: number; supervisor_id?: number | null; department_id?: number | null } | null | undefined,
): boolean {
  if (canManageEmployees(user)) return true
  if (!employee) return false
  const myId = user?.employee?.id
  if (!myId || employee.id === myId) return false
  if (employee.supervisor_id && employee.supervisor_id === myId) return true
  const unit = user?.actor?.unit_department_ids ?? user?.headed_department_ids ?? []
  return !!employee.department_id && unit.includes(employee.department_id)
}

/**
 * Xodim KARTASINI (GET /employees/{id}) ocha oladimi — serverdagi
 * `assert_can_read_employee_card` bilan bir xil: kadr/rahbariyat/admin — ha
 * (filial ko'lamini server o'zi cheklaydi); oddiy xodim — faqat o'zining kartasi,
 * «Kadrlar hisobi» o'qish huquqi berilgan bo'lsa tashkilotdagilar, bo'lim
 * boshlig'i — o'z bo'limi va bevosita bo'ysunuvchilari. Qolganlarida server
 * 403 `employee_card_forbidden` qaytaradi — ro'yxatda havola bo'lmasin.
 */
export function canOpenEmployeeCard(
  user: U,
  employee: { id: number; supervisor_id?: number | null; department_id?: number | null },
): boolean {
  if (!isPlainEmployee(user)) return true
  if (employee.id === user?.employee?.id) return true
  if (readsOrg(user, 'employees')) return true
  // Rahbar: bilvosita bo'ysunuvchilar zanjirini mijoz ko'rmaydi — havola
  // qoldiriladi, ruxsatni server hal qiladi (yashirgandan ko'ra kamdan-kam
  // «Ruxsat yo'q» yaxshiroq).
  if (isLineManager(user)) return true
  return canManageEmployee(user, employee)
}

/**
 * «Barcha filiallar» ko'rinishiga o'ta oladimi — o'qish ko'lami global
 * (master, rahbariyat, markaziy kadr). Backend `own_branch_ids: null` beradi.
 */
export function canSwitchBranchScope(user: U): boolean {
  if (isSiteMasterAdmin(user)) return true
  const a = user?.actor
  return !!a && !isGuest(user) && a.own_branch_ids === null
}

/** O'qiy oladigan filiallar. `null` — cheklovsiz (global). */
export function ownBranchIds(user: U): number[] | null {
  if (isSiteMasterAdmin(user)) return null
  const own = user?.actor?.own_branch_ids
  if (own === null && user?.actor) return null
  if (own?.length) return own.map(Number)
  const adminBranch = user?.admin?.organization_branch_id
  if (adminBranch) return [adminBranch]
  const empBranches = user?.employee?.organization_branches?.map((b) => b.id) ?? []
  if (empBranches.length) return empBranches
  const dept = user?.employee?.department?.organization_branch_id
  return dept ? [dept] : []
}

/** Ko'rinadigan ism: xodim kartasi, hisobdagi F.I.Sh. yoki login. */
export function displayName(user: U): string {
  return user?.employee?.legal_name || user?.full_name || user?.username || ''
}
