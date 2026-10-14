import i18n from './index'
import { localizedName, localizedText, type NamedRow } from './localized'

/**
 * Render-time shortcuts for the reader's language (TZ 4.1.7). Read
 * `i18n.language` when called, so they work in cells / option builders that
 * have no hook; every page already re-renders on a language switch because it
 * uses `useTranslation`.
 */

/** A flat Uzbek text from the server (department_name, status title...). */
export const lt = (text: string | null | undefined): string => localizedText(text, i18n.language)

const REPEAT_AUDIT_PREFIX = 'Takroriy audit: '

/**
 * An audit title from the server. The backend builds repeat audits as
 * «Takroriy audit: <title>»: the fixed prefix is translated by key, the rest
 * is the (user-typed) original title.
 */
export const auditTitle = (title: string | null | undefined): string => {
  const s = title ?? ''
  if (s.startsWith(REPEAT_AUDIT_PREFIX)) {
    const prefix = (i18n.t as unknown as (k: string) => string)('inspections.repeatTitlePrefix')
    return prefix + s.slice(REPEAT_AUDIT_PREFIX.length)
  }
  return lt(s)
}

/** A catalogue row with `name` (+ `name_ru`, or `extra.name_ru`). */
export const ln = (obj: NamedRow | null | undefined): string => localizedName(obj, i18n.language)
