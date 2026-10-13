import type { BadgeTone } from '@/components/ui/Badge'
import { canWrite, canWriteOrg, isSiteMasterAdmin } from '@/auth/permissions'
import { errorCode } from '@/api/errorMessage'
import type { User } from '@/types'
import type { OrderAct } from './useOrders'

/**
 * Who may do what to an order — v1 `pages/orders/helpers.js` + the predicates
 * of `BuyruqlarTable` / `OrderDetailModal`, on the sandbox actor flags
 * (`/auth/me` `actor.*`, module permissions). The backend re-checks every step;
 * this only decides which buttons are shown.
 *
 * A DECREE is an order whose category has `creator_role` employee|hr — it runs
 * draft → (pending_submitter) → pending_approval → approved →
 * pending_leadership → confirmed → applied. Anything else is a legacy act
 * signed through `/sign` + `/reject`.
 */

type U = User | null | undefined

export const DECREE_STATUSES = [
  'draft',
  'pending_submitter',
  'pending_approval',
  'changes_requested',
  'approved',
  'pending_leadership',
  'confirmed',
  'applied',
  'rejected',
] as const
export type DecreeStatus = (typeof DECREE_STATUSES)[number]

export const DECREE_TONE: Record<DecreeStatus, BadgeTone> = {
  draft: 'neutral',
  pending_submitter: 'warning',
  pending_approval: 'warning',
  changes_requested: 'danger',
  approved: 'success',
  pending_leadership: 'warning',
  confirmed: 'info',
  applied: 'success',
  rejected: 'danger',
}

/** Status filter options (v1 order). */
export const STATUS_FILTER: DecreeStatus[] = [
  'draft',
  'pending_approval',
  'changes_requested',
  'approved',
  'pending_leadership',
  'confirmed',
  'applied',
  'rejected',
]

/** Backend `_LOCKED_DECREE_STATUSES`: no edit / delete from here on. */
export const LOCKED_STATUSES = ['confirmed', 'applied']

export const isDecreeOrder = (o?: Pick<OrderAct, 'category_rel'> | null) =>
  ['employee', 'hr'].includes(o?.category_rel?.creator_role ?? '')

export const isKnownDecreeStatus = (s?: string | null): s is DecreeStatus =>
  !!s && (DECREE_STATUSES as readonly string[]).includes(s)

const sameId = (a: unknown, b: unknown) => a != null && b != null && Number(a) === Number(b)

export function isOrderRejected(o?: OrderAct | null) {
  return !!o && (o.status === 'rejected' || !!o.rejected_by)
}

export function hasEmployeeSigned(o: OrderAct | null | undefined, employeeId?: number | null) {
  if (!o || !employeeId) return false
  return (o.signers ?? []).some((s) => sameId(s.employee_id ?? s.employee?.id, employeeId))
}

/** Legacy act: every assigned signer has signed. */
export function isOrderSigned(o?: OrderAct | null) {
  if (!o || isOrderRejected(o)) return false
  if (o.status === 'signed') return true
  const assigned = o.assigned_signers ?? []
  return assigned.length > 0 && assigned.every((a) => hasEmployeeSigned(o, a.employee_id ?? a.employee?.id))
}

/** Legacy act state for the badge. */
export function legacyState(o: OrderAct): 'rejected' | 'signed' | 'new' {
  if (isOrderRejected(o)) return 'rejected'
  if (isOrderSigned(o)) return 'signed'
  return 'new'
}

/** Is a sign / agree stage open (regardless of who is looking)? */
export function isSignStageOpen(o?: OrderAct | null) {
  if (!o || isOrderRejected(o) || o.status === 'signed') return false
  if (isDecreeOrder(o)) return o.status === 'pending_approval' || o.status === 'pending_leadership'
  return true
}

/** Decree: only the CURRENT stage's signers agree / reject. */
export function canSignDecree(o: OrderAct | null | undefined, employeeId?: number | null) {
  if (!o || !employeeId || isOrderRejected(o)) return false
  if (o.status !== 'pending_approval' && o.status !== 'pending_leadership') return false
  const stage = o.status === 'pending_approval' ? 'approver' : 'leadership'
  const inStage = (o.assigned_signers ?? []).some((s) => s.signer_type === stage && sameId(s.employee_id, employeeId))
  return inStage && !hasEmployeeSigned(o, employeeId)
}

/** Legacy act: an assigned signer who has not signed yet. */
export function canSignLegacy(o: OrderAct | null | undefined, employeeId?: number | null) {
  if (!o || !employeeId || isDecreeOrder(o) || isOrderRejected(o) || o.status === 'signed') return false
  const assigned = (o.assigned_signers ?? []).some((s) => sameId(s.employee_id, employeeId))
  return assigned && !hasEmployeeSigned(o, employeeId)
}

/** HR role — the server's `_is_hr_user` (multi-org role «hr»). */
export const isOrdersHr = (user: U) => !!user?.actor?.hr

/** Management (rais / o'rinbosar) — their list is «assigned to me». */
export const isOrdersManagement = (user: U) => !!user?.actor?.management

/**
 * TZ O1/O2 create / edit — HR on its own level (`orders >= edit`). A branch
 * director (Tabel settings) does not author orders (v1 decision 2026-08-21);
 * the site master admin always may.
 */
export function canManageOrders(user: U) {
  if (isSiteMasterAdmin(user)) return true
  if ((user?.director_branch_ids ?? []).length > 0) return false
  return canWriteOrg(user, 'orders')
}

export interface OrderPowers {
  submit: boolean
  confirmSubmission: boolean
  approveReject: boolean
  signLegacy: boolean
  sendToLeadership: boolean
  resubmit: boolean
  apply: boolean
  edit: boolean
  delete: boolean
}

/** Every action for one order and one viewer — the table row and the detail use the same set. */
export function orderPowers(o: OrderAct, user: U): OrderPowers {
  const me = user?.employee?.id ?? null
  const admin = isSiteMasterAdmin(user)
  const hr = isOrdersHr(user)
  const decree = isDecreeOrder(o)
  const hrDecree = o.category_rel?.creator_role === 'hr'
  const hrDecreeManager = hr && hrDecree
  const createdBy = o.created_by_id ?? o.created_by?.id ?? null
  const isCreator = !!me && (sameId(createdBy, me) || (hrDecreeManager && createdBy == null))
  const locked = decree && LOCKED_STATUSES.includes(o.status ?? '')
  const manage = canManageOrders(user)
  const management = isOrdersManagement(user)
  return {
    submit: decree && o.status === 'draft' && (admin || isCreator),
    confirmSubmission: decree && o.status === 'pending_submitter' && (admin || (!!me && sameId(o.submitter_id, me))),
    approveReject: decree && (canSignDecree(o, me) || (admin && isSignStageOpen(o))),
    signLegacy: !decree && (canSignLegacy(o, me) || (admin && isSignStageOpen(o))),
    sendToLeadership: decree && o.status === 'approved' && (admin || isCreator || hrDecreeManager),
    resubmit: decree && o.status === 'changes_requested' && (admin || isCreator || hrDecreeManager),
    // TZ 2154: HR (or the site admin) puts a confirmed decree into effect.
    apply: decree && o.status === 'confirmed' && (admin || hr),
    // Server `_assert_can_edit_decree`: author, submitter, or HR of the
    // order's branch (never someone else's draft).
    edit:
      !locked &&
      (admin ||
        (!management &&
          manage &&
          (isCreator || (!!me && sameId(o.submitter_id, me)) || (hr && o.status !== 'draft')))),
    // Server `delete_order_act`: author or HR, never once anybody has signed.
    delete: !locked && (o.signers ?? []).length === 0 && (admin || (!management && (isCreator || hr))),
  }
}

// ── TZ O2 1224 «Возможные расширения» ─────────────────────────────────────

/** Backend `_WITHDRAWABLE_STATUSES`: the order is somewhere in the approval chain. */
export const WITHDRAWABLE_STATUSES = ['pending_submitter', 'pending_approval', 'approved', 'pending_leadership', 'changes_requested']

/**
 * «Kelishuvdan qaytarib olish» — the author, HR with `orders = full`, or the
 * site master admin (server `OrderActService.withdraw`, 403 otherwise).
 */
export function canWithdrawOrder(o: OrderAct | null | undefined, user: U): boolean {
  if (!o || !WITHDRAWABLE_STATUSES.includes(o.status ?? '')) return false
  if (isSiteMasterAdmin(user)) return true
  const me = user?.employee?.id ?? null
  const createdBy = o.created_by_id ?? o.created_by?.id ?? null
  if (me && sameId(createdBy, me)) return true
  return isOrdersHr(user) && canWrite(user, 'orders', 'full')
}

/** A confirmed / applied decree is changed only by a corrective order (HR who author orders). */
export function canCorrectOrder(o: OrderAct | null | undefined, user: U): boolean {
  if (!o || !isDecreeOrder(o) || !LOCKED_STATUSES.includes(o.status ?? '')) return false
  return canManageOrders(user) && (isSiteMasterAdmin(user) || !isOrdersManagement(user))
}

/** 409 `order_locked` (400 `order_act_locked` before TZ v2) — edit / delete of a locked order. */
export const isOrderLockedError = (err: unknown) => ['order_locked', 'order_act_locked'].includes(errorCode(err) ?? '')
