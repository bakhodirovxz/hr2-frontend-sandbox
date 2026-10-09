import type { TFunction } from 'i18next'
import type { OrderCategory } from './useOrders'

/**
 * TZ O1 / 4.2.9 — order type = the category's type: «приём, увольнение,
 * перевод, отпуск, командировка». Resolved from `category.code` (the five TZ
 * codes) or, for older categories, the internal int `type`. An unknown
 * category has no type-specific block. Port of v1 `pages/orders/orderTypes.js`.
 */
export const ORDER_TYPE_CODES = ['hire', 'dismissal', 'transfer', 'vacation', 'business_trip'] as const
export type OrderTypeCode = (typeof ORDER_TYPE_CODES)[number]

// backend app/models/order_act.py · OrderActCategoryType
const CATEGORY_INT_TYPE_MAP: Record<number, OrderTypeCode> = {
  0: 'vacation',
  1: 'business_trip',
  3: 'vacation',
  4: 'vacation',
  5: 'vacation',
  6: 'vacation',
  7: 'transfer',
  8: 'transfer',
  9: 'hire',
  11: 'dismissal',
}

export function orderTypeOfCategory(category?: OrderCategory | null): OrderTypeCode | null {
  if (!category) return null
  const code = category.code
  if (code && (ORDER_TYPE_CODES as readonly string[]).includes(code)) return code as OrderTypeCode
  if (category.type != null) return CATEGORY_INT_TYPE_MAP[Number(category.type)] ?? null
  return null
}

export function orderTypeLabel(t: TFunction, type: OrderTypeCode | null | undefined): string {
  return type ? t(`orders.type_${type}`) : ''
}

/** `details` JSONB keys per type (contract §9). Transfer date = `effective_start_date`. */
export const TYPE_DETAIL_KEYS: Record<OrderTypeCode, string[]> = {
  hire: ['hire_date', 'position_id', 'department_id', 'salary'],
  dismissal: ['dismissal_date', 'dismissal_reason_code'],
  transfer: ['position_id', 'department_id'],
  vacation: ['leave_from', 'leave_to'],
  business_trip: ['trip_from', 'trip_to', 'trip_destination'],
}

export const ALL_DETAIL_KEYS = [
  'hire_date', 'dismissal_date', 'dismissal_reason_code', 'position_id', 'department_id',
  'salary', 'leave_from', 'leave_to', 'trip_from', 'trip_to', 'trip_destination',
]

const NUMERIC_KEYS = new Set(['position_id', 'department_id', 'salary'])
export const DATE_KEYS = new Set(['hire_date', 'dismissal_date', 'leave_from', 'leave_to', 'trip_from', 'trip_to'])

export type OrderDetails = Record<string, string>

export function detailLabel(t: TFunction, key: string, type?: OrderTypeCode | null): string {
  switch (key) {
    case 'hire_date': return t('orders.d_hireDate')
    case 'dismissal_date': return t('orders.d_dismissalDate')
    case 'dismissal_reason_code': return t('orders.d_dismissalReason')
    case 'position_id': return type === 'transfer' ? t('orders.d_newPosition') : t('orders.d_position')
    case 'department_id': return type === 'transfer' ? t('orders.d_newDepartment') : t('orders.d_department')
    case 'salary': return t('orders.d_salary')
    case 'leave_from': return t('orders.d_leaveFrom')
    case 'leave_to': return t('orders.d_leaveTo')
    case 'trip_from': return t('orders.d_tripFrom')
    case 'trip_to': return t('orders.d_tripTo')
    case 'trip_destination': return t('orders.d_tripDestination')
    default: return key
  }
}

/** Saved `details` → form strings (only the known keys). */
export function pickDetails(raw: unknown): OrderDetails {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out: OrderDetails = {}
  for (const k of ALL_DETAIL_KEYS) if (src[k] != null) out[k] = String(src[k])
  return out
}

/** Form values → the `details` the backend gets (only this type's keys). */
export function buildDetailsPayload(type: OrderTypeCode, details: OrderDetails): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of TYPE_DETAIL_KEYS[type]) {
    const v = details[k]
    if (v === '' || v == null) continue
    if (NUMERIC_KEYS.has(k)) {
      const n = Number(String(v).replace(/\s+/g, ''))
      if (Number.isFinite(n)) out[k] = n
    } else {
      out[k] = String(v).trim()
    }
  }
  return out
}

/** Type-specific required fields (TZ O1 «Система проверяет корректность»). */
export function validateOrderDetails(
  t: TFunction,
  type: OrderTypeCode,
  d: OrderDetails,
  effectiveStartDate: string,
): Record<string, string> {
  const errors: Record<string, string> = {}
  const need = (k: string, msg: string) => {
    if (!d[k]) errors[k] = msg
  }
  const dateMsg = t('orders.errDate')
  switch (type) {
    case 'hire':
      need('hire_date', dateMsg)
      need('position_id', t('orders.errPosition'))
      need('department_id', t('orders.errDepartment'))
      break
    case 'dismissal':
      need('dismissal_date', dateMsg)
      need('dismissal_reason_code', t('orders.errReason'))
      break
    case 'transfer':
      if (!effectiveStartDate) errors.effective_start_date = dateMsg
      if (!d.position_id && !d.department_id) errors.position_id = t('orders.errPositionOrDepartment')
      break
    case 'vacation':
      need('leave_from', dateMsg)
      need('leave_to', dateMsg)
      if (d.leave_from && d.leave_to && d.leave_to < d.leave_from) errors.leave_to = t('orders.errEndBeforeStart')
      break
    case 'business_trip':
      need('trip_from', dateMsg)
      need('trip_to', dateMsg)
      need('trip_destination', t('orders.errDestination'))
      if (d.trip_from && d.trip_to && d.trip_to < d.trip_from) errors.trip_to = t('orders.errEndBeforeStart')
      break
  }
  if (type === 'hire' && d.salary) {
    const n = Number(String(d.salary).replace(/\s+/g, ''))
    if (!Number.isFinite(n) || n < 0) errors.salary = t('orders.errSalary')
  }
  return errors
}
