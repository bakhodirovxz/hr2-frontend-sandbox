import { useSyncExternalStore } from 'react'
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

/**
 * Russian names of structure rows (departments, job positions) seen in the
 * reference lists, keyed by their Uzbek name. Many endpoints (dashboard
 * widgets, statistics rows) return only `department_name` /
 * `job_position_name` strings; with this registry `lt()` can still show the
 * `name_ru` the HR officer entered (TZ 4.1.7).
 */
const dataNamesRu = new Map<string, string>()
const nameKey = (s: string) => normalizeUzApostrophes(s).trim().toLowerCase()

let namesVersion = 0
const namesListeners = new Set<() => void>()

export function registerRuNames(rows: readonly NamedRow[] | null | undefined): void {
  let changed = false
  for (const row of rows ?? []) {
    const ru = ruNameOf(row)
    if (!row?.name || !ru) continue
    const k = nameKey(row.name)
    if (dataNamesRu.get(k) !== ru) {
      dataNamesRu.set(k, ru)
      changed = true
    }
  }
  if (changed) {
    namesVersion += 1
    namesListeners.forEach((fn) => fn())
  }
}

/** Re-render when new Russian structure names become known. */
export function useRuNamesVersion(): number {
  return useSyncExternalStore(
    (fn) => {
      namesListeners.add(fn)
      return () => namesListeners.delete(fn)
    },
    () => namesVersion,
  )
}

/** The ONE way to show a catalogue / structure name in the current language. */
export function localizedName(obj: NamedRow | null | undefined, lang: string): string {
  const name = obj?.name ?? ''
  // Seeded system rows (order types, roles, nationalities…) have no `name_ru`
  // in the database but their Uzbek text is in the interface dictionary.
  if (lang === 'ru') return ruNameOf(obj) || (name && dataNamesRu.get(nameKey(name))) || ruLookup(name) || name
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
