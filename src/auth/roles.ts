/* Centralized role resolution, ported to TypeScript from the v1 roleHelpers.
 * Special roles are employees flagged with is_multi_org_user +
 * multi_org_employee_role. Keep this the single source of role truth. */

import type { Employee, MultiOrgRole, User } from '@/types'

function getMultiOrgRoles(employee?: Employee | null): MultiOrgRole[] {
  // is_kpi_admin is a SEPARATE boolean column, not a value inside
  // multi_org_employee_role — it stacks on top of whatever the primary role is
  // (an employee with no multi-org role can still be a KPI admin).
  const extra: MultiOrgRole[] = employee?.is_kpi_admin ? ['kpi_admin'] : []
  if (!employee?.is_multi_org_user) return extra
  const raw = employee.multi_org_employee_role
  const primary = Array.isArray(raw) ? (raw.filter(Boolean) as MultiOrgRole[]) : raw ? [raw] : []
  return [...primary, ...extra]
}

function getMultiOrgRole(user?: User | null): MultiOrgRole | null {
  return getMultiOrgRoles(user?.employee)[0] ?? null
}

function hasMultiOrgRole(user: User | null | undefined, role: MultiOrgRole): boolean {
  return getMultiOrgRoles(user?.employee).includes(role)
}

/** A direct supervisor is assigned — the only thing that grants "request leave". */
export function hasSupervisor(user?: User | null): boolean {
  return !!(user?.employee?.supervisor_id || user?.employee?.supervisor?.id)
}

/** master-admin OR ministr. */
export function isMasterAdmin(user?: User | null): boolean {
  return user?.type === 'master-admin' || getMultiOrgRole(user) === 'ministr'
}

/**
 * SYSTEM ADMINISTRATION — branches, locations, turnstiles, HikCentral, roles,
 * extra fields.
 *
 * ⚠️ `isMasterAdmin` is DELIBERATELY not used: it also covers the ministr, and
 * the server answers those screens with 403 for them — the menu would offer a
 * page that can only fail. Mirrors v1's `canAccessSystemAdmin`.
 */
export function canAccessSystemAdmin(user?: User | null): boolean {
  // `UserType` has no 'admin' member, but such accounts DO exist in the
  // database (`users.type = 'admin'`) — compared as a string here for the same
  // reason the employee form does it.
  return (
    String(user?.type) === 'admin' ||
    user?.type === 'master-admin' ||
    (user?.akt_branch_ids?.length ?? 0) > 0
  )
}

/** Strict site master-admin (excludes ministr) — for site-wide override UI. */
export function isSiteMasterAdmin(user?: User | null): boolean {
  return user?.type === 'master-admin'
}

/**
 * «Mehmon» — TZ 4.2.2: ro'yxatdan o'tgan, ammo administrator shaxsini hali
 * tasdiqlamagan foydalanuvchi. Xodim kartochkasi YO'Q, shuning uchun xodimga
 * tayangan har qanday ekran (davomat, KPI, profil) unga bo'sh chiqadi —
 * menyusi ham, boshlang'ich sahifasi ham alohida.
 */
export function isGuest(user?: User | null): boolean {
  return user?.type === 'guest'
}

/** Regular (non multi-org) employee. */
function isEmployee(user?: User | null): boolean {
  return user?.type === 'employee' && !user?.employee?.is_multi_org_user
}

export function isHR(user?: User | null): boolean {
  return hasMultiOrgRole(user, 'hr')
}

/** Verifix "Администратор КПЭ" — an extra flag, stacked on the primary role. */
function isKpiAdmin(user?: User | null): boolean {
  return hasMultiOrgRole(user, 'kpi_admin')
}

/** May manage KPI catalogs, results and evaluation sheets. */
export function canManageKpi(user?: User | null): boolean {
  return isMasterAdmin(user) || isHR(user) || isKpiAdmin(user)
}

/**
 * «Hisobotlar» module. Mirrors the server's report role keys
 * (`services/reports/access.py`): privileged roles read org-wide; a plain
 * employee gets in only as a LINE MANAGER (`/me.is_line_manager`, tabel of
 * subordinates) or a KPI admin (the KPI report).
 */
/** «Mening jamoam»: whoever heads a department or has someone reporting to
 *  them (server `core.scoping.is_line_manager`, reported on `/auth/me`). */
export function canSeeTeam(user?: User | null): boolean {
  return !!user?.is_line_manager
}

export function canSeeReports(user?: User | null): boolean {
  return (
    isMasterAdmin(user) ||
    String(user?.type) === 'admin' ||
    isHR(user) ||
    isDeputy(user) ||
    isAccounting(user) ||
    isKpiAdmin(user) ||
    !!user?.is_line_manager
  )
}

/**
 * The lateness ranking (`/dashboard/late-employees/*`). Mirrors the server's
 * `_require_discipline_viewer`: admin accounts, the privileged managers (hr,
 * ministr), the watch roles (deputy, monitoring, dashboard) and line
 * managers. The KPI admin flag is NOT in it — the board used to fire both
 * calls for a KPI admin anyway and eat two 403s (measured 2026-09-23).
 */
export function canSeeLateness(user?: User | null): boolean {
  if (user?.type === 'master-admin' || String(user?.type) === 'admin') return true
  const primary = getMultiOrgRole(user)
  if (primary && (['hr', 'ministr', 'deputy', 'monitoring', 'dashboard'] as string[]).includes(primary)) return true
  return !!user?.is_line_manager
}

export function isDeputy(user?: User | null): boolean {
  return hasMultiOrgRole(user, 'deputy')
}

function isChancellery(user?: User | null): boolean {
  const role = getMultiOrgRole(user)
  return role === 'chancellery' || role === 'kanselariya'
}

export function isMinister(user?: User | null): boolean {
  return getMultiOrgRole(user) === 'ministr'
}

export function isSecretariat(user?: User | null): boolean {
  return !!user?.is_secretariat
}

export function canAccessChairmanTasks(user?: User | null): boolean {
  return isSecretariat(user) || isMinister(user) || isSiteMasterAdmin(user)
}

export function isAccounting(user?: User | null): boolean {
  return getMultiOrgRole(user) === 'accounting'
}

/** Decree leadership signers: ministr OR deputy. */
export function isLeadership(user?: User | null): boolean {
  return isMinister(user) || isDeputy(user)
}

/**
 * DEVONXONA by ANY route: the multi-org role, OR a branch-leader chancellery
 * assignment, OR a department literally named "devonxona" — the last two arrive
 * as `chancellery_branch_ids` on /me. Checking only the multi-org role left
 * branch-level chancellery staff looking at the regular view.
 */
export function isAnyChancellery(user?: User | null): boolean {
  return isChancellery(user) || (user?.chancellery_branch_ids?.length ?? 0) > 0
}

/**
 * Approves trip certificates: ONLY a deputy holding the "Boshqaruv raisi
 * o'rinbosari" position — "Birinchi o'rinbosari" is a different person and
 * does not approve (main-branch rule, ported from v1).
 */
export function isTripApprover(user?: User | null): boolean {
  if (!isDeputy(user)) return false
  const jp = user?.employee?.job_position
  const name = (typeof jp === 'object' ? jp?.name : jp) || ''
  const norm = name.toLowerCase().replace(/[’`ʼ]/g, "'").trim()
  return norm.includes("boshqaruv raisi o'rinbosari") && !norm.includes('birinchi')
}


/**
 * DEVONXONA FOR ONE BRANCH.
 *
 * ⚠️ NOT the same question as `isAnyChancellery`. A clerk assigned to branch 5
 * answers yes to that one everywhere, so a list mixing branches offered them
 * Register and Edit-stamp on branch 1's decrees — buttons the server refuses.
 * The global multi-org role still passes for every branch; a branch-leader
 * assignment passes only for the branches it was given for.
 */
export function isBranchChancellery(user: User | null | undefined, branchId?: number | null): boolean {
  if (branchId == null) return false
  return (user?.chancellery_branch_ids ?? []).map(Number).includes(Number(branchId))
}

export function canActAsChancellery(user: User | null | undefined, branchId?: number | null): boolean {
  if (isBranchChancellery(user, branchId)) return true
  // The GLOBAL role is branch-bound too, and the server says so: it accepts the
  // role only when the document's branch is one of the person's own
  // (`_can_act_as_chancellery` → `employee_branch_ids`, department branch plus
  // the multi-org list). Mirroring it is the point — a wider client check just
  // draws a button that answers 403.
  if (!isChancellery(user)) return false
  if (branchId == null) return true
  const own = new Set(employeeBranchIds(user))
  return own.size === 0 || own.has(Number(branchId))
}

/** Branches this person belongs to — home department plus the multi-org list. */
export function employeeBranchIds(user?: User | null): number[] {
  const home = user?.employee?.department?.organization_branch_id
  const ids = getAllowedBranchIds(user).map(Number)
  return home != null ? [...new Set([Number(home), ...ids])] : ids
}

/**
 * KADR FOR ONE BRANCH — the Tabel assignment (`hr_branch_ids`) or a multi-org
 * HR whose own branch list covers it. Same reason as above: HR of two branches
 * is not HR of the other twenty-six.
 */
export function isBranchHr(user: User | null | undefined, branchId?: number | null): boolean {
  if (branchId == null) return false
  const bid = Number(branchId)
  if ((user?.hr_branch_ids ?? []).map(Number).includes(bid)) return true
  // ⚠️ `employeeBranchIds`, NOT `getAllowedBranchIds`. The server resolves
  // membership as department branch ∪ multi-org list (`scoping.employee_branch_ids`);
  // the M2M list alone is empty for roughly half the directory, whose branch comes
  // from their department. Measured live on letter 141122: the server let the HR
  // account add a trip leg while this check said it belonged to no branch at all.
  return isHR(user) && employeeBranchIds(user).map(Number).includes(bid)
}

/** Global accounting role, or the branch's designated accountant (Tabel). */
export function canActAsAccounting(user: User | null | undefined, branchId: number | null): boolean {
  if (isAccounting(user)) return true
  if (branchId == null) return false
  return (user?.accounting_branch_ids ?? []).map(Number).includes(Number(branchId))
}

export function isDashboardViewer(user?: User | null): boolean {
  return getMultiOrgRole(user) === 'dashboard'
}

/**
 * NAZORATCHI — the supervisory role v1 has and v2 did not know at all.
 *
 * It was absent from the assignable list AND from every check, so granting it
 * produced a user the app could not classify: not employee-like, therefore
 * stripped of the personal pages, with no attendance list and no board.
 */
export function isNazoratchi(user?: User | null): boolean {
  return getMultiOrgRole(user) === 'nazoratchi'
}

export function isMonitoringOperator(user?: User | null): boolean {
  const role = getMultiOrgRole(user)
  return role === 'monitoring' || role === 'monitoring_operator'
}

/**
 * Whoever the duty roster concerns: a member, a viewer, or anyone in a
 * department that runs one. HR and the master admin manage it, so they are in
 * too. Mirrors v1's `needsNavbatchilik`.
 */
export function canSeeDuty(user?: User | null): boolean {
  if (isHR(user) || isMasterAdmin(user)) return true
  return Boolean(
    user?.is_navbatchi ||
      user?.is_navbatchi_viewer ||
      user?.employee?.department?.has_navbatchilik,
  )
}

/** An `admin` account — a branch's system administrator, with no employee card. */
export function isBranchAdmin(user?: User | null): boolean {
  return String(user?.type) === 'admin'
}

/**
 * Accounting, dashboard-viewer and nazoratchi get the full regular-employee
 * experience — menu, personal pages, employee rights — with their own extra on
 * top. Check THIS, not `isEmployee`, for anything employee-scoped: the
 * multi-org flag would otherwise take their own pages away from them.
 */
export function isEmployeeLike(user?: User | null): boolean {
  return isEmployee(user) || isAccounting(user) || isDashboardViewer(user) || isNazoratchi(user)
}

/** Roles whose home is the PERSONNEL board rather than their own day. */
export function hasDashboardHome(user?: User | null): boolean {
  return isDashboardViewer(user) || isNazoratchi(user)
}

/**
 * Branches this person administers as a SYSTEM admin (locations, turnstiles,
 * HikCentral). A master admin is unrestricted and returns none; an `admin`
 * account has exactly its own; an employee given the AKT role has whatever
 * Tabel assigned. These must appear in the branch picker even when the person
 * belongs to no branch otherwise — those screens read the picked branch.
 */
export function getSystemAdminBranchIds(user?: User | null): number[] {
  if (String(user?.type) === 'master-admin') return []
  if (isBranchAdmin(user)) {
    const id = user?.admin?.organization_branch_id
    return id ? [Number(id)] : []
  }
  return (user?.akt_branch_ids ?? []).map(Number)
}

export function getAllowedBranchIds(user?: User | null): number[] {
  return user?.employee?.organization_branches?.map((b) => b.id) ?? []
}

/** HR bound to the executive-apparatus branch (can view "All branches"). */
function isExecutiveHR(user: User | null | undefined, execBranchId: number | null): boolean {
  // The server's own verdict (`/me.is_executive_hr`, the predicate its write
  // gates use) wins; the branch-list derivation below only covers a `/me`
  // that predates the flag.
  if (typeof user?.is_executive_hr === 'boolean') return user.is_executive_hr
  if (!isHR(user) || execBranchId == null) return false
  // Same correction as `isBranchHr`: the server's `is_executive_hr` reads
  // `employee_branch_ids` and its docstring names THIS function as the mirror,
  // so an executive-apparatus HR with no M2M row was denied the "All branches"
  // scope the server would have granted.
  return employeeBranchIds(user)
    .map(Number)
    .includes(Number(execBranchId))
}

/** Can switch to the "All branches" scope. */
export function canSwitchBranchScope(
  user: User | null | undefined,
  execBranchId: number | null,
): boolean {
  return isMasterAdmin(user) || isDeputy(user) || isExecutiveHR(user, execBranchId)
}

/** i18n dictionary key for a role (see uz.ts `roles.*`). NO display text here —
 *  components render t(`roles.${getRoleKey(user)}`). */
export type RoleKey =
  | 'masterAdmin'
  | 'employee'
  | 'hr'
  | 'kpp'
  | 'chancellery'
  | 'ministr'
  | 'deputy'
  | 'accounting'
  | 'dashboard'
  | 'monitoring'
  | 'nazoratchi'
  | 'guest'
  // A branch/system administrator: no employee card, so it is not an employee.
  | 'admin'

const MULTI_ORG_ROLE_KEYS: Record<string, RoleKey> = {
  ministr: 'ministr',
  deputy: 'deputy',
  hr: 'hr',
  chancellery: 'chancellery',
  kanselariya: 'chancellery',
  accounting: 'accounting',
  dashboard: 'dashboard',
  kpp: 'kpp',
  monitoring_operator: 'monitoring',
  monitoring: 'monitoring',
  nazoratchi: 'nazoratchi',
}

/** Role key for the current user's primary role (header dropdown). */
/**
 * A post/kiosk account: KPP or monitoring. Not an employee — no department, no
 * position — but it does have a branch (and may have several), which is the
 * only thing that scopes it.
 */
export function isSeparateAccount(user?: User | null): boolean {
  const t = user?.type
  if (!t) return false
  return t !== 'employee' && t !== 'admin' && t !== 'master-admin' && t !== 'guest'
}

export function getRoleKey(user?: User | null): RoleKey {
  // Mehmon BIRINCHI: uning `type` i 'guest' va `employee` yozuvi yo'q, ya'ni
  // quyidagi tekshiruvlarning hech biriga tushmasdi va sarlavhada «Xodim»
  // deb ko'rinardi — u esa xodim EMAS (TZ 4.2.2).
  if (isGuest(user)) return 'guest'
  const role = getMultiOrgRole(user)
  if (role && MULTI_ORG_ROLE_KEYS[role]) return MULTI_ORG_ROLE_KEYS[role]
  if (isSiteMasterAdmin(user)) return 'masterAdmin'
  // ⚠️ A branch admin has no employee record either, and fell through to
  // 'employee' — so the header introduced a system administrator as «Xodim».
  // The menu was already right (`adminOnlyAccount` handles it); the LABEL was not.
  if (isBranchAdmin(user)) return 'admin'
  // ⚠️ ALOHIDA HISOB (KPP posti, monitoring kioski) XODIM EMAS. Uning `type` i
  // xodimnikidan boshqa va `employee` yozuvi UMUMAN yo'q — bo'limi ham,
  // lavozimi ham yo'q. Bu yerda `employee` ga tushib qolgani uchun u oddiy
  // xodim menyusini olardi: «Mening davomatim», «Ruxsat so'rash», «Malaka
  // oshirish» — xodim kartasi yo'q hisob uchun bularning hammasi ma'nosiz.
  // A post account is named by its own type: a KPP checkpoint and a monitoring
  // station are different posts with different screens.
  if (isSeparateAccount(user)) return user?.type === 'kpp' ? 'kpp' : 'monitoring'
  return 'employee'
}

/** The user's display name, or null (caller renders t('common.user')). */
export function getDisplayName(user?: User | null): string | null {
  return user?.employee?.legal_name || user?.username || null
}

/**
 * Mirror of the server's `assert_branch_admin` (organization.py) — who may
 * change ONE branch's settings, blank, stamp and leader list:
 *   master-admin / admin / executive HR -> every branch;
 *   branch HR (kadr)                    -> own branches;
 *   any registered leader of the branch -> that branch;
 * and with `leadersOnly` (the leader list itself) only a director / akt
 * leader of the branch besides the global roles.
 */
export function canAdministerBranch(
  user: User | null | undefined,
  branchId: number | null | undefined,
  opts: { leadersOnly?: boolean; execBranchId?: number | null } = {},
): boolean {
  if (branchId == null) return false
  const bid = Number(branchId)
  if (isSiteMasterAdmin(user) || isBranchAdmin(user) || isExecutiveHR(user, opts.execBranchId ?? null)) return true
  if (isHR(user) && employeeBranchIds(user).map(Number).includes(bid)) return true
  const buckets = opts.leadersOnly
    ? [user?.director_branch_ids, user?.akt_branch_ids]
    : [
        user?.director_branch_ids,
        user?.akt_branch_ids,
        user?.hr_branch_ids,
        user?.deputy_branch_ids,
        user?.accounting_branch_ids,
        user?.legal_branch_ids,
        user?.chancellery_branch_ids,
        user?.nurse_branch_ids,
        user?.transport_branch_ids,
        user?.transport_approver_branch_ids,
      ]
  return buckets.some((ids) => (ids ?? []).map(Number).includes(bid))
}

/** Avtopark pages: site master-admin, or a transport officer / fleet approver
 *  of any branch — the server's `VehicleService.can_view_fleet`. */
export function canSeeFleet(user: User | null | undefined): boolean {
  return isSiteMasterAdmin(user) || !!user?.transport_branch_ids?.length || !!user?.transport_approver_branch_ids?.length
}
