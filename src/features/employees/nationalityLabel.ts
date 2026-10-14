import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useCodeOptions } from '@/features/employees/t2/useT2'
import { lt } from '@/i18n/display'

/**
 * Nationality code → the name people read.
 *
 * ⚠️ THE STORED VALUE IS A LEGACY ABBREVIATION. `Employee.nationality` holds
 * "uzb", "toj", "qoz"; the dictionary is keyed by the full code ("uzbek",
 * "tojik", "qozoq"). A hard-coded five-entry map missed everything else and
 * printed the raw code — the roster page showed "toj" and "Unknown" beside
 * "O'zbek" and "Rus", in three different languages at once.
 *
 * Resolution: exact code first, then a prefix that matches EXACTLY ONE entry.
 * "tur" matches both `turk` and `turkman`, and guessing there would put a
 * wrong nationality on a chart nobody can audit — so an ambiguous value stays
 * as written.
 */
export function useNationalityLabel() {
  const { t, i18n } = useTranslation()
  const nationalities = useCodeOptions('nationalities')
  return useMemo(() => {
    const byCode = new Map(nationalities.map((n) => [n.value.toLowerCase(), n.label]))
    return (raw?: string | null): string => {
      const v = (raw ?? '').trim().toLowerCase()
      if (!v || v === 'unknown') return t('common.unknown')
      const exact = byCode.get(v)
      if (exact) return exact
      const hits = [...byCode.entries()].filter(([code]) => code.startsWith(v))
      // A stored full name («O'zbek») rather than a code: the shared
      // dictionary lookup gives its Russian / Cyrillic form.
      return hits.length === 1 ? hits[0][1] : lt(raw as string)
    }
  }, [nationalities, t, i18n.language])
}
