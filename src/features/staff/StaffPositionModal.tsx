import { useEffect, useMemo, useState } from 'react'
import { lt } from '@/i18n/display'
import dayjs from 'dayjs'
import { useTranslation } from 'react-i18next'
import { Copy, History, Lock, Megaphone, Send } from 'lucide-react'
import { inTashkent, numberLocale } from '@/lib/format'
import { Button, Checkbox, Combobox, DateInput, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { useDepartmentRecords, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { useServerText } from '@/features/statistics/serverText'
import { RequiredLanguagesChips, entryLabel } from '@/features/vacancies/RequiredLanguagesChips'
import type { RequiredLanguage } from '@/features/vacancies/useVacancies'
import { RequiredLanguagesEditor, cleanLanguages } from './RequiredLanguagesEditor'
import { EmployeeSelect } from '@/features/orders/EmployeeSelect'
import { useBranchStore } from '@/store/branchStore'
import {
  EMPLOYMENT_TYPES,
  fmtUnits,
  useStaffChanges,
  useStaffMutations,
  useVacancyPushJobs,
  type StaffChange,
  type StaffPosition,
  useStaffPositions,
} from './useStaffPositions'

interface Props {
  open: boolean
  onClose: () => void
  /** null = create a new staff line (or, with `vacancyMode`, a vacancy). */
  row: StaffPosition | null
  /** «Vakansiya yaratish» (TZ V1): the announcement opens as «Ochiq». */
  vacancyMode?: boolean
  /** A department head (TZ V1 «Руководители») — his units only. null = any. */
  allowedDepartmentIds?: number[] | null
  /** TZ V2 1304 «Вакансия закрыта — предлагает создать новую вакансию»: copy this line. */
  onCopy?: (row: StaffPosition) => void
  /** TZ V1 1277 «Копирование существующей вакансии»: the V1 form starts from this vacancy. */
  copyFrom?: StaffPosition | null
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
  // TZ V1 1277: publishing is an explicit option.
  publish_to_portal: false,
  experience_years: '',
  required_skills: '',
  work_schedule: '',
  employment_type: '',
  vacancy_status: 'open',
  recruiter_employee_id: '',
  // TZ V1 1260 «количество вакантных единиц» and the staff line it opens on.
  vacancy_units: '',
  line_id: '',
}

type FieldErrors = Partial<Record<'department' | 'position' | 'units' | 'salary' | 'deadline' | 'reason' | 'recruiter', string>>

/** Server field → the form error slot it belongs under (TZ D-D4 422). */
const SERVER_FIELD: Record<string, keyof FieldErrors> = {
  salary_to: 'salary',
  application_deadline: 'deadline',
  reason: 'reason',
  recruiter_employee_id: 'recruiter',
}

/** Announcement fields of a vacancy as form values (V1 copy / reopen). */
function announcementOf(r: StaffPosition) {
  return {
    candidate_requirements: r.candidate_requirements ?? '',
    education_level_code: r.education_level_code ?? '',
    salary_from: r.salary_from != null ? String(Number(r.salary_from)) : '',
    salary_to: r.salary_to != null ? String(Number(r.salary_to)) : '',
    application_deadline: r.application_deadline && !dayjs(r.application_deadline).isBefore(dayjs(), 'day') ? r.application_deadline : '',
    contact_person: r.contact_person ?? '',
    contact_phone: r.contact_phone ?? '',
    contact_email: r.contact_email ?? '',
    publish_to_portal: r.publish_to_portal === true,
    experience_years: r.experience_years != null ? String(r.experience_years) : '',
    required_skills: r.required_skills ?? '',
    work_schedule: r.work_schedule ?? '',
    employment_type: r.employment_type ?? '',
    recruiter_employee_id: r.recruiter_employee_id ? String(r.recruiter_employee_id) : '',
  }
}

/**
 * One staff line and the vacancy announcement that hangs off it (TZ 4.2.6,
 * 4.2.10, V1, V2). The department/position pair is fixed after creation: a
 * line moved to another post is a different line. Every change may carry a
 * reason, which lands in the change log shown at the bottom (TZ V2 «История»).
 */
export function StaffPositionModal({ open, onClose, row, vacancyMode = false, allowedDepartmentIds = null, onCopy, copyFrom = null }: Props) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const st = useServerText()
  const { create, update, openVacancy } = useStaffMutations()
  const allDepartments = useDepartmentRecords<{ id: number; name?: string | null; parent_id?: number | null }>()
  const positions = useJobPositionOptions()
  const { options: eduRows } = useDictionaryOptions(open ? 'education_levels' : null)
  const educationOptions = useMemo(
    () => eduRows.map((e) => ({ value: e.code, label: entryLabel(eduRows, e.code, i18n.language) })),
    [eduRows, i18n.language],
  )

  // D-D17: a head opens vacancies in his department AND every sub-department.
  const departments = useMemo(() => {
    if (!allowedDepartmentIds) return allDepartments
    const allowed = new Set(allowedDepartmentIds)
    let grew = true
    while (grew) {
      grew = false
      for (const d of allDepartments) {
        if (d.parent_id != null && allowed.has(d.parent_id) && !allowed.has(d.id)) {
          allowed.add(d.id)
          grew = true
        }
      }
    }
    return allDepartments.filter((d) => allowed.has(d.id))
  }, [allDepartments, allowedDepartmentIds])
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: d.name ?? `#${d.id}` })),
    [departments],
  )

  // TZ V1: «Vakansiya yaratish» opens a vacancy on an EXISTING staff line
  // (fixed when `row` is given, picked by department otherwise).
  const isEdit = !!row?.id && !vacancyMode
  const lineFixed = vacancyMode && !!row?.id
  const { changes } = useStaffChanges(open && isEdit ? row?.id : null)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  // TZ V1 1277: the last job-portal delivery of this line (the caller's own pushes).
  const pushJobs = useVacancyPushJobs(open && isEdit)
  const lastPush = isEdit ? (pushJobs.data ?? []).find((j) => j.result?.staff_position_id === row?.id) : undefined
  // TZ V2 1304: 409 `vacancy_closed` — offer a new vacancy (a copy) instead.
  const [closedOffer, setClosedOffer] = useState(false)

  const [form, setForm] = useState(BLANK)
  const [languages, setLanguages] = useState<RequiredLanguage[]>([])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  // TZ V1 1267 «Нет свободных штатных единиц» — 409 `no_free_units`.
  const [noFree, setNoFree] = useState<{ planned?: unknown; occupied?: unknown } | null>(null)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setFormError(null)
    setNoFree(null)
    setClosedOffer(false)
    const langSrc = vacancyMode ? copyFrom ?? (row && row.vacancy_announcement ? row : null) : row
    setLanguages(
      Array.isArray(langSrc?.required_languages)
        ? langSrc!.required_languages!.map((r) => ({ language_code: r.language_code || '', level_code: r.level_code ?? null }))
        : [],
    )
    const src = vacancyMode ? copyFrom ?? (row && row.vacancy_announcement ? row : null) : row
    setForm(
      vacancyMode
        ? {
            ...BLANK,
            ...(src ? announcementOf(src) : {}),
            department_id: row?.department_id ? String(row.department_id) : allowedDepartmentIds?.length === 1 ? String(allowedDepartmentIds[0]) : '',
            line_id: row?.id ? String(row.id) : '',
            vacancy_units: row?.id ? fmtUnits(row.vacant_units) : '',
            vacancy_status: 'open',
          }
        : row
        ? {
            department_id: String(row.department_id ?? ''),
            job_position_id: String(row.job_position_id ?? ''),
            planned_units: fmtUnits(row.planned_units),
            note: row.note ?? '',
            reason: '',
            candidate_requirements: row.candidate_requirements ?? '',
            education_level_code: row.education_level_code ?? '',
            salary_from: row.salary_from != null ? String(Number(row.salary_from)) : '',
            salary_to: row.salary_to != null ? String(Number(row.salary_to)) : '',
            application_deadline: row.application_deadline ?? '',
            contact_person: row.contact_person ?? '',
            contact_phone: row.contact_phone ?? '',
            contact_email: row.contact_email ?? '',
            publish_to_portal: row.publish_to_portal === true,
            experience_years: row.experience_years != null ? String(row.experience_years) : '',
            required_skills: row.required_skills ?? '',
            work_schedule: row.work_schedule ?? '',
            employment_type: row.employment_type ?? '',
            vacancy_status: row.vacancy_status ?? 'open',
            recruiter_employee_id: row.recruiter_employee_id ? String(row.recruiter_employee_id) : '',
            vacancy_units: row.vacancy_units != null ? fmtUnits(row.vacancy_units) : '',
            line_id: '',
          }
        : {
            ...BLANK,
            department_id: allowedDepartmentIds?.length === 1 ? String(allowedDepartmentIds[0]) : '',
          },
    )
  }, [open, row, allowedDepartmentIds, vacancyMode, copyFrom])

  const set = <K extends keyof typeof BLANK>(k: K, v: (typeof BLANK)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const clearErr = (k: keyof FieldErrors) => setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e))

  const submit = async () => {
    setFormError(null)
    const next: FieldErrors = {}
    const units = Number(form.planned_units)
    const vacUnits = form.vacancy_units.trim() === '' ? null : Number(form.vacancy_units)
    if (vacancyMode) {
      if (!form.department_id) next.department = t('staff.departmentRequired')
      if (!form.line_id) next.position = t('ordVac.lineRequired')
      if (vacUnits == null || !Number.isFinite(vacUnits) || vacUnits <= 0) next.units = t('staff.unitsInvalid')
    } else {
      if (!isEdit && !form.department_id) next.department = t('staff.departmentRequired')
      if (!isEdit && !form.job_position_id) next.position = t('staff.positionRequired')
      if (form.planned_units.trim() === '' || !Number.isFinite(units) || units < 0) next.units = t('staff.unitsInvalid')
      if (vacUnits != null && (!Number.isFinite(vacUnits) || vacUnits <= 0)) next.units = t('staff.unitsInvalid')
    }
    const sFrom = form.salary_from.trim() === '' ? null : Number(form.salary_from)
    const sTo = form.salary_to.trim() === '' ? null : Number(form.salary_to)
    if (sFrom != null && sTo != null && sFrom > sTo) next.salary = t('orgRef.salaryRange')
    if (
      form.application_deadline &&
      form.application_deadline !== (row?.application_deadline ?? '') &&
      dayjs(form.application_deadline).isBefore(dayjs(), 'day')
    ) {
      next.deadline = t('orgRef.deadlinePast')
    }
    const statusChanged = isEdit ? (form.vacancy_status || 'open') !== (row?.vacancy_status || 'open') : false
    if (statusChanged && form.reason.trim().length < 3) next.reason = t('orgRef.statusReason')
    if (Object.keys(next).length) {
      setErrors(next)
      return
    }

    // Empty strings reach the API as null: '' would sit in the column as a
    // blank the portal export publishes.
    const text = (v: string) => (v.trim() ? v.trim() : null)
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const announcement: Record<string, unknown> = {
      candidate_requirements: text(form.candidate_requirements),
      education_level_code: text(form.education_level_code),
      salary_from: num(form.salary_from),
      salary_to: num(form.salary_to),
      application_deadline: text(form.application_deadline),
      contact_person: text(form.contact_person),
      contact_phone: text(form.contact_phone),
      contact_email: text(form.contact_email),
      publish_to_portal: form.publish_to_portal,
      experience_years: num(form.experience_years),
      required_skills: text(form.required_skills),
      work_schedule: text(form.work_schedule),
      employment_type: text(form.employment_type),
      vacancy_status: text(form.vacancy_status) || 'open',
      required_languages: cleanLanguages(languages),
      recruiter_employee_id: form.recruiter_employee_id ? Number(form.recruiter_employee_id) : null,
      vacancy_units: vacUnits,
    }
    // A plain staff line (not a vacancy) is created without a status: the free
    // units check of TZ V1 1267 runs only when a vacancy is OPENED.
    if (!isEdit && !vacancyMode) delete announcement.vacancy_status
    setNoFree(null)

    try {
      if (vacancyMode) {
        const { vacancy_status: _status, ...ann } = announcement
        await openVacancy.mutateAsync({ id: Number(form.line_id), body: { ...ann, reason: text(form.reason) } })
      } else if (isEdit) {
        await update.mutateAsync({
          id: row!.id as number,
          body: { planned_units: units, note: text(form.note), reason: text(form.reason), ...announcement },
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
      toast.ok(isEdit ? t('staff.updated') : vacancyMode ? t('orgRef.vacancyCreated') : t('staff.createdRow'))
      onClose()
    } catch (e) {
      const msg = errorMessage(e, t('staff.saveFailed'))
      if (errorCode(e) === 'no_free_units') {
        setNoFree(errorParams(e))
        return
      }
      if (errorCode(e) === 'vacancy_units_exceed') {
        setErrors((cur) => ({ ...cur, units: msg }))
        return
      }
      if (errorCode(e) === 'vacancy_closed') {
        setClosedOffer(true)
        return
      }
      if (errorCode(e) === 'recruiter_not_found') {
        setErrors((cur) => ({ ...cur, recruiter: msg }))
        return
      }
      const fieldErrs = errorParams(e).errors
      if (Array.isArray(fieldErrs)) {
        const fe: FieldErrors = {}
        for (const x of fieldErrs as { field?: string }[]) {
          const slot = x.field ? SERVER_FIELD[x.field] : undefined
          if (slot) fe[slot] = msg
        }
        if (Object.keys(fe).length) {
          setErrors((cur) => ({ ...cur, ...fe }))
          return
        }
      }
      setFormError(msg)
    }
  }

  const saving = create.isPending || update.isPending || openVacancy.isPending
  const vacant = Number(row?.vacant_units ?? 0)
  const title = isEdit ? t('staff.editRow') : vacancyMode ? t('orgRef.newVacancy') : t('staff.newRow')
  // TZ V1 «выбирает должность из штатного расписания»: the department's lines
  // with a free unit and no open / paused vacancy.
  const lineList = useStaffPositions(
    { page: 1, size: 500, departmentId: form.department_id || undefined },
    open && vacancyMode && !lineFixed && !!form.department_id,
  )
  const lineRows = (lineList.rows ?? []).filter(
    (r) => r.id && r.has_staff_row !== false && !r.is_closed && Number(r.vacant_units ?? 0) > 0
      && (r.vacancy_announcement == null || r.vacancy_announcement === 'closed'),
  )
  const lineOptions = lineRows.map((r) => ({
    value: String(r.id),
    label: lt(r.job_position_name) || `#${r.id}`,
    subLabel: t('ordVac.freeUnits', { units: fmtUnits(r.vacant_units) }),
  }))
  const pickedLine = lineFixed ? row : lineRows.find((r) => String(r.id) === form.line_id) ?? null

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="lg"
      title={title}
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
      <div className="flex flex-col gap-5">
        {vacancyMode ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {lineFixed ? (
              <div className="flex flex-col gap-1 rounded-inner border border-line bg-surface-2/40 px-4 py-3 sm:col-span-2">
                <span className="text-[14px] font-semibold text-fg">{lt(row?.department_name)}</span>
                <span className="text-[13px] text-fg-muted">{lt(row?.job_position_name)}</span>
              </div>
            ) : (
              <>
                <Field label={t('employees.colDepartment')} required error={errors.department}>
                  <Combobox
                    value={form.department_id}
                    onChange={(v) => {
                      setForm((f) => ({ ...f, department_id: v, line_id: '', vacancy_units: '' }))
                      clearErr('department')
                    }}
                    options={departmentOptions}
                    placeholder={t('common.choose')}
                    invalid={!!errors.department}
                  />
                </Field>
                <Field label={t('ordVac.staffLine')} required hint={t('ordVac.staffLineHint')} error={errors.position}>
                  <Combobox
                    value={form.line_id}
                    onChange={(v) => {
                      const r = lineRows.find((x) => String(x.id) === v)
                      setForm((f) => ({ ...f, line_id: v, vacancy_units: r ? fmtUnits(r.vacant_units) : '' }))
                      clearErr('position')
                    }}
                    options={lineOptions}
                    loading={lineList.loading}
                    placeholder={form.department_id && !lineList.loading && !lineOptions.length ? t('ordVac.noFreeLines') : t('common.choose')}
                    invalid={!!errors.position}
                  />
                </Field>
              </>
            )}
            <Field
              label={t('ordVac.vacancyUnits')}
              required
              hint={pickedLine ? t('ordVac.freeUnits', { units: fmtUnits(pickedLine.vacant_units) }) : t('ordVac.vacancyUnitsHint')}
              error={errors.units}
            >
              <Input
                type="number"
                step="0.5"
                min="0.5"
                value={form.vacancy_units}
                invalid={!!errors.units}
                onChange={(e) => {
                  set('vacancy_units', e.target.value)
                  clearErr('units')
                }}
              />
            </Field>
          </div>
        ) : isEdit ? (
          <div className="flex flex-col gap-1.5 rounded-inner border border-line bg-surface-2/40 px-4 py-3">
            <span className="text-[14px] font-semibold text-fg">{lt(row?.department_name)}</span>
            <span className="text-[13px] text-fg-muted">{lt(row?.job_position_name)}</span>
            <RequiredLanguagesChips value={row?.required_languages} />
            <div className="mt-1 flex gap-4 text-[12px] text-fg-muted">
              <span>
                {t('staff.occupied')}: <b className="tabnum text-fg">{fmtUnits(row?.occupied_units)}</b>
              </span>
              <span>
                {t('staff.vacant')}:{' '}
                <b className={vacant > 0 ? 'tabnum text-success' : vacant < 0 ? 'tabnum text-danger' : 'tabnum text-fg'}>
                  {fmtUnits(row?.vacant_units)}
                </b>
              </span>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('employees.colDepartment')} required error={errors.department}>
              <Combobox
                value={form.department_id}
                onChange={(v) => {
                  set('department_id', v)
                  clearErr('department')
                }}
                options={departmentOptions}
                placeholder={t('common.choose')}
                invalid={!!errors.department}
              />
            </Field>
            <Field label={t('employees.colPosition')} required error={errors.position}>
              <Combobox
                value={form.job_position_id}
                onChange={(v) => {
                  set('job_position_id', v)
                  clearErr('position')
                }}
                options={positions}
                placeholder={t('common.choose')}
                invalid={!!errors.position}
              />
            </Field>
          </div>
        )}

        {!vacancyMode && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('staff.plannedUnits')} required hint={t('staff.unitsHint')} error={errors.units}>
            <Input
              type="number"
              step="0.5"
              min="0"
              value={form.planned_units}
              invalid={!!errors.units}
              onChange={(e) => {
                set('planned_units', e.target.value)
                clearErr('units')
              }}
            />
          </Field>
          <Field label={t('staff.note')}>
            <Input value={form.note} onChange={(e) => set('note', e.target.value)} placeholder={t('orgRef.optional')} />
          </Field>
          {isEdit && (
            <Field label={t('ordVac.vacancyUnits')} hint={t('ordVac.vacancyUnitsEditHint')}>
              <Input type="number" step="0.5" min="0.5" value={form.vacancy_units} onChange={(e) => set('vacancy_units', e.target.value)} />
            </Field>
          )}
        </div>
        )}

        {/* ── Vakansiya e'loni (TZ 4.2.10, V1) ──────────────────────────── */}
        <section className="rounded-inner border border-line bg-surface-2/40 p-4">
          <h4 className="mb-1 flex items-center gap-2 text-[14px] font-bold text-fg">
            <Megaphone size={14} /> {t('staff.announcement')}
          </h4>
          <p className="mb-4 text-xs text-fg-muted">{t('orgRef.announcementHint')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('staff.requirements')} wide>
              <Textarea
                rows={3}
                value={form.candidate_requirements}
                onChange={(e) => set('candidate_requirements', e.target.value)}
                placeholder={t('staff.requirementsPlaceholder')}
              />
            </Field>
            <Field label={t('staff.experienceYears')}>
              <Input
                type="number"
                min={0}
                max={60}
                value={form.experience_years}
                onChange={(e) => set('experience_years', e.target.value)}
              />
            </Field>
            {!vacancyMode && (
            <Field label={t('staff.vacancyStatus')}>
              <Select
                value={form.vacancy_status}
                onChange={(e) => {
                  set('vacancy_status', e.target.value)
                  clearErr('reason')
                }}
                options={[
                  { value: 'open', label: t('staff.vacOpen') },
                  { value: 'paused', label: t('ordVac.vacPaused') },
                  { value: 'closed', label: t('staff.vacClosed') },
                ]}
              />
            </Field>
            )}
            <Field label={t('ordVac.recruiter')} hint={t('ordVac.recruiterHint')} error={errors.recruiter} wide>
              <EmployeeSelect
                value={form.recruiter_employee_id}
                onChange={(v) => {
                  set('recruiter_employee_id', v)
                  clearErr('recruiter')
                }}
                branchId={row?.organization_branch_id ?? selectedBranchId ?? null}
                known={row?.recruiter_employee_id ? [{ value: String(row.recruiter_employee_id), label: row.recruiter_name || `#${row.recruiter_employee_id}` }] : []}
                placeholder={t('orgRef.notSelected')}
                invalid={!!errors.recruiter}
              />
            </Field>
            <Field label={t('staff.requiredSkills')} wide>
              <Textarea rows={2} value={form.required_skills} onChange={(e) => set('required_skills', e.target.value)} />
            </Field>
            <Field label={t('staff.workSchedule')} hint={t('staff.scheduleHint')}>
              <Input value={form.work_schedule} onChange={(e) => set('work_schedule', e.target.value)} />
            </Field>
            <Field label={t('staff.employmentType')}>
              <Combobox
                value={form.employment_type}
                onChange={(v) => set('employment_type', v)}
                options={EMPLOYMENT_TYPES.map((k) => ({ value: k, label: t(`orgRef.emp_${k}`) }))}
                placeholder={t('orgRef.notSelected')}
              />
            </Field>
            <Field label={t('staff.educationLevel')} wide>
              <Combobox
                value={form.education_level_code}
                onChange={(v) => set('education_level_code', v)}
                options={educationOptions}
                placeholder={t('orgRef.notRequired')}
              />
            </Field>
            <div className="sm:col-span-2">
              <RequiredLanguagesEditor value={languages} onChange={setLanguages} />
            </div>
            <Field label={t('staff.salaryFrom')} error={errors.salary}>
              <Input
                type="number"
                min="0"
                value={form.salary_from}
                invalid={!!errors.salary}
                onChange={(e) => {
                  set('salary_from', e.target.value)
                  clearErr('salary')
                }}
              />
            </Field>
            <Field label={t('staff.salaryTo')}>
              <Input
                type="number"
                min="0"
                value={form.salary_to}
                invalid={!!errors.salary}
                onChange={(e) => {
                  set('salary_to', e.target.value)
                  clearErr('salary')
                }}
              />
            </Field>
            <Field label={t('staff.deadline')} error={errors.deadline} wide>
              <DateInput
                value={form.application_deadline}
                invalid={!!errors.deadline}
                onChange={(v) => {
                  set('application_deadline', v)
                  clearErr('deadline')
                }}
              />
            </Field>
            <Field label={t('staff.contactPerson')}>
              <Input value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} />
            </Field>
            <Field label={t('staff.contactPhone')}>
              <Input
                value={form.contact_phone}
                onChange={(e) => set('contact_phone', e.target.value)}
                placeholder="+998 __ ___ __ __"
              />
            </Field>
            <Field label={t('staff.contactEmail')} wide>
              <Input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
            </Field>
            <div className="sm:col-span-2">
              <Checkbox
                checked={form.publish_to_portal}
                onChange={(e) => set('publish_to_portal', e.target.checked)}
                label={t('staff.publishToPortal')}
              />
              <p className="mt-1 pl-7 text-xs text-fg-subtle">{t('orgRef.portalHint')}</p>
              {lastPush && (
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7 text-xs text-fg-muted">
                  <Send size={12} className="shrink-0" />
                  {t('ordVac.lastPush')}:{' '}
                  {(lastPush.result?.deliveries ?? []).length ? (
                    (lastPush.result?.deliveries ?? []).map((d, i) => (
                      <span key={i} className={d.ok ? 'text-success' : 'text-danger'} title={d.error ?? undefined}>
                        {d.portal} — {d.ok ? t('ordVac.deliveryOk') : t('ordVac.deliveryFailed')}
                        {i < (lastPush.result?.deliveries ?? []).length - 1 ? ';' : ''}
                      </span>
                    ))
                  ) : (
                    <span className="text-warning">{t('ordVac.deliveryQueued')}</span>
                  )}
                  {(lastPush.finished_at || lastPush.created_at) && (
                    <span className="tabnum text-fg-subtle">· {inTashkent(lastPush.finished_at || lastPush.created_at).format('DD.MM.YYYY HH:mm')}</span>
                  )}
                </p>
              )}
            </div>
          </div>
        </section>

        <Field label={t('staff.reason')} hint={t('staff.reasonHint')} error={errors.reason}>
          <Input
            value={form.reason}
            invalid={!!errors.reason}
            placeholder={t('orgRef.reasonPlaceholder')}
            onChange={(e) => {
              set('reason', e.target.value)
              clearErr('reason')
            }}
          />
        </Field>

        {noFree && (
          <div role="alert" className="rounded-inner border border-warning/35 bg-warning-soft px-3 py-2.5 text-[13px] text-warning">
            <p className="font-semibold">{t('orgRef.noFreeTitle')}</p>
            <p className="mt-0.5 text-fg-muted">
              {t('orgRef.noFreeText', { planned: fmtUnits(noFree.planned as number), occupied: fmtUnits(noFree.occupied as number) })}
            </p>
          </div>
        )}

        <FormError>{formError}</FormError>

        <Modal
          open={closedOffer}
          onClose={() => setClosedOffer(false)}
          size="sm"
          title={t('ordVac.closedTitle')}
          footer={
            <>
              <Button variant="ghost" onClick={() => setClosedOffer(false)}>
                {t('common.cancel')}
              </Button>
              {onCopy && row && (
                <Button
                  leftIcon={<Copy size={15} />}
                  onClick={() => {
                    setClosedOffer(false)
                    onCopy(row)
                  }}
                >
                  {t('ordVac.copyAsNew')}
                </Button>
              )}
            </>
          }
        >
          <div className="flex gap-3 text-[13.5px]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-warning-soft text-warning">
              <Lock size={17} />
            </span>
            <div className="space-y-1.5">
              <p className="font-semibold text-fg">{t('ordVac.closedText')}</p>
              <p className="text-fg-muted">{t('ordVac.closedHint')}</p>
            </div>
          </div>
        </Modal>

        {isEdit && changes.length > 0 && (
          <ChangeHistory changes={changes} educationLabel={(c) => educationOptions.find((o) => o.value === c)?.label} st={st} />
        )}
      </div>
    </Modal>
  )
}

/** TZ V2 1295/1304 «История» — every change, and for each one: field, old → new. */
function ChangeHistory({
  changes,
  educationLabel,
  st,
}: {
  changes: StaffChange[]
  educationLabel: (code: string) => string | undefined
  st: (s: string | null | undefined) => string
}) {
  const { t } = useTranslation()
  const fmt = (field: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? t('orgRef.yes') : t('orgRef.no')
    if (Array.isArray(v)) {
      if (!v.length) return '—'
      return v
        .map((x) => (x && typeof x === 'object' ? Object.values(x).filter(Boolean).join(' / ') : String(x)))
        .join('; ')
    }
    if (field === 'vacancy_status')
      return v === 'closed' ? t('staff.vacClosed') : v === 'open' ? t('staff.vacOpen') : v === 'paused' ? t('ordVac.vacPaused') : String(v)
    if (field === 'employment_type' && (EMPLOYMENT_TYPES as readonly string[]).includes(String(v)))
      return t(`orgRef.emp_${v as (typeof EMPLOYMENT_TYPES)[number]}`)
    if (field === 'education_level_code') return educationLabel(String(v)) ?? String(v)
    if (field === 'planned_units') return fmtUnits(v as number)
    if (typeof v === 'number') return v.toLocaleString(numberLocale())
    return String(v)
  }
  const actionLabel = (c: StaffChange) => {
    switch (c.action) {
      case 'created':
        return t('staff.action_created')
      case 'closed':
        return t('orgRef.actionReduced')
      case 'reopened':
        return t('staff.action_reopened')
      case 'status_changed':
        return t('orgRef.actionStatus')
      case 'deleted':
        return t('staff.action_deleted')
      default:
        return c.fields?.length || c.old_planned_units == null
          ? t('staff.action_updated')
          : `${t('staff.planned')}: ${fmtUnits(c.old_planned_units)} → ${fmtUnits(c.new_planned_units)}`
    }
  }
  return (
    <section>
      <h4 className="mb-2 flex items-center gap-2 text-[14px] font-bold text-fg">
        <History size={14} /> {t('staff.history')}
      </h4>
      <ul className="flex flex-col gap-2">
        {changes.map((c) => {
          const at = c.at || c.created_at
          return (
            <li key={c.id} className="rounded-inner bg-surface-2 px-3 py-2.5 text-[12.5px]">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="font-semibold text-fg">{actionLabel(c)}</span>
                <span className="tabnum whitespace-nowrap text-fg-subtle">
                  {at ? inTashkent(at).format('DD.MM.YYYY HH:mm') : ''}
                </span>
              </div>
              <p className="mt-0.5 text-fg-muted">
                {c.by || c.changed_by_name || '—'}
                {c.reason ? ` · ${t('orgRef.reasonShort')}: ${c.reason}` : ''}
              </p>
              {!!c.fields?.length && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {c.fields.map((f) => (
                    <li key={f.field} className="grid grid-cols-[minmax(0,40%)_1fr] gap-2">
                      <span className="truncate text-fg-muted" title={st(f.label || f.field)}>
                        {st(f.label || f.field)}
                      </span>
                      <span className="break-words text-fg">
                        <span className="text-fg-subtle line-through">{fmt(f.field, f.old)}</span>
                        {' → '}
                        {fmt(f.field, f.new)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
