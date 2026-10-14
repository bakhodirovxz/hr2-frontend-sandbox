import { useTranslation } from 'react-i18next'
import { normalizeUzApostrophes, toCyrillic } from './translit'
import { ruLookup } from './index'

/**
 * A database row whose display name exists in Uzbek (`name`) and, optionally,
 * Russian (`name_ru` on the row, or `extra.name_ru` for departments and job
 * positions, which keep it in their JSONB). TZ 4.1.7: Russian readers see
 * `name_ru` when it is set, Cyrillic readers the transliterated Uzbek name.
 */
export interface NamedRow {
  name?: string | null
  name_ru?: string | null
  extra?: { name_ru?: string | null } | Record<string, unknown> | null
}

/** Russian name of a row, wherever it is stored. */
export function ruNameOf(obj: NamedRow | null | undefined): string | null {
  if (!obj) return null
  if (obj.name_ru) return obj.name_ru
  const extra = obj.extra as { name_ru?: unknown } | null | undefined
  return typeof extra?.name_ru === 'string' && extra.name_ru ? extra.name_ru : null
}

/** The ONE way to show a catalogue / structure name in the current language. */
export function localizedName(obj: NamedRow | null | undefined, lang: string): string {
  const name = obj?.name ?? ''
  // Seeded system rows (order types, roles, nationalities…) have no `name_ru`
  // in the database but their Uzbek text is in the interface dictionary.
  if (lang === 'ru') return ruNameOf(obj) || ruLookup(name) || name
  if (lang === 'uz_cyrl') return toCyrillic(name)
  return normalizeUzApostrophes(name)
}

/** A plain Uzbek name with an optional Russian form. */
export function localizedPair(name: string | null | undefined, nameRu: string | null | undefined, lang: string): string {
  return localizedName({ name, name_ru: nameRu }, lang)
}

/**
 * A fixed server text (status name, rule title, built-in form name) in the
 * current language: Russian from the dictionary, Cyrillic by transliteration,
 * unchanged when unknown.
 */
export function localizedText(text: string | null | undefined, lang: string): string {
  return localizedName({ name: text ?? '' }, lang)
}

/** Hook form: `const ln = useLocalizedName(); ln(row)`. */
export function useLocalizedName(): (obj: NamedRow | null | undefined) => string {
  const { i18n } = useTranslation()
  const lang = i18n.language
  return (obj) => localizedName(obj, lang)
}
