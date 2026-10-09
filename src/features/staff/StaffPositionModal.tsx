import { useEffect, useMemo, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { History } from 'lucide-react'
import { inTashkent } from '@/lib/format'
import {
  Button,
  Checkbox,
  Combobox,
  DateInput,
  Field,
  Input,
  Modal,
  Textarea,
  useToast,
} from '@/components/ui'
import { errorMessage } from '@/api/errorMessage'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { fmtUnits, useStaffChanges, useStaffMutations, type StaffPosition } from './useStaffPositions'

interface Props {
  open: boolean
  onClose: () => void
  /** null = create a new staff line. */
  row: StaffPosition | null
}

const BLANK = {
  department_id: '',
  job_position_id: '',
  planned_units: '1',
  note: '',
  reason: '',
  candidate_requirements: '',
  education_level_code: '',
  salary_from: '',
  salary_to: '',
  application_deadline: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  publish_to_portal: true,
  experience_years: '',
  required_skills: '',
  work_schedule: '',
  employment_type: '',
  vacancy_status: 'open',
}

/**
 * One staff line, and the vacancy announcement that hangs off it.
 *
 * The department/position pair is fixed after creation on purpose: moving a
 * line to a different post is not an edit, it is a different line — and the
 * occupied count is derived from the employees standing in THAT pair.
 *
 * Every change asks for a REASON. The change log below the form is the only
 * record of why an establishment grew, and a reason typed at the moment of the
 * change is the only one anybody ever writes.
 */
export function StaffPositionModal({ open, onClose, row }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const { create, update } = useStaffMutations()
  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()
  // The education list comes from Ma'lumotnomalar (TZ 4.2.5) — never hardcoded.
  const { options: eduRows } = useDictionaryOptions(open ? 'education_levels' : null)
  const educationOptions = useMemo(
    () => eduRows.map((e) => ({ value: e.code, label: e.name })),
    [eduRows],
  )

  const isEdit = !!row?.id
  const { changes } = useStaffChanges(open && isEdit ? row?.id : null)

  const [form, setForm] = useState(BLANK)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setForm(
      row
        ? {
            department_id: String(row.department_id ?? ''),
            job_position_id: String(row.job_position_id ?? ''),
            planned_units: fmtUnits(row.planned_units),
            note: row.note ?? '',
            reason: '',
            candidate_requirements: row.candidate_requirements ?? '',
            education_level_code: row.education_level_code ?? '',
            salary_from: row.salary_from != null ? String(row.salary_from) : '',
            salary_to: row.salary_to != null ? String(row.salary_to) : '',
            application_deadline: row.application_deadline ?? '',
            contact_person: row.contact_person ?? '',
            contact_phone: row.contact_phone ?? '',
            contact_email: row.contact_email ?? '',
            publish_to_portal: row.publish_to_portal !== false,
            experience_years: row.experience_years != null ? String(row.experience_years) : '',
            required_skills: row.required_skills ?? '',
            work_schedule: row.work_schedule ?? '',
            employment_type: row.employment_type ?? '',
            vacancy_status: row.vacancy_status ?? 'open',
          }
        : BLANK,
    )
  }, [open, row])

  const set = <K extends keyof typeof BLANK>(k: K, v: (typeof BLANK)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setError(null)
    const units = Number(form.planned_units)
    if (!isEdit && !form.department_id) return setError(t('staff.departmentRequired'))
    if (!isEdit && !form.job_position_id) return setError(t('staff.positionRequired'))
    if (!Number.isFinite(units) || units < 0) return setError(t('staff.unitsInvalid'))

    // Empty strings must reach the API as null: '' passes validation and then
    // sits in the column as a blank the portal export would publish.
    const text = (v: string) => (v.trim() ? v.trim() : null)
    const num = (v: string) => (v.trim() === '' ? null : Number(v))

    const announcement = {
      candidate_requirements: text(form.candidate_requirements),
      education_level_code: text(form.education_level_code),
      salary_from: num(form.salary_from),
      salary_to: num(form.salary_to),
      application_deadline: text(form.application_deadline),
      contact_person: text(form.contact_person),
      contact_phone: text(form.contact_phone),
      contact_email: text(form.contact_email),
      publish_to_portal: form.publish_to_portal,
      // What the candidate must bring and what the job offers — the half of the
      // announcement that answers "should I apply", missing from v2 until now.
      experience_years: num(form.experience_years),
      required_skills: text(form.required_skills),
      work_schedule: text(form.work_schedule),
      employment_type: text(form.employment_type),
      vacancy_status: text(form.vacancy_status) || 'open',
    }

    try {
      if (isEdit) {
        await update.mutateAsync({
          id: row!.id as number,
          body: {
            planned_units: units,
            note: text(form.note),
            reason: text(form.reason),
            ...announcement,
          },
        })
      } else {
        await create.mutateAsync({
          department_id: Number(form.department_id),
          job_position_id: Number(form.job_position_id),
          planned_units: units,
          note: text(form.note),
          reason: text(form.reason),
          ...announcement,
        })
      }
      toast.ok(isEdit ? t('staff.updated') : t('staff.createdRow'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('staff.saveFailed')))
    }
  }

  const saving = create.isPending || update.isPending

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? t('staff.editRow') : t('staff.newRow')}
      description={
        isEdit ? `${row?.department_name ?? ''} · ${row?.job_position_name ?? ''}` : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('employees.colDepartment')} required>
          <Combobox
            value={form.department_id}
            onChange={(v) => set('department_id', v)}
            options={departments}
            placeholder={t('dashboard.allDepartments')}
            disabled={isEdit}
          />
        </Field>
        <Field label={t('employees.colPosition')} required>
          <Combobox
            value={form.job_position_id}
            onChange={(v) => set('job_position_id', v)}
            options={positions}
            placeholder={t('dashboard.allPositions')}
            disabled={isEdit}
          />
        </Field>
        <Field label={t('staff.plannedUnits')} required hint={t('staff.unitsHint')}>
          <Input
            type="number"
            step="0.25"
            min="0"
            value={form.planned_units}
            onChange={(e) => set('planned_units', e.target.value)}
          />
        </Field>
        <Field label={t('staff.reason')} hint={t('staff.reasonHint')}>
          <Input value={form.reason} onChange={(e) => set('reason', e.target.value)} />
        </Field>
        <Field label={t('staff.note')} wide>
          <Textarea value={form.note} onChange={(e) => set('note', e.target.value)} rows={2} />
        </Field>
      </div>

      {/* ── Vakansiya e'loni (TZ 4.2.10) ──────────────────────────────── */}
      <div className="mt-5 rounded-inner border border-line bg-surface-2/40 p-4">
        <h4 className="engrave mb-3 text-fg">{t('staff.announcement')}</h4>
        <p className="mb-3 text-xs text-fg-muted">{t('staff.announcementHint')}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('staff.requirements')} wide>
            <Textarea
              value={form.candidate_requirements}
              onChange={(e) => set('candidate_requirements', e.target.value)}
              rows={3}
              placeholder={t('staff.requirementsPlaceholder')}
            />
          </Field>
          <Field label={t('staff.educationLevel')}>
            <Combobox
              value={form.education_level_code}
              onChange={(v) => set('education_level_code', v)}
              options={educationOptions}
              placeholder={t('staff.educationAny')}
            />
          </Field>
          <Field label={t('staff.deadline')}>
            <DateInput
              value={form.application_deadline}
              onChange={(v) => set('application_deadline', v)}
            />
          </Field>
          <Field label={t('staff.salaryFrom')}>
            <Input
              type="number"
              min="0"
              value={form.salary_from}
              onChange={(e) => set('salary_from', e.target.value)}
            />
          </Field>
          <Field label={t('staff.salaryTo')}>
            <Input
              type="number"
              min="0"
              value={form.salary_to}
              onChange={(e) => set('salary_to', e.target.value)}
            />
          </Field>
          <Field label={t('staff.contactPerson')}>
            <Input
              value={form.contact_person}
              onChange={(e) => set('contact_person', e.target.value)}
            />
          </Field>
          <Field label={t('staff.contactPhone')}>
            <Input
              value={form.contact_phone}
              onChange={(e) => set('contact_phone', e.target.value)}
              placeholder="+998 __ ___ __ __"
            />
          </Field>
          <Field label={t('staff.contactEmail')} wide>
            <Input
              type="email"
              value={form.contact_email}
              onChange={(e) => set('contact_email', e.target.value)}
            />
          </Field>
          <Field label={t('staff.experienceYears')} hint={t('staff.experienceHint')}>
            <Input
              type="number"
              min={0}
              value={form.experience_years}
              onChange={(e) => set('experience_years', e.target.value)}
            />
          </Field>
          <Field label={t('staff.employmentType')}>
            <Combobox
              value={form.employment_type}
              onChange={(v) => set('employment_type', v)}
              options={[
                { value: 'full_time', label: t('staff.empFull') },
                { value: 'part_time', label: t('staff.empPart') },
                { value: 'contract', label: t('staff.empContract') },
                { value: 'temporary', label: t('staff.empTemporary') },
              ]}
              placeholder={t('t2.pick')}
            />
          </Field>
          <Field label={t('staff.workSchedule')} hint={t('staff.scheduleHint')}>
            <Input value={form.work_schedule} onChange={(e) => set('work_schedule', e.target.value)} />
          </Field>
          <Field label={t('staff.vacancyStatus')}>
            <Combobox
              value={form.vacancy_status}
              onChange={(v) => set('vacancy_status', v)}
              options={[
                { value: 'open', label: t('staff.vacOpen') },
                { value: 'paused', label: t('staff.vacPaused') },
                { value: 'closed', label: t('staff.vacClosed') },
              ]}
              clearable={false}
              placeholder={t('staff.vacOpen')}
            />
          </Field>
          <Field label={t('staff.requiredSkills')} wide hint={t('staff.skillsHint')}>
            <Textarea
              rows={3}
              value={form.required_skills}
              onChange={(e) => set('required_skills', e.target.value)}
            />
          </Field>
          <Field wide>
            <Checkbox
              checked={form.publish_to_portal}
              onChange={(e) => set('publish_to_portal', e.target.checked)}
              label={t('staff.publishToPortal')}
            />
          </Field>
        </div>
      </div>

      {/* ── O'zgarishlar tarixi ───────────────────────────────────────── */}
      {isEdit && changes.length > 0 && (
        <div className="mt-5">
          <h4 className="engrave mb-2 flex items-center gap-2 text-fg">
            <History size={13} /> {t('staff.history')}
          </h4>
          <ul className="scroll-thin max-h-[180px] space-y-1.5 overflow-y-auto">
            {changes.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-baseline gap-x-2 rounded-inner bg-surface-2 px-3 py-2 text-xs text-fg-muted"
              >
                <span className="font-semibold text-fg">
                  {t(`staff.action_${c.action}` as never)}
                </span>
                {c.old_planned_units != null && c.new_planned_units != null && (
                  <span className="tabnum">
                    {fmtUnits(c.old_planned_units)} → {fmtUnits(c.new_planned_units)}
                  </span>
                )}
                {c.reason && <span className="italic">«{c.reason}»</span>}
                <span className="ml-auto whitespace-nowrap text-fg-subtle">
                  {c.changed_by_name ?? '—'}
                  {c.created_at ? ` · ${inTashkent(c.created_at).format('DD.MM.YYYY HH:mm')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
