import { useState } from 'react'
import { ln } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { Briefcase, CalendarClock, CalendarDays, Clock, GraduationCap, LogIn, Route, TimerOff } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { Spinner } from '@/components/ui/Spinner'
import { LoadError } from '@/components/data/LoadError'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { apiGet } from '@/api/http'
import { isPlainEmployee } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { MonthCalendar, type CalendarEmployee } from '@/features/attendance/MonthCalendar'
import { dmy, formatHours } from '@/features/attendance/period'
import { useAttendance } from '@/features/attendance/useAttendance'

interface MyEmployee extends CalendarEmployee {
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  job_position?: { name?: string | null } | null
  department?: { name?: string | null; organization_branch_id?: number | null } | null
  educations?: { id?: number; institution_name?: string | null; faculty_name?: string | null; degree_name?: string | null; start_date?: string | null; end_date?: string | null }[]
  work_experiences?: { id?: number; company_name?: string | null; position?: string | null; start_date?: string | null; end_date?: string | null }[]
}

interface CareerRow {
  job_position?: { name?: string | null } | null
  department?: { name?: string | null } | null
  from?: string | null
  to?: string | null
  basis?: string | null
}

/**
 * DAVOMATIM (TZ I2, v1 `MyAttendancePage`): o'z oylik kalendari — bayramlar va
 * kadr buyrug'i asosidagi holatlar (ta'til, safar, kasallik) bilan, kunni
 * bosib reja/fakt va turniket o'tishlarini ko'rish. Oddiy xodim faqat
 * kalendarni ko'radi; qolganlarga «Karyera» tabi ham (tashkilotdagi
 * lavozimlar tarixi, ta'lim, ish tajribasi).
 */
export function MyAttendancePage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const employeeId = user?.employee?.id
  const plain = isPlainEmployee(user)
  const [tab, setTab] = useState<'calendar' | 'career'>('calendar')
  const [month, setMonth] = useState(() => dayjs().startOf('month'))

  const emp = useQuery({
    queryKey: ['employee', employeeId],
    queryFn: () => apiGet<MyEmployee>(`employees/${employeeId}`),
    enabled: !!employeeId,
  })

  if (!employeeId) {
    return (
      <PageContainer>
        <PageHeader title={t('davomat.myTitle')} />
        <Card className="p-8">
          <EmptyState icon={<CalendarDays size={22} />} title={t('davomat.noCardTitle')} description={t('davomat.noCardHint')} />
        </Card>
      </PageContainer>
    )
  }

  const employee = emp.data

  return (
    <PageContainer>
      <PageHeader title={t('davomat.myTitle')} subtitle={t('davomat.mySubtitle')} />

      {emp.isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner />
        </div>
      ) : emp.error || !employee ? (
        <LoadError error={emp.error} onRetry={emp.refetch} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <ProfileCard employee={employee} />
          <div className="min-w-0">
            {!plain && (
              <Segmented
                className="mb-4 w-fit"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'calendar', label: t('davomat.tabCalendar'), icon: <CalendarDays size={14} /> },
                  { value: 'career', label: t('davomat.tabCareer'), icon: <Briefcase size={14} /> },
                ]}
              />
            )}
            {tab === 'career' && !plain ? (
              <CareerPanel employee={employee} />
            ) : (
              <>
                <MonthStats employeeId={employee.id} month={month} />
                <Card className="p-4">
                  <MonthCalendar employee={employee} month={month} onMonthChange={setMonth} />
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </PageContainer>
  )
}

function ProfileCard({ employee }: { employee: MyEmployee }) {
  const { t } = useTranslation()
  const hh = (v?: string | null) => (v ? v.slice(0, 5) : '')
  const hours = employee.working_hours_start && employee.working_hours_end
    ? `${hh(employee.working_hours_start)}–${hh(employee.working_hours_end)}`
    : '09:00–18:00'
  const lunch = employee.lunch_start_time && employee.lunch_end_time
    ? `${hh(employee.lunch_start_time)}–${hh(employee.lunch_end_time)}`
    : '13:00–14:00'
  return (
    <Card className="h-fit p-4">
      <div className="flex flex-col items-center text-center">
        <Avatar src={employee.photo_thumb_path} fallbackSrc={employee.photo_path} name={employee.legal_name} size={88} />
        <p className="mt-3 text-[15px] font-semibold text-fg">{employee.legal_name}</p>
        <p className="mt-0.5 text-[12.5px] text-fg-muted">{ln(employee.job_position) || '—'}</p>
      </div>
      <dl className="mt-4 space-y-2 border-t border-line pt-3 text-[12.5px]">
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">{t('davomat.colDepartment')}</dt>
          <dd className="text-right text-fg">{ln(employee.department) || '—'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">{t('davomat.workHours')}</dt>
          <dd className="tabular-nums text-fg">{hours}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-fg-muted">{t('davomat.lunch')}</dt>
          <dd className="tabular-nums text-fg">{lunch}</dd>
        </div>
      </dl>
    </Card>
  )
}

function MonthStats({ employeeId, month }: { employeeId: number; month: dayjs.Dayjs }) {
  const { t } = useTranslation()
  // MonthCalendar bilan AYNAN bir xil so'rov — kesh bitta, tarmoqqa ikkinchi marta chiqmaydi.
  const { rows } = useAttendance({
    from: month.startOf('month').format('YYYY-MM-DD'),
    to: month.endOf('month').format('YYYY-MM-DD'),
    page: 1,
    size: 1,
    employeeId,
  })
  const a = rows.find((r) => r.id === employeeId)?.attendance
  const items = [
    { icon: <LogIn size={18} />, tone: '--success', label: t('davomat.statPresent'), value: t('davomat.nDays', { n: a?.present_days_count ?? 0 }) },
    { icon: <Clock size={18} />, tone: '--warning', label: t('davomat.statLate'), value: t('davomat.nTimes', { n: a?.late_days_count ?? 0 }) },
    { icon: <TimerOff size={18} />, tone: '--danger', label: t('davomat.statAbsent'), value: t('davomat.nDays', { n: a?.absent_days_count ?? 0 }) },
    { icon: <CalendarClock size={18} />, tone: '--brand', label: t('davomat.statHours'), value: t('davomat.nHours', { n: formatHours(a?.work_duration_hours) }) },
  ]
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {items.map((s) => (
        <Card key={s.label} className="flex items-center gap-3 p-3.5">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: `rgb(var(${s.tone}) / 0.14)`, color: `rgb(var(${s.tone}))` }}
          >
            {s.icon}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold tabular-nums text-fg">{s.value}</p>
            <p className="truncate text-xs text-fg-muted">{s.label}</p>
          </div>
        </Card>
      ))}
    </div>
  )
}

/** Tashkilotdagi lavozimlar tarixi (`employees/{pk}/career`), ta'lim va ish tajribasi. */
function CareerPanel({ employee }: { employee: MyEmployee }) {
  const { t } = useTranslation()
  const career = useQuery({
    queryKey: ['employee-career', employee.id],
    queryFn: () => apiGet<{ items?: CareerRow[] }>(`employees/${employee.id}/career`),
  })
  const period = (a?: string | null, b?: string | null) => `${a ? dmy(a) : '…'} — ${b ? dmy(b) : t('davomat.untilNow')}`
  const history = career.data?.items ?? []

  return (
    <div className="grid gap-4">
      <Card className="p-0">
        <SectionTitle icon={<Route size={15} />} title={t('davomat.careerHistory')} />
        {career.isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner />
          </div>
        ) : career.error ? (
          <LoadError error={career.error} onRetry={career.refetch} />
        ) : history.length === 0 ? (
          <EmptyState title={t('davomat.noData')} />
        ) : (
          <ul className="divide-y divide-line">
            {history.map((r, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg">{ln(r.job_position) || '—'}</p>
                  <p className="text-[12px] text-fg-muted">
                    {[ln(r.department), r.basis].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <span className="tabular-nums text-[12px] text-fg-subtle">{period(r.from, r.to)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-0">
          <SectionTitle icon={<Briefcase size={15} />} title={t('davomat.experience')} />
          {(employee.work_experiences ?? []).length === 0 ? (
            <EmptyState title={t('davomat.noData')} />
          ) : (
            <ul className="divide-y divide-line">
              {(employee.work_experiences ?? []).map((r, i) => (
                <li key={r.id ?? i} className="px-4 py-3">
                  <p className="text-[13px] font-medium text-fg">{r.company_name || '—'}</p>
                  <p className="text-[12px] text-fg-muted">{r.position || '—'}</p>
                  <p className="mt-0.5 tabular-nums text-[11px] text-fg-subtle">{period(r.start_date, r.end_date)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-0">
          <SectionTitle icon={<GraduationCap size={15} />} title={t('davomat.education')} />
          {(employee.educations ?? []).length === 0 ? (
            <EmptyState title={t('davomat.noData')} />
          ) : (
            <ul className="divide-y divide-line">
              {(employee.educations ?? []).map((r, i) => (
                <li key={r.id ?? i} className="px-4 py-3">
                  <p className="text-[13px] font-medium text-fg">{r.institution_name || '—'}</p>
                  <p className="text-[12px] text-fg-muted">{[r.faculty_name, r.degree_name].filter(Boolean).join(' · ') || '—'}</p>
                  <p className="mt-0.5 tabular-nums text-[11px] text-fg-subtle">{period(r.start_date, r.end_date)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-brand-strong">
      {icon}
      <h3 className="text-[14px] font-bold text-fg">{title}</h3>
    </div>
  )
}
