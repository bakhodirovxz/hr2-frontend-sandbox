import axios from 'axios'
import i18n from 'i18next'

/**
 * Human-readable message for a failed request. The backend raises AppException
 * with `{code, detail}`; FastAPI validation errors come back as a list under
 * `detail`. Swallowing these into a generic "amal bajarilmadi" hid a real bug
 * (a required field rejected with 422) behind a silent close, so every form
 * surfaces the server's own text.
 */
export function errorMessage(err: unknown, fallback: string): string {
  const text = baseErrorMessage(err, fallback)
  // Users reported "404 on some searches" with a screenshot that did not say
  // which request failed. A 404 names what was not found, so the message
  // carries the request path (no query string — search terms stay out of
  // screenshots) and the next report pinpoints the endpoint.
  if (axios.isAxiosError(err) && err.response?.status === 404) {
    const path = (err.config?.url ?? '').split('?')[0]
    if (path) return `${text} (404 · ${path})`
  }
  return text
}

function baseErrorMessage(err: unknown, fallback: string): string {
  if (!axios.isAxiosError(err)) return fallback
  const data = err.response?.data as
    | { detail?: unknown; message?: string; code?: string }
    | undefined
  if (!data) return fallback

  // ⚠️ AVVAL KOD, keyin serverning matni. Backend `message` ni INGLIZCHA
  // yozadi ("Organization branch ID is required to create a folder") — uni
  // to'g'ridan-to'g'ri ko'rsatish foydalanuvchini adashtiradi. Tarjima
  // `i18n/uz.ts` dagi `errors` jadvalida (v1 bilan bir xil), shu bois rus va
  // kirill variantlari ham avtomatik keladi.
  const { detail } = data

  /**
   * ⚠️ `validation_error` is a WRAPPER, not a reason. The backend raises it in
   * 28 places, each with its own specific Uzbek `detail` («Kelajak kuniga
   * davomat yozilmaydi», «Noma'lum davr turi»…), and translating the code threw
   * all of that away: pressing Save simply looked like nothing happened. For
   * such generic codes the server's own sentence IS the message.
   */
  const code = data.code
  /**
   * `conflict` belongs here too. Every one of the backend's twelve 409 raises
   * carries its own Uzbek sentence («Muddatlar kesishmoqda: „…“ shu KPI
   * ko'rsatkichi bo'yicha allaqachon rejalashtirilgan», «Bu filialda „…“ kodli
   * bo'lim allaqachon bor», the delete guard's «bog'liq ma'lumotlar bor (…)»),
   * yet the translated code said «Ma'lumot boshqa o'zgarish bilan to'qnashdi.
   * Sahifani yangilang» — sending the user to reload a page that would then
   * fail identically. Measured live 2026-09-22 on an overlapping work plan.
   */
  const GENERIC_CODES = new Set(['validation_error', 'bad_request', 'conflict'])
  if (code && !GENERIC_CODES.has(code)) {
    const key = `errors.${code}`
    if (i18n.exists(key)) return i18n.t(key as never)
  }
  if (code && GENERIC_CODES.has(code)) {
    // The specific sentence arrives as `message` (AppException serialises it
    // there), with `detail` absent — reading only `detail` found nothing and
    // fell through to the generic translation again.
    // `AppException` writes `message = detail or i18n_key`, so a raise without
    // a sentence arrives as the bare key («errors.conflict») — never show that.
    const isKey = (s: string) => /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(s.trim())
    const specific =
      typeof detail === 'string' && detail.trim() && !isKey(detail)
        ? detail
        : typeof data.message === 'string' && data.message.trim() && !isKey(data.message)
          ? data.message
          : null
    if (specific) return specific
  }
  if (code) {
    const key = `errors.${code}`
    if (i18n.exists(key)) return i18n.t(key as never)
  }
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail)) {
    // FastAPI 422: [{loc: ['body', 'description'], msg: '...'}]
    const parts = detail
      .map((d) => {
        const item = d as { loc?: unknown[]; msg?: string }
        const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : null
        return field ? `${String(field)}: ${item.msg ?? ''}` : (item.msg ?? '')
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }
  if (typeof data.message === 'string' && data.message.trim()) return data.message
  return fallback
}
