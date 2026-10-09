import { useTranslation } from 'react-i18next'
import { Languages, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { IconButton } from '@/components/ui/IconButton'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { entryLabel } from '@/features/vacancies/RequiredLanguagesChips'
import type { RequiredLanguage } from '@/features/vacancies/useVacancies'

/**
 * TZ V1 «Требования к кандидату (…, ЗНАНИЕ ЯЗЫКОВ)» — `required_languages:
 * [{language_code, level_code}]`; codes come from the «Chet tillari»
 * (`foreign_languages`) and «Til bilish darajasi» (`language_levels`)
 * dictionaries.
 */

/** For saving: rows without a language are dropped, repeats merged. */
export function cleanLanguages(rows: RequiredLanguage[] | null | undefined): RequiredLanguage[] {
  const seen = new Set<string>()
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => {
      if (!r?.language_code || seen.has(r.language_code)) return false
      seen.add(r.language_code)
      return true
    })
    .map((r) => ({ language_code: r.language_code, level_code: r.level_code || null }))
}

export function RequiredLanguagesEditor({
  value,
  onChange,
}: {
  value: RequiredLanguage[]
  onChange: (rows: RequiredLanguage[]) => void
}) {
  const { t, i18n } = useTranslation()
  const languages = useDictionaryOptions('foreign_languages')
  const levels = useDictionaryOptions('language_levels')
  const opt = (list: typeof languages.options) =>
    list.map((e) => ({ value: e.code, label: entryLabel(list, e.code, i18n.language) }))
  const langOptions = opt(languages.options)
  const levelOptions = opt(levels.options)

  const update = (i: number, patch: Partial<RequiredLanguage>) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-2 text-[13px] font-medium text-fg-muted">
        <Languages size={14} /> {t('orgRef.languages')}
      </span>
      {value.length === 0 && <span className="text-[12px] text-fg-subtle">{t('orgRef.notRequired')}</span>}
      {value.map((r, i) => {
        const taken = new Set(value.filter((_, idx) => idx !== i).map((x) => x.language_code))
        return (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Combobox
              value={r.language_code || ''}
              onChange={(v) => update(i, { language_code: v })}
              options={langOptions.filter((o) => !taken.has(o.value))}
              placeholder={t('orgRef.pickLanguage')}
            />
            <Combobox
              value={r.level_code || ''}
              onChange={(v) => update(i, { level_code: v || null })}
              options={levelOptions}
              placeholder={t('orgRef.pickLevel')}
            />
            <IconButton size="sm" label={t('orgRef.removeRow')} onClick={() => onChange(value.filter((_, idx) => idx !== i))}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        )
      })}
      <Button
        size="sm"
        variant="outline"
        className="self-start"
        leftIcon={<Plus size={14} />}
        onClick={() => onChange([...value, { language_code: '', level_code: null }])}
      >
        {t('orgRef.addLanguage')}
      </Button>
    </div>
  )
}
