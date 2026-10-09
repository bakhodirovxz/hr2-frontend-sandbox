import { useTranslation } from 'react-i18next'
import { useDictionaryOptions, type DictionaryEntry } from '@/features/dictionaries/useDictionaries'
import { toCyrillic } from '@/i18n/translit'
import type { RequiredLanguage } from './useVacancies'

/**
 * TZ V1 «Требования к кандидату (…, ЗНАНИЕ ЯЗЫКОВ)» — shtat qatorining
 * `required_languages` maydoni `[{language_code, level_code}]`; kodlar
 * «Chet tillari» (`foreign_languages`) va «Til bilish darajasi»
 * (`language_levels`) ma'lumotnomalaridan. Kartochka uchun ixcham ko'rinish.
 */

/** Yozuv nomi joriy tilda: ru → `name_ru`, kirill → transliteratsiya. */
export function entryLabel(entries: DictionaryEntry[], code: string | null | undefined, lang: string): string {
  if (!code) return ''
  const e = entries.find((x) => x.code === code)
  if (!e) return code
  if (lang === 'ru' && e.name_ru) return e.name_ru
  if (lang === 'uz_cyrl') return toCyrillic(e.name)
  return e.name || e.code
}

/** Tili yo'q qatorlar tashlanadi, takrorlar birlashadi. */
function clean(rows: RequiredLanguage[] | null | undefined): RequiredLanguage[] {
  const seen = new Set<string>()
  return (Array.isArray(rows) ? rows : []).filter((r) => {
    if (!r?.language_code || seen.has(r.language_code)) return false
    seen.add(r.language_code)
    return true
  })
}

export function RequiredLanguagesChips({ value }: { value: RequiredLanguage[] | null | undefined }) {
  const { i18n } = useTranslation()
  const rows = clean(value)
  const languages = useDictionaryOptions(rows.length ? 'foreign_languages' : null)
  const levels = useDictionaryOptions(rows.length ? 'language_levels' : null)
  if (!rows.length) return null
  return (
    <span className="flex flex-wrap gap-1.5">
      {rows.map((r) => (
        <span
          key={r.language_code}
          className="whitespace-nowrap rounded-[var(--r-xs)] bg-brand-soft px-2 py-0.5 text-[12px] font-medium text-brand-strong ring-1 ring-inset ring-brand/25"
        >
          {entryLabel(languages.options, r.language_code, i18n.language)}
          {r.level_code ? ` · ${entryLabel(levels.options, r.level_code, i18n.language)}` : ''}
        </span>
      ))}
    </span>
  )
}
