import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Home, IdCard, MapPin, Pencil, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { fmtDate } from '../format'
import { DocumentsSlot } from './DocumentsSlot'
import type { T2TabProps } from './GeneralTab'
import { FieldGrid, ReadField, T2Section, nullifyEmpty, useT2Save } from './T2Ui'
import { labelOf, useCardName, useCodeOptions, useDistrictOptions } from './useT2'

/**
 * «Fotosurat» (TZ 4.2.7 · 2068, 2152): the portrait is uploaded / replaced
 * in the employee form (`photo_base64`); here it is shown and enlarged.
 */
export function PhotoTab({ employee, canEdit, onEditEmployee }: T2TabProps) {
  const { t } = useTranslation()
  const photo = employee.photo_path
  return (
    <T2Section
      icon={<Camera size={15} />}
      title={t('personnel.tabs.photo')}
      actions={
        canEdit && onEditEmployee ? (
          <Button size="sm" variant="outline" leftIcon={<Pencil size={13} />} onClick={onEditEmployee}>
            {photo ? t('personnel.t2.replacePhoto') : t('personnel.t2.uploadPhoto')}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col items-start gap-4 sm:flex-row">
        {photo ? (
          <a
            href={photo}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('personnel.t2.enlargePhoto')}
            title={t('personnel.t2.enlargePhoto')}
            className="block aspect-[3/4] w-[220px] max-w-full overflow-hidden rounded-lg border border-line"
          >
            <img src={photo} alt={employee.legal_name ?? ''} className="h-full w-full object-cover" />
          </a>
        ) : (
          <div className="flex aspect-[3/4] w-[220px] max-w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-fg-subtle">
            <User size={48} strokeWidth={1.2} aria-hidden />
            <span className="text-[12px]">{t('personnel.t2.noPhoto')}</span>
          </div>
        )}
        <p className="max-w-[360px] text-[12.5px] leading-relaxed text-fg-muted">{t('personnel.t2.photoHint')}</p>
      </div>
    </T2Section>
  )
}

/**
 * «Pasport ma'lumotlari»: JSHSHIR, pasport, berilgan sana va joy, amal
 * qilish muddati, STIR, ShJPHR + pasport skani. Raqamlar xodim formasida
 * (dublikat nazorati o'sha yerda), sanalar — T-2 orqali.
 */
export function PassportTab({ employee, card, canEdit, onEditEmployee }: T2TabProps) {
  const { t } = useTranslation()
  const { saving, patch, begin } = useT2Save(employee.id, () => setEditing(false))
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ pasport_issue_date: '', pasport_expiry_date: '' })
  const values = card.values ?? {}
  const passport = [employee.pasport_series, employee.pasport_number].filter(Boolean).join(' ')

  return (
    <div className="flex flex-col gap-3">
      <T2Section
        icon={<IdCard size={15} />}
        title={t('personnel.tabs.passport')}
        canEdit={canEdit}
        editing={editing}
        onEdit={() => {
          setForm({ pasport_issue_date: values.pasport_issue_date ?? '', pasport_expiry_date: values.pasport_expiry_date ?? '' })
          begin('passport')
          setEditing(true)
        }}
        onCancel={() => setEditing(false)}
        onSave={async () => {
          if (await patch(nullifyEmpty(form), 'passport')) setEditing(false)
        }}
        saving={saving === 'passport'}
        actions={
          canEdit && onEditEmployee && !editing ? (
            <Button size="sm" variant="outline" leftIcon={<Pencil size={13} />} onClick={onEditEmployee}>
              {t('personnel.t2.editNumbers')}
            </Button>
          ) : undefined
        }
      >
        <FieldGrid>
          <ReadField label={t('personnel.f.pinfl')} value={employee.personal_identification_number} />
          <ReadField label={t('personnel.f.passport')} value={passport} />
          {editing ? (
            <>
              <Field label={t('personnel.f.passportIssueDate')}>
                <DateInput value={form.pasport_issue_date} onChange={(v) => setForm((f) => ({ ...f, pasport_issue_date: v }))} aria-label={t('personnel.f.passportIssueDate')} />
              </Field>
              <Field label={t('personnel.f.passportExpiry')}>
                <DateInput value={form.pasport_expiry_date} onChange={(v) => setForm((f) => ({ ...f, pasport_expiry_date: v }))} aria-label={t('personnel.f.passportExpiry')} />
              </Field>
            </>
          ) : (
            <>
              <ReadField label={t('personnel.f.passportIssueDate')} value={values.pasport_issue_date ? fmtDate(values.pasport_issue_date) : ''} />
              <ReadField label={t('personnel.f.passportExpiry')} value={values.pasport_expiry_date ? fmtDate(values.pasport_expiry_date) : ''} />
            </>
          )}
          <ReadField label={t('personnel.f.passportIssuedBy')} value={employee.pasport_issue_by} />
          <ReadField label={t('personnel.f.inn')} value={employee.taxpayer_identification_number} />
          <ReadField label={t('personnel.f.inps')} value={employee.individual_accumulative_pension_account_number} />
        </FieldGrid>
      </T2Section>

      <DocumentsSlot employeeId={employee.id} kind="passport" title={t('personnel.docs.passportScan')} canEdit={canEdit} />
    </div>
  )
}

const ADDRESS_KEYS = [
  'birth_country_code',
  'birth_region_code',
  'birth_district_code',
  'residence_country_code',
  'residence_region_code',
  'residence_district_code',
  'residence_address',
] as const

/**
 * «Manzil»: tug'ilgan joy (davlat / viloyat / tuman) va yashash joyi
 * (davlat / viloyat / tuman / manzil). Tuman ro'yxati tanlangan viloyatga
 * bog'liq; ikkala bo'lim bitta PATCH bilan saqlanadi.
 */
export function AddressTab({ employee, card, canEdit }: T2TabProps) {
  const { t } = useTranslation()
  const cardName = useCardName(card)
  const { saving, patch, begin } = useT2Save(employee.id, () => setEditing(false))
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const values = card.values ?? {}
  const cur: Record<string, string> = editing
    ? form
    : {
        ...Object.fromEntries(ADDRESS_KEYS.map((k) => [k, String(values[k] ?? '')])),
        residence_country_code: values.residence_country_code ?? employee.residence_country_code ?? '',
        residence_address: values.residence_address ?? employee.residence_address ?? '',
      }
  const countries = useCodeOptions('countries')
  const regions = useCodeOptions('regions')
  const birthDistricts = useDistrictOptions(cur.birth_region_code)
  const resDistricts = useDistrictOptions(cur.residence_region_code)

  const set = (k: string) => (v: string) =>
    setForm((f) => {
      const next = { ...f, [k]: v }
      if (k === 'birth_region_code') next.birth_district_code = ''
      if (k === 'residence_region_code') next.residence_district_code = ''
      return next
    })

  const pick = (k: string, label: string, options: typeof countries, disabled = false, placeholder?: string) => (
    <Field label={label}>
      <Combobox
        value={form[k] ?? ''}
        onChange={set(k)}
        options={options}
        clearable
        disabled={disabled}
        placeholder={placeholder ?? t('common.choose')}
      />
    </Field>
  )

  return (
    <div className="flex flex-col gap-3">
      <T2Section
        icon={<MapPin size={15} />}
        title={t('personnel.t2.birthPlace')}
        canEdit={canEdit}
        editing={editing}
        onEdit={() => {
          setForm({ ...cur })
          begin('address')
          setEditing(true)
        }}
        onCancel={() => setEditing(false)}
        onSave={async () => {
          if (await patch(nullifyEmpty(form), 'address')) setEditing(false)
        }}
        saving={saving === 'address'}
      >
        {editing ? (
          <FieldGrid>
            {pick('birth_country_code', t('personnel.t2.country'), countries)}
            {pick('birth_region_code', t('personnel.t2.region'), regions)}
            {pick(
              'birth_district_code',
              t('personnel.t2.district'),
              birthDistricts,
              !form.birth_region_code,
              form.birth_region_code ? undefined : t('personnel.t2.regionFirst'),
            )}
          </FieldGrid>
        ) : (
          <FieldGrid>
            <ReadField label={t('personnel.t2.country')} value={cardName('birth_country_name') || labelOf(countries, values.birth_country_code)} />
            <ReadField label={t('personnel.t2.region')} value={cardName('birth_region_name') || labelOf(regions, values.birth_region_code)} />
            <ReadField label={t('personnel.t2.district')} value={cardName('birth_district_name') || labelOf(birthDistricts, values.birth_district_code)} />
          </FieldGrid>
        )}
      </T2Section>

      <T2Section icon={<Home size={15} />} title={t('personnel.t2.residence')} hint={editing ? t('personnel.t2.savedTogether') : undefined}>
        {editing ? (
          <FieldGrid>
            {pick('residence_country_code', t('personnel.t2.country'), countries)}
            {pick('residence_region_code', t('personnel.t2.region'), regions)}
            {pick(
              'residence_district_code',
              t('personnel.t2.district'),
              resDistricts,
              !form.residence_region_code,
              form.residence_region_code ? undefined : t('personnel.t2.regionFirst'),
            )}
            <Field label={t('personnel.t2.address')} className="sm:col-span-2 lg:col-span-3">
              <Input
                value={form.residence_address ?? ''}
                maxLength={1000}
                placeholder={t('personnel.form.streetPlaceholder')}
                onChange={(e) => set('residence_address')(e.target.value)}
              />
            </Field>
          </FieldGrid>
        ) : (
          <FieldGrid>
            <ReadField label={t('personnel.t2.country')} value={cardName('residence_country_name') || labelOf(countries, cur.residence_country_code)} />
            <ReadField label={t('personnel.t2.region')} value={cardName('residence_region_name') || labelOf(regions, values.residence_region_code)} />
            <ReadField label={t('personnel.t2.district')} value={cardName('residence_district_name') || labelOf(resDistricts, values.residence_district_code)} />
            <ReadField label={t('personnel.t2.address')} value={cur.residence_address} />
            <ReadField label={t('personnel.f.regAddress')} value={employee.address} />
          </FieldGrid>
        )}
      </T2Section>
    </div>
  )
}
