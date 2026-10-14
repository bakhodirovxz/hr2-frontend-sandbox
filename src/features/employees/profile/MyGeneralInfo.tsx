import type { ReactNode } from 'react'
import { ln } from '@/i18n/display'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { BookOpen, Briefcase, Building2, GraduationCap, LayoutDashboard, User as UserIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useNationalityLabel } from '@/features/employees/nationalityLabel'
import type { EducationRow, MyEmployee, WorkExperienceRow } from './useMyAccount'

const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : null)
const hhmm = (v?: string | null) => (v ? v.slice(0, 5) : '')

function Row({ label, value }: { label: string; value?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-2 last:border-b-0">
      <dt className="shrink-0 text-[12.5px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[13px] font-medium text-fg">{value || '—'}</dd>
    </div>
  )
}

/**
 * «Umumiy ma'lumotlarim» — o'z kartasi (TZ L1, 4.2.4): asosiy va shaxsiy
 * ma'lumotlar, ish tajribasi va ta'lim. O'z kartasi bo'lgani uchun pasport,
 * JShShIR, STIR va manzil ham ko'rinadi (server ham egasiga to'liq beradi).
 */
export function MyGeneralInfo({ employee }: { employee: MyEmployee }) {
  const { t } = useTranslation()
  const nationalityLabel = useNationalityLabel()
  const e = employee

  const dayShort = [t('account.dayMon'), t('account.dayTue'), t('account.dayWed'), t('account.dayThu'), t('account.dayFri'), t('account.daySat'), t('account.daySun')]
  const days = Array.isArray(e.working_days) ? e.working_days : []
  const daysText = !days.length
    ? ''
    : days.length === 5 && days.every((d) => d >= 0 && d <= 4)
      ? `${dayShort[0]}–${dayShort[4]}`
      : days.length === 6 && days.every((d) => d >= 0 && d <= 5)
        ? `${dayShort[0]}–${dayShort[5]}`
        : days.map((d) => dayShort[d]).filter(Boolean).join(', ')
  const hours = e.working_hours_start && e.working_hours_end ? `${hhmm(e.working_hours_start)}–${hhmm(e.working_hours_end)}` : ''
  const lunch = e.lunch_start_time && e.lunch_end_time ? `(${t('account.lunch')}: ${hhmm(e.lunch_start_time)}–${hhmm(e.lunch_end_time)})` : ''
  const schedule = [daysText, hours, lunch].filter(Boolean).join(' ')

  const passport = [e.pasport_series, e.pasport_number].filter(Boolean).join(' ')
  const gender = e.gender === 1 ? t('account.male') : e.gender === 2 ? t('account.female') : null
  const branchName = e.department?.organization_branch?.name || e.organization_branches?.[0]?.name

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="overflow-hidden">
        <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-6 text-center">
          <Avatar src={e.photo_thumb_path} fallbackSrc={e.photo_path} name={e.legal_name} size={96} />
          <h2 className="text-lg font-bold leading-tight text-fg">{e.legal_name || '—'}</h2>
        </div>
        <CardHeader title={t('account.mainInfo')} icon={<LayoutDashboard />} className="border-t" />
        <dl>
          <Row label={t('account.organization')} value={branchName} />
          <Row label={t('account.department')} value={ln(e.department) || undefined} />
          <Row label={t('account.supervisor')} value={e.supervisor?.legal_name} />
          <Row label={t('account.position')} value={ln(e.job_position) || undefined} />
          <Row label={t('account.internalPhone')} value={e.internal_phone_number} />
          <Row label={t('account.workDays')} value={schedule} />
        </dl>
        <CardHeader title={t('account.personalInfo')} icon={<UserIcon />} className="border-t" />
        <dl>
          <Row label={t('account.gender')} value={gender} />
          <Row label={t('account.nationality')} value={e.nationality ? nationalityLabel(e.nationality) : null} />
          <Row label={t('account.maritalStatus')} value={maritalText(e.maritial_status, t)} />
          <Row label={t('account.passport')} value={passport} />
          <Row label={t('account.birthDate')} value={fmtDate(e.birth_date)} />
          <Row label={t('account.passportIssuedBy')} value={e.pasport_issue_by} />
          <Row label={t('account.pinfl')} value={e.personal_identification_number} />
          <Row label={t('account.pension')} value={e.individual_accumulative_pension_account_number} />
          <Row label={t('account.tin')} value={e.taxpayer_identification_number} />
          <Row label={t('account.residenceAddress')} value={e.residence_address} />
          <Row label={t('account.registeredAddress')} value={e.address} />
        </dl>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <HistoryCard
          title={t('account.workExperience')}
          icon={<Building2 />}
          rows={(e.work_experiences ?? []).map((x: WorkExperienceRow, i) => ({
            key: x.id ?? i,
            title: x.company_name,
            subtitle: x.position,
            period: period(x.start_date, x.end_date, x.is_current, t('account.untilNow')),
            icon: <Briefcase size={16} />,
          }))}
        />
        <HistoryCard
          title={t('account.education')}
          icon={<BookOpen />}
          rows={(e.educations ?? []).map((x: EducationRow, i) => ({
            key: x.id ?? i,
            title: x.institution_name,
            subtitle: [x.faculty_name, x.degree_name].filter(Boolean).join(' · '),
            period: period(x.start_date, x.end_date, x.is_current, t('account.untilNow')),
            icon: <GraduationCap size={16} />,
          }))}
        />
      </div>
    </div>
  )
}

/** Oilaviy holat matni (v1 qiymatlari) → tarjima kaliti. */
export const MARITAL_VALUES = ['Turmush qurmagan', 'Turmush qurgan', 'Ajrashgan', 'Beva'] as const
export function maritalKey(v: string): 'single' | 'married' | 'divorced' | 'widowed' | 'other' {
  const i = (MARITAL_VALUES as readonly string[]).indexOf(v)
  return (['single', 'married', 'divorced', 'widowed'] as const)[i] ?? 'other'
}

export function maritalText(v: string | null | undefined, t: TFunction) {
  if (!v) return null
  const k = maritalKey(v)
  return k === 'other' ? v : t(`account.marital_${k}`)
}

function period(start?: string | null, end?: string | null, current?: boolean | null, now?: string) {
  const s = start ? dayjs(start).format('MM.YYYY') : ''
  const e = end && !current ? dayjs(end).format('MM.YYYY') : now
  return `${s} – ${e}`
}

function HistoryCard({
  title,
  icon,
  rows,
}: {
  title: string
  icon: ReactNode
  rows: { key: number; title?: string | null; subtitle?: string | null; period: string; icon: ReactNode }[]
}) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} icon={icon} />
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <EmptyState title={t('account.noData')} />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.key} className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-inner bg-surface-2 text-fg-muted">{r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-fg">{r.title || '—'}</span>
                  <span className="block truncate text-xs text-fg-muted">{r.subtitle || '—'}</span>
                </span>
                <span className="tabnum shrink-0 text-xs text-fg-subtle">{r.period}</span>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
