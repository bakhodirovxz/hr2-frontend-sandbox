import { useEffect, useMemo, useState } from 'react'
import { Avatar } from '@/components/ui/Avatar'
import { FormError } from '@/components/ui/FormError'
import {
  WeeklyScheduleEditor,
  cycleWeekOf,
  mondayOf,
  type WeeklySchedule,
} from '@/features/employees/WeeklyScheduleEditor'
import { useTranslation } from 'react-i18next'
import axios from 'axios'
import { Briefcase, IdCard, KeyRound, Mail, Phone, Settings2, UserPlus, User as UserIcon, X } from 'lucide-react'
import {
  Button,
  Checkbox,
  Combobox,
  DateInput,
  Field,
  Input,
  Modal,
  Select,
  TimeInput,
  useToast,
} from '@/components/ui'
import { errorMessage } from '@/api/errorMessage'
import { useCredentialEmail, useCredentialEmailStatus } from './useEmployees'
import { apiPost } from '@/api/http'
import { EMPLOYEES_LIST, EMPLOYEE_SET_PASSWORD } from '@/api/endpoints'
import { cn } from '@/lib/cn'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { useDictionaryOptions } from '@/features/dictionaries/useDictionaries'
import { PhotoPicker } from './PhotoPicker'
import { useConfirm } from '@/components/data/useConfirm'
import { apiDelete } from '@/api/http'
import { EMPLOYEE_DETAIL } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { Employee, User } from '@/types'
import * as roles from '@/auth/roles'
import { useBranches } from '@/hooks/useBranches'
import { maskValue } from '@/lib/fieldMask'
import { useAuthStore } from '@/store/authStore'
import { canManageEmployees } from '@/auth/canManage'
import { useEmployeeMutations } from './useEmployees'
import { queryClient } from '@/api/queryClient'
import { ConcurrentPostModal } from './ConcurrentPostModal'
import { lookupByPinfl, type EmployeeLookupResult } from './useEmployeeAssignments'
import { tabPill } from '@/components/ui/control'

type Section = 'identity' | 'documents' | 'contact' | 'work' | 'flags'

const SECTIONS: { key: Section; icon: typeof UserIcon }[] = [
  { key: 'identity', icon: UserIcon },
  { key: 'documents', icon: IdCard },
  { key: 'contact', icon: Phone },
  { key: 'work', icon: Briefcase },
  { key: 'flags', icon: Settings2 },
]

const BLANK: Record<string, string> = {
  legal_name: '',
  birth_date: '',
  gender: '',
  nationality: '',
  maritial_status: '',
  multi_org_employee_role: '',
  primary_organization_branch_id: '',
  tabel_number: '',
  change_reason: '',
  pasport_series: '',
  pasport_number: '',
  pasport_individual_number: '',
  pasport_issue_by: '',
  personal_identification_number: '',
  taxpayer_identification_number: '',
  individual_accumulative_pension_account_number: '',
  address: '',
  email: '',
  phone_number: '',
  internal_phone_number: '',
  department_id: '',
  job_position_id: '',
  supervisor_id: '',
  job_acceptance_date: '',
  working_hours_start: '',
  working_hours_end: '',
  lunch_start_time: '',
  lunch_end_time: '',
  stavka: '',
}

/** Multi-org roles, matching the v1 drawer and `roles.MULTI_ORG_ROLE_KEYS`. */
const MULTI_ORG_ROLES = [
  'ministr',
  'deputy',
  'hr',
  'chancellery',
  'accounting',
  'dashboard',
  'monitoring',
  'kpp',
  'nazoratchi',
] as const

const BOOL_KEYS = [
  'ignore_lateness',
  'is_remote_worker',
  'is_gpx_worker',
  'hidden_from_regular',
  'simple_trip_enabled',
] as const

/**
 * ⚠️ HAR BIR BAYROQNI HAR KIM QO'YOLMAYDI — backend buni MAJBURIY tekshiradi
 * (`EmployeeService._guard_privileged_fields` va `_ADMIN_ONLY_EMPLOYEE_FIELDS`).
 *
 * NEGA MUHIM: yaratishda forma bu bayroqlarni SHARTSIZ yuborardi, ya'ni KADR
 * xodim qo'sha olmasdi — server butun so'rovni 403 bilan rad etardi
 * ("Only the master account can change 'hidden_from_regular'"), foydalanuvchi
 * esa faqat "ruxsat yo'q" degan tushunarsiz xabar ko'rardi. Endi ruxsati
 * yo'q bayroq NA ko'rsatiladi, NA yuboriladi.
 */
/** Mirror of the server's `_LINE_MANAGER_ALLOWED_FIELDS`. */
const LINE_MANAGER_FIELDS = new Set([
  'working_hours_start', 'working_hours_end', 'lunch_start_time', 'lunch_end_time',
  'working_days', 'weekly_schedule', 'stavka', 'phone_number', 'internal_phone_number', 'job_position_id',
])

export function allowedFlags(user: User | null | undefined): readonly (typeof BOOL_KEYS)[number][] {
  const master = roles.isSiteMasterAdmin(user)
  // `ignore_lateness` — `_ADMIN_ONLY_EMPLOYEE_FIELDS` ro'yxatida: admin
  // hisobi yoki ministr; kadr KIRMAYDI.
  // `UserType` da 'admin' YO'Q, lekin backendda bunday hisoblar bor
  // (`users.type = 'admin'`) — shuning uchun satr sifatida solishtiramiz.
  const adminLevel =
    String(user?.type) === 'admin' || roles.isSiteMasterAdmin(user) || roles.isMinister(user)
  return BOOL_KEYS.filter((k) => {
    if (k === 'hidden_from_regular') return master
    // The short trip form skips the chancellery and the report entirely, so who
    // may use it is a master-admin decision and nobody else's.
    if (k === 'simple_trip_enabled') return master
    if (k === 'ignore_lateness') return adminLevel
    return true
  })
}

/** Weekday indices the API uses: 0 = Monday … 6 = Sunday. */
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/**
 * XODIM KARTOCHKASI — create and full edit (TZ 4.2.7, «Ввод и хранение данных»).
 *
 * v2 shipped with a ten-field identity modal and NO way to add a person at all,
 * so every new hire had to be entered in the old product. This is the whole
 * card: who they are, their documents, how to reach them, where they sit on the
 * establishment, and the handful of switches that change how attendance treats
 * them.
 *
 * Two rules the old form learned the hard way and this one keeps:
 *   · only CHANGED fields are sent on edit, so an untouched value is never
 *     rewritten (and a masked PII field is never written back as its mask);
 *   · the classified lists (millat, oilaviy holat) come from Ma'lumotnomalar,
 *     not from a hardcoded array.
 */
export function EmployeeFormDrawer({
  open,
  onClose,
  employee,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** null = create. */
  employee: Employee | null
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const isEdit = !!employee?.id
  // Goes through the shared mutation so the roster row is patched in place —
  // a direct apiPatch here would save correctly and leave a stale row on screen.
  const { update, invalidate } = useEmployeeMutations()

  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()
  const { options: supervisors, loading: supLoading } = useEmployeeOptions(branchId, open)
  const { options: nationalities } = useDictionaryOptions(open ? 'nationalities' : null)

  const [section, setSection] = useState<Section>('identity')
  const [form, setForm] = useState<Record<string, string>>(BLANK)
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const currentUser = useAuthStore((st) => st.user)
  const visibleFlags = useMemo(() => allowedFlags(currentUser), [currentUser])
  /* A LINE MANAGER (department head / supervisor, not HR) reaches this drawer
     through the row's `can_edit`; the server then accepts work details only
     (`_LINE_MANAGER_ALLOWED_FIELDS`: hours, lunch, days, schedule, stavka,
     phones, position) and answers 403 to anything else. Lock the rest here
     so the 403 is never reachable from the form. */
  const restricted = isEdit && !canManageEmployees(currentUser)
  const lock = (k: string) => restricted && !LINE_MANAGER_FIELDS.has(k)
  useEffect(() => {
    if (open && restricted) setSection('work')
  }, [open, restricted])
  // Admin darajasi — backenddagi `_ADMIN_ONLY_EMPLOYEE_FIELDS` ko'zgusi.
  const canSetMultiOrg =
    String(currentUser?.type) === 'admin' ||
    roles.isSiteMasterAdmin(currentUser) ||
    roles.isMinister(currentUser)
  const [multiOrg, setMultiOrg] = useState(false)
  const [branchIds, setBranchIds] = useState<number[]>([])
  const { branches } = useBranches()
  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })),
    [branches],
  )
  const [kpiAdmin, setKpiAdmin] = useState(false)
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoCleared, setPhotoCleared] = useState(false)
  /**
   * TAKROR JSHSHIR — XATO EMAS, TANISH.
   *
   * Xodim asosiy filialiga qo'shilgan, ikkinchi filial uni ichki o'rindosh
   * sifatida qabul qilmoqchi — kadr shu formada "JSHSHIR allaqachon mavjud"
   * xatosiga urilardi va oqim tugardi. JSHSHIR tizimda shaxs kaliti (turniket
   * hodisasi, HikCentral personCode, OneID login) bo'lgani uchun ikkinchi
   * kartochka OCHILMAYDI — buning o'rniga forma odamni tanib, unga IKKINCHI
   * ISH O'RNI ochishni taklif qiladi.
   */
  const [lookup, setLookup] = useState<EmployeeLookupResult | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setError(null)
    setSection('identity')
    setPhoto(null)
    setPhotoCleared(false)
    setLookup(null)
    setAttachOpen(false)
    if (!employee) {
      setForm(BLANK)
      setFlags({})
      setBranchIds([])
      setDays([0, 1, 2, 3, 4])
      setWeekly({})
      return
    }
    const e = employee as unknown as Record<string, unknown>
    const next: Record<string, string> = {}
    for (const k of Object.keys(BLANK)) {
      const v = e[k]
      next[k] = v == null ? '' : String(v)
    }
    // Times arrive as HH:MM:SS; the control speaks HH:MM.
    for (const k of ['working_hours_start', 'working_hours_end', 'lunch_start_time', 'lunch_end_time']) {
      if (next[k]) next[k] = next[k].slice(0, 5)
    }
    setForm(next)
    setFlags(Object.fromEntries(BOOL_KEYS.map((k) => [k, !!e[k]])))
    setMultiOrg(!!e.is_multi_org_user)
    setBranchIds(
      Array.isArray(e.organization_branches)
        ? (e.organization_branches as { id: number }[]).map((b) => b.id)
        : [],
    )
    setKpiAdmin(!!e.is_kpi_admin)
    setDays(Array.isArray(e.working_days) ? (e.working_days as number[]) : [0, 1, 2, 3, 4])
    setWeekly(
      e.weekly_schedule && typeof e.weekly_schedule === 'object'
        ? (e.weekly_schedule as WeeklySchedule)
        : {},
    )
    const alt =
      e.weekly_schedule_alt && typeof e.weekly_schedule_alt === 'object'
        ? (e.weekly_schedule_alt as WeeklySchedule)
        : {}
    const anchor = typeof e.schedule_cycle_anchor === 'string' ? e.schedule_cycle_anchor : ''
    setWeeklyAlt(alt)
    setCycleAnchor(anchor || mondayOf(new Date()))
    setCycle(Object.keys(alt).length > 0 && !!anchor)
  }, [open, employee])

  const [weekly, setWeekly] = useState<WeeklySchedule>({})
  /* TWO-WEEK CYCLE (2026-09-30): some half-rate staff work 3 days one week
     and 2 the next. `weekly` is week 1, `weeklyAlt` week 2, and the anchor is
     a date inside a week 1 (the server snaps it to that Monday). */
  const [cycle, setCycle] = useState(false)
  const [weeklyAlt, setWeeklyAlt] = useState<WeeklySchedule>({})
  const [cycleAnchor, setCycleAnchor] = useState<string>(() => mondayOf(new Date()))
  // A rate below 1.0 is what makes the per-weekday map meaningful — the server
  // stores it only then and clears it at full rate.
  const isPartTime =
    form.stavka.trim() !== '' && Number(form.stavka) > 0 && Number(form.stavka) < 1

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }))

  /**
   * Passport as ONE field, stored as TWO columns.
   *
   * The document reads "AA1234567"; splitting it across two inputs made the
   * card slower to fill and left half-filled records behind. Two leading
   * letters are the series, the rest is the number — everything else in the
   * system keeps reading the two columns it always did.
   */
  const passportText = `${form.pasport_series ?? ''}${form.pasport_number ?? ''}`
  const setPassport = (raw: string) => {
    const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
    // ⚠️ `(\d*)` was unbounded — the number accepted any length. A passport
    // number is exactly seven digits, so it is capped here rather than left to
    // a `maxLength` on a field that also holds the two series letters.
    const m = /^([A-Z]{0,2})(\d{0,7})/.exec(clean)
    setForm((f) => ({
      ...f,
      pasport_series: m ? m[1] : clean.slice(0, 2),
      pasport_number: m ? m[2] : clean.slice(2, 9),
    }))
  }

  const nationalityOptions = useMemo(
    () => nationalities.map((n) => ({ value: n.name, label: n.name })),
    [nationalities],
  )
  // Family status has no dictionary on this API; v1 carries the same four.
  const maritalOptions = useMemo(
    () =>
      (['married', 'single', 'divorced', 'unmarried'] as const).map((k) => ({
        value: t(`employees.marital_${k}` as never),
        label: t(`employees.marital_${k}` as never),
      })),
    [t],
  )

  /**
   * JSHSHIR bo'yicha «bu odam tizimda bormi». Tahrirda chaqirilmaydi (o'z
   * JSHSHIRi doim topiladi) va faqat to'liq 14 raqamda ishlaydi — har bosilgan
   * raqamda so'rov yuborish serverni bekorga charchatardi.
   */
  const runLookup = async (raw: string) => {
    const pinfl = raw.replace(/\D/g, '')
    if (isEdit || pinfl.length !== 14) {
      setLookup(null)
      return
    }
    setLookupBusy(true)
    try {
      const res = await lookupByPinfl(pinfl)
      setLookup(res.found ? res : null)
    } catch {
      // Qidiruv qo'shimcha qulaylik — u yiqilsa forma odatdagidek ishlayveradi
      // (server takror JSHSHIRni baribir rad etadi).
      setLookup(null)
    } finally {
      setLookupBusy(false)
    }
  }

  const submit = async () => {
    setError(null)
    if (!form.legal_name.trim()) {
      setSection('identity')
      return setError(t('employees.nameRequired'))
    }
    if (!isEdit && !form.personal_identification_number.trim()) {
      setSection('documents')
      return setError(t('employees.pinflRequired'))
    }
    if (!isEdit && !form.email.trim()) {
      setSection('contact')
      return setError(t('employees.emailRequired'))
    }
    if (!isEdit && (!form.department_id || !form.job_position_id)) {
      setSection('work')
      return setError(t('employees.departmentRequired'))
    }
    // v1 required this on create and v2 dropped it; the API asks for it again.
    if (!isEdit && !form.job_acceptance_date) {
      setSection('work')
      return setError(t('employees.hireDateRequired'))
    }
    if (multiOrg && !form.multi_org_employee_role) {
      setSection('work')
      return setError(t('employees.multiOrgRoleRequired'))
    }

    /*
     * FORMAT RULES — the same ones the API now enforces.
     *
     * ⚠️ v1 CHECKED THESE AND v2 DID NOT. The masks below cap the length while
     * typing but never complain about a value left half-finished, so a 13-digit
     * PINFL or a six-digit passport number saved silently — a live sample of
     * 200 employees found exactly that. The server rejects them now; repeating
     * the rule here is only so the person sees WHICH field is wrong before the
     * round trip, not as the security boundary.
     *
     * Only a filled value is judged, matching the server: these columns are
     * optional and most of the directory leaves them empty.
     */
    const pinfl = form.personal_identification_number.trim()
    if (pinfl && !/^\d{14}$/.test(pinfl)) {
      setSection('documents')
      return setError(t('employees.pinflLength'))
    }
    const mail = form.email.trim()
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setSection('contact')
      return setError(t('employees.emailInvalid'))
    }
    if (form.pasport_series.trim() && !/^[A-Za-z]{2}$/.test(form.pasport_series.trim())) {
      setSection('documents')
      return setError(t('employees.passportSeriesLength'))
    }
    if (form.pasport_number.trim() && !/^\d{7}$/.test(form.pasport_number.trim())) {
      setSection('documents')
      return setError(t('employees.passportNumberLength'))
    }
    const inn = (form.taxpayer_identification_number ?? '').trim()
    if (inn && !/^\d{9}$/.test(inn)) {
      setSection('documents')
      return setError(t('employees.innLength'))
    }

    const text = (v: string) => (v.trim() ? v.trim() : null)
    const num = (v: string) => (v.trim() === '' ? null : Number(v))
    const time = (v: string) => (v.trim() ? `${v}:00`.slice(0, 8) : null)

    const body: Record<string, unknown> = {
      legal_name: text(form.legal_name),
      birth_date: text(form.birth_date),
      gender: num(form.gender),
      nationality: text(form.nationality),
      maritial_status: text(form.maritial_status),
      pasport_series: text(form.pasport_series),
      pasport_number: text(form.pasport_number),
      pasport_issue_by: text(form.pasport_issue_by),
      pasport_individual_number: text(form.pasport_individual_number),
      individual_accumulative_pension_account_number: text(
        form.individual_accumulative_pension_account_number,
      ),
      personal_identification_number: text(form.personal_identification_number),
      taxpayer_identification_number: text(form.taxpayer_identification_number),
      address: text(form.address),
      email: text(form.email),
      phone_number: text(form.phone_number),
      internal_phone_number: text(form.internal_phone_number),
      department_id: num(form.department_id),
      job_position_id: num(form.job_position_id),
      supervisor_id: num(form.supervisor_id),
      job_acceptance_date: text(form.job_acceptance_date),
      tabel_number: text(form.tabel_number),
      ...(isEdit ? { change_reason: text(form.change_reason) } : {}),
      working_hours_start: time(form.working_hours_start),
      working_hours_end: time(form.working_hours_end),
      lunch_start_time: time(form.lunch_start_time),
      lunch_end_time: time(form.lunch_end_time),
      stavka: num(form.stavka),
      // The server reads this map to decide a part-timer's daily window and
      // working days; sending `stavka` without it left attendance measured
      // against a full day. Null at full rate mirrors `EmployeeService`.
      weekly_schedule: isPartTime ? weekly : null,
      weekly_schedule_alt: isPartTime && cycle ? weeklyAlt : null,
      schedule_cycle_anchor: isPartTime && cycle ? cycleAnchor || null : null,
      working_days: days,
      ...Object.fromEntries(visibleFlags.map((k) => [k, !!flags[k]])),
      // Rol biriktirmasi FAQAT admin darajasida yuboriladi — kadr uchun bu
      // maydonlar serverda 403 beradi (`_ADMIN_ONLY_EMPLOYEE_FIELDS`).
      ...(canSetMultiOrg
        ? {
            is_multi_org_user: multiOrg,
            multi_org_employee_role: multiOrg ? form.multi_org_employee_role || null : null,
            is_kpi_admin: multiOrg ? kpiAdmin : false,
            organization_branch_ids: branchIds,
            primary_organization_branch_id: num(form.primary_organization_branch_id),
          }
        : {}),
    }

    if (photo) body.photo_base64 = photo

    let payload = body
    if (isEdit) {
      // Send only what actually changed — writing a masked PII value back is
      // how a passport number turns into "•••• 4821" in the database.
      const e = employee as unknown as Record<string, unknown>
      payload = {}
      for (const [k, v] of Object.entries(body)) {
        // A freshly picked portrait has nothing to compare against — it is
        // always a change when present.
        if (k === 'photo_base64') {
          if (v) payload[k] = v
          continue
        }
        const before = e[k]
        const same =
          Array.isArray(v) && Array.isArray(before)
            ? JSON.stringify(v) === JSON.stringify(before)
            : String(before ?? '') === String(v ?? '')
        if (!same) payload[k] = v
      }
      if (!Object.keys(payload).length) {
        onClose()
        return
      }
    } else {
      // ⚠️ `organization_branch_ids` (a LIST), not the singular
      // `organization_branch_id` that was sent here before. `EmployeeCreate`
      // declares only the list; Pydantic ignored the singular key, so a
      // non-admin creator (who never sees the multi-branch picker) produced an
      // employee with NO branch rows and only the department's branch to fall
      // back on (2026-09-11 audit). The list is not an admin-only field.
      payload = {
        ...body,
        ...(canSetMultiOrg || !branchId ? {} : { organization_branch_ids: [Number(branchId)] }),
      }
    }

    setSaving(true)
    try {
      if (isEdit) await update.mutateAsync({ id: employee!.id, body: payload })
      else {
        await apiPost(EMPLOYEES_LIST, payload)
        invalidate()
      }
      toast.ok(isEdit ? t('employees.saved') : t('employees.created'))
      onSaved()
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('employees.saveFailed')))
      // Takror JSHSHIR — kadr qidiruvni o'tkazib yuborgan bo'lsa ham (masalan
      // maydonni to'ldirib darhol "Saqlash" bosgan) tanish kartochkasi shu
      // yerda ochiladi, xato matni bilan birga.
      const code = axios.isAxiosError(e)
        ? ((e.response?.data as { detail?: { code?: string } } | undefined)?.detail?.code ?? null)
        : null
      if (code === 'personal_identification_number_exists') {
        setSection('documents')
        void runLookup(form.personal_identification_number)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      title={isEdit ? t('employees.editTitle') : t('employees.createTitle')}
      description={isEdit ? (employee?.legal_name ?? undefined) : t('employees.createHint')}
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
      <div className="mb-4 flex flex-wrap gap-1.5">
        {SECTIONS.filter((s) => !restricted || s.key === 'contact' || s.key === 'work').map((s) => {
          const Icon = s.icon
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              aria-pressed={section === s.key}
              className={tabPill(section === s.key)}
            >
              <Icon size={13} /> {t(`employees.sec_${s.key}` as never)}
            </button>
          )
        })}
      </div>

      {section === 'identity' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PhotoPicker
              value={photo}
              onChange={setPhoto}
              currentUrl={photoCleared ? null : employee?.photo_thumb_path}
              currentFallbackUrl={photoCleared ? null : employee?.photo_path}
              name={form.legal_name || employee?.legal_name}
              onError={(m) => setError(m || null)}
              onRemove={
                isEdit
                  ? async () => {
                      // Removes the stored photo right away, not on Save.
                      if (!(await confirm({ kind: 'delete', subject: employee?.legal_name, confirmLabel: t('employees.photoRemove') }))) return
                      try {
                        await apiDelete(`${EMPLOYEE_DETAIL(employee!.id)}/photo`)
                        setPhotoCleared(true)
                        setPhoto(null)
                        toast.ok(t('employees.photoRemoved'))
                        // Removed immediately, so refresh now: a Save with
                        // no other change only closes the drawer, and the
                        // card, roster and (own card) header kept the old
                        // photo until a reload.
                        invalidate()
                        void queryClient.invalidateQueries({ queryKey: ['employee', employee!.id] })
                        if (useAuthStore.getState().user?.employee?.id === employee!.id) {
                          void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
                        }
                        onSaved()
                      } catch (e) {
                        setError(errorMessage(e, t('employees.saveFailed')))
                      }
                    }
                  : undefined
              }
            />
          </div>
          <Field label={t('employees.fieldName')} required wide>
            <Input value={form.legal_name} onChange={(e) => set('legal_name', e.target.value)} autoFocus />
          </Field>
          <Field label={t('employees.fieldBirthDate')}>
            <DateInput value={form.birth_date} onChange={(v) => set('birth_date', v)} />
          </Field>
          <Field label={t('employees.fieldGender')}>
            <Select
              value={form.gender}
              onChange={(e) => set('gender', e.target.value)}
              options={[
                { value: '1', label: t('employees.male') },
                { value: '2', label: t('employees.female') },
              ]}
              placeholder={t('t2.pick')}
            />
          </Field>
          <Field label={t('t2.nationality')}>
            <Combobox
              value={form.nationality}
              onChange={(v) => set('nationality', v)}
              options={nationalityOptions}
              placeholder={t('t2.pick')}
            />
          </Field>
          <Field label={t('employees.fieldMarital')}>
            <Combobox
              value={form.maritial_status}
              onChange={(v) => set('maritial_status', v)}
              options={maritalOptions}
              placeholder={t('t2.pick')}
            />
          </Field>
          <Field label={t('employees.fieldAddress')} wide>
            <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </div>
      )}

      {section === 'documents' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {/* ⚠️ SERIYA VA RAQAM BITTA MAYDON. Pasport hujjatda «AA1234567»
              ko'rinishida yozilgan — ikkiga bo'lish kadrni har safar kursorni
              ko'chirishga majbur qilardi va yarmi bo'sh qolgan kartalar
              paydo bo'lardi. Bazada ikki ustun qoladi (boshqa modullar
              o'qiydi), bo'lish shu yerda: ikki harf = seriya, qolgani raqam. */}
          <Field label={t('employees.fieldPassport')} hint={t('employees.passportHint')}>
            <Input
              value={passportText}
              onChange={(e) => setPassport(e.target.value)}
              maxLength={12}
              placeholder="AA1234567"
              className="uppercase"
            />
          </Field>
          <Field label={t('employees.fieldPassportIssuedBy')}>
            <Input
              value={form.pasport_issue_by}
              onChange={(e) => set('pasport_issue_by', e.target.value)}
            />
          </Field>
          {/*
            ⚠️ THESE TWO HAD NO INPUT AT ALL. Both sit in the form's initial
            state (and have since it was written), both are accepted by
            `EmployeeCreate`/`EmployeeUpdate` — but neither was ever rendered
            nor put in the submit body, so there was no way to record either
            one from this screen, in create or in edit.
          */}
          <Field label={t('employees.fieldPassportIndividualNumber')}>
            <Input
              value={form.pasport_individual_number}
              onChange={(e) => set('pasport_individual_number', e.target.value)}
            />
          </Field>
          <Field label={t('employees.fieldPensionAccount')}>
            <Input
              value={form.individual_accumulative_pension_account_number}
              onChange={(e) =>
                set('individual_accumulative_pension_account_number', e.target.value)
              }
            />
          </Field>
          <Field
            label={t('employees.fieldPinfl')}
            required={!isEdit}
            hint={isEdit ? t('employees.pinflHint') : t('assignments.pinflLookupHint')}
          >
            <Input
              value={form.personal_identification_number}
              onChange={(e) => {
                const next = maskValue('pinfl', e.target.value)
                set('personal_identification_number', next)
                if (lookup) setLookup(null)
                // 14 raqam to'lishi bilan qidiramiz: kadr maydonni tark
                // etishini kutish shart emas, javob u yozib bo'lgan zahoti keladi.
                if (next.replace(/\D/g, '').length === 14) void runLookup(next)
              }}
              onBlur={(e) => void runLookup(e.target.value)}
              maxLength={14}
              inputMode="numeric"
            />
          </Field>

          {/* TAKROR JSHSHIR = MAVJUD XODIM. Xato o'rniga kim ekani va nima
              qilish mumkinligi ko'rsatiladi. */}
          {!isEdit && (lookupBusy || lookup) && (
            <div className="sm:col-span-2">
              {lookupBusy && !lookup ? (
                <p className="text-[13px] text-fg-muted">{t('assignments.lookupBusy')}</p>
              ) : lookup ? (
                <div className="rounded-lg border border-warning/30 bg-warning-soft p-3">
                  <p className="text-[13px] font-semibold text-fg">
                    {t('assignments.foundTitle')}
                  </p>
                  <p className="mt-0.5 flex items-center gap-2 text-[13px] text-fg-muted">
                    <Avatar src={lookup.photo_thumb_path} name={lookup.legal_name ?? '?'} size={24} />
                    {lookup.legal_name} — {lookup.primary_branch_name || '—'}
                    {lookup.primary_job_position_name ? ` · ${lookup.primary_job_position_name}` : ''}
                  </p>
                  <p className="mt-1.5 text-[12px] text-fg-muted">
                    {lookup.reason === 'already_attached'
                      ? t('assignments.reasonAlreadyAttached')
                      : lookup.reason === 'forbidden'
                        ? t('assignments.reasonForbidden')
                        : lookup.reason === 'archived'
                          ? t('assignments.reasonArchived')
                          : t('assignments.foundHint')}
                  </p>
                  {lookup.can_attach && (
                    <Button
                      className="mt-2.5"
                      size="sm"
                      leftIcon={<UserPlus size={14} />}
                      onClick={() => setAttachOpen(true)}
                    >
                      {t('assignments.attachAction')}
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <Field label={t('employees.fieldInn')}>
            <Input
              value={form.taxpayer_identification_number}
              onChange={(e) => set('taxpayer_identification_number', maskValue('inn', e.target.value))}
              maxLength={9}
              inputMode="numeric"
            />
          </Field>
        </div>
      )}

      {section === 'contact' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('employees.fieldEmail')} required={!isEdit}>
            <Input
              disabled={lock('email')}
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              spellCheck={false}
            />
          </Field>
          <Field label={t('employees.fieldPhone')}>
            <Input
              value={form.phone_number}
              onChange={(e) => set('phone_number', maskValue('phone', e.target.value))}
              inputMode="tel"
              placeholder="998__ ___ __ __"
            />
          </Field>
          <Field label={t('employees.fieldInternalPhone')}>
            <Input
              value={form.internal_phone_number}
              onChange={(e) => set('internal_phone_number', maskValue('internalPhone', e.target.value))}
              maxLength={6}
            />
          </Field>
        </div>
      )}

      {section === 'work' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('employees.colDepartment')} required={!isEdit}>
            <Combobox
              disabled={lock('department_id')}
              value={form.department_id}
              onChange={(v) => set('department_id', v)}
              options={departments}
              placeholder={t('employees.allDepartments')}
            />
          </Field>
          <Field label={t('employees.colPosition')} required={!isEdit}>
            <Combobox
              value={form.job_position_id}
              onChange={(v) => set('job_position_id', v)}
              options={positions}
              placeholder={t('employees.allPositions')}
            />
          </Field>
          <Field label={t('employeeProfile.supervisor')} wide>
            <Combobox
              disabled={lock('supervisor_id')}
              value={form.supervisor_id}
              onChange={(v) => set('supervisor_id', v)}
              options={supervisors}
              loading={supLoading}
              placeholder={t('t2.pick')}
            />
          </Field>
          <Field label={t('employees.colHired')}>
            <DateInput
              disabled={lock('job_acceptance_date')}
              value={form.job_acceptance_date}
              onChange={(v) => set('job_acceptance_date', v)}
            />
          </Field>
          <Field label={t('employees.fieldTabelNumber')} hint={t('employees.tabelNumberHint')}>
            <Input value={form.tabel_number} onChange={(e) => set('tabel_number', e.target.value)} disabled={lock('tabel_number')} />
          </Field>
          {/* Why the card is being changed — an order number and date, kept with
              the record so a later audit can see what a change was based on.
              Only on edit: there is nothing to justify when creating. */}
          {isEdit && (
            <Field label={t('employees.fieldChangeReason')} hint={t('employees.changeReasonHint')} wide>
              <Input value={form.change_reason} onChange={(e) => set('change_reason', e.target.value)} disabled={lock('change_reason')} />
            </Field>
          )}
          <Field label={t('employees.fieldStavka')}>
            <Input
              type="number"
              step="0.25"
              min="0"
              value={form.stavka}
              onChange={(e) => set('stavka', e.target.value)}
            />
          </Field>
          {isPartTime && (
            <Field label={t('employees.weeklyScheduleLabel')} hint={t('employees.weeklyScheduleHint')} wide>
              <div className="flex flex-col gap-3">
                <Checkbox
                  label={t('employees.cycleToggle')}
                  checked={cycle}
                  onChange={(e) => setCycle(e.target.checked)}
                />
                {cycle && (
                  <div className="flex flex-wrap items-end gap-3 rounded-md border border-line bg-surface-2/50 p-3">
                    <div className="w-[180px]">
                      <span className="mb-1 block text-[12px] font-semibold text-fg-muted">
                        {t('employees.cycleAnchor')}
                      </span>
                      <DateInput value={cycleAnchor} onChange={(v) => setCycleAnchor(v)} />
                    </div>
                    <p className="min-w-[220px] flex-1 text-[12px] leading-snug text-fg-muted">
                      {t('employees.cycleAnchorHint')}
                      {cycleAnchor && (
                        <>
                          {' '}
                          <b className="text-fg">
                            {t('employees.cycleThisWeek', { week: cycleWeekOf(cycleAnchor) })}
                          </b>
                        </>
                      )}
                    </p>
                  </div>
                )}
                <WeeklyScheduleEditor
                  value={weekly}
                  onChange={setWeekly}
                  stavka={Number(form.stavka)}
                  title={cycle ? t('employees.cycleWeek1') : undefined}
                />
                {cycle && (
                  <WeeklyScheduleEditor
                    value={weeklyAlt}
                    onChange={setWeeklyAlt}
                    stavka={Number(form.stavka)}
                    title={t('employees.cycleWeek2')}
                  />
                )}
              </div>
            </Field>
          )}
          <Field label={t('employees.fieldWorkStart')}>
            <TimeInput
              value={form.working_hours_start}
              onChange={(v) => set('working_hours_start', v)}
            />
          </Field>
          <Field label={t('employees.fieldWorkEnd')}>
            <TimeInput value={form.working_hours_end} onChange={(v) => set('working_hours_end', v)} />
          </Field>
          <Field label={t('employees.fieldLunchStart')}>
            <TimeInput value={form.lunch_start_time} onChange={(v) => set('lunch_start_time', v)} />
          </Field>
          <Field label={t('employees.fieldLunchEnd')}>
            <TimeInput value={form.lunch_end_time} onChange={(v) => set('lunch_end_time', v)} />
          </Field>
          <Field label={t('employees.fieldWorkingDays')} wide hint={t('employees.workingDaysHint')}>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const on = days.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDays((prev) =>
                        prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
                      )
                    }
                    aria-pressed={on}
                    className={cn(
                      'rounded-pill px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors',
                      on
                        ? 'bg-brand text-fg-on-brand'
                        : 'bg-fg/[0.06] text-fg-muted hover:bg-fg/[0.12]',
                    )}
                  >
                    {(t('date.weekdays', { returnObjects: true }) as string[])[(d + 1) % 7]}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
      )}

      {section === 'flags' && (
        <div className="flex flex-col gap-3">
          {/*
            MULTI-ORG ROLE — the assignment that decides which menu, which
            screens and which powers this person gets.
            ⚠️ IT WAS MISSING FROM v2 ENTIRELY: the card could be edited but
            the role could not be granted, so every new deputy, chancellery
            clerk or KPP controller had to be created in the old product.
            Admin-level only, matching the backend
            (`_ADMIN_ONLY_EMPLOYEE_FIELDS`: is_multi_org_user,
            multi_org_employee_role, is_kpi_admin) — HR sees nothing here.
          */}
          {canSetMultiOrg && (
            <div className="rounded-inner border border-line p-3.5">
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={multiOrg}
                  onChange={(e) => {
                    setMultiOrg(e.target.checked)
                    if (!e.target.checked) set('multi_org_employee_role', '')
                  }}
                  srLabel={t('employees.multiOrgTitle')}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-fg">
                    {t('employees.multiOrgTitle')}
                  </span>
                  <span className="block text-xs text-fg-muted">{t('employees.multiOrgHint')}</span>
                </span>
              </label>
              {/* Which branches this person belongs to, and which one owns them.
                  `primary_organization_branch_id` is in the server's
                  `_ADMIN_ONLY_EMPLOYEE_FIELDS`, so both live in the admin block. */}
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label={t('employees.fieldBranches')} hint={t('employees.branchesHint')}>
                  <div className="space-y-1.5">
                    <Combobox
                      value=""
                      onChange={(v) => {
                        const id = Number(v)
                        if (id) setBranchIds((p) => (p.includes(id) ? p : [...p, id]))
                      }}
                      options={branchOptions.filter((b) => !branchIds.includes(Number(b.value)))}
                      placeholder={t('t2.pick')}
                    />
                    {branchIds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {branchIds.map((id) => (
                          <span
                            key={id}
                            className="inline-flex max-w-[15rem] items-center gap-1 rounded-pill bg-brand px-2.5 py-1 text-[11.5px] font-medium text-fg-on-brand"
                          >
                            <span className="truncate">
                              {branchOptions.find((b) => Number(b.value) === id)?.label ?? `#${id}`}
                            </span>
                            <button
                              type="button"
                              aria-label={t('common.delete')}
                              onClick={() =>
                                setBranchIds((p) => {
                                  const next = p.filter((x) => x !== id)
                                  // The primary branch must stay inside the list.
                                  if (Number(form.primary_organization_branch_id) === id) {
                                    set('primary_organization_branch_id', '')
                                  }
                                  return next
                                })
                              }
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>
                <Field label={t('employees.fieldPrimaryBranch')} hint={t('employees.primaryBranchHint')}>
                  <Combobox
                    value={form.primary_organization_branch_id}
                    onChange={(v) => set('primary_organization_branch_id', v)}
                    options={branchOptions.filter((b) => branchIds.includes(Number(b.value)))}
                    placeholder={t('employees.primaryBranchNone')}
                  />
                </Field>
              </div>

              {multiOrg && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label={t('employees.multiOrgRole')} required>
                    <Select
                      value={form.multi_org_employee_role}
                      onChange={(e) => set('multi_org_employee_role', e.target.value)}
                      options={MULTI_ORG_ROLES.map((r) => ({
                        value: r,
                        label: t(`roles.${r}` as never),
                      }))}
                      placeholder={t('t2.pick')}
                    />
                  </Field>
                  <label className="flex cursor-pointer items-center gap-3 self-end pb-2">
                    <Checkbox
                      checked={kpiAdmin}
                      onChange={(e) => setKpiAdmin(e.target.checked)}
                      srLabel={t('employees.kpiAdmin')}
                    />
                    <span className="text-[13px] text-fg">{t('employees.kpiAdmin')}</span>
                  </label>
                </div>
              )}
            </div>
          )}
          {visibleFlags.map((k) => (
            <label
              key={k}
              className="flex cursor-pointer items-start gap-3 rounded-inner border border-line px-3.5 py-3"
            >
              <Checkbox
                checked={!!flags[k]}
                onChange={(e) => setFlags((f) => ({ ...f, [k]: e.target.checked }))}
                srLabel={t(`employees.flag_${k}` as never)}
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-fg">
                  {t(`employees.flag_${k}` as never)}
                </span>
                <span className="block text-xs text-fg-muted">
                  {t(`employees.flagHint_${k}` as never)}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      <FormError className="mt-4">{error}</FormError>

      {/* Mavjud xodimga ikkinchi ish o'rni — yangi kartochka OCHILMAYDI. */}
      <ConcurrentPostModal
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        lookup={lookup}
        onDone={(msg) => {
          toast.ok(msg)
          invalidate()
          onSaved()
          onClose()
        }}
      />
    </Modal>
  )
}

/** Small helper the page uses for the "give this person a password" action. */
export function SetPasswordModal({
  employee,
  onClose,
}: {
  employee: Employee | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const credentials = useCredentialEmail()
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /**
   * The queued mail job.
   *
   * ⚠️ THE POST'S 200 MEANS "ACCEPTED", NOT "DELIVERED". SMTP here has been
   * measured hanging outright about a third of the time, and the modal used to
   * announce "yuborildi" and close the moment the queue took the job — so a
   * mail that never went out looked exactly like one that did, and personnel
   * had no reason to fall back to setting the password by hand. The status
   * endpoint that answers this properly already existed, with no caller.
   */
  const [taskId, setTaskId] = useState<string | null>(null)
  const [waitedTooLong, setWaitedTooLong] = useState(false)
  const mail = useCredentialEmailStatus(employee?.id ?? null, taskId)

  useEffect(() => {
    setValue('')
    setError(null)
    setTaskId(null)
    setWaitedTooLong(false)
  }, [employee])

  /* The server's own note says PENDING also comes back for an unknown task id,
     so the client must not wait forever — after this the honest answer is
     "we cannot tell, set it by hand". */
  useEffect(() => {
    if (!taskId || mail.status !== 'pending') return
    const timer = setTimeout(() => setWaitedTooLong(true), 90_000)
    return () => clearTimeout(timer)
  }, [taskId, mail.status])

  if (!employee) return null

  const submit = async () => {
    if (value.trim().length < 6) return setError(t('employees.passwordTooShort'))
    setSaving(true)
    try {
      await apiPost(EMPLOYEE_SET_PASSWORD(employee.id), { password: value })
      toast.ok(t('employees.passwordSet'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('employees.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t('employees.setPassword')}
      description={employee.legal_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          {/* The other way to hand over credentials: the server generates the
              password itself and mails it, so nobody has to read one out. */}
          <Button
            variant="secondary"
            leftIcon={<Mail size={15} />}
            loading={credentials.send.isPending}
            onClick={async () => {
              // Generates a NEW password and mails it — the old one stops working.
              if (!(await confirm({ kind: 'action', subject: employee.legal_name, confirmLabel: t('employees.sendCredentials') }))) return
              try {
                setWaitedTooLong(false)
                const res = await credentials.send.mutateAsync(employee.id)
                if (!res?.task_id) {
                  // The broker was down: the server says so outright rather
                  // than pretending the mail is on its way.
                  toast.error(t('employees.credentialsNotQueued'))
                  return
                }
                setTaskId(res.task_id)
              } catch (e) {
                toast.error(errorMessage(e, t('common.actionFailed')))
              }
            }}
          >
            {t('employees.sendCredentials')}
          </Button>
          <Button onClick={submit} loading={saving} leftIcon={<KeyRound size={15} />}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <Field label={t('employees.newPassword')} hint={t('employees.passwordHint')}>
        <Input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
      </Field>

      {taskId && (
        <p
          className={cn(
            'mt-3 rounded-lg border px-3 py-2 text-[13px]',
            mail.status === 'sent'
              ? 'border-success/25 bg-success-soft text-success'
              : mail.status === 'failed' || waitedTooLong
                ? 'border-danger/25 bg-danger-soft text-danger'
                : 'border-line bg-surface-2 text-fg-muted',
          )}
        >
          {mail.status === 'sent'
            ? t('employees.credentialsSent')
            : mail.status === 'failed'
              ? t('employees.credentialsFailed')
              : mail.status === 'superseded'
                ? t('employees.credentialsSuperseded')
                : waitedTooLong
                  ? t('employees.credentialsUnknown')
                  : t('employees.credentialsSending')}
        </p>
      )}
      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
