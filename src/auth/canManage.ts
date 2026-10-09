import * as roles from './roles'
import type { User } from '@/types'

/**
 * KIM QAYSI MODULDA YOZA OLADI — YAGONA MANBA.
 *
 * ⚠️ NEGA KERAK: har bir sahifa bu savolni o'zicha hal qilardi, ko'pchiligi
 * esa umuman hal qilmasdi. Natijada foydalanuvchi «Yangi …» tugmasini ko'rar,
 * formani to'ldirar va faqat SAQLAGANDA 403 olardi (jonli tekshirildi: rais
 * kun tartibi, tuzilma, bayramlar, buyruq turlari, navbatchilik). Endi javob
 * shu yerda, backend darvozalarining KO'ZGUSI sifatida turadi.
 *
 * Har bir bandda AYNAN qaysi backend funksiyasi aks etayotgani yozilgan —
 * backend qoidasi o'zgarsa, shu bitta fayl yangilanadi.
 *
 * Bu — QULAYLIK qatlami, xavfsizlik chegarasi EMAS: haqiqiy tekshiruv
 * backendda va u o'z kuchida qoladi.
 */

/** `users.type === 'admin'` — «akt xodimi» hisobi.
 *  `UserType` da bu qiymat sanab o'tilmagan (v2 tipi to'liq emas), shu bois
 *  satr sifatida solishtiriladi. */
function isAdminAccount(user?: User | null): boolean {
  return String(user?.type) === 'admin'
}

/**
 * `core/scoping.py::org_structure_scope` — tashkiliy tuzilmani BOSHQARISH:
 * master-admin, `admin` hisobi va KADR. Qolgani DENY (o'qish ochiq).
 *
 * Shu bitta qoida ostida: bo'limlar, lavozimlar, ierarxiya va NAVBATCHILIK
 * (`duty_day.py::assert_can_manage`). Bayramlar — `canManageHolidays`.
 */
export function canManageStructure(user?: User | null): boolean {
  return roles.isSiteMasterAdmin(user) || isAdminAccount(user) || roles.isHR(user)
}

/**
 * `api/v1/holiday.py::_assert_holiday_writer` — bayram va ko'chirilgan ish
 * kuni butun tashkilotning kalendari (har bir filialga ta'sir qiladi), shu
 * sabab uni faqat BOSH FILIAL kadri, `admin` hisobi va master-admin yozadi
 * (`org_structure_scope` GLOBAL). Filial kadrlari ro'yxatni faqat ko'radi.
 * Bosh filial kadri — serverning o'z hukmi `/me.is_executive_hr`.
 */
export function canManageHolidays(user?: User | null): boolean {
  return roles.isSiteMasterAdmin(user) || isAdminAccount(user) || user?.is_executive_hr === true
}

/**
 * `services/employee.py::_is_privileged_manager` — master-admin / `admin`
 * hisobi / multi-org roli `hr` yoki `ministr`.
 *
 * BUYRUQ TURLARI shu darvoza ortida (`_require_category_manager` aynan shuni
 * chaqiradi).
 */
export function canManageOrderTypes(user?: User | null): boolean {
  return roles.isSiteMasterAdmin(user) || isAdminAccount(user) || roles.isHR(user) || roles.isMinister(user)
}

/**
 * `services/employee.py::_can_crud_employees` — 2026-08-13 da TORAYTIRILGAN:
 * FAQAT kadr va sayt master-admini. Ministr va `admin` hisobi xodimlar
 * sahifasini KO'RADI, lekin yoza olmaydi.
 */
export function canManageEmployees(user?: User | null): boolean {
  return roles.isHR(user) || roles.isSiteMasterAdmin(user)
}
