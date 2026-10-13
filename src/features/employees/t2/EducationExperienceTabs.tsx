import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Award, BookOpen, Briefcase, ClipboardCheck, ExternalLink, GraduationCap, Pencil, Plus, Route, Save, Timer, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { BasisModal } from '../EmployeeBasisFields'
import { RecordModal, recordBody, type EducationDraft, type ExperienceDraft } from '../RecordModal'
import { addEmployeeRecord, deleteEmployeeRecord, useEmployeeCareer, useEmployeeTrainings, type RecordKind } from '../useEmployees'
import { fmtDate, fmtRange, usePersonnelLabels } from '../format'
import type { Attestation, CareerRow, EditBasis, ExperiencePeriod } from '../types'
import { DocumentsSlot } from './DocumentsSlot'
import type { T2TabProps } from './GeneralTab'
import { EmptyRow, FieldGrid, ReadField, RowsTable, T2Section, nullifyEmpty, useT2Save, type RowsColumn } from './T2Ui'
import { labelOf, useCardName, useCodeOptions, useT2Mutations } from './useT2'

/**
 * Add / remove an education or work-experience row on an existing card —
 * both ask for the basis document first (TZ C3).
 */
function useRecordRows(employeeId: number, kind: RecordKind) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [pendingAdd, setPendingAdd] = useState<Record<string, unknown> | null>(null)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['employee', employeeId] })
    void qc.invalidateQueries({ queryKey: ['employee-t2', employeeId] })
  }
  const confirm = async (basis: EditBasis) => {
    setBusy(true)
    try {
      if (pendingAdd) {
        await addEmployeeRecord(employeeId, kind, pendingAdd, basis)
        toast.ok(t('personnel.rec.added'))
      } else if (pendingDelete != null) {
        await deleteEmployeeRecord(employeeId, kind, pendingDelete, basis)
        toast.ok(t('common.deleted'))
      }
      setPendingAdd(null)
      setPendingDelete(null)
      refresh()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBusy(false)
    }
  }
  const modal = (
    <BasisModal
      open={!!pendingAdd || pendingDelete != null}
      title={pendingAdd ? t('personnel.rec.addBasis') : t('personnel.rec.deleteTitle')}
      message={pendingAdd ? undefined : t('personnel.rec.deleteConfirm')}
      confirmLabel={pendingAdd ? t('common.save') : t('common.delete')}
      danger={!pendingAdd}
      busy={busy}
      onClose={() => {
        setPendingAdd(null)
        setPendingDelete(null)
      }}
      onConfirm={(b) => void confirm(b)}
    />
  )
  return {
    busy,
    add: (draft: EducationDraft | ExperienceDraft) => setPendingAdd(recordBody(draft)),
    remove: (id: number) => setPendingDelete(id),
    modal,
  }
}

function deleteColumn<R extends { id?: number | string }>(label: string, onRemove: (id: number) => void, disabled: boolean): RowsColumn<R & Record<string, unknown>> {
  return {
    key: '_actions',
    label: '',
    render: (r) => (
      <IconButton size="sm" label={label} disabled={disabled} onClick={() => onRemove(Number(r.id))} className="text-danger">
        <Trash2 size={14} />
      </IconButton>
    ),
  }
}

const EDU_KEYS = [
  'education_level_code',
  'education_specialty_code',
  'education_institution',
  'education_graduation_year',
  'academic_degree_code',
  'academic_title_code',
] as const

/**
 * «Ma'lumoti»: o'qish davrlari (o'quv yurti, mutaxassislik), ma'lumot
 * darajasi (T-2), diplom skani va malaka oshirish (K4).
 */
export function EducationTab({ employee, card, canEdit }: T2TabProps) {
  const { t } = useTranslation()
  const cardName = useCardName(card)
  const { saving, patch, begin } = useT2Save(employee.id, () => setEditing(false))
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [addOpen, setAddOpen] = useState(false)
  const records = useRecordRows(employee.id, 'educations')
  const levels = useCodeOptions('education_levels')
  const specialties = useCodeOptions('education_specialties')
  const degrees = useCodeOptions('academic_degrees')
  const titles = useCodeOptions('academic_titles')
  const values = card.values ?? {}
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

  type Row = Record<string, unknown> & { id: number }
  const rows = (employee.educations ?? []) as unknown as Row[]
  const columns: RowsColumn<Row>[] = [
    { key: 'period', label: t('personnel.rec.studyPeriod'), render: (r) => fmtRange(r.start_date as string, r.is_current ? null : (r.end_date as string), t('personnel.rec.studyingShort')) },
    { key: 'institution_name', label: t('personnel.rec.institution') },
    { key: 'faculty_name', label: t('personnel.rec.facultySpecialty') },
    { key: 'degree_name', label: t('personnel.rec.degree') },
  ]
  if (canEdit) columns.push(deleteColumn<Row>(t('common.delete'), records.remove, records.busy))

  const combo = (k: string, label: string, options: typeof levels) => (
    <Field label={label}>
      <Combobox value={form[k] ?? ''} onChange={set(k)} options={options} clearable placeholder={t('common.choose')} />
    </Field>
  )

  return (
    <div className="flex flex-col gap-3">
      <T2Section
        icon={<BookOpen size={15} />}
        title={t('personnel.t2.studyPlaces')}
        actions={
          canEdit ? (
            <Button size="sm" variant="outline" leftIcon={<Plus size={13} />} onClick={() => setAddOpen(true)} disabled={records.busy}>
              {t('common.add')}
            </Button>
          ) : undefined
        }
      >
        <RowsTable columns={columns} rows={rows} emptyText={t('personnel.rec.noEducation')} />
      </T2Section>

      <T2Section
        icon={<GraduationCap size={15} />}
        title={t('personnel.t2.educationLevel')}
        canEdit={canEdit}
        editing={editing}
        onEdit={() => {
          setForm(Object.fromEntries(EDU_KEYS.map((k) => [k, values[k] == null ? '' : String(values[k])])))
          begin('education')
          setEditing(true)
        }}
        onCancel={() => setEditing(false)}
        onSave={async () => {
          const body = nullifyEmpty(form)
          if (body.education_graduation_year != null) body.education_graduation_year = Number(body.education_graduation_year) || null
          if (await patch(body, 'education')) setEditing(false)
        }}
        saving={saving === 'education'}
      >
        {editing ? (
          <FieldGrid>
            {combo('education_level_code', t('personnel.t2.educationLevel'), levels)}
            {combo('education_specialty_code', t('personnel.t2.specialty'), specialties)}
            <Field label={t('personnel.t2.institution')}>
              <Input value={form.education_institution ?? ''} maxLength={500} onChange={(e) => set('education_institution')(e.target.value)} />
            </Field>
            <Field label={t('personnel.t2.graduationYear')}>
              <Input type="number" min={1900} max={2100} value={form.education_graduation_year ?? ''} onChange={(e) => set('education_graduation_year')(e.target.value)} />
            </Field>
            {combo('academic_degree_code', t('personnel.t2.academicDegree'), degrees)}
            {combo('academic_title_code', t('personnel.t2.academicTitle'), titles)}
          </FieldGrid>
        ) : (
          <FieldGrid>
            <ReadField label={t('personnel.t2.educationLevel')} value={cardName('education_level_name') || labelOf(levels, values.education_level_code)} />
            <ReadField label={t('personnel.t2.specialty')} value={cardName('education_specialty_name') || labelOf(specialties, values.education_specialty_code)} />
            <ReadField label={t('personnel.t2.institution')} value={values.education_institution} />
            <ReadField label={t('personnel.t2.graduationYear')} value={values.education_graduation_year} />
            <ReadField label={t('personnel.t2.academicDegree')} value={cardName('academic_degree_name') || labelOf(degrees, values.academic_degree_code)} />
            <ReadField label={t('personnel.t2.academicTitle')} value={cardName('academic_title_name') || labelOf(titles, values.academic_title_code)} />
          </FieldGrid>
        )}
      </T2Section>

      <DocumentsSlot employeeId={employee.id} kind="diploma" title={t('personnel.docs.diplomaScan')} canEdit={canEdit} />
      <TrainingsList employeeId={employee.id} />

      {canEdit && <RecordModal open={addOpen} kind="education" onClose={() => setAddOpen(false)} onAdd={records.add} />}
      {records.modal}
    </div>
  )
}

/** Malaka oshirish (TZ K4): `GET /employees/{pk}/trainings`. */
function TrainingsList({ employeeId }: { employeeId: number }) {
  const { t } = useTranslation()
  const q = useEmployeeTrainings(employeeId)
  if (q.isError) return null
  type Row = Record<string, unknown> & { id: number }
  const rows = (q.data?.items ?? []) as unknown as Row[]
  const resultLabel = (r: Row) => {
    if (r.result === 'passed') return t('personnel.training.passed')
    if (r.result === 'failed') return t('personnel.training.failed')
    const st = r.status as string | undefined
    if (st && ['planned', 'in_progress', 'completed', 'cancelled'].includes(st)) return t(`personnel.training.${st as 'planned'}`)
    return st || '—'
  }
  const columns: RowsColumn<Row>[] = [
    { key: 'type', label: t('personnel.training.type'), render: (r) => String(r.training_type_label || r.training_type || '—') },
    { key: 'program_name', label: t('personnel.training.program') },
    { key: 'provider', label: t('personnel.training.provider') },
    { key: 'period', label: t('personnel.training.period'), render: (r) => fmtRange(r.start_date as string, r.end_date as string) },
    { key: 'hours', label: t('personnel.training.hours') },
    { key: 'result', label: t('personnel.training.result'), render: resultLabel },
    {
      key: 'file',
      label: t('personnel.training.certificate'),
      render: (r) =>
        r.file_url ? (
          <a href={String(r.file_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline">
            <ExternalLink size={12} aria-hidden /> {String(r.certificate_number || t('personnel.open'))}
          </a>
        ) : (
          String(r.certificate_number || '—')
        ),
    },
  ]
  return (
    <T2Section icon={<Award size={15} />} title={t('personnel.training.title')} hint={t('personnel.training.hint')}>
      {q.isLoading ? <EmptyRow text={t('common.loading')} /> : <RowsTable columns={columns} rows={rows} emptyText={t('personnel.training.none')} />}
    </T2Section>
  )
}

/**
 * «Mehnat faoliyati»: umumiy staj (barcha davrlar yig'indisi), davrlar,
 * mehnat faoliyati yozuvlari, tashkilot ichidagi ko'chishlar, attestatsiya
 * va mehnat daftarchasi skani (TZ 4.2.7 · 2102–2107, 2149, 2150).
 */
export function ExperienceTab({ employee, card, canEdit }: T2TabProps) {
  const { t } = useTranslation()
  const labels = usePersonnelLabels()
  const { saving, patch, begin } = useT2Save(employee.id, () => setEditing(false))
  const [editing, setEditing] = useState(false)
  const [prevMonths, setPrevMonths] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const records = useRecordRows(employee.id, 'work-experiences')
  const career = useEmployeeCareer(employee.id)
  const values = card.values ?? {}

  type Row = Record<string, unknown> & { id: number }
  const rows = (employee.work_experiences ?? []) as unknown as Row[]
  const columns: RowsColumn<Row>[] = [
    { key: 'company_name', label: t('personnel.rec.company') },
    { key: 'position', label: t('personnel.rec.position') },
    { key: 'start_date', label: t('personnel.rec.startDate'), type: 'date' },
    { key: 'end_date', label: t('personnel.rec.endDate'), render: (r) => (r.is_current ? t('personnel.rec.untilNow') : fmtDate(r.end_date as string)) },
  ]
  if (canEdit) columns.push(deleteColumn<Row>(t('common.delete'), records.remove, records.busy))

  const kindLabel = (k: string) =>
    k === 'work' ? t('personnel.tabs.experience') : k === 'current' ? t('personnel.t2.currentJob') : k === 'study' ? t('personnel.t2.study') : k
  type PRow = ExperiencePeriod & Record<string, unknown> & { id: number }
  const breakdown = (card.experience_breakdown ?? []).map((p, i) => ({ ...p, id: i })) as PRow[]
  const breakdownColumns: RowsColumn<PRow>[] = [
    { key: 'kind', label: t('personnel.t2.periodKind'), render: (r) => kindLabel(r.kind) },
    { key: 'title', label: t('personnel.t2.periodTitle') },
    { key: 'subtitle', label: t('personnel.t2.periodSubtitle') },
    { key: 'start', label: t('personnel.rec.from'), type: 'date' },
    { key: 'end', label: t('personnel.rec.until'), render: (r) => (r.is_open ? t('personnel.rec.untilNow') : fmtDate(r.end)) },
    { key: 'len', label: t('personnel.t2.duration'), render: (r) => labels.period(r) },
  ]

  return (
    <div className="flex flex-col gap-3">
      <T2Section
        icon={<Timer size={15} />}
        title={t('personnel.t2.totalExperience')}
        canEdit={canEdit}
        editing={editing}
        onEdit={() => {
          setPrevMonths(values.previous_experience_months == null ? '' : String(values.previous_experience_months))
          begin('experience')
          setEditing(true)
        }}
        onCancel={() => setEditing(false)}
        onSave={async () => {
          const n = prevMonths === '' ? null : Number(prevMonths)
          if (await patch({ previous_experience_months: Number.isFinite(n) ? n : null }, 'experience')) setEditing(false)
        }}
        saving={saving === 'experience'}
      >
        <FieldGrid>
          <ReadField label={t('personnel.t2.totalAll')} value={<span className="font-semibold text-brand">{labels.period(card.experience_total) || '—'}</span>} />
          <ReadField label={t('personnel.t2.studyTotal')} value={labels.period(card.study_total) || '—'} />
          {editing ? (
            <Field label={t('personnel.t2.prevMonths')}>
              <Input type="number" min={0} max={1200} value={prevMonths} placeholder={t('personnel.t2.prevMonthsPh')} onChange={(e) => setPrevMonths(e.target.value)} />
            </Field>
          ) : (
            <ReadField label={t('personnel.t2.prevMonths')} value={values.previous_experience_months} />
          )}
        </FieldGrid>
      </T2Section>

      <T2Section icon={<Timer size={15} />} title={t('personnel.t2.breakdown')}>
        <RowsTable columns={breakdownColumns} rows={breakdown} emptyText={t('personnel.t2.noPeriods')} />
      </T2Section>

      <T2Section
        icon={<Briefcase size={15} />}
        title={t('personnel.tabs.experience')}
        actions={
          canEdit ? (
            <Button size="sm" variant="outline" leftIcon={<Plus size={13} />} onClick={() => setAddOpen(true)} disabled={records.busy}>
              {t('common.add')}
            </Button>
          ) : undefined
        }
      >
        <RowsTable columns={columns} rows={rows} emptyText={t('personnel.rec.noExperience')} />
      </T2Section>

      <T2Section icon={<Route size={15} />} title={t('personnel.t2.transfers')}>
        <CareerTable rows={career.data?.items} loading={career.isLoading} failed={career.isError} />
      </T2Section>

      <AttestationSection employeeId={employee.id} rows={card.attestations ?? []} years={card.attestation_period_years} canEdit={canEdit} />

      <DocumentsSlot employeeId={employee.id} kind="labor_book" title={t('personnel.docs.laborBook')} canEdit={canEdit} />

      {canEdit && <RecordModal open={addOpen} kind="experience" onClose={() => setAddOpen(false)} onAdd={records.add} />}
      {records.modal}
    </div>
  )
}

/** Positions held inside the organisation (`GET /employees/{pk}/career`). */
export function CareerTable({ rows, loading, failed }: { rows?: CareerRow[]; loading: boolean; failed: boolean }) {
  const { t } = useTranslation()
  if (loading) return <EmptyRow text={t('common.loading')} />
  if (failed) return <p className="py-2 text-[12.5px] text-danger">{t('personnel.career.loadFailed')}</p>
  type R = CareerRow & Record<string, unknown> & { id: number }
  const data = (rows ?? []).map((r, i) => ({ ...r, id: i })) as R[]
  const columns: RowsColumn<R>[] = [
    { key: 'position', label: t('personnel.f.position'), render: (r) => r.job_position?.name || '—' },
    { key: 'department', label: t('personnel.f.department'), render: (r) => r.department?.name || '—' },
    { key: 'from', label: t('personnel.rec.from'), type: 'date' },
    { key: 'to', label: t('personnel.rec.until'), render: (r) => (r.to ? fmtDate(r.to) : <span className="text-success">{t('personnel.rec.untilNow')}</span>) },
    { key: 'basis', label: t('personnel.career.basis'), render: (r) => r.basis || '—' },
  ]
  return <RowsTable columns={columns} rows={data} emptyText={t('personnel.career.none')} />
}

const ATT_STATUSES = ['planned', 'passed', 'failed', 'cancelled'] as const
const ATT_TONE: Record<string, 'brand' | 'success' | 'danger' | 'neutral'> = {
  planned: 'brand',
  passed: 'success',
  failed: 'danger',
  cancelled: 'neutral',
}

/**
 * Attestatsiya (TZ 4.2.7 · 2150): created automatically when the position
 * changes; HR records the result, date and note (`PATCH …/t2/attestations/{id}`).
 */
function AttestationSection({ employeeId, rows, years, canEdit }: { employeeId: number; rows: Attestation[]; years?: number | null; canEdit: boolean }) {
  const { t } = useTranslation()
  const list = [...rows].reverse()
  return (
    <T2Section
      icon={<ClipboardCheck size={15} />}
      title={t('personnel.att.title')}
      hint={years ? t('personnel.att.every', { n: years }) : undefined}
    >
      {list.length === 0 ? (
        <EmptyRow text={t('personnel.att.none')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <AttestationRow key={r.id} employeeId={employeeId} row={r} canEdit={canEdit} />
          ))}
        </ul>
      )}
    </T2Section>
  )
}

function AttestationRow({ employeeId, row, canEdit }: { employeeId: number; row: Attestation; canEdit: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { saveAttestation } = useT2Mutations(employeeId)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ status: 'planned', held_at: '', due_at: '', result: '', note: '' })
  const statusLabel = (s: string) => ((ATT_STATUSES as readonly string[]).includes(s) ? t(`personnel.att.${s as 'planned'}`) : s)
  const save = async () => {
    try {
      await saveAttestation.mutateAsync({
        id: row.id,
        body: {
          status: form.status,
          held_at: form.held_at || null,
          due_at: form.due_at || null,
          result: form.result.trim() || null,
          note: form.note.trim() || null,
        },
      })
      toast.ok(t('common.saved'))
      setEditing(false)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }
  return (
    <li className="rounded-inner border border-line bg-surface-2/40 px-3 py-2.5">
      <div className="flex flex-wrap items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-fg">{row.position_name || '—'}</div>
          <div className="mt-0.5 text-[11.5px] text-fg-subtle">
            {t('personnel.att.assigned')}: {fmtDate(row.assigned_at)} · {t('personnel.att.due')}: {fmtDate(row.due_at)}
            {row.basis ? ` · ${row.basis}` : ''}
          </div>
        </div>
        <Badge tone={ATT_TONE[row.status] ?? 'neutral'}>{statusLabel(row.status)}</Badge>
        {row.overdue && (
          <span className="inline-flex items-center gap-1 text-[11.5px] text-warning">
            <AlertTriangle size={12} aria-hidden /> {t('personnel.att.overdue')}
          </span>
        )}
        {canEdit && !editing && (
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Pencil size={12} />}
            onClick={() => {
              setForm({ status: row.status || 'planned', held_at: row.held_at || '', due_at: row.due_at || '', result: row.result || '', note: row.note || '' })
              setEditing(true)
            }}
          >
            {t('common.edit')}
          </Button>
        )}
      </div>
      {!editing && (row.held_at || row.result || row.note) && (
        <p className="mt-1.5 text-[12px] text-fg-muted">
          {row.held_at && <span>{t('personnel.att.heldAt')}: {fmtDate(row.held_at)}. </span>}
          {row.result && <span>{t('personnel.att.result')}: {row.result}. </span>}
          {row.note && <span className="text-fg-subtle">{row.note}</span>}
        </p>
      )}
      {editing && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label={t('personnel.att.status')}>
            <Combobox
              value={form.status}
              onChange={(v) => setForm((f) => ({ ...f, status: v || 'planned' }))}
              options={ATT_STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
              hidePlaceholderOption
              clearable={false}
            />
          </Field>
          <Field label={t('personnel.att.heldAt')}>
            <DateInput value={form.held_at} onChange={(v) => setForm((f) => ({ ...f, held_at: v }))} aria-label={t('personnel.att.heldAt')} />
          </Field>
          <Field label={t('personnel.att.due')}>
            <DateInput value={form.due_at} onChange={(v) => setForm((f) => ({ ...f, due_at: v }))} aria-label={t('personnel.att.due')} />
          </Field>
          <Field label={t('personnel.att.resultFull')}>
            <Input value={form.result} maxLength={1000} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))} />
          </Field>
          <Field label={t('personnel.att.note')} className="md:col-span-2">
            <Input value={form.note} maxLength={1000} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
          <div className="flex justify-end gap-1.5 md:col-span-2">
            <Button size="sm" variant="ghost" leftIcon={<X size={12} />} onClick={() => setEditing(false)} disabled={saveAttestation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" leftIcon={<Save size={12} />} onClick={() => void save()} loading={saveAttestation.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}
