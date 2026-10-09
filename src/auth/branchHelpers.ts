import type { OrganizationBranch, User } from '@/types'
import * as roles from './roles'

/** "Ijro apparati" — the head-company branch ("O'zbekgidroenergo" AJ).
 *  Read from the row's `is_head_office` flag (set in the branch form, also in
 *  the slim shell list); the name match below is only the fallback for a
 *  database where no row carries the flag yet, and `1` the last resort. */
export function findExecutiveBranchId(branches?: OrganizationBranch[] | null): number {
  const flagged = (branches || []).find((b) => b.is_head_office)
  if (flagged) return flagged.id
  const norm = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/[‘’`']/g, '')
      .replace(/[«»"”“]/g, '')
  const match = (branches || []).find((b) => {
    const n = norm(b.name)
    return /\bozbekgidroenergo\b/.test(n) && /\baj\b/.test(n) && !n.includes('filial')
  })
  return match?.id ?? 1
}

/**
 * BRANCHES THIS PERSON MAY SWITCH TO.
 *
 * ⚠️ The picker used to fall back to the WHOLE list whenever the user had no
 * branches of their own — which is every ordinary employee. Measured live: a
 * plain employee could pick any of 28 branches and ask for that branch's data.
 * v1 answers `[]` there, and the picker then renders as a static label.
 *
 * Ported from v1's `computeAllowedBranches`, including the part v2 never had:
 * a system administrator (an `admin` account, or an employee holding the AKT
 * role) must see the branch they administer even though they may belong to no
 * branch at all — Manzillar and Turniketlar read the picked branch.
 */
export function visibleBranches(
  branches: OrganizationBranch[],
  user: User | null | undefined,
): OrganizationBranch[] {
  if (roles.isMasterAdmin(user)) return branches

  const systemIds = roles.getSystemAdminBranchIds(user).map(Number)
  if (systemIds.length) {
    const own = branches.filter((b) => systemIds.includes(Number(b.id)))
    // A pure admin account has nothing else; the AKT role is an ADDITION to a
    // normal employee, so their own branches stay alongside.
    if (roles.isBranchAdmin(user)) return own
    const allowed = roles.getAllowedBranchIds(user).map(Number)
    const merged = branches.filter(
      (b) => systemIds.includes(Number(b.id)) || allowed.includes(Number(b.id)),
    )
    return merged.length ? merged : own
  }

  if (
    roles.isHR(user) ||
    roles.isDeputy(user) ||
    roles.isAnyChancellery(user) ||
    roles.isAccounting(user) ||
    roles.isDashboardViewer(user) ||
    roles.isNazoratchi(user) ||
    // KPP (checkpoint) posts can cover several branches. v1 does not give them
    // the picker but DOES list every branch they hold under the header
    // (`DashboardLayout.jsx:1176`); v2 left them with `[]`, which degrades to a
    // single static chip — so a two-branch post could see only one of them.
    // The server scopes each request to their own branches regardless.
    roles.getRoleKey(user) === 'kpp'
  ) {
    const allowed = roles.getAllowedBranchIds(user).map(Number)
    return branches.filter((b) => allowed.includes(Number(b.id)))
  }

  /*
   * ⚠️ A POST/KIOSK ACCOUNT HAS NO EMPLOYEE RECORD, so `getAllowedBranchIds`
   * (which reads `employee.organization_branches`) is always empty for it and
   * the picker degraded to a single static chip. Its branches live on the
   * kiosk record instead — and a post may legitimately cover several, which is
   * exactly what the earlier `getRoleKey === 'kpp'` line could never reach,
   * because a kiosk account resolves to the 'monitoring' key.
   */
  if (roles.isSeparateAccount(user)) {
    const own = (user?.multi_modal_user?.organization_branch_ids ?? []).map(Number)
    return branches.filter((b) => own.includes(Number(b.id)))
  }

  return []
}
