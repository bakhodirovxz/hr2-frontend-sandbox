import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Building, Calendar, Clock, Hash, Home, IdCard, Info, LayoutGrid, MapPin, Phone, Star, User, UserCheck, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { fmtDate, hhmm, usePersonnelLabels, useWorkingDaysLabel } from '../format'
import type { EmployeeFull, T2Card } from '../types'
import { useCardName } from '../t2/useT2'

function InfoItem({ label, value, icon }: { label: string; value?: ReactNode; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line/50 px-3 py-1.5 last:border-b-0">
      <span className="flex shrink-0 items-center gap-2 text-[12.5px] text-fg-muted">
        <span className="text-brand">{icon}</span>
        {label}
      </span>
      <span className="min-w-0 truncate pl-2 text-right text-[12.5px] font-semibold text-fg" title={typeof value === 'string' ? value : undefined}>
        {value || '—'}
      </span>
    </div>
  )
}

function Block({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 flex items-center gap-2 text-[13.5px] font-semibold text-fg">
        <span className="text-brand">{icon}</span>
        {title}
      </h3>
      <div className="overflow-hidden rounded-inner border border-line bg-surface-2/40">{children}</div>
    </section>
  )
}

/**
 * The left column of the card (TZ 4.2.7 · 2143 «Информация об организации
 * в отдельном прямоугольнике»): photo, name, organisation block, personal
 * data. PII arrives masked (or null) from the server by the viewer's level.
 */
export function ProfileInfo({ employee, card }: { employee: EmployeeFull; card?: T2Card | null }) {
  const { t } = useTranslation()
  const labels = usePersonnelLabels()
  const daysLabel = useWorkingDaysLabel()
  const cardName = useCardName(card)
  const e = employee
  const hours = e.working_hours_start && e.working_hours_end ? `${hhmm(e.working_hours_start)}–${hhmm(e.working_hours_end)}` : ''
  const lunch =
    e.lunch_start_time && e.lunch_end_time ? `(${t('personnel.info.lunch')}: ${hhmm(e.lunch_start_time)}–${hhmm(e.lunch_end_time)})` : ''
  const schedule = [daysLabel(e.working_days), hours, lunch].filter(Boolean).join(' ')
  const passport = [e.pasport_series, e.pasport_number].filter(Boolean).join(' ')
  const residence = [cardName('residence_region_name'), cardName('residence_district_name'), card?.values?.residence_address ?? e.residence_address]
    .filter(Boolean)
    .join(', ')
  const branch = e.department?.organization_branch?.name || e.organization_branches?.[0]?.name

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        {e.photo_path ? (
          <a href={e.photo_path} target="_blank" rel="noopener noreferrer" aria-label={t('personnel.t2.enlargePhoto')}>
            <Avatar src={e.photo_thumb_path || e.photo_path} fallbackSrc={e.photo_path} name={e.legal_name} size={100} />
          </a>
        ) : (
          <Avatar name={e.legal_name} size={100} />
        )}
        <h2 className="text-[19px] font-bold leading-tight text-fg">{e.legal_name}</h2>
      </div>

      <Block title={t('personnel.info.main')} icon={<LayoutGrid size={15} />}>
        <InfoItem label={t('personnel.info.organization')} value={branch} icon={<Building size={13} />} />
        <InfoItem label={t('personnel.f.department')} value={e.department?.name} icon={<LayoutGrid size={13} />} />
        <InfoItem label={t('personnel.info.supervisor')} value={e.supervisor?.legal_name} icon={<UserCheck size={13} />} />
        <InfoItem label={t('personnel.f.position')} value={e.job_position?.name} icon={<Star size={13} />} />
        <InfoItem label={t('personnel.f.internalPhone')} value={e.internal_phone_number} icon={<Phone size={13} />} />
        <InfoItem label={t('personnel.info.workDays')} value={schedule} icon={<Clock size={13} />} />
      </Block>

      <Block title={t('personnel.info.personal')} icon={<User size={15} />}>
        <InfoItem label={t('personnel.f.gender')} value={labels.gender(e.gender)} icon={<Info size={13} />} />
        <InfoItem label={t('personnel.f.nationality')} value={cardName('nationality_name') || e.nationality} icon={<Info size={13} />} />
        <InfoItem label={t('personnel.f.marital')} value={labels.marital(e.maritial_status)} icon={<Users size={13} />} />
        <InfoItem label={t('personnel.f.passport')} value={passport} icon={<IdCard size={13} />} />
        <InfoItem label={t('personnel.f.birthDate')} value={e.birth_date ? fmtDate(e.birth_date) : ''} icon={<Calendar size={13} />} />
        <InfoItem label={t('personnel.f.passportIssuedBy')} value={e.pasport_issue_by} icon={<MapPin size={13} />} />
        <InfoItem label={t('personnel.f.pinfl')} value={e.personal_identification_number} icon={<Hash size={13} />} />
        <InfoItem label={t('personnel.f.inps')} value={e.individual_accumulative_pension_account_number} icon={<Hash size={13} />} />
        <InfoItem label={t('personnel.f.inn')} value={e.taxpayer_identification_number} icon={<Hash size={13} />} />
        <InfoItem label={t('personnel.info.residence')} value={residence} icon={<Home size={13} />} />
        <InfoItem label={t('personnel.f.regAddress')} value={e.address} icon={<MapPin size={13} />} />
      </Block>
    </Card>
  )
}
