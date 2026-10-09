import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, IdCard, Mail, MapPin, User as UserIcon } from 'lucide-react'
import dayjs from 'dayjs'
import { apiPatch } from '@/api/http'
import { EMPLOYEE_SELF_UPDATE } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { useAuthStore } from '@/store/authStore'
import { useCurrentUser } from '@/hooks/useAuth'
import { EMPLOYEE_QUERY_KEYS } from '@/features/employees/useEmployees'
import { PhotoPicker } from '@/features/employees/PhotoPicker'
import { T2Card } from '@/features/employees/t2/T2Card'
import { MyMedicalTab } from '@/features/employees/profile/MyMedicalTab'
import {
  ProfileCareerTab,
  ProfileKpiTab,
  ProfileLeavesTab,
} from '@/features/employees/profile/ProfileTabs'
import { tabPill } from '@/components/ui/control'
import { FIELD_MASKS, maskValue } from '@/lib/fieldMask'

type Tab = 'shaxsiy' | 'kpi' | 'karyera' | 't2' | 'ruxsatlar' | 'tibbiy'
const TABS: Tab[] = ['shaxsiy', 'kpi', 'karyera', 't2', 'ruxsatlar', 'tibbiy']

/** What an employee may correct about themselves (server: `me/self-update`). */
/** Identity fields keep their document shape — see `lib/fieldMask`. */
function maskField(key: string, raw: string): string {
  const kind = FIELD_MASKS[key]
  return kind ? maskValue(kind, raw) : raw
}

const FIELDS = [
  { section: 'sectionPersonal', key: 'legal_name', label: 'fieldName', wide: true },
  { section: 'sectionPersonal', key: 'birth_date', label: 'fieldBirthDate', type: 'date' },
  { section: 'sectionPersonal', key: 'gender', label: 'fieldGender', type: 'gender' },
  { section: 'sectionPersonal', key: 'address', label: 'fieldAddress', wide: true },
  { section: 'sectionContact', key: 'phone_number', label: 'fieldPhone', inputMode: 'tel' as const },
  { section: 'sectionContact', key: 'internal_phone_number', label: 'fieldInternalPhone', maxLength: 6 },
  { section: 'sectionIdentity', key: 'pasport_series', label: 'fieldPassportSeries', maxLength: 2 },
  { section: 'sectionIdentity', key: 'pasport_number', label: 'fieldPassportNumber', maxLength: 7 },
  { section: 'sectionIdentity', key: 'pasport_individual_number', label: 'fieldPassportIndividual', maxLength: 14 },
  { section: 'sectionIdentity', key: 'personal_identification_number', label: 'fieldPinfl', maxLength: 14, inputMode: 'numeric' as const },
  { section: 'sectionIdentity', key: 'taxpayer_identification_number', label: 'fieldTin', maxLength: 9, inputMode: 'numeric' as const },
  { section: 'sectionIdentity', key: 'individual_accumulative_pension_account_number', label: 'fieldPension', maxLength: 14 },
] as const

const SECTIONS = [
  { key: 'sectionPersonal', icon: <UserIcon size={16} /> },
  { key: 'sectionContact', icon: <Mail size={16} /> },
  { key: 'sectionIdentity', icon: <IdCard size={16} /> },
] as const

/**
 * MENING PROFILIM — the employee's own card, read the way HR reads anyone's.
 *
 * Same five faces as the personnel card (`/employees/:id`) so a person sees
 * exactly what the organisation holds about them: who they are, their KPI,
 * their career, their T-2, their requests. Nothing about CREDENTIALS lives
 * here any more — password and active sessions moved to Sozlamalar, because a
 * password field beside a passport number made the page do two unrelated jobs.
 */
export function MyProfilePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  useCurrentUser() // keep the freshest employee in the store
  const employee = useAuthStore((s) => s.user?.employee)

  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'shaxsiy'
  const setTab = (v: Tab) =>
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        if (v === 'shaxsiy') sp.delete('tab')
        else sp.set('tab', v)
        return sp
      },
      { replace: true },
    )

  const initial = useMemo(() => {
    const o: Record<string, string> = {}
    for (const f of FIELDS) {
      const v = (employee as unknown as Record<string, unknown>)?.[f.key]
      o[f.key] = v == null ? '' : String(v)
    }
    return o
  }, [employee])

  const [form, setForm] = useState<Record<string, string>>({})
  const [photo, setPhoto] = useState<string | null>(null)
  const val = (key: string) => (key in form ? form[key] : (initial[key] ?? ''))
  const setVal = (key: string, v: string) => setForm((p) => ({ ...p, [key]: v }))

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPatch<{ employee?: Record<string, unknown> }>(EMPLOYEE_SELF_UPDATE, body),
    onSuccess: (res) => {
      toast.ok(t('profile.saved'))
      // The form's `initial` values come from the auth store (`auth/me`,
      // cached 5 min). Clearing the edits without refreshing that store
      // snapped every field back to the OLD value until a page reload — the
      // saved change looked lost. Write the server's answer into the store
      // now, then refetch everything that shows this person.
      const saved = res?.employee
      const user = useAuthStore.getState().user
      if (saved && user?.employee) {
        const patch: Record<string, unknown> = {}
        for (const f of FIELDS) if (f.key in saved) patch[f.key] = saved[f.key]
        for (const k of ['photo_path', 'photo_thumb_path'] as const) if (k in saved) patch[k] = saved[k]
        useAuthStore.getState().setUser({ ...user, employee: { ...user.employee, ...patch } })
      }
      setPhoto(null)
      setForm({})
      void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      for (const key of EMPLOYEE_QUERY_KEYS) void queryClient.invalidateQueries({ queryKey: key })
      void queryClient.invalidateQueries({ queryKey: ['employee', employee?.id] })
    },
    onError: (e) => toast.error(errorMessage(e, t('profile.saveError'))),
  })

  const onSave = () => {
    const body: Record<string, unknown> = {}
    for (const f of FIELDS) {
      const cur = val(f.key)
      if (cur !== (initial[f.key] ?? '')) body[f.key] = cur || null
    }
    if (photo) body.photo_base64 = photo
    if (!Object.keys(body).length) return
    save.mutate(body)
  }

  if (!employee) {
    return (
      <PageContainer>
        <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />
        <Card className="p-6">
          <EmptyState title={t('profile.noEmployee')} />
        </Card>
      </PageContainer>
    )
  }

  const jobTitle =
    typeof employee.job_position === 'string' ? employee.job_position : employee.job_position?.name
  const branchName = employee.organization_branches?.[0]?.name

  return (
    <PageContainer>
      <PageHeader title={t('profile.title')} subtitle={t('profile.subtitle')} />

      {/* Who this is */}
      <Card className="mb-4 flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-center">
        <Avatar
          src={employee.photo_thumb_path}
          fallbackSrc={employee.photo_path}
          name={employee.legal_name}
          size={80}
        />
        <div className="min-w-0 text-center sm:text-left">
          <h2 className="truncate text-xl font-bold text-fg">
            {employee.legal_name || t('common.unknown')}
          </h2>
          <p className="mt-0.5 text-sm text-fg-muted">{jobTitle || '—'}</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-fg-subtle sm:justify-start">
            {employee.department?.name && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={13} />
                {employee.department.name}
              </span>
            )}
            {branchName && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13} />
                {branchName}
              </span>
            )}
            {employee.job_acceptance_date && (
              <span className="tabnum">
                {t('employeeProfile.hiredAt', {
                  date: dayjs(employee.job_acceptance_date).format('DD.MM.YYYY'),
                })}
              </span>
            )}
          </div>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={tabPill(tab === k)}
          >
            {t(`profile.tab_${k}` as never)}
          </button>
        ))}
      </div>

      {tab === 'shaxsiy' && (
        <>
          <Card className="mb-4 p-5">
            <PhotoPicker
              value={photo}
              onChange={setPhoto}
              currentUrl={employee.photo_thumb_path}
              currentFallbackUrl={employee.photo_path}
              name={employee.legal_name}
              onError={(m) => m && toast.error(m)}
            />
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {SECTIONS.map((sec) => (
              <Card key={sec.key} className="flex flex-col">
                <CardHeader title={t(`profile.${sec.key}`)} icon={sec.icon} />
                <CardBody className="grid grid-cols-1 gap-4">
                  {FIELDS.filter((f) => f.section === sec.key).map((f) => (
                    <Field key={f.key} label={t(`profile.${f.label}`)}>
                      {'type' in f && f.type === 'gender' ? (
                        <Select
                          value={val(f.key)}
                          onChange={(e) => setVal(f.key, maskField(f.key, e.target.value))}
                          options={[
                            { value: '1', label: t('employees.male') },
                            { value: '2', label: t('employees.female') },
                          ]}
                          placeholder={t('t2.pick')}
                          aria-label={t(`profile.${f.label}`)}
                        />
                      ) : 'type' in f && f.type === 'date' ? (
                        <DateInput
                          value={val(f.key)}
                          onChange={(v) => setVal(f.key, v)}
                          name={f.key}
                          aria-label={t(`profile.${f.label}`)}
                        />
                      ) : (
                        <Input
                          value={val(f.key)}
                          onChange={(e) => setVal(f.key, maskField(f.key, e.target.value))}
                          name={f.key}
                          type="text"
                          maxLength={'maxLength' in f ? f.maxLength : undefined}
                          inputMode={'inputMode' in f ? f.inputMode : undefined}
                          spellCheck={false}
                          aria-label={t(`profile.${f.label}`)}
                        />
                      )}
                    </Field>
                  ))}
                </CardBody>
              </Card>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button size="lg" onClick={onSave} loading={save.isPending}>
              {t('profile.save')}
            </Button>
          </div>
        </>
      )}

      {tab === 'kpi' && <ProfileKpiTab employeeId={employee.id} />}
      {tab === 'tibbiy' && <MyMedicalTab />}
      {tab === 'karyera' && <ProfileCareerTab employee={employee} />}
      {tab === 't2' && <T2Card employeeId={employee.id} />}
      {tab === 'ruxsatlar' && <ProfileLeavesTab employeeId={employee.id} />}
    </PageContainer>
  )
}
