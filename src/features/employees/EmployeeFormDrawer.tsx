import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Briefcase, GraduationCap, KeyRound, Paperclip, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import { TimeInput } from '@/components/ui/TimeInput'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { cn } from '@/lib/cn'
import { maskValue, type MaskKind } from '@/lib/fieldMask'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useBranches } from '@/hooks/useBranches'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { canManageEmployees, canSwitchBranchScope, isBranchAdmin, isSiteMasterAdmin, ownBranchIds } from '@/auth/permissions'
import type { User } from '@/types'
import { EmployeeBasisFields } from './EmployeeBasisFields'
import { EmployeePasswordModal } from './EmployeePasswordModal'
import { PhotoPicker } from './PhotoPicker'
import { RecordModal, recordBody, type EducationDraft, type ExperienceDraft } from './RecordModal'
import { SCAN_ACCEPT, scanProblem } from './t2/DocumentsSlot'
import { useCodeOptions } from './t2/useT2'
import { MARITAL, fmtDate, hhmm } from './format'
import { WeeklyScheduleEditor, type WeeklySchedule } from './WeeklyScheduleEditor'
import { useEmployeeOptions } from './useEmployeeOptions'
import { EditConflictDialog, editConflictOf, recordOwnWrite, resolveBase, type EditConflictInfo } from './editConflict'
import {
  addEmployeeRecord,
  fetchEmployee,
  invalidateEmployees,
  sendCredentialEmail,
  uploadEmployeeDocument,
  useEmployeeMutations,
} from './useEmployees'
import { CONTRACT_TYPES, EMPTY_BASIS, cleanBasis, isBasisComplete, type EditBasis, type EmployeeFull } from './types'

type Step = 1 | 2 | 3
type Form = Record<string, string>

const TEXT_FIELDS = [
  'legal_name',
  'tabel_number',
  'birth_date',
  'pasport_series',
  'pasport_number',
  'pasport_issue_by',
  'taxpayer_identification_number',
  'individual_accumulative_pension_account_number',
  'personal_identification_number',
  'maritial_status',
  'address',
  'residence_country_code',
  'residence_address',
  'contract_type',
  'email',
  'phone_number',
  'internal_phone_number',
  'job_acceptance_date',
  'job_position_id',
  'department_id',
  'supervisor_id',
  'gender',
  'nationality',
  'working_hours_start',
  'working_hours_end',
  'lunch_start_time',
  'lunch_end_time',
  'organization_branch_id',
  'multi_org_employee_role',
  'primary_organization_branch_id',
] as const

const MASKS: Record<string, MaskKind> = {
  pasport_series: 'passportSeries',
  pasport_number: 'passportNumber',
  personal_identification_number: 'pinfl',
  taxpayer_identification_number: 'inn',
  individual_accumulative_pension_account_number: 'inps',
  phone_number: 'phone',
  internal_phone_number: 'internalPhone',
}

/** Fields a line manager (unit-scope department head) may change (backend allow-list). */
const LINE_MANAGER_FIELDS = new Set([
  'working_hours_start',
  'working_hours_end',
  'lunch_start_time',
  'lunch_end_time',
  'working_days',
  'weekly_schedule',
  'stavka',
  'phone_number',
  'internal_phone_number',
  'job_position_id',
])

const ID_FIELDS = new Set(['department_id', 'job_position_id', 'supervisor_id', 'primary_organization_branch_id'])
const TIME_FIELDS = new Set(['working_hours_start', 'working_hours_end', 'lunch_start_time', 'lunch_end_time'])
const DUP_FIELD: Record<string, string> = {
  duplicate_inn: 'taxpayer_identification_number',
  duplicate_pinfl: 'personal_identification_number',
  personal_identification_number_exists: 'personal_identification_number',
  duplicate_passport: 'pasport_number',
}
// Fields of step 1 the server may name in `params.fields` (TZ C1 1001).
const STEP1_FIELDS = new Set(['legal_name', 'birth_date', 'gender', 'maritial_status', 'phone_number',
  'internal_phone_number', 'personal_identification_number', 'taxpayer_identification_number',
  'pasport_series', 'pasport_number', 'email'])
const SCAN_KINDS = ['passport', 'diploma', 'labor_book'] as const
const MULTI_ORG_ROLES = ['ministr', 'deputy', 'hr'] as const
const STAVKAS = ['1', '0.75', '0.5', '0.25'] as const

/** Admin-level account (backend `_is_admin_level`): admin / master-admin / ministr. */
function isAdminLevel(user: User | null | undefined): boolean {
  if (isSiteMasterAdmin(user) || isBranchAdmin(user)) return true
  const emp = user?.employee
  const role = emp?.multi_org_employee_role
  return !!emp?.is_multi_org_user && (Array.isArray(role) ? role.includes('ministr') : role === 'ministr')
}

const BLANK: Form = Object.fromEntries(TEXT_FIELDS.map((k) => [k, ''])) as Form

function fromEmployee(e: EmployeeFull): Form {
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  return {
    ...BLANK,
    legal_name: s(e.legal_name),
    tabel_number: s(e.tabel_number),
    birth_date: s(e.birth_date),
    pasport_series: s(e.pasport_series),
    pasport_number: s(e.pasport_number),
    pasport_issue_by: s(e.pasport_issue_by),
    taxpayer_identification_number: s(e.taxpayer_identification_number),
    individual_accumulative_pension_account_number: s(e.individual_accumulative_pension_account_number),
    personal_identification_number: s(e.personal_identification_number),
    maritial_status: s(e.maritial_status),
    address: s(e.address),
    residence_country_code: s(e.residence_country_code),
    residence_address: s(e.residence_address),
    contract_type: s(e.contract_type),
    email: s(e.email),
    phone_number: s(e.phone_number),
    internal_phone_number: s(e.internal_phone_number),
    job_acceptance_date: s(e.job_acceptance_date),
    job_position_id: s(e.job_position_id),
    department_id: s(e.department_id),
    supervisor_id: s(e.supervisor_id),
    gender: s(e.gender),
    nationality: s(e.nationality),
    working_hours_start: hhmm(e.working_hours_start),
    working_hours_end: hhmm(e.working_hours_end),
    lunch_start_time: hhmm(e.lunch_start_time),
    lunch_end_time: hhmm(e.lunch_end_time),
    organization_branch_id: s(
      e.department?.organization_branch_id ?? e.job_position?.organization_branch_id ?? e.organization_branches?.[0]?.id,
    ),
    multi_org_employee_role: s(e.multi_org_employee_role),
    primary_organization_branch_id: s(e.primary_organization_branch_id),
  }
}

interface Extra {
  stavka: number
  working_days: number[]
  weekly_schedule: WeeklySchedule
  is_multi_org_user: boolean
  organization_branch_ids: number[]
}

const sameArr = (a: number[], b: number[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i])

/**
 * «Xodim qo'shish / tahrirlash» (TZ C1, C3) — three steps like v1:
 * 1) personal data (photo, F.I.Sh., tabel raqami, pasport, JSHSHIR/STIR,
 *    addresses, contacts); 2) work experience and education records;
 * 3) job data (hire date, contract type, organisation, department, position,
 *    supervisor, rate and schedule) + document scans (create) or the basis
 *    document of the change (edit).
 * A new employee's card opens after saving; 409 duplicate PINFL / INN shows
 * a link to the existing record; an e-mail (= login) change re-sends the
 * credentials letter and waits for its real outcome.
 */
export function EmployeeFormDrawer({
  open,
  editId,
  onClose,
  onSaved,
  initialName,
}: {
  open: boolean
  editId: number | null
  onClose: () => void
  onSaved?: (res: { id: number; created: boolean }) => void
  /** Create mode: the F.I.Sh. typed where the person was not found (TZ O1 «Сотрудник не найден»). */
  initialName?: string
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const { branches } = useBranches()
  const { create, update, deletePhoto } = useEmployeeMutations()

  const adminLevel = isAdminLevel(user)
  const hr = canManageEmployees(user)
  const isEdit = editId != null
  const lineManagerMode = isEdit && !hr
  const unitDepartments = user?.actor?.unit_department_ids ?? []

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [original, setOriginal] = useState<{ form: Form; extra: Extra; employee: EmployeeFull } | null>(null)
  const [form, setForm] = useState<Form>(BLANK)
  const [extra, setExtra] = useState<Extra>({ stavka: 1, working_days: [0, 1, 2, 3, 4], weekly_schedule: {}, is_multi_org_user: false, organization_branch_ids: [] })
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [experiences, setExperiences] = useState<ExperienceDraft[]>([])
  const [educations, setEducations] = useState<EducationDraft[]>([])
  const [recordModal, setRecordModal] = useState<'education' | 'experience' | null>(null)
  const [scans, setScans] = useState<Record<string, File | null>>({})
  const [basis, setBasis] = useState<EditBasis>(EMPTY_BASIS)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [dup, setDup] = useState<{ message: string; employeeId: number | null; archived: boolean } | null>(null)
  const [cred, setCred] = useState<{ state: 'sending' | 'failed' | 'timeout'; email: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [pwdOpen, setPwdOpen] = useState(false)
  const [conflict, setConflict] = useState<EditConflictInfo | null>(null)

  // ── load ──
  /** The form, its baseline for the «changed fields» diff, and — TZ C3 1062 —
   *  the `updated_at` sent back as `expected_updated_at`. */
  const applyLoaded = (e: EmployeeFull) => {
    const f = fromEmployee(e)
    const x: Extra = {
      stavka: e.stavka != null ? Number(e.stavka) : 1,
      working_days: e.working_days ?? [0, 1, 2, 3, 4],
      weekly_schedule: (e.weekly_schedule ?? {}) as WeeklySchedule,
      is_multi_org_user: !!e.is_multi_org_user,
      organization_branch_ids: (e.organization_branches ?? []).map((b) => b.id),
    }
    setForm(f)
    setExtra(x)
    setOriginal({ form: f, extra: x, employee: e })
  }

  /** «Yangisini yuklash» after 409 `edit_conflict`: the latest saved record
   *  replaces the form; the basis, new rows and the picked photo stay. */
  const reloadFromServer = async () => {
    if (!editId) return
    try {
      applyLoaded(await fetchEmployee(editId))
      setStep(1)
      toast.info(t('hrExt.conflict.reloaded'))
    } catch (err) {
      toast.error(errorMessage(err, t('personnel.form.loadFailed')))
    }
  }

  useEffect(() => {
    if (!open) return
    setStep(1)
    setPhoto(null)
    setPhotoError('')
    setExperiences([])
    setEducations([])
    setScans({})
    setBasis(EMPTY_BASIS)
    setErrors({})
    setDup(null)
    setCred(null)
    if (!isEdit) {
      const own = ownBranchIds(user)
      const def = selectedBranchId ?? (own && own.length ? own[0] : null)
      setOriginal(null)
      setForm({
        ...BLANK,
        legal_name: initialName ?? '',
        organization_branch_id: def ? String(def) : '',
        working_hours_start: '09:00',
        working_hours_end: '18:00',
        lunch_start_time: '13:00',
        lunch_end_time: '14:00',
      })
      setExtra({ stavka: 1, working_days: [0, 1, 2, 3, 4], weekly_schedule: {}, is_multi_org_user: false, organization_branch_ids: [] })
      return
    }
    let alive = true
    setLoading(true)
    fetchEmployee(editId!)
      .then((e) => {
        if (!alive) return
        applyLoaded(e)
      })
      .catch((err) => {
        toast.error(errorMessage(err, t('personnel.form.loadFailed')))
        onClose()
      })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editId])

  // ── reference data ──
  const branchOptions = useMemo(() => {
    const own = ownBranchIds(user)
    return branches
      .filter((b) => canSwitchBranchScope(user) || own === null || own.includes(Number(b.id)))
      .map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))
  }, [branches, user])
  const activeBranch = Number(form.organization_branch_id) || (extra.is_multi_org_user ? extra.organization_branch_ids[0] : null) || selectedBranchId || null
  const allDepartments = useDepartmentOptions(activeBranch)
  const departmentOptions = useMemo(
    () => (hr || !unitDepartments.length ? allDepartments : allDepartments.filter((d) => unitDepartments.includes(Number(d.value)))),
    [allDepartments, hr, unitDepartments],
  )
  const positionOptions = useJobPositionOptions(activeBranch)
  const { options: supervisorRaw } = useEmployeeOptions(activeBranch, open && step === 3)
  const supervisorOptions = useMemo(() => supervisorRaw.filter((o) => Number(o.value) !== editId), [supervisorRaw, editId])
  const countries = useCodeOptions('countries', open)
  const nationalities = useCodeOptions('nationalities', open)

  const locked = (k: string) => lineManagerMode && !LINE_MANAGER_FIELDS.has(k)
  const set = (k: string, raw: string) => {
    const v = MASKS[k] ? maskValue(MASKS[k], raw) : raw
    setForm((f) => {
      const next = { ...f, [k]: v }
      if (k === 'organization_branch_id') {
        next.department_id = ''
        next.job_position_id = ''
        next.supervisor_id = ''
      }
      return next
    })
    if (errors[k]) setErrors((e) => ({ ...e, [k]: '' }))
  }

  // ── validation ──
  const validateStep1 = (): boolean => {
    const e: Record<string, string> = {}
    if (!form.legal_name.trim()) e.legal_name = t('personnel.form.errName')
    if (!form.personal_identification_number) e.personal_identification_number = t('personnel.form.errPinflRequired')
    else if (form.personal_identification_number.length !== 14) e.personal_identification_number = t('personnel.form.errPinfl')
    if (!form.email.trim()) e.email = t('personnel.form.errEmailRequired')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = t('personnel.form.errEmail')
    if (form.pasport_series && form.pasport_series.length !== 2) e.pasport_series = t('personnel.form.errSeries')
    if (form.pasport_number && form.pasport_number.length !== 7) e.pasport_number = t('personnel.form.errPassportNo')
    if (form.taxpayer_identification_number && form.taxpayer_identification_number.length !== 9) e.taxpayer_identification_number = t('personnel.form.errInn')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const validateStep3 = (): boolean => {
    const e: Record<string, string> = {}
    if (!isEdit) {
      if (!form.job_acceptance_date) e.job_acceptance_date = t('personnel.form.errHireDate')
      if (adminLevel && extra.is_multi_org_user) {
        if (!form.multi_org_employee_role) e.multi_org_employee_role = t('personnel.form.errRole')
        if (!extra.organization_branch_ids.length) e.organization_branch_ids = t('personnel.form.errBranches')
      } else if (!extra.is_multi_org_user) {
        if (!form.department_id) e.department_id = t('personnel.form.errDepartment')
        if (!form.job_position_id) e.job_position_id = t('personnel.form.errPosition')
      }
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSaveError = (err: unknown) => {
    const clash = editConflictOf(err)
    if (clash) {
      setConflict(clash)
      return
    }
    const code = errorCode(err)
    const msg = errorMessage(err, t('common.actionFailed'))
    const field = code ? DUP_FIELD[code] : undefined
    if (field) {
      const existing = Number(errorParams(err).employee_id) || null
      setErrors((e) => ({ ...e, [field]: msg }))
      setDup({ message: msg, employeeId: existing && existing !== editId ? existing : null, archived: !!errorParams(err).archived })
      setStep(1)
      return
    }
    if (code === 'basis_required' || code === 'basis_date_before_hire' || code === 'basis_date_in_future') {
      setErrors((e) => ({ ...e, basis: msg }))
      setStep(3)
      return
    }
    const named = errorParams(err).fields
    if (named && typeof named === 'object' && !Array.isArray(named)) {
      const keys = Object.keys(named as Record<string, unknown>)
      if (keys.length) {
        setErrors((e) => ({ ...e, ...Object.fromEntries(keys.map((k) => [k, msg])) }))
        if (keys.some((k) => STEP1_FIELDS.has(k))) setStep(1)
        else if (keys.includes('job_acceptance_date')) setStep(3)
        toast.error(msg)
        return
      }
    }
    toast.error(msg)
  }

  // ── payloads ──
  const scheduleFields = () => ({
    stavka: extra.stavka || 1,
    working_days: extra.working_days,
    weekly_schedule: extra.stavka < 1 ? extra.weekly_schedule : null,
  })
  const time = (v: string) => (v ? `${v}:00` : undefined)

  const createPayload = (): Record<string, unknown> => {
    const opt = (v: string) => (v ? v : undefined)
    const id = (v: string) => (v ? Number(v) : undefined)
    return {
      legal_name: form.legal_name.trim(),
      tabel_number: opt(form.tabel_number.trim()),
      birth_date: opt(form.birth_date),
      pasport_series: opt(form.pasport_series),
      pasport_number: opt(form.pasport_number),
      pasport_individual_number: opt(form.personal_identification_number),
      pasport_issue_by: opt(form.pasport_issue_by.trim()),
      taxpayer_identification_number: opt(form.taxpayer_identification_number),
      individual_accumulative_pension_account_number: opt(form.individual_accumulative_pension_account_number),
      personal_identification_number: form.personal_identification_number,
      maritial_status: opt(form.maritial_status),
      address: opt(form.address.trim()),
      residence_country_code: opt(form.residence_country_code),
      residence_address: opt(form.residence_address.trim()),
      contract_type: opt(form.contract_type),
      email: form.email.trim(),
      phone_number: opt(form.phone_number),
      internal_phone_number: opt(form.internal_phone_number),
      job_acceptance_date: opt(form.job_acceptance_date),
      job_position_id: id(form.job_position_id),
      department_id: id(form.department_id),
      supervisor_id: id(form.supervisor_id),
      organization_branch_ids: extra.is_multi_org_user
        ? extra.organization_branch_ids
        : form.organization_branch_id
          ? [Number(form.organization_branch_id)]
          : [],
      photo_base64: photo ?? undefined,
      ...scheduleFields(),
      working_hours_start: time(form.working_hours_start),
      working_hours_end: time(form.working_hours_end),
      lunch_start_time: time(form.lunch_start_time),
      lunch_end_time: time(form.lunch_end_time),
      nationality: opt(form.nationality),
      gender: form.gender ? Number(form.gender) : undefined,
      ...(adminLevel
        ? {
            is_multi_org_user: extra.is_multi_org_user,
            multi_org_employee_role: extra.is_multi_org_user ? form.multi_org_employee_role || undefined : undefined,
            primary_organization_branch_id: extra.is_multi_org_user && form.primary_organization_branch_id ? Number(form.primary_organization_branch_id) : undefined,
          }
        : {}),
    }
  }

  const changedFields = (): Record<string, unknown> => {
    if (!original) return {}
    const out: Record<string, unknown> = {}
    for (const k of TEXT_FIELDS) {
      if (form[k] === original.form[k]) continue
      const v = form[k] === '' ? null : form[k]
      if (k === 'organization_branch_id') {
        if (!extra.is_multi_org_user) out.organization_branch_ids = v ? [Number(v)] : []
      } else if (ID_FIELDS.has(k)) out[k] = v === null ? null : Number(v)
      else if (k === 'gender') out[k] = v === null ? null : Number(v)
      else if (TIME_FIELDS.has(k)) out[k] = v ? `${v}:00` : null
      else if (k === 'personal_identification_number') {
        out[k] = v
        out.pasport_individual_number = v
      } else out[k] = typeof v === 'string' ? v.trim() : v
    }
    const ox = original.extra
    if (extra.stavka !== ox.stavka) out.stavka = extra.stavka
    if (!sameArr(extra.working_days, ox.working_days)) out.working_days = extra.working_days
    if (JSON.stringify(extra.weekly_schedule) !== JSON.stringify(ox.weekly_schedule) || extra.stavka !== ox.stavka)
      out.weekly_schedule = extra.stavka < 1 ? extra.weekly_schedule : null
    if (extra.is_multi_org_user !== ox.is_multi_org_user) out.is_multi_org_user = extra.is_multi_org_user
    if (extra.is_multi_org_user && !sameArr(extra.organization_branch_ids, ox.organization_branch_ids))
      out.organization_branch_ids = extra.organization_branch_ids
    if (photo) out.photo_base64 = photo
    if (!adminLevel) {
      delete out.is_multi_org_user
      delete out.multi_org_employee_role
      delete out.primary_organization_branch_id
    }
    if (lineManagerMode) for (const k of Object.keys(out)) if (!LINE_MANAGER_FIELDS.has(k)) delete out[k]
    return out
  }

  // ── save ──
  const save = async () => {
    if (!validateStep1()) {
      setStep(1)
      return
    }
    if (!validateStep3()) {
      setStep(3)
      return
    }
    setDup(null)
    const newRows = experiences.length + educations.length > 0
    let employeeId = editId
    let blocked = false
    setSaving(true)
    try {
      if (isEdit) {
        const changed = changedFields()
        const anything = Object.keys(changed).length > 0 || newRows
        if (!anything) {
          onSaved?.({ id: editId!, created: false })
          onClose()
          return
        }
        if (!isBasisComplete(basis)) {
          setErrors((e) => ({ ...e, basis: t('personnel.basis.required') }))
          setStep(3)
          toast.error(t('personnel.basis.required'))
          return
        }
        if (Object.keys(changed).length) {
          // TZ C3 1062: the record as it was when the form opened.
          const expected = resolveBase(editId!, original?.employee.updated_at)
          const saved = await update.mutateAsync({ id: editId!, body: { ...changed, basis: cleanBasis(basis), expected_updated_at: expected } })
          recordOwnWrite(editId!, expected, saved?.updated_at)
          if (typeof changed.email === 'string' && changed.email) {
            const email = changed.email
            setCred({ state: 'sending', email })
            const result = await sendCredentialEmail(editId!)
            if (result === 'sent') {
              setCred(null)
              toast.ok(t('personnel.cred.sent'))
            } else if (result === 'superseded') {
              setCred(null)
              toast.info(t('personnel.cred.superseded'))
            } else {
              setCred({ state: result, email })
              blocked = true
            }
          }
        }
      } else {
        const created = await create.mutateAsync(createPayload())
        employeeId = created.id
      }
      if (!employeeId) return

      const rowBasis = isEdit ? cleanBasis(basis) : null
      for (const x of experiences) await addEmployeeRecord(employeeId, 'work-experiences', recordBody(x), rowBasis)
      for (const x of educations) await addEmployeeRecord(employeeId, 'educations', recordBody(x), rowBasis)

      if (!isEdit) {
        const failed: string[] = []
        for (const kind of SCAN_KINDS) {
          const file = scans[kind]
          if (!file) continue
          try {
            await uploadEmployeeDocument(employeeId, kind, file, t(`personnel.scan.${kind}`))
          } catch (err) {
            failed.push(`${t(`personnel.scan.${kind}`)} — ${errorMessage(err, t('personnel.docs.uploadFailed'))}`)
          }
        }
        if (failed.length) toast.error(`${t('personnel.form.scansFailed')}: ${failed.join(', ')}`)
      }
      invalidateEmployees(qc)
      if (blocked) return
      toast.ok(isEdit ? t('personnel.form.updated') : t('personnel.form.created'))
      onSaved?.({ id: employeeId, created: !isEdit })
      onClose()
    } catch (err) {
      handleSaveError(err)
    } finally {
      setSaving(false)
    }
  }

  const removePhoto = async () => {
    if (!editId) return
    const ok = await confirm({ kind: 'delete', title: t('personnel.photo.removeTitle'), description: t('personnel.photo.removeConfirm') })
    if (!ok) return
    try {
      await deletePhoto.mutateAsync(editId)
      setOriginal((o) => (o ? { ...o, employee: { ...o.employee, photo_path: null, photo_thumb_path: null } } : o))
      toast.ok(t('personnel.photo.removed'))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  // ── render helpers ──
  const text = (k: string, label: string, opts: { required?: boolean; placeholder?: string; type?: string; maxLength?: number; hint?: string } = {}) => (
    <Field label={label} required={opts.required} error={errors[k]} hint={opts.hint}>
      <Input
        type={opts.type ?? 'text'}
        value={form[k]}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        invalid={!!errors[k]}
        disabled={locked(k)}
        onChange={(e) => set(k, e.target.value)}
      />
    </Field>
  )
  const pick = (k: string, label: string, options: { value: string; label: string }[], opts: { required?: boolean; placeholder?: string; disabled?: boolean } = {}) => (
    <Field label={label} required={opts.required} error={errors[k]}>
      <Combobox
        value={form[k]}
        onChange={(v) => set(k, v)}
        options={options}
        placeholder={opts.placeholder ?? t('common.choose')}
        disabled={opts.disabled || locked(k)}
        invalid={!!errors[k]}
        clearable={!opts.required}
      />
    </Field>
  )
  const date = (k: string, label: string, required = false) => (
    <Field label={label} required={required} error={errors[k]}>
      <DateInput value={form[k]} onChange={(v) => set(k, v)} invalid={!!errors[k]} disabled={locked(k)} aria-label={label} />
    </Field>
  )
  const timeField = (k: string, label: string) => (
    <Field label={label}>
      <TimeInput value={form[k]} onChange={(v) => set(k, v)} disabled={locked(k)} aria-label={label} />
    </Field>
  )

  const steps: { id: Step; label: string }[] = [
    { id: 1, label: t('personnel.form.step1') },
    { id: 2, label: t('personnel.form.step2') },
    { id: 3, label: t('personnel.form.step3') },
  ]
  const days = [
    t('personnel.days.mon'),
    t('personnel.days.tue'),
    t('personnel.days.wed'),
    t('personnel.days.thu'),
    t('personnel.days.fri'),
    t('personnel.days.sat'),
    t('personnel.days.sun'),
  ]
  const existingExp = original?.employee.work_experiences ?? []
  const existingEdu = original?.employee.educations ?? []

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        placement="right"
        size="md"
        title={isEdit ? t('personnel.form.editTitle') : t('personnel.form.createTitle')}
        description={isEdit ? t('personnel.form.editHint') : t('personnel.form.createHint')}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <span>
              {step === 2 && (
                <Button variant="ghost" onClick={() => setStep(3)}>
                  {t('personnel.form.skip')}
                </Button>
              )}
            </span>
            <span className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                {t('common.cancel')}
              </Button>
              {step < 3 ? (
                <Button
                  onClick={() => {
                    if (step === 1 && !validateStep1()) return
                    setStep((s) => (s + 1) as Step)
                  }}
                  disabled={loading}
                >
                  {t('personnel.form.next')}
                </Button>
              ) : (
                <Button onClick={() => void save()} loading={saving} disabled={loading || cred?.state === 'sending'}>
                  {cred?.state === 'sending' ? t('personnel.cred.sending') : t('common.save')}
                </Button>
              )}
            </span>
          </div>
        }
      >
        {loading ? (
          <div className="grid place-items-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <ol className="flex flex-1 items-center gap-1.5" aria-label={t('personnel.form.steps')}>
                {steps.map((s) => (
                  <li key={s.id} className="flex-1">
                    <button
                      type="button"
                      onClick={() => (s.id === 1 || validateStep1() ? setStep(s.id) : undefined)}
                      aria-current={step === s.id ? 'step' : undefined}
                      className={cn(
                        'flex w-full flex-col items-center gap-1 rounded-inner px-1 py-1.5 text-[11.5px] font-semibold transition-colors',
                        step >= s.id ? 'text-brand' : 'text-fg-subtle hover:text-fg',
                      )}
                    >
                      <span
                        className={cn(
                          'grid h-7 w-7 place-items-center rounded-full text-[12px]',
                          step >= s.id ? 'bg-brand text-fg-on-brand' : 'border border-line bg-surface-2',
                        )}
                      >
                        {s.id}
                      </span>
                      {s.label}
                    </button>
                  </li>
                ))}
              </ol>
              {isEdit && hr && (
                <IconButton label={t('personnel.pwd.title')} onClick={() => setPwdOpen(true)}>
                  <KeyRound size={17} />
                </IconButton>
              )}
            </div>
            {lineManagerMode && <p className="rounded-inner bg-info-soft px-3 py-2 text-[12px] text-info">{t('personnel.form.lineManagerHint')}</p>}

            {step === 1 && (
              <div className="flex flex-col gap-3.5">
                {!lineManagerMode && (
                  <PhotoPicker
                    value={photo}
                    onChange={setPhoto}
                    currentUrl={original?.employee.photo_thumb_path || original?.employee.photo_path}
                    currentFallbackUrl={original?.employee.photo_path}
                    name={form.legal_name}
                    size={64}
                    onRemove={isEdit ? () => void removePhoto() : undefined}
                    onError={setPhotoError}
                  />
                )}
                <FormError>{photoError}</FormError>
                {text('legal_name', t('personnel.form.fullName'), { required: true, placeholder: t('personnel.form.fullNamePh'), maxLength: 255 })}
                {text('tabel_number', t('personnel.f.tabelNumber'), { placeholder: t('personnel.form.tabelPh'), maxLength: 64 })}
                <div className="grid gap-3 sm:grid-cols-2">
                  {pick('gender', t('personnel.f.gender'), [
                    { value: '1', label: t('personnel.gender.male') },
                    { value: '2', label: t('personnel.gender.female') },
                  ])}
                  {pick('maritial_status', t('personnel.f.marital'), MARITAL.map((m) => ({ value: m.value, label: t(`personnel.marital.${m.key}`) })))}
                  {text('pasport_series', t('personnel.form.passportSeries'), { placeholder: 'AA' })}
                  {text('pasport_number', t('personnel.form.passportNumber'), { placeholder: '1234567' })}
                  {text('pasport_issue_by', t('personnel.f.passportIssuedBy'), { maxLength: 255 })}
                  {date('birth_date', t('personnel.f.birthDate'))}
                  {pick('nationality', t('personnel.f.nationality'), nationalities)}
                  {text('personal_identification_number', t('personnel.form.pinfl'), { required: true, placeholder: '12345678901234' })}
                  {text('taxpayer_identification_number', t('personnel.form.inn'), { placeholder: '123456789' })}
                  {text('individual_accumulative_pension_account_number', t('personnel.f.inps'), { placeholder: '12345678901234' })}
                </div>
                <Field label={t('personnel.f.regAddress')}>
                  <Textarea value={form.address} rows={2} maxLength={1000} disabled={locked('address')} onChange={(e) => set('address', e.target.value)} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  {pick('residence_country_code', t('personnel.form.residenceCountry'), countries)}
                  {text('residence_address', t('personnel.form.residenceAddress'), { placeholder: t('personnel.form.streetPlaceholder'), maxLength: 1000 })}
                  {text('email', t('personnel.form.email'), { required: true, type: 'email', placeholder: 'email@uzgidro.uz', hint: isEdit ? t('personnel.form.emailHint') : undefined })}
                  {text('phone_number', t('personnel.form.phone'), { placeholder: '+998901234567' })}
                  {text('internal_phone_number', t('personnel.f.internalPhone'), { placeholder: '1234' })}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <RecordsBlock
                  icon={<Briefcase size={15} />}
                  title={t('personnel.form.experiences')}
                  empty={t('personnel.form.noExperiences')}
                  disabled={lineManagerMode}
                  onAdd={() => setRecordModal('experience')}
                  existing={existingExp.map((x) => ({
                    key: `e${x.id}`,
                    title: x.position ?? '',
                    sub: `${x.company_name ?? ''} (${fmtDate(x.start_date)} — ${x.is_current ? t('personnel.rec.untilNow') : fmtDate(x.end_date)})`,
                  }))}
                  drafts={experiences.map((x, i) => ({
                    key: `n${i}`,
                    title: x.position,
                    sub: `${x.company_name} (${fmtDate(x.start_date)} — ${x.is_current ? t('personnel.rec.untilNow') : fmtDate(x.end_date)})`,
                    remove: () => setExperiences((p) => p.filter((_, j) => j !== i)),
                  }))}
                />
                <RecordsBlock
                  icon={<GraduationCap size={15} />}
                  title={t('personnel.form.educations')}
                  empty={t('personnel.form.noEducations')}
                  disabled={lineManagerMode}
                  onAdd={() => setRecordModal('education')}
                  existing={existingEdu.map((x) => ({
                    key: `e${x.id}`,
                    title: [x.degree_name, x.faculty_name].filter(Boolean).join(' — '),
                    sub: `${x.institution_name ?? ''} (${fmtDate(x.start_date)} — ${x.is_current ? t('personnel.rec.untilNow') : fmtDate(x.end_date)})`,
                  }))}
                  drafts={educations.map((x, i) => ({
                    key: `n${i}`,
                    title: [x.degree_name, x.faculty_name].filter(Boolean).join(' — '),
                    sub: `${x.institution_name} (${fmtDate(x.start_date)} — ${x.is_current ? t('personnel.rec.untilNow') : fmtDate(x.end_date)})`,
                    remove: () => setEducations((p) => p.filter((_, j) => j !== i)),
                  }))}
                />
                {isEdit && <p className="text-[12px] text-fg-subtle">{t('personnel.form.recordsHint')}</p>}
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-3.5">
                {date('job_acceptance_date', t('personnel.f.hireDate'), !isEdit)}
                {pick(
                  'contract_type',
                  t('personnel.f.contractType'),
                  CONTRACT_TYPES.map((c) => ({ value: c, label: t(`personnel.contract.${c}`) })),
                )}

                {adminLevel && (
                  <Checkbox
                    label={t('personnel.form.multiOrg')}
                    checked={extra.is_multi_org_user}
                    onChange={(e) => setExtra((x) => ({ ...x, is_multi_org_user: e.target.checked }))}
                  />
                )}

                {extra.is_multi_org_user && adminLevel && (
                  <>
                    {pick(
                      'multi_org_employee_role',
                      t('personnel.form.multiOrgRole'),
                      MULTI_ORG_ROLES.map((r) => ({ value: r, label: t(`personnel.form.role_${r}`) })),
                      { required: true },
                    )}
                    <Field label={t('personnel.form.branches')} required error={errors.organization_branch_ids}>
                      <div className="flex flex-col gap-1.5 rounded-inner border border-line p-2.5">
                        {branches.map((b) => (
                          <Checkbox
                            key={b.id}
                            label={b.name ?? `#${b.id}`}
                            checked={extra.organization_branch_ids.includes(Number(b.id))}
                            onChange={(e) =>
                              setExtra((x) => {
                                const ids = e.target.checked
                                  ? [...x.organization_branch_ids, Number(b.id)]
                                  : x.organization_branch_ids.filter((id) => id !== Number(b.id))
                                if (!ids.includes(Number(form.primary_organization_branch_id))) set('primary_organization_branch_id', '')
                                return { ...x, organization_branch_ids: ids }
                              })
                            }
                          />
                        ))}
                      </div>
                    </Field>
                    <Field label={t('personnel.form.primaryBranch')} hint={t('personnel.form.primaryBranchHint')}>
                      <Combobox
                        value={form.primary_organization_branch_id}
                        onChange={(v) => set('primary_organization_branch_id', v)}
                        options={branches
                          .filter((b) => extra.organization_branch_ids.includes(Number(b.id)))
                          .map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))}
                        placeholder={t('personnel.form.primaryBranchPh')}
                        clearable
                      />
                    </Field>
                  </>
                )}

                {!extra.is_multi_org_user && branchOptions.length > 1 &&
                  pick('organization_branch_id', t('personnel.form.branch'), branchOptions, { placeholder: t('personnel.form.branchPh') })}

                <div className="grid gap-3 sm:grid-cols-2">
                  {pick('job_position_id', t('personnel.f.position'), positionOptions, {
                    required: !isEdit && !extra.is_multi_org_user,
                    placeholder: activeBranch ? t('personnel.form.positionPh') : t('personnel.place.orgFirst'),
                    disabled: !activeBranch,
                  })}
                  {pick('department_id', t('personnel.f.department'), departmentOptions, {
                    required: !isEdit && !extra.is_multi_org_user,
                    placeholder: activeBranch ? t('personnel.form.departmentPh') : t('personnel.place.orgFirst'),
                    disabled: !activeBranch,
                  })}
                </div>
                {pick('supervisor_id', t('personnel.form.supervisor'), supervisorOptions, { placeholder: t('personnel.form.supervisorPh') })}

                <Field label={t('personnel.form.stavka')}>
                  <Combobox
                    value={String(extra.stavka)}
                    onChange={(v) => setExtra((x) => ({ ...x, stavka: Number(v) || 1 }))}
                    options={STAVKAS.map((s) => ({ value: s, label: t(`personnel.form.stavka_${s.replace('.', '_') as '1'}`) }))}
                    hidePlaceholderOption
                    clearable={false}
                  />
                </Field>

                {extra.stavka < 1 ? (
                  <WeeklyScheduleEditor
                    value={extra.weekly_schedule}
                    stavka={extra.stavka}
                    onChange={(ws) => setExtra((x) => ({ ...x, weekly_schedule: ws }))}
                  />
                ) : (
                  <>
                    <Field label={t('personnel.info.workDays')}>
                      <div className="flex flex-wrap gap-1.5">
                        {days.map((d, i) => {
                          const on = extra.working_days.includes(i)
                          return (
                            <button
                              key={i}
                              type="button"
                              aria-pressed={on}
                              onClick={() =>
                                setExtra((x) => ({
                                  ...x,
                                  working_days: on ? x.working_days.filter((w) => w !== i) : [...x.working_days, i].sort(),
                                }))
                              }
                              className={cn(
                                'h-9 w-10 rounded-inner border text-[12px] font-bold transition-colors',
                                on ? 'border-brand bg-brand text-fg-on-brand' : 'border-line bg-surface-2 text-fg-muted hover:text-fg',
                              )}
                            >
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {timeField('working_hours_start', t('personnel.form.workStart'))}
                      {timeField('working_hours_end', t('personnel.form.workEnd'))}
                    </div>
                  </>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {timeField('lunch_start_time', t('personnel.form.lunchStart'))}
                  {timeField('lunch_end_time', t('personnel.form.lunchEnd'))}
                </div>

                {isEdit ? (
                  <EmployeeBasisFields
                    value={basis}
                    onChange={(b) => {
                      setBasis(b)
                      if (errors.basis) setErrors((e) => ({ ...e, basis: '' }))
                    }}
                    error={errors.basis}
                  />
                ) : (
                  <ScansPicker value={scans} onChange={setScans} />
                )}
              </div>
            )}

            {dup && (
              <div role="alert" className="flex items-start gap-2.5 rounded-inner border border-danger/30 bg-danger-soft px-3.5 py-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-[13px] font-semibold text-danger">{dup.message}</span>
                  {dup.employeeId && (
                    <Link
                      to={dup.archived ? `/employees/${dup.employeeId}?action=rehire` : `/employees/${dup.employeeId}`}
                      onClick={onClose}
                      className="self-start text-[12.5px] font-semibold text-brand hover:underline"
                    >
                      {dup.archived ? t('personnel.form.openArchived') : t('personnel.form.openExisting')}
                    </Link>
                  )}
                </div>
              </div>
            )}

            {cred && cred.state !== 'sending' && (
              <div role="alert" className="flex items-start gap-2.5 rounded-inner border border-danger/30 bg-danger-soft px-3.5 py-3">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-[13px] font-semibold text-danger">
                    {cred.state === 'timeout' ? t('personnel.cred.timeout') : t('personnel.cred.failed')}
                  </span>
                  <p className="text-[12px] leading-relaxed text-fg-muted">
                    {t('personnel.cred.explain', { email: cred.email })}{' '}
                    {cred.state === 'timeout' ? t('personnel.cred.retrying') : t('personnel.cred.oldWorks')} {t('personnel.cred.manual')}
                  </p>
                  {hr && (
                    <Button size="sm" className="self-start" leftIcon={<KeyRound size={13} />} onClick={() => setPwdOpen(true)}>
                      {t('personnel.pwd.title')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <RecordModal
        open={!!recordModal}
        kind={recordModal ?? 'education'}
        onClose={() => setRecordModal(null)}
        onAdd={(d) => (recordModal === 'education' ? setEducations((p) => [...p, d as EducationDraft]) : setExperiences((p) => [...p, d as ExperienceDraft]))}
      />
      {isEdit && (
        <EmployeePasswordModal
          target={pwdOpen ? { id: editId!, legal_name: form.legal_name } : null}
          onClose={() => setPwdOpen(false)}
          onSaved={() => {
            if (cred) {
              setCred(null)
              onSaved?.({ id: editId!, created: false })
              onClose()
            }
          }}
        />
      )}
      {/* TZ C3 1062: somebody saved this card after the form was opened. */}
      <EditConflictDialog conflict={conflict} onReload={reloadFromServer} onClose={() => setConflict(null)} />
    </>
  )
}

function RecordsBlock({
  icon,
  title,
  empty,
  disabled,
  onAdd,
  existing,
  drafts,
}: {
  icon: ReactNode
  title: string
  empty: string
  disabled?: boolean
  onAdd: () => void
  existing: { key: string; title: string; sub: string }[]
  drafts: { key: string; title: string; sub: string; remove: () => void }[]
}) {
  const { t } = useTranslation()
  const total = existing.length + drafts.length
  return (
    <section className="overflow-hidden rounded-inner border border-line">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-2/50 px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
          <span className="text-brand">{icon}</span>
          {title}
          <span className="rounded-pill bg-brand-soft px-1.5 text-[11px] text-brand-strong">{total}</span>
        </span>
        <Button size="sm" variant="outline" leftIcon={<Plus size={13} />} onClick={onAdd} disabled={disabled}>
          {t('common.add')}
        </Button>
      </div>
      {total === 0 ? (
        <p className="px-3.5 py-5 text-center text-[12.5px] text-fg-subtle">{empty}</p>
      ) : (
        <ul className="divide-y divide-line/60">
          {existing.map((r) => (
            <li key={r.key} className="px-3.5 py-2.5">
              <span className="block text-[13px] font-medium text-fg">{r.title}</span>
              <span className="block text-[11.5px] text-fg-subtle">{r.sub}</span>
            </li>
          ))}
          {drafts.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 bg-brand-soft/30 px-3.5 py-2.5">
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-fg">{r.title}</span>
                <span className="block text-[11.5px] text-fg-subtle">{r.sub}</span>
              </span>
              <IconButton size="sm" label={t('common.delete')} onClick={r.remove} className="text-danger">
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** C1: passport / diploma / labour-book scans picked now, uploaded after the employee is created. */
function ScansPicker({ value, onChange }: { value: Record<string, File | null>; onChange: (v: Record<string, File | null>) => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  return (
    <fieldset className="flex flex-col gap-2.5 rounded-lg border border-brand/30 bg-brand-soft/40 p-3">
      <legend className="flex items-center gap-1.5 px-1.5 text-[13px] font-semibold text-fg">
        <Paperclip size={14} aria-hidden /> {t('personnel.form.scans')}
      </legend>
      <p className="text-[11.5px] text-fg-subtle">{t('personnel.form.scansHint')}</p>
      {SCAN_KINDS.map((kind) => {
        const file = value[kind]
        return (
          <div key={kind} className="flex items-center gap-2.5">
            <span className="w-[150px] shrink-0 text-[13px] text-fg-muted">{t(`personnel.scan.${kind}`)}</span>
            {file ? (
              <span className="flex min-w-0 flex-1 items-center gap-2 text-[12.5px] text-brand">
                <span className="truncate">{file.name}</span>
                <IconButton size="sm" label={t('common.delete')} onClick={() => onChange({ ...value, [kind]: null })}>
                  <Trash2 size={14} />
                </IconButton>
              </span>
            ) : (
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-btn border border-line bg-surface px-3 text-[12px] font-semibold text-fg hover:bg-surface-2">
                <Plus size={13} aria-hidden /> {t('personnel.form.pickFile')}
                <input
                  type="file"
                  accept={SCAN_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (!f) return
                    const problem = scanProblem(f)
                    if (problem) {
                      toast.error(problem === 'type' ? t('personnel.docs.wrongType') : t('personnel.docs.tooBig'))
                      return
                    }
                    onChange({ ...value, [kind]: f })
                  }}
                />
              </label>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}

