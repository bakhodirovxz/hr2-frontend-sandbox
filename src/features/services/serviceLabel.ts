import i18n from '@/i18n'

/**
 * Xizmat turining nomi — LUG'ATDAN, backend qaytargan `label` dan EMAS.
 *
 * `/service-requests/catalog` va statistika endpointi nomlarni faqat
 * O'ZBEKCHA beradi (server `SERVICE_LABELS`). Rus yoki kirill tiliga
 * o'tilganda kartochkalar va tanlagichlar ichida o'zbekcha yozuv qolib
 * ketardi — TZ 4.1.7 esa «Все надписи экранных форм … должны быть на
 * выбранном пользователем языке» deydi.
 *
 * Noma'lum kod uchun server matni ZAXIRA bo'lib qoladi: backendga yangi
 * xizmat qo'shilsa, u frontend yangilanmasidan oldin ham nom bilan
 * ko'rinadi, bo'sh emas.
 */
export function serviceLabel(code: string, fallback: string): string {
  const key = `services.type_${code}`
  // Tiplangan `t()` faqat LITERAL kalitni qabul qiladi; bu yerda kalit
  // xizmat KODIDAN yasaladi, shuning uchun cast (izohi `i18n/dynamicKey.ts` da).
  const translate = i18n.t as unknown as (k: string) => string
  return i18n.exists(key) ? translate(key) : fallback
}

/** Katalog tavsifi (TZ I1 1592–1595) — xuddi shu sabab bilan lug'atdan, server matni zaxira. */
export function serviceDescription(code: string, fallback?: string | null): string {
  const key = `svc.desc_${code}`
  const translate = i18n.t as unknown as (k: string) => string
  return i18n.exists(key) ? translate(key) : (fallback ?? '')
}

/** Nega yopiq: mehmon arizasi — faqat mehmon, qolgani — faqat UGE xodimi. */
export function serviceClosedReason(code: string, fallback?: string | null): string {
  const key = code === 'job_application' ? 'svc.reasonGuestOnly' : 'svc.reasonEmployeeOnly'
  const translate = i18n.t as unknown as (k: string) => string
  return i18n.exists(key) ? translate(key) : (fallback ?? '')
}
