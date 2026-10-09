import type { User } from '@/types'
import { canWriteOrg, canManageEmployees as canManageEmployeesPerm } from './permissions'

/**
 * KIM QAYSI MODULDA YOZA OLADI — YAGONA MANBA.
 *
 * Har bir javob `/auth/me` modul ruxsati va aktyor ko'lamidan
 * (`src/auth/permissions.ts`) olinadi va hr-frontend-sandbox `App.jsx`
 * darvozalari bilan bir xil. Backend (`require_module` + servis ko'lami) baribir
 * qayta tekshiradi — bu faqat ko'ringan tugma jimgina 403 bermasligi uchun.
 */

/** S1/S2 — bo'limlar, lavozimlar, ierarxiya: tashkilot darajasida tahrir. */
export function canManageStructure(user?: User | null): boolean {
  return canWriteOrg(user, 'structure')
}

/**
 * I2 — bayramlar va ko'chirilgan ish kunlari (`/holidays`). Filial yozuvi —
 * o'z tashkiloti kadri; umumiy (butun tizim) yozuvi — faqat `global` ko'lam,
 * buni sahifa `canWriteGlobal(user, 'attendance')` bilan alohida tekshiradi.
 */
export function canManageHolidays(user?: User | null): boolean {
  return canWriteOrg(user, 'attendance')
}

/** 4.2.9 — buyruq turlari (`/order-types`): buyruqlar moduli to'liq daraja. */
export function canManageOrderTypes(user?: User | null): boolean {
  return canWriteOrg(user, 'orders', 'full')
}

/** C1/C3/C4 — xodim kartalarini tashkilot darajasida boshqarish. */
export function canManageEmployees(user?: User | null): boolean {
  return canManageEmployeesPerm(user)
}
