import { useTranslation } from 'react-i18next'
import { Building2, LogIn, LogOut, Phone, PhoneCall } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { formatTime, getDisplayStatus, jobTitle } from '@/features/dashboard/attendance'
import { usePhoneContact } from '@/features/phone/usePhoneDirectory'
import type { AttendanceRow } from '@/types/dashboard'
import { ProfileTabelTab } from '@/features/employees/profile/ProfileTabs'
import { StatusPill, type RowTone } from './rows'

/**
 * A COLLEAGUE, opened from the roster.
 *
 * v1 lets anyone click a row and see who that person is; v2's rows were inert,
 * so an ordinary employee had no way to look a colleague up at all — neither
 * their phone number nor whether they are in today.
 *
 * Everything here is readable by an ORDINARY employee, which is the whole
 * point: `/employees/{id}` answers 404 to them (branch scoping), so the card is
 * built from what they may actually read — the roster row already in hand, the
 * open phone directory, and the turnstile feed filtered to this person.
 */
const TONE: Record<string, RowTone> = {
  present: 'success',
  arrived: 'success',
  left: 'neutral',
  absent: 'danger',
  denied: 'danger',
  vacation: 'brand',
  trip: 'info',
  sick: 'neutral',
  leave: 'brand',
  dekret: 'brand',
}

export function ColleagueModal({ row, onClose }: { row: AttendanceRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const open = !!row
  const employeeId = row?.employee?.id

  // Only this person's card — not the branch directory.
  const contact = usePhoneContact(employeeId, open)

  if (!row) return null
  const status = getDisplayStatus(row)
  const dept = row.employee.department
  const deptName = typeof dept === 'object' && dept ? (dept.name ?? '') : ''
  const phone = contact?.phone_number
  const internal = contact?.internal_phone_number

  return (
    <Modal open={open} onClose={onClose} title={row.employee.legal_name ?? t('common.unknown')} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={row.employee.photo_thumb_path}
            fallbackSrc={row.employee.photo_path}
            name={row.employee.legal_name ?? ''}
            size={56}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-fg">
              {row.employee.legal_name ?? t('common.unknown')}
            </p>
            <p className="truncate text-[12px] text-fg-muted">{jobTitle(row.employee)}</p>
            {deptName && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-fg-subtle">
                <Building2 size={12} /> {deptName}
              </p>
            )}
          </div>
          <StatusPill tone={TONE[status.key] ?? 'neutral'}>
            {t(`status.${status.key}` as never)}
          </StatusPill>
        </div>

        {/* THE PHONE. The directory is open to every role, so this is the one
            contact detail a colleague may always be given. */}
        <div className="grid grid-cols-2 gap-2">
          <ContactTile
            icon={<Phone size={14} />}
            label={t('phone.colPhonePersonal')}
            value={phone}
            href={phone ? `tel:${phone}` : undefined}
          />
          <ContactTile
            icon={<PhoneCall size={14} />}
            label={t('phone.colPhoneInternal')}
            value={internal}
            href={internal ? `tel:${internal}` : undefined}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <TimeTile icon={<LogIn size={14} />} label={t('dashboard.colIn')} value={formatTime(row.entry?.happen_time)} />
          <TimeTile icon={<LogOut size={14} />} label={t('dashboard.colOut')} value={formatTime(row.exit?.happen_time)} />
        </div>

        {/* THE MONTH, not just today. v1 opens the personal tabel calendar from
            this row and that is the question people actually bring here —
            "which days did they miss" — so the same calendar is reused rather
            than a second, thinner view of the same data. Verified readable by
            an ORDINARY employee for a colleague on their roster. */}
        <div className="border-t border-line pt-3">
          <ProfileTabelTab employeeId={row.employee.id} showLegend={false} />
        </div>

      </div>
    </Modal>
  )
}

function ContactTile({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value?: string | null
  href?: string
}) {
  const { t } = useTranslation()
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
        {icon} {label}
      </span>
      <span className="mt-0.5 block truncate text-[13.5px] font-semibold [font-variant-numeric:tabular-nums] text-fg">
        {value || t('dashboard.board.noPhone')}
      </span>
    </>
  )
  const cls = 'block rounded-control border border-line bg-fg/[0.03] px-3 py-2'
  return href ? (
    <a href={href} className={`${cls} transition-colors hover:border-brand/50 hover:bg-brand-soft/40`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  )
}

function TimeTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-control border border-line bg-fg/[0.03] px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
        {icon} {label}
      </span>
      <span className="mt-0.5 block text-[13.5px] font-semibold [font-variant-numeric:tabular-nums] text-fg">
        {value}
      </span>
    </div>
  )
}
