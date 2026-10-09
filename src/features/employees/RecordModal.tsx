import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'

export interface EducationDraft {
  institution_name: string
  faculty_name: string
  degree_name: string
  start_date: string
  end_date: string
  is_current: boolean
}
export interface ExperienceDraft {
  company_name: string
  position: string
  start_date: string
  end_date: string
  is_current: boolean
}

const BLANK_EDU: EducationDraft = { institution_name: '', faculty_name: '', degree_name: '', start_date: '', end_date: '', is_current: false }
const BLANK_EXP: ExperienceDraft = { company_name: '', position: '', start_date: '', end_date: '', is_current: false }

/** Request body of a new row (`end_date` dropped while still studying / working). */
export function recordBody(d: EducationDraft | ExperienceDraft): Record<string, unknown> {
  const { end_date, is_current, ...rest } = d
  return { ...rest, is_current, end_date: is_current || !end_date ? undefined : end_date }
}

/**
 * «Ta'lim ma'lumotini qo'shish» / «Ish tajribasini qo'shish» (v1
 * AddEducationModal / AddExperienceModal): used by the creation wizard
 * (step 2) and by the «Ma'lumoti» / «Mehnat faoliyati» tabs of the card.
 */
export function RecordModal({
  open,
  kind,
  onClose,
  onAdd,
}: {
  open: boolean
  kind: 'education' | 'experience'
  onClose: () => void
  onAdd: (draft: EducationDraft | ExperienceDraft) => void
}) {
  const { t } = useTranslation()
  const isEdu = kind === 'education'
  const [form, setForm] = useState<Record<string, string | boolean>>({})
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setForm({ ...(isEdu ? BLANK_EDU : BLANK_EXP) })
      setError(null)
    }
  }, [open, isEdu])

  const text = (k: string) => String(form[k] ?? '')
  const set = (k: string, v: string | boolean) => {
    setForm((f) => ({ ...f, [k]: v }))
    setError(null)
  }
  const fields: [string, string, string][] = isEdu
    ? [
        ['institution_name', t('personnel.rec.institution'), t('personnel.rec.institutionPh')],
        ['faculty_name', t('personnel.rec.faculty'), t('personnel.rec.facultyPh')],
        ['degree_name', t('personnel.rec.degree'), t('personnel.rec.degreePh')],
      ]
    : [
        ['company_name', t('personnel.rec.company'), t('personnel.rec.companyPh')],
        ['position', t('personnel.rec.position'), t('personnel.rec.positionPh')],
      ]

  const submit = () => {
    const missing = fields.some(([k]) => !text(k).trim()) || !text('start_date') || (!form.is_current && !text('end_date'))
    if (missing) {
      setError(t('personnel.rec.required'))
      return
    }
    if (!form.is_current && text('end_date') < text('start_date')) {
      setError(t('personnel.rec.endBeforeStart'))
      return
    }
    onAdd({ ...(isEdu ? BLANK_EDU : BLANK_EXP), ...form } as EducationDraft | ExperienceDraft)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdu ? t('personnel.rec.addEducation') : t('personnel.rec.addExperience')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit}>{t('common.add')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {fields.map(([k, label, ph]) => (
          <Field key={k} label={label} required>
            <Input value={text(k)} placeholder={ph} maxLength={255} onChange={(e) => set(k, e.target.value)} />
          </Field>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={isEdu ? t('personnel.rec.studyStart') : t('personnel.rec.workStart')} required>
            <DateInput value={text('start_date')} onChange={(v) => set('start_date', v)} />
          </Field>
          <Field label={t('personnel.rec.until')} required={!form.is_current}>
            <DateInput
              value={form.is_current ? '' : text('end_date')}
              disabled={!!form.is_current}
              onChange={(v) => set('end_date', v)}
            />
          </Field>
        </div>
        <Checkbox
          label={isEdu ? t('personnel.rec.studyingNow') : t('personnel.rec.workingNow')}
          checked={!!form.is_current}
          onChange={(e) => set('is_current', e.target.checked)}
        />
        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}
