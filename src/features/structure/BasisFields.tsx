import { useTranslation } from 'react-i18next'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'
import type { Basis } from './useDepartmentAdmin'

/** To'liq kiritilganmi — raqam va sana. */
export function isBasisComplete(b: Basis): boolean {
  return !!(b.number.trim() && b.date)
}

export const EMPTY_BASIS: Basis = { number: '', date: '' }

/**
 * Asos buyrug'i bloki (TZ S2 «Пользователь указывает основание для изменения
 * (приказ)»): raqami va sanasi. Bo'lim tahriri, qisqartirish/qayta tiklash va
 * «Qayta tuzish» uchun majburiy (`basis_number`, `basis_date`).
 */
export function BasisFields({
  value,
  onChange,
  title,
  required = true,
  error,
}: {
  value: Basis
  onChange: (next: Basis) => void
  title?: string
  required?: boolean
  error?: string | null
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="rounded-lg border border-brand/30 bg-brand-soft/40 p-3">
      <legend className="px-1.5 text-[13px] font-semibold text-fg">
        {title ?? t('orgAdmin.basisTitle')}
        {required && <span className="text-danger"> *</span>}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('orgAdmin.basisNumber')} required={required}>
          <Input
            value={value.number}
            maxLength={64}
            invalid={!!error && !value.number.trim()}
            onChange={(e) => onChange({ ...value, number: e.target.value })}
          />
        </Field>
        <Field label={t('orgAdmin.basisDate')} required={required}>
          <DateInput
            value={value.date}
            invalid={!!error && !value.date}
            onChange={(v) => onChange({ ...value, date: v })}
            aria-label={t('orgAdmin.basisDate')}
          />
        </Field>
      </div>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </fieldset>
  )
}
