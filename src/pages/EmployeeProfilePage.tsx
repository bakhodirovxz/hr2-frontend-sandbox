import { lazy, Suspense, useMemo, useState } from 'react'
import { ProfileMonthStrip } from '@/features/employees/profile/ProfileMonthStrip'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Archive, ArrowLeft, Briefcase, Building2, CalendarDays, IdCard, Pencil, Phone, Stamp } from 'lucide-react'
import dayjs from 'dayjs'
import { CustomFieldsSection } from '@/features/employees/CustomFieldsSection'
import { EmployeeAssignmentsCard } from '@/features/employees/EmployeeAssignmentsCard'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST, ORDER_ACTS } from '@/api/endpoints'
import { PageContainer } from '@/components/layout/Page'
import { Avatar, Button, Card, EmptyState } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { toItems, type ListResponse, type Employee } from '@/types'
import { T2Card } from '@/features/employees/t2/T2Card'
import { EmployeeFormDrawer } from '@/features/employees/EmployeeFormDrawer'
import { ArchiveEmployeeModal } from '@/features/employees/ArchiveEmployeeModal'
import {
  ProfileCareerTab,
  ProfileKpiTab,
  ProfileLeavesTab,
  ProfileTabelTab,
} from '@/features/employees/profile/ProfileTabs'

/** `employees.gender` is stored as 1 / 2 (T-2 card convention). */
function useGenderLabel() {
  const { t } = useTranslation()
  return (g?: number | string | null) => {
    const v = g == null ? '' : String(g)
    if (v === '1') return t('employees.male')
    if (v === '2') return t('employees.female')
    return g ?? null
  }
}
/**
 * ⚠️ LAZY: this is the only tab that draws charts, and a static import put the
 * whole 413 KB `recharts` chunk into the profile route — paid by everyone who
 * opened a personnel card, including the readers who never touch «Tahlil».
 */
const ProfileAnalyticsTab = lazy(() =>
  import('@/features/employees/profile/ProfileAnalyticsTab').then((m) => ({
    default: m.ProfileAnalyticsTab,
  })),
)
import { ProfileMedicalTab } from '@/features/employees/profile/ProfileMedicalTab'
import { ProfileHistoryPanel } from '@/features/employees/profile/ProfileHistoryPanel'
import type { OrderAct } from '@/features/orders/useOrders'
import { tabPill } from '@/components/ui/control'
import { canManageEmployees } from '@/auth/canManage'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'

type Tab = 'umumiy' | 'kpi' | 'tabel' | 'karyera' | 't2' | 'ruxsatlar' | 'buyruqlar' | 'tahlil' | 'tibbiy' | 'tarix'

/**
 * XODIM KARTOCHKASI — TZ 4.2.7 (учет кадров) + 4.2.9 §2 (вкладка «Приказы»).
 *
 * One person, three readings: who they are on the establishment (Umumiy), the
 * T-2 personal card the personnel office keeps, and the orders that moved them
 * through it. The tab lives in the URL so a colleague can be linked straight
 * to the T-2 rather than told where to click.
 */
export function EmployeeProfilePage() {
  // Karyera yozuvlarini kadr va bosh admin kiritadi — `auth/canManage.ts`
  // (backenddagi `_can_crud_employees` ning ko'zgusi).
  const currentUser = useAuthStore((st) => st.user)
  const canWriteCareer = canManageEmployees(currentUser)
  const { t } = useTranslation()
  const { id } = useParams()
  // Opened from «Mening jamoam» (a manager, read-only) — back goes there.
  const location = useLocation()
  const fromTeam = location.pathname.startsWith('/mening-jamoam')
  // Reached from another page of the app (not typed in / a new tab): «back»
  // returns THERE — the attendance list with its filters, the team, a letter —
  // instead of always landing on the employees list (user 2026-09-26). Tabs
  // replace the entry, so one step back is the page before the profile.
  const cameFromApp = location.key !== 'default'
  const listPath = fromTeam ? '/mening-jamoam' : '/employees'
  const navigate = useNavigate()
  const employeeId = Number(id)
  const [params, setParams] = useSearchParams()
  const rawTab = (params.get('tab') as Tab) || 'umumiy'
  const setTab = (v: Tab) =>
    setParams(
      (prev) => {
        const sp = new URLSearchParams(prev)
        if (v === 'umumiy') sp.delete('tab')
        else sp.set('tab', v)
        return sp
      },
      { replace: true },
    )

  const employeeQuery = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => apiGet<Employee>(`${EMPLOYEES_LIST}/${employeeId}`),
    enabled: Number.isFinite(employeeId) && employeeId > 0,
    retry: false,
  })
  const employee = employeeQuery.data ?? null

  // Passport is two columns but one fact; the rest map one-to-one. Only rows the
  // server actually sent survive the filter.
  const passport = [employee?.pasport_series, employee?.pasport_number]
    .filter(Boolean)
    .join(' ')
  const genderLabel = useGenderLabel()
  const personalRows = (
    [
      // ⚠️ `gender` is the stored CODE (1 / 2) — the card printed «JINSI 2».
      // The edit form and the dashboard have always labelled it.
      [t('employees.fieldGender'), genderLabel(employee?.gender)],
      [t('employees.fieldNationality'), employee?.nationality],
      [t('employees.fieldMarital'), employee?.maritial_status],
      [t('employees.fieldPassport'), passport],
      [t('employees.fieldPassportIndividualNumber'), employee?.pasport_individual_number],
      [t('employees.fieldPassportIssuedBy'), employee?.pasport_issue_by],
      [t('employees.fieldPinfl'), employee?.personal_identification_number],
      [t('employees.fieldInn'), employee?.taxpayer_identification_number],
      [t('employees.fieldPensionAccount'), employee?.individual_accumulative_pension_account_number],
      [t('employees.fieldAddress'), employee?.address],
    ] as [string, string | null | undefined][]
  )
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([label, value]) => ({ label, value: String(value) }))

  /**
   * EDIT AND ARCHIVE LIVE ON THE CARD, not only in the list.
   *
   * v1 put them in the header of the profile; v2 had neither, so the only way
   * to correct a person's record was to go back to the roster and find the row
   * again. An ARCHIVED card stays read-only — the server refuses writes on one
   * and its login is already gone, so offering the buttons would only produce
   * a 400.
   */
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const canManage = canManageEmployees(currentUser) && !employee?.is_archived
  // Two tabs are gated on the SERVER and used to be drawn for everyone, so a
  // deputy/ministr got a silent 403 behind «Tibbiy» (medical checkups,
  // annual indexes) and «Tarix» (`employees/{id}/history`, `_require_hr`:
  // hr / admin / master-admin). v1 shows the medical tab only with
  // `medical_enabled` from /auth/me and has no history tab at all.
  const canSeeHistory =
    roles.isHR(currentUser) || String(currentUser?.type) === 'admin' || currentUser?.type === 'master-admin'
  const visibleTabs = (['umumiy', 'kpi', 'tabel', 'tahlil', 'karyera', 't2', 'ruxsatlar', 'buyruqlar', 'tibbiy', 'tarix'] as Tab[]).filter(
    (k) => (k === 'tibbiy' ? !!currentUser?.medical_enabled : k === 'tarix' ? canSeeHistory : true),
  )
  // A deep link to a hidden tab falls back to the first one instead of a 403.
  const tab: Tab = visibleTabs.includes(rawTab) ? rawTab : 'umumiy'

  const ordersQuery = useQuery({
    queryKey: ['employee-orders', employeeId],
    queryFn: () =>
      // `/order-acts` paginates with `limit`, not `size` — the old `size: 100`
      // was silently dropped and the default page came back.
      apiGet<ListResponse<OrderAct>>(ORDER_ACTS, { employee_id: employeeId, limit: 100 }),
    enabled: tab === 'buyruqlar' && employeeId > 0,
    retry: false,
  })
  const orders = useMemo(() => toItems(ordersQuery.data), [ordersQuery.data])

  const jp = employee?.job_position
  const jobName = typeof jp === 'object' ? (jp?.name ?? '') : (jp ?? '')
  const deptName = employee?.department?.name ?? ''

  if (employeeQuery.isLoading) {
    return (
      <PageContainer>
        <CenteredSpinner />
      </PageContainer>
    )
  }

  if (employeeQuery.isError || !employee) {
    return (
      <PageContainer>
        <EmptyState
          icon={<IdCard size={20} />}
          title={t('employeeProfile.notFound')}
          description={t('employeeProfile.notFoundHint')}
          action={
            <Button variant="outline" size="sm" onClick={() => navigate(listPath)}>
              {t('employeeProfile.backToList')}
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer className="flex min-h-full flex-col">
      <Link
        to={listPath}
        onClick={(e) => {
          if (!cameFromApp || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
          e.preventDefault()
          navigate(-1)
        }}
        className="mb-3 inline-flex items-center gap-1.5 self-start text-[13px] text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={14} />{' '}
        {cameFromApp ? t('employeeProfile.back') : fromTeam ? t('myTeam.title') : t('employeeProfile.backToList')}
      </Link>

      {/* ── Kim ekani ──────────────────────────────────────────────────── */}
      <Card className="mb-4 flex flex-wrap items-center gap-4 p-5">
        <Avatar
          src={employee.photo_thumb_path}
          fallbackSrc={employee.photo_path}
          name={employee.legal_name}
          size={72}
        />
        <div className="min-w-0 flex-1">
          {/* The full name is the one thing this card exists for: on a phone
              it wraps instead of ending in «Abbosov Jaloliddi…». */}
          <h1 className="break-words text-[22px] font-bold tracking-[-0.02em] text-fg sm:truncate sm:text-[24px]">
            {employee.legal_name ?? t('common.unknown')}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-fg-muted">
            {jobName && (
              <span className="inline-flex items-center gap-1.5">
                <Briefcase size={13} /> {jobName}
              </span>
            )}
            {deptName && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={13} /> {deptName}
              </span>
            )}
            {employee.phone_number && (
              <span className="inline-flex items-center gap-1.5">
                <Phone size={13} /> {employee.phone_number}
              </span>
            )}
            {employee.job_acceptance_date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={13} />
                {t('employeeProfile.hiredAt', {
                  date: dayjs(employee.job_acceptance_date).format('DD.MM.YYYY'),
                })}
              </span>
            )}
          </div>
        </div>
        {/* Say WHY the actions are gone, or their absence reads as a bug. */}
        {employee.is_archived && (
          <span className="shrink-0 rounded-pill bg-fg/[0.08] px-2.5 py-1 text-[11px] font-semibold text-fg-muted">
            {t('employees.tabArchive')}
          </span>
        )}
        {canManage && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
            <Button variant="danger-ghost" size="sm" leftIcon={<Archive size={14} />} onClick={() => setArchiving(true)}>
              {t('employees.archiveAction')}
            </Button>
          </div>
        )}
      </Card>

      {notice && (
        <p className="mb-4 rounded-inner border border-success/30 bg-success-soft px-3 py-2 text-[12.5px] text-success">
          {notice}
        </p>
      )}

      <EmployeeFormDrawer
        open={editing}
        employee={editing ? employee : null}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          void employeeQuery.refetch()
          setNotice(t('employees.saved'))
        }}
      />

      <ArchiveEmployeeModal
        open={archiving}
        employeeId={archiving ? employeeId : null}
        employeeName={employee.legal_name}
        onClose={() => setArchiving(false)}
        onDone={() => {
          setArchiving(false)
          // The card is now read-only history; the roster is where the user
          // needs to be, and it must not still list the person.
          navigate('/employees')
        }}
      />

      {/* ── Tablar ─────────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {visibleTabs.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={tabPill(tab === k)}
          >
            {t(`employeeProfile.tab_${k}` as never)}
          </button>
        ))}
      </div>

      {tab === 'umumiy' && visibleTabs.includes('tabel') && (
        <ProfileMonthStrip employeeId={employeeId} onOpenTabel={() => setTab('tabel')} />
      )}

      {tab === 'umumiy' && (
        <Card className="p-5">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Row label={t('employees.colDepartment')} value={deptName} />
            <Row label={t('employees.colPosition')} value={jobName} />
            <Row label={t('employees.colPhone')} value={employee.phone_number ?? ''} />
            <Row
              label={t('employees.colHired')}
              value={
                employee.job_acceptance_date
                  ? dayjs(employee.job_acceptance_date).format('DD.MM.YYYY')
                  : ''
              }
            />
            <Row
              label={t('employeeProfile.workingHours')}
              value={
                employee.working_hours_start
                  ? `${employee.working_hours_start.slice(0, 5)} — ${(employee.working_hours_end ?? '').slice(0, 5)}`
                  : ''
              }
            />
            <Row
              label={t('employeeProfile.supervisor')}
              value={employee.supervisor?.legal_name ?? ''}
            />
          </dl>
          <p className="mt-5 text-xs text-fg-subtle">{t('employeeProfile.moreInT2')}</p>
        </Card>
      )}

      {/*
        SHAXSIY MA'LUMOTLAR — v1 da bor edi (`EmployeeProfileInfo.jsx`), v2 da bu
        maydonlar FAQAT tahrir formasida ko'rinardi, ya'ni ko'rish huquqi bor-u
        tahrir huquqi yo'q rol (ministr, o'rinbosar) ularni umuman ocholmasdi.

        ⚠️ DARVOZA MIJOZDA QAYTA YOZILMAYDI. Server `mask_detail_pii` bilan uch
        daraja beradi: kadr/bosh admin — to'liq, ministr/o'rinbosar/admin —
        oxirgi 4 belgi ("*****4567"), qolganlar — null; o'z kartasi hech qachon
        maskalanmaydi, arxiv kartasi esa hammaga yopiq. Shuning uchun bu yerda
        rol tekshirilmaydi: KELGAN qiymat chiziladi, bo'sh qiymat qatori
        tushiriladi va hech biri kelmasa panel butunlay chizilmaydi. Rolni
        takrorlash server qoidasidan ajralib ketish demakdir.
      */}
      {tab === 'umumiy' && personalRows.length > 0 && (
        <Card className="mt-4 p-5">
          <h3 className="mb-4 text-sm font-semibold text-fg">{t('employeeProfile.personalData')}</h3>
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {personalRows.map((r) => (
              <Row key={r.label} label={r.label} value={r.value} />
            ))}
          </dl>
        </Card>
      )}

      {/* The administrator-defined fields for this employee. Renders nothing at
          all when none are defined, so an untouched install looks unchanged. */}
      {/* O'rindoshlik lavozimlari — faqat bor bo'lsa chiziladi, shuning uchun
          oddiy xodim kartochkasi o'zgarmaydi. */}
      {tab === 'umumiy' && (
        <div className="mt-4">
          <EmployeeAssignmentsCard employeeId={employeeId} canEdit={canWriteCareer} />
        </div>
      )}

      {tab === 'umumiy' && (
        <div className="mt-4">
          {/* Custom fields are free-form HR data read under the passport-level
              gate (services/custom_field.py) — a manager's view would only
              get a 403 here. */}
          {!fromTeam && <CustomFieldsSection entityType="employee" entityId={employeeId} canEdit={canWriteCareer} />}
        </div>
      )}

      {tab === 'kpi' && <ProfileKpiTab employeeId={employeeId} />}
      {tab === 'tabel' && <ProfileTabelTab employeeId={employeeId} />}
      {tab === 'karyera' && <ProfileCareerTab employee={employee} canEdit={canWriteCareer} />}
      {tab === 't2' && <T2Card employeeId={employeeId} />}
      {tab === 'ruxsatlar' && <ProfileLeavesTab employeeId={employeeId} />}
      {tab === 'tahlil' && (
        <Suspense fallback={<CenteredSpinner />}>
          <ProfileAnalyticsTab employeeId={employeeId} />
        </Suspense>
      )}
      {tab === 'tibbiy' && <ProfileMedicalTab employeeId={employeeId} />}
      {tab === 'tarix' && <ProfileHistoryPanel employeeId={employeeId} />}

      {tab === 'buyruqlar' && (
        <Card className="p-0">
          {ordersQuery.isLoading ? (
            <CenteredSpinner />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<Stamp size={20} />}
              title={t('employeeProfile.noOrders')}
              description={t('employeeProfile.noOrdersHint')}
            />
          ) : (
            <ul className="divide-y divide-line">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="tabnum rounded-pill bg-fg/[0.06] px-2.5 py-1 text-[12px] text-fg-muted">
                    {o.act_number || `#${o.id}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
                    {o.summary || o.category_rel?.name || '—'}
                  </span>
                  <span className="tabnum shrink-0 text-[12px] text-fg-subtle">
                    {o.act_date
                      ? dayjs(o.act_date).format('DD.MM.YYYY')
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageContainer>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[14px] text-fg">{value || '—'}</dd>
    </div>
  )
}
