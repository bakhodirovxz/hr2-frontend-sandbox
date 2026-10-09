import * as roles from '@/auth/roles'
import type { User } from '@/types'
import type { Translation } from '@/i18n/uz'

/**
 * WHO sees WHICH slice of the document lists.
 *
 * Before this, every page fetched the whole branch's documents and showed them
 * to everyone: a plain employee scrolled through 200 letters that had nothing
 * to do with them, while the chancellery had to hunt for the handful actually
 * waiting to be registered. The backend already scopes by permission; this
 * decides what is USEFUL to each role and turns it into query parameters.
 *
 * Both lists are defined here rather than inside the two pages so the roles
 * cannot drift apart — a rule added for letters is visible when editing orders.
 */

export type LetterScope =
  | 'all'
  | 'my'
  | 'assigned'
  | 'signed'
  | 'registry'
  | 'destination'
  | 'approval'
  | 'accounting'

export type OrderScope = 'all' | 'my' | 'assigned' | 'signed' | 'registry' | 'hr'

export interface ScopeDef<T extends string> {
  key: T
  /** i18n key under `documents.scope.*`. */
  label: keyof Translation['documents']['scope']
}

/** Query params for `GET /letters` for the chosen scope. */
export function letterScopeParams(
  scope: LetterScope,
  opts: { employeeId?: number; branchId: number | null },
): Record<string, unknown> {
  switch (scope) {
    case 'my':
      return { employee_id: opts.employeeId }
    case 'assigned':
      return { assigned_signer: true }
    case 'signed':
      return { signer: true }
    // Chancellery's actual job queue: signed off and waiting for a number.
    case 'registry':
      return { status: 'pending_registration' }
    // HR of the branch being VISITED — who is arriving, and when. The branch
    // filter has to be cleared explicitly or the interceptor re-adds the user's
    // own branch and the destination filter matches nothing.
    case 'destination':
      return {
        organization_branch_id: null,
        destination_branch_id: opts.branchId ?? undefined,
        letter_type: 'business_trip',
      }
    // Trip certificates that HR has confirmed as arrived, awaiting the deputy.
    case 'approval':
      return {
        organization_branch_id: null,
        letter_type: 'business_trip',
        status: 'management_approved',
        is_trip_confirmed: true,
      }
    // Accounting only ever needs trips whose report is fully approved.
    case 'accounting':
      return {
        organization_branch_id: null,
        letter_type: 'business_trip',
        status: 'report_approved',
      }
    case 'all':
    default:
      return {}
  }
}

/** Query params for `GET /order-acts` for the chosen scope. */
export function orderScopeParams(
  scope: OrderScope,
  opts: { employeeId?: number },
): Record<string, unknown> {
  switch (scope) {
    case 'my':
      return { employee_id: opts.employeeId }
    case 'assigned':
      return { assigned_signer: true }
    case 'signed':
      return { signer: true }
    case 'registry':
      return { status: 'pending_chancellery' }
    case 'hr':
      return { creator_role: 'hr' }
    case 'all':
    default:
      return {}
  }
}

/**
 * The scopes a user may switch between, in the order they should appear.
 *
 * A plain employee deliberately has NO "Barchasi": the branch's letters are not
 * their business, and offering a tab that returns a wall of other people's
 * documents is what made the page useless to them.
 */
export function letterScopesFor(user: User | null, branchId: number | null): ScopeDef<LetterScope>[] {
  const out: ScopeDef<LetterScope>[] = []
  const chancellery = roles.isAnyChancellery(user)
  const privileged =
    chancellery || roles.isHR(user) || roles.isLeadership(user) || roles.isMasterAdmin(user)

  if (chancellery) out.push({ key: 'registry', label: 'registry' })
  if (privileged) out.push({ key: 'all', label: 'all' })

  // Everyone keeps their personal three — including the chancellery, who may
  // still file their own bildirgi.
  out.push({ key: 'my', label: 'my' }, { key: 'assigned', label: 'assigned' }, { key: 'signed', label: 'signed' })

  if (roles.isHR(user) || roles.isMasterAdmin(user)) out.push({ key: 'destination', label: 'destination' })
  if (roles.isTripApprover(user) || roles.isMasterAdmin(user)) out.push({ key: 'approval', label: 'approval' })
  if (roles.canActAsAccounting(user, branchId)) out.push({ key: 'accounting', label: 'accounting' })

  return out
}

export function orderScopesFor(user: User | null): ScopeDef<OrderScope>[] {
  const out: ScopeDef<OrderScope>[] = []
  const chancellery = roles.isAnyChancellery(user)
  const privileged =
    chancellery || roles.isHR(user) || roles.isLeadership(user) || roles.isMasterAdmin(user)

  if (chancellery) out.push({ key: 'registry', label: 'registry' })
  if (privileged) out.push({ key: 'all', label: 'all' })
  out.push({ key: 'my', label: 'my' }, { key: 'assigned', label: 'assigned' }, { key: 'signed', label: 'signed' })
  if (roles.isHR(user) || roles.isMasterAdmin(user)) out.push({ key: 'hr', label: 'hr' })

  return out
}

/**
 * Where the page opens: "Barchasi" whenever the role has it.
 *
 * It first opened on each role's own queue — the chancellery landed in
 * "Ro'yxatga olish". That hid the rest of the work behind a tab nobody thought
 * to press: the page looked like it held one document. The queue stays first in
 * the strip (one click away), but the landing view shows everything the role is
 * allowed to see. A plain employee has no "Barchasi", so they still start on
 * their own documents.
 */
function defaultScope<T extends string>(scopes: ScopeDef<T>[]): T {
  const all = scopes.find((s) => s.key === ('all' as T))
  return all?.key ?? scopes[0]?.key ?? ('my' as T)
}

/** Guard a scope coming from the URL against the user's allowed set. */
export function resolveScope<T extends string>(raw: string | null, scopes: ScopeDef<T>[]): T {
  const found = scopes.find((s) => s.key === raw)
  return found ? found.key : defaultScope(scopes)
}
