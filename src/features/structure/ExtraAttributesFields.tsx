import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useDictionaryOptions, type DictionaryEntry } from '@/features/dictionaries/useDictionaries'
import { entryLabel } from './usePositionAdmin'

type Target = 'department' | 'job_position'
type ValueType = 'text' | 'number' | 'date' | 'bool'

/**
 * Qo'shimcha ma'lumotlar (TZ S1 «Внесение дополнительных сведений о
 * подразделениях», 4.2.6 · 2049/2060). Turlari `extra_attribute_kinds`
 * ma'lumotnomasida: `extra.target` (department | job_position) va
 * `extra.value_type` (text | number | date | bool). Qiymatlar
 * `{kind_code: value}` ko'rinishida saqlanadi. Mos tur yo'q bo'lsa — hech
 * narsa chizilmaydi.
 */
export function useExtraAttributeKinds(target: Target, enabled = true) {
  const { options } = useDictionaryOptions(enabled ? 'extra_attribute_kinds' : null)
  return options.filter((e) => (e.extra as { target?: string } | null | undefined)?.target === target)
}

const typeOf = (k: DictionaryEntry): ValueType =>
  ((k.extra as { value_type?: ValueType } | null | undefined)?.value_type ?? 'text') as ValueType

export function ExtraAttributesFields({
  target,
  value,
  onChange,
}: {
  target: Target
  value: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const kinds = useExtraAttributeKinds(target)
  if (!kinds.length) return null
  const set = (code: string, v: unknown) => onChange({ ...value, [code]: v })
  return (
    <div>
      <p className="mb-2 text-[13px] font-semibold text-fg">{t('orgAdmin.extraTitle')}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.map((k) => {
          const type = typeOf(k)
          const v = value[k.code]
          const label = entryLabel(k)
          if (type === 'bool') {
            return (
              <div key={k.code} className="flex items-end pb-2">
                <Checkbox label={label} checked={!!v} onChange={(e) => set(k.code, e.target.checked)} />
              </div>
            )
          }
          if (type === 'date') {
            return (
              <Field key={k.code} label={label}>
                <DateInput value={typeof v === 'string' ? v : ''} onChange={(d) => set(k.code, d || null)} aria-label={label} />
              </Field>
            )
          }
          return (
            <Field key={k.code} label={label}>
              <Input
                type={type === 'number' ? 'number' : 'text'}
                value={v == null ? '' : String(v)}
                onChange={(e) => {
                  const raw = e.target.value
                  set(k.code, raw === '' ? null : type === 'number' ? Number(raw) : raw)
                }}
              />
            </Field>
          )
        })}
      </div>
    </div>
  )
}

/** Faqat o'qish uchun — kartochkada. */
export function ExtraAttributesView({ target, value }: { target: Target; value?: Record<string, unknown> | null }) {
  const { t } = useTranslation()
  const kinds = useExtraAttributeKinds(target)
  if (!kinds.length) return null
  const show = (k: DictionaryEntry) => {
    const v = value?.[k.code]
    if (v === undefined || v === null || v === '') return '—'
    const type = typeOf(k)
    if (type === 'bool') return v ? t('orgAdmin.yes') : t('orgAdmin.no')
    if (type === 'date' && typeof v === 'string' && dayjs(v).isValid()) return dayjs(v).format('DD.MM.YYYY')
    return String(v)
  }
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{t('orgAdmin.extraTitle')}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {kinds.map((k) => (
          <div key={k.code} className="min-w-0">
            <dt className="text-[12px] text-fg-muted">{entryLabel(k)}</dt>
            <dd className="break-words text-[14px] text-fg">{show(k)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
