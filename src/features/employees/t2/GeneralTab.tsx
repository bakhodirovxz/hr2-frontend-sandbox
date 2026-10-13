import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListPlus, Pencil, Shield, User } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { fmtDate, usePersonnelLabels } from '../format'
import type { EmployeeFull, ExtraAttribute, T2Card } from '../types'
import { FieldGrid, ReadField, T2Section, nullifyEmpty, useT2Save } from './T2Ui'
import { labelOf, useCardName, useCodeOptions } from './useT2'

export interface T2TabProps {
  employee: EmployeeFull
  card: T2Card
  canEdit: boolean
  onEditEmployee?: () => void
}

const SCALARS = ['nationality_code', 'military_obligation_code', 'military_rank_code', 'political_party_code'] as const

function extraText(a: ExtraAttribute, value: unknown, yes: string, no: string): string {
  if (value === null || value === undefined || value === '') return '—'
  if (a.value_type === 'bool') return value ? yes : no
  if (a.value_type === 'date') return fmtDate(String(value))
  return String(value)
}

/**
 * «Umumiy ma'lumot»: F.I.Sh., tug'ilgan sana, jins, oilaviy holat, millat,
 * ishlaydi/bo'shatilgan, shartnoma turi, tabel raqami (xodim formasida
 * tahrirlanadi) + harbiy xizmat va partiyaviylik (T-2) + qo'shimcha
 * ma'lumotlar (TZ 4.2.7 · 2153, `extra_attribute_kinds`).
 */
export function GeneralTab({ employee, card, canEdit, onEditEmployee }: T2TabProps) {
  const { t } = useTranslation()
  const labels = usePersonnelLabels()
  const cardName = useCardName(card)
  const { saving, patch, begin } = useT2Save(employee.id, (key) => (key === 'extra' ? setExtraEditing(false) : setEditing(false)))
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [extraEditing, setExtraEditing] = useState(false)
  const [extra, setExtra] = useState<Record<string, unknown>>({})

  const nationalities = useCodeOptions('nationalities')
  const obligation = useCodeOptions('military_obligation')
  const ranks = useCodeOptions('military_ranks')
  const parties = useCodeOptions('political_parties')
  const values = card.values ?? {}
  const archived = !!employee.is_archived
  const attrs = card.extra_attributes ?? []
  const savedExtra = (card.extra ?? card.values?.extra ?? {}) as Record<string, unknown>
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  const nationality = cardName('nationality_name') || labelOf(nationalities, values.nationality_code) || employee.nationality

  return (
    <div className="flex flex-col gap-3">
      <T2Section
        icon={<User size={15} />}
        title={t('personnel.tabs.general')}
        actions={
          canEdit && onEditEmployee ? (
            <Button size="sm" variant="outline" leftIcon={<Pencil size={13} />} onClick={onEditEmployee}>
              {t('personnel.t2.editPersonal')}
            </Button>
          ) : undefined
        }
      >
        <FieldGrid>
          <ReadField label={t('personnel.f.fullName')} value={employee.legal_name} />
          <ReadField label={t('personnel.f.birthDate')} value={employee.birth_date ? fmtDate(employee.birth_date) : ''} />
          <ReadField label={t('personnel.f.gender')} value={labels.gender(employee.gender)} />
          <ReadField label={t('personnel.f.marital')} value={labels.marital(employee.maritial_status)} />
          <ReadField label={t('personnel.f.nationality')} value={nationality} />
          <ReadField
            label={t('personnel.f.state')}
            value={
              <span className={archived ? 'text-danger' : 'text-success'}>
                {archived ? t('personnel.state.archived') : t('personnel.state.working')}
              </span>
            }
          />
          <ReadField label={t('personnel.f.contractType')} value={labels.contract(employee.contract_type)} />
          <ReadField label={t('personnel.f.tabelNumber')} value={employee.tabel_number} />
          <ReadField label={t('personnel.f.hireDate')} value={employee.job_acceptance_date ? fmtDate(employee.job_acceptance_date) : ''} />
          {archived && card.archive?.reason && (
            <ReadField label={t('personnel.f.archiveReason')} value={[card.archive.reason, card.archive.note].filter(Boolean).join(' — ')} />
          )}
        </FieldGrid>
      </T2Section>

      <T2Section
        icon={<Shield size={15} />}
        title={t('personnel.t2.military')}
        canEdit={canEdit}
        editing={editing}
        onEdit={() => {
          setForm(Object.fromEntries(SCALARS.map((k) => [k, values[k] ?? ''])))
          begin('general')
          setEditing(true)
        }}
        onCancel={() => setEditing(false)}
        onSave={async () => {
          if (await patch(nullifyEmpty(form), 'general')) setEditing(false)
        }}
        saving={saving === 'general'}
      >
        {editing ? (
          <FieldGrid cols={2}>
            <Field label={t('personnel.f.nationality')}>
              <Combobox value={form.nationality_code ?? ''} onChange={set('nationality_code')} options={nationalities} clearable placeholder={t('common.choose')} />
            </Field>
            <Field label={t('personnel.t2.militaryObligation')}>
              <Combobox value={form.military_obligation_code ?? ''} onChange={set('military_obligation_code')} options={obligation} clearable placeholder={t('common.choose')} />
            </Field>
            <Field label={t('personnel.t2.militaryRank')}>
              <Combobox value={form.military_rank_code ?? ''} onChange={set('military_rank_code')} options={ranks} clearable placeholder={t('common.choose')} />
            </Field>
            <Field label={t('personnel.t2.party')}>
              <Combobox value={form.political_party_code ?? ''} onChange={set('political_party_code')} options={parties} clearable placeholder={t('common.choose')} />
            </Field>
          </FieldGrid>
        ) : (
          <FieldGrid>
            <ReadField label={t('personnel.t2.militaryObligation')} value={cardName('military_obligation_name') || labelOf(obligation, values.military_obligation_code)} />
            <ReadField label={t('personnel.t2.militaryRank')} value={cardName('military_rank_name') || labelOf(ranks, values.military_rank_code)} />
            <ReadField label={t('personnel.t2.party')} value={cardName('political_party_name') || labelOf(parties, values.political_party_code)} />
          </FieldGrid>
        )}
      </T2Section>

      {attrs.length > 0 && (
        <T2Section
          icon={<ListPlus size={15} />}
          title={t('personnel.t2.extra')}
          canEdit={canEdit}
          editing={extraEditing}
          onEdit={() => {
            setExtra({ ...savedExtra })
            begin('extra')
            setExtraEditing(true)
          }}
          onCancel={() => setExtraEditing(false)}
          onSave={async () => {
            if (await patch({ extra }, 'extra')) setExtraEditing(false)
          }}
          saving={saving === 'extra'}
        >
          <FieldGrid cols={2}>
            {attrs.map((a) => {
              const v = extraEditing ? extra[a.code] : (savedExtra[a.code] ?? a.value)
              if (!extraEditing) {
                return <ReadField key={a.code} label={a.name} value={extraText(a, v, t('personnel.yes'), t('personnel.no'))} />
              }
              const setV = (nv: unknown) => setExtra((x) => ({ ...x, [a.code]: nv }))
              if (a.value_type === 'bool') {
                return (
                  <div key={a.code} className="flex items-end pb-2">
                    <Checkbox label={a.name} checked={!!v} onChange={(e) => setV(e.target.checked)} />
                  </div>
                )
              }
              return (
                <Field key={a.code} label={a.name}>
                  {a.value_type === 'date' ? (
                    <DateInput value={v ? String(v) : ''} onChange={(nv) => setV(nv || null)} aria-label={a.name} />
                  ) : (
                    <Input
                      type={a.value_type === 'number' ? 'number' : 'text'}
                      value={v === null || v === undefined ? '' : String(v)}
                      onChange={(e) =>
                        setV(a.value_type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)
                      }
                    />
                  )}
                </Field>
              )
            })}
          </FieldGrid>
        </T2Section>
      )}
    </div>
  )
}
