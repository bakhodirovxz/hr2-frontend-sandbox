import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Hash, IdCard, ImageIcon, Phone, Save } from 'lucide-react'
import { apiGet, apiPatch } from '@/api/http'
import { EMPLOYEE_SELF_UPDATE } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { useCodeOptions } from '@/features/employees/t2/useT2'
import { EditConflictDialog, editConflictOf, recordOwnWrite, resolveBase, type EditConflictInfo } from '../editConflict'
import { MARITAL_VALUES, maritalKey } from './MyGeneralInfo'
import { MAX_PHOTO_BYTES, readImage, useRefreshAccount, type MyEmployee } from './useMyAccount'

const KEYS = [
  'legal_name',
  'birth_date',
  'gender',
  'nationality',
  'phone_number',
  'internal_phone_number',
  'address',
  'pasport_series',
  'pasport_number',
  'pasport_individual_number',
  'pasport_issue_by',
  'personal_identification_number',
  'taxpayer_identification_number',
  'individual_accumulative_pension_account_number',
  'maritial_status',
] as const
type Key = (typeof KEYS)[number]
type Form = Record<Key, string>

function toForm(employee: MyEmployee): Form {
  const o = {} as Form
  for (const k of KEYS) {
    const v = (employee as unknown as Record<string, unknown>)[k]
    o[k] = v == null ? '' : String(v)
  }
  return o
}

/** Kiritish paytidagi maskalar (hujjat raqamlari shakli). */
function mask(key: Key, v: string): string {
  switch (key) {
    case 'personal_identification_number':
    case 'pasport_individual_number':
    case 'individual_accumulative_pension_account_number':
      return v.replace(/\D/g, '').slice(0, 14)
    case 'pasport_series':
      return v.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 2)
    case 'pasport_number':
      return v.replace(/\D/g, '').slice(0, 7)
    case 'taxpayer_identification_number':
      return v.replace(/\D/g, '').slice(0, 9)
    case 'internal_phone_number':
      return v.replace(/\D/g, '').slice(0, 6)
    case 'phone_number':
      return v.startsWith('+') ? '+' + v.slice(1).replace(/\D/g, '').slice(0, 12) : v.replace(/\D/g, '').slice(0, 13)
    default:
      return v
  }
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} icon={icon} />
      <CardBody className="p-card">{children}</CardBody>
    </Card>
  )
}

/**
 * «Tahrirlash» — xodimning o'z shaxsiy ma'lumotlari (TZ L2 946–963):
 * `PATCH /employees/me/self-update`. Lavozim va bo'lim bu yerda yo'q —
 * ularni kadrlar xizmati o'zgartiradi. Faqat o'zgargan maydonlar yuboriladi.
 */
/** Fields the employee may change himself (TZ C3: the rest goes through HR). */
const SELF_EDITABLE = new Set<string>(['phone_number', 'internal_phone_number'])

export function MyEditForm({
  employee,
  onCancel,
  onSaved,
}: {
  employee: MyEmployee
  onCancel: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const refresh = useRefreshAccount()
  const nationalities = useCodeOptions('nationalities')
  const fileRef = useRef<HTMLInputElement>(null)

  const initial = useMemo(() => toForm(employee), [employee])
  const [form, setForm] = useState<Form>(initial)
  // TZ C3 1062: the card's `updated_at` when the form opened.
  const [base, setBase] = useState<string | null | undefined>(employee.updated_at)
  const [conflict, setConflict] = useState<EditConflictInfo | null>(null)
  const [photo, setPhoto] = useState<{ preview: string; base64: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const set = (k: Key) => (v: string) => setForm((f) => ({ ...f, [k]: mask(k, v) }))
  // TZ C3: personnel data is changed by HR on a basis document; the employee
  // edits only contacts and the photo (backend 403 `self_update_hr_only`).
  const locked = (k: Key) => !SELF_EDITABLE.has(k)
  const input = (k: Key, label: string, extra?: { placeholder?: string; maxLength?: number; inputMode?: 'tel' | 'numeric' }) => (
    <Field label={label}>
      <Input
        name={k}
        disabled={locked(k)}
        value={form[k]}
        onChange={(e) => set(k)(e.target.value)}
        placeholder={extra?.placeholder}
        maxLength={extra?.maxLength}
        inputMode={extra?.inputMode}
        spellCheck={false}
      />
    </Field>
  )

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) return toast.error(t('account.photoOnlyImage'))
    if (file.size > MAX_PHOTO_BYTES) return toast.error(t('account.photoTooBig'))
    setPhoto(await readImage(file))
  }

  const validate = (): string => {
    if (form.phone_number && !/^(\+?998\d{9}|\d{9})$/.test(form.phone_number)) return t('account.errPhone')
    return ''
  }

  const save = async () => {
    const msg = validate()
    if (msg) return toast.error(msg)
    const body: Record<string, unknown> = {}
    for (const k of KEYS) {
      if (form[k] === initial[k]) continue
      const v = form[k].trim()
      body[k] = k === 'gender' ? (v ? Number(v) : null) : v || null
    }
    if (photo) body.photo_base64 = photo.base64
    if (!Object.keys(body).length) return toast.info(t('account.noChanges'))
    setSaving(true)
    const expected = resolveBase(employee.id, base)
    try {
      const res = await apiPatch<{ employee?: { updated_at?: string | null } }>(EMPLOYEE_SELF_UPDATE, { ...body, expected_updated_at: expected })
      recordOwnWrite(employee.id, expected, res?.employee?.updated_at)
      await refresh(employee.id)
      setPhoto(null)
      toast.ok(t('account.saved'))
      onSaved()
    } catch (err) {
      const clash = editConflictOf(err)
      if (clash) setConflict(clash)
      else toast.error(errorMessage(err, t('account.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  /** «Yangisini yuklash»: the latest saved card replaces the form. */
  const reload = async () => {
    try {
      const fresh = await apiGet<MyEmployee>(`employees/${employee.id}`)
      setForm(toForm(fresh))
      setBase(fresh.updated_at)
      setPhoto(null)
      await refresh(employee.id)
      toast.info(t('hrExt.conflict.reloaded'))
    } catch (err) {
      toast.error(errorMessage(err, t('account.saveFailed')))
    }
  }

  const nationalityOptions = useMemo(() => {
    const opts = nationalities.map((n) => ({ value: n.value, label: n.label }))
    if (form.nationality && !opts.some((o) => o.value === form.nationality)) opts.push({ value: form.nationality, label: form.nationality })
    return opts
  }, [nationalities, form.nationality])

  const maritalOptions = MARITAL_VALUES.map((v) => ({ value: v, label: t(`account.marital_${maritalKey(v) as 'single'}`) }))
  if (form.maritial_status && !(MARITAL_VALUES as readonly string[]).includes(form.maritial_status)) {
    maritalOptions.push({ value: form.maritial_status as (typeof MARITAL_VALUES)[number], label: form.maritial_status })
  }

  return (
    <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-start">
      <Card className="flex w-full shrink-0 flex-col items-center gap-3 p-5 md:w-[220px]">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-card ring-1 ring-line transition hover:ring-brand"
          aria-label={t('account.changePhoto')}
        >
          <Avatar src={photo?.preview || employee.photo_thumb_path || employee.photo_path} fallbackSrc={employee.photo_path} name={form.legal_name} size={150} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        <Button type="button" variant="outline" size="sm" className="w-full" leftIcon={<ImageIcon size={14} />} onClick={() => fileRef.current?.click()}>
          {t('account.changePhoto')}
        </Button>
        {photo && <span className="text-xs text-brand-strong">{t('account.photoPicked')}</span>}
      </Card>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <p role="note" className="rounded-inner bg-info-soft px-3 py-2 text-[12.5px] text-info">
          {t('account.hrOnlyHint')}{' '}
          <Link to="/services" className="font-semibold underline">
            {t('account.hrOnlyLink')}
          </Link>
        </p>
        <Section title={t('account.sectionDocuments')} icon={<IdCard />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {input('pasport_series', t('account.passportSeries'), { placeholder: 'AA', maxLength: 2 })}
            {input('pasport_number', t('account.passportNumber'), { placeholder: '1234567', maxLength: 7, inputMode: 'numeric' })}
            {input('pasport_individual_number', t('account.passportIndividual'), { placeholder: '12345678901234', maxLength: 14, inputMode: 'numeric' })}
            {input('pasport_issue_by', t('account.passportIssuedBy'))}
          </div>
        </Section>

        <Section title={t('account.sectionIds')} icon={<Hash />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {input('personal_identification_number', t('account.pinflLong'), { placeholder: '12345678901234', maxLength: 14, inputMode: 'numeric' })}
            {input('taxpayer_identification_number', t('account.tinLong'), { placeholder: '123456789', maxLength: 9, inputMode: 'numeric' })}
            {input('individual_accumulative_pension_account_number', t('account.pension'), { placeholder: '12345678901234', maxLength: 14, inputMode: 'numeric' })}
          </div>
        </Section>

        <Section title={t('account.sectionContact')} icon={<Phone />}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">{input('legal_name', t('account.fullName'))}</div>
            {input('phone_number', t('account.phone'), { placeholder: '+998901234567', inputMode: 'tel' })}
            {input('internal_phone_number', t('account.internalPhone'), { placeholder: '1234', maxLength: 6, inputMode: 'numeric' })}
            <Field label={t('account.birthDate')}>
              <DateInput value={form.birth_date} onChange={set('birth_date')} name="birth_date" aria-label={t('account.birthDate')} disabled />
            </Field>
            <Field label={t('account.maritalStatus')}>
              <Select
                value={form.maritial_status}
                disabled
                onChange={(e) => set('maritial_status')(e.target.value)}
                options={maritalOptions}
                placeholder={t('account.notSelected')}
                aria-label={t('account.maritalStatus')}
              />
            </Field>
            <Field label={t('account.gender')}>
              <Select
                value={form.gender}
                disabled
                onChange={(e) => set('gender')(e.target.value)}
                options={[
                  { value: '1', label: t('account.male') },
                  { value: '2', label: t('account.female') },
                ]}
                placeholder={t('account.notSelected')}
                aria-label={t('account.gender')}
              />
            </Field>
            <Field label={t('account.nationality')}>
              <Combobox
                value={form.nationality}
                disabled
                onChange={set('nationality')}
                options={nationalityOptions}
                placeholder={t('account.notSelected')}
              />
            </Field>
            <div className="md:col-span-2">{input('address', t('account.registeredAddress'))}</div>
          </div>
        </Section>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} loading={saving} leftIcon={<Save size={15} />}>
            {t('common.save')}
          </Button>
        </div>
        <EditConflictDialog conflict={conflict} onReload={reload} onClose={() => setConflict(null)} />
      </div>
    </div>
  )
}
