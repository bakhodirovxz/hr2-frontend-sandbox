import axios from 'axios'
import i18n from 'i18next'
import { toCyrillic } from '@/i18n/translit'

interface ErrorBody {
  detail?: unknown
  message?: string
  code?: string
  params?: Record<string, unknown>
}

/**
 * hr-backend-sandbox xatosi `{"detail": {code, i18n_key, params, message}}`
 * ko'rinishida keladi (`core/exceptions.py::AppException`); 401 va mehmon /
 * parol darvozalari esa yuqori darajada `code` bilan. Ikkalasi bitta shaklga.
 */
export function normalizeErrorBody(raw: unknown): ErrorBody | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const body = raw as ErrorBody
  const d = body.detail
  if (d && typeof d === 'object' && !Array.isArray(d) && 'code' in d) {
    const inner = d as { code?: string; message?: string; params?: Record<string, unknown> }
    return { code: inner.code, message: inner.message, params: inner.params ?? {}, detail: inner.message }
  }
  return body
}

/** Ish vaqtida yasalgan kalit — tiplangan `t()` uni bilmaydi. */
const tr = (key: string, params?: Record<string, unknown>) =>
  String((i18n.t as unknown as (k: string, o?: object) => string)(key, params ?? {}))

/** Xatoning kodi (`module_forbidden`, `edit_conflict` …) — ikkala shakldan. */
export function errorCode(err: unknown): string | undefined {
  if (!axios.isAxiosError(err)) return undefined
  return normalizeErrorBody(err.response?.data)?.code
}

/** Xatoning parametrlari (`attempts_left`, `until` …). */
export function errorParams(err: unknown): Record<string, unknown> {
  if (!axios.isAxiosError(err)) return {}
  return normalizeErrorBody(err.response?.data)?.params ?? {}
}

/**
 * TZ E3 1729 «Сбой тестирования модуля — Система блокирует модуль»: modul
 * o'z-o'zini sinovdan o'tmagani uchun bloklangan (503 `module_blocked`, bosh
 * administratordan boshqa hamma uchun). Sahifa xato holati buni oddiy
 * «yuklab bo'lmadi» dan ajratib ko'rsatadi.
 */
export function isModuleBlocked(err: unknown): boolean {
  return errorCode(err) === 'module_blocked'
}

/** «Xodimlar» moduli vaqtincha bloklangan … — modul nomi lug'atdan. */
function moduleBlockedMessage(params?: Record<string, unknown>): string {
  const m = typeof params?.module === 'string' ? params.module : ''
  const key = `roleAdmin.mod_${m}`
  const name = m && i18n.exists(key) ? tr(key) : m
  return tr('sysOps.moduleBlockedMsg', { module: name })
}

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
  const data = normalizeErrorBody(err.response?.data)
  if (!data) return fallback
  if (data.code === 'module_blocked') return moduleBlockedMessage(data.params)

  /*
   * TZ sandbox: server xabari O'ZBEKCHA va eng aniq (masalan «KPI» moduliga
   * ruxsat yo'q (kerakli daraja: tahrir)» — modul nomi va daraja serverda
   * qo'yiladi, `params` bo'sh). O'zbek lotinida shuni ko'rsatamiz; kirillda —
   * transliteratsiya; rus tilida kod tarjimasi bo'lsa o'sha, bo'lmasa server
   * matni.
   */
  const lang = i18n.language
  const serverText = typeof data.message === 'string' && data.message.trim() ? data.message.trim() : null
  const isKeyText = (s: string) => /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(s)
  if (serverText && !isKeyText(serverText) && data.code) {
    if (lang === 'uz') return serverText
    if (lang === 'uz_cyrl') return toCyrillic(serverText)
    const key = `errors.${data.code}`
    if (i18n.exists(key)) return tr(key, data.params)
    return serverText
  }

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
    if (i18n.exists(key)) return tr(key, data.params)
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
    if (i18n.exists(key)) return tr(key, data.params)
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
