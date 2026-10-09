import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useDictionaryOptions, type DictionaryEntry } from '@/features/dictionaries/useDictionaries'
import { detailLabel, orderTypeLabel, type OrderDetails, type OrderTypeCode } from './orderTypes'

/** Dictionary entry in the interface language (`name_ru` for Russian). */
export function dictEntryLabel(e: DictionaryEntry, lang: string): string {
  return lang.startsWith('ru') && e.name_ru ? e.name_ru : e.name
}

/** Dismissal reasons (TZ 4.2.5 «Причины увольнения») as options. */
export function useDismissalReasonOptions(enabled: boolean) {
  const { i18n } = useTranslation()
  const { options, loading } = useDictionaryOptions(enabled ? 'dismissal_reasons' : null)
  const opts = useMemo(
    () => options.map((e) => ({ value: e.code, label: dictEntryLabel(e, i18n.language) })),
    [options, i18n.language],
  )
  return { options: opts, loading }
}

/**
 * The fields specific to the chosen order type (TZ O1 «Пользователь заполняет
 * специфичные поля приказа», contract §9 `details`). v1 `OrderTypeFields`.
 */
export function OrderTypeFields({
  type,
  details,
  onChange,
  effectiveStartDate,
  onEffectiveStartDate,
  errors,
  branchId,
}: {
  type: OrderTypeCode
  details: OrderDetails
  onChange: (next: OrderDetails) => void
  effectiveStartDate: string
  onEffectiveStartDate: (v: string) => void
  errors: Record<string, string>
  branchId: number | null
}) {
  const { t } = useTranslation()
  const positions = useJobPositionOptions(branchId)
  const departments = useDepartmentOptions(branchId)
  const reasons = useDismissalReasonOptions(type === 'dismissal')
  const set = (key: string, value: string) => onChange({ ...details, [key]: value })
  const date = (key: string) => (
    <Field label={detailLabel(t, key, type)} required error={errors[key]}>
      <DateInput value={details[key] ?? ''} onChange={(v) => set(key, v)} invalid={!!errors[key]} />
    </Field>
  )
  const picker = (key: 'position_id' | 'department_id', required: boolean) => (
    <Field label={detailLabel(t, key, type)} required={required} error={errors[key]} wide>
      <Combobox
        value={details[key] ?? ''}
        onChange={(v) => set(key, v)}
        options={key === 'position_id' ? positions : departments}
        placeholder={t('orders.pick')}
        invalid={!!errors[key]}
      />
    </Field>
  )

  return (
    <fieldset className="rounded-panel border border-line bg-surface-2/40 p-4">
      <legend className="px-1 text-[12px] font-semibold uppercase tracking-wide text-brand-strong">
        {t('orders.typeBlock', { type: orderTypeLabel(t, type) })}
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {type === 'hire' && (
          <>
            {date('hire_date')}
            <Field label={detailLabel(t, 'salary', type)} error={errors.salary}>
              <Input
                inputMode="numeric"
                value={details.salary ?? ''}
                onChange={(e) => set('salary', e.target.value.replace(/[^\d\s.]/g, ''))}
                placeholder="5 000 000"
                invalid={!!errors.salary}
              />
            </Field>
            {picker('position_id', true)}
            {picker('department_id', true)}
          </>
        )}
        {type === 'dismissal' && (
          <>
            {date('dismissal_date')}
            <Field label={detailLabel(t, 'dismissal_reason_code', type)} required error={errors.dismissal_reason_code}>
              <Combobox
                value={details.dismissal_reason_code ?? ''}
                onChange={(v) => set('dismissal_reason_code', v)}
                options={reasons.options}
                loading={reasons.loading}
                placeholder={reasons.loading || reasons.options.length ? t('orders.pick') : t('orders.dictEmpty')}
                invalid={!!errors.dismissal_reason_code}
              />
            </Field>
          </>
        )}
        {type === 'transfer' && (
          <>
            <Field label={t('orders.d_transferDate')} required error={errors.effective_start_date} wide>
              <DateInput value={effectiveStartDate} onChange={onEffectiveStartDate} invalid={!!errors.effective_start_date} />
            </Field>
            {picker('position_id', false)}
            {picker('department_id', false)}
          </>
        )}
        {type === 'vacation' && (
          <>
            {date('leave_from')}
            {date('leave_to')}
          </>
        )}
        {type === 'business_trip' && (
          <>
            {date('trip_from')}
            {date('trip_to')}
            <Field label={detailLabel(t, 'trip_destination', type)} required error={errors.trip_destination} wide>
              <Input
                maxLength={255}
                value={details.trip_destination ?? ''}
                onChange={(e) => set('trip_destination', e.target.value)}
                placeholder={t('orders.tripDestinationPlaceholder')}
                invalid={!!errors.trip_destination}
              />
            </Field>
          </>
        )}
      </div>
    </fieldset>
  )
}
