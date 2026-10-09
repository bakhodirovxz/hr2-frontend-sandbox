import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Building2, Calendar, Clock, MapPin } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import {
  eventLocation,
  eventDirection,
  turnstileName,
  type TurnstileEvent as DayEvent,
} from '@/features/attendance/useDayEvents'
import { jobTitle } from '@/features/dashboard/attendance'
import { useBranches } from '@/hooks/useBranches'
import type { AttendanceRow } from '@/types/dashboard'

/**
 * BATAFSIL MA'LUMOT — the pass, opened from the portrait.
 *
 * v1 gives the row two targets: the NAME opens the person's tabel, the PHOTO
 * opens this — where that pass happened, when, at which gate and branch, and
 * (from a latecomers list) how late it was.
 */
export function PassDetailModal({
  row,
  lateMinutes,
  onClose,
}: {
  row: AttendanceRow | null
  /**
   * Minutes late, when the pass was opened from a latecomers list.
   *
   * ⚠️ WITHOUT THIS, OPENING A "LATE" ROW LOST THE ONE FACT THAT FLAGGED IT.
   * v1's version of this popup printed the lateness; v2's showed the gate, the
   * time and the distance but never how late the person actually was — so the
   * detail view of a late row said less about lateness than the row itself.
   * The board list is the only caller that knows this number (the server
   * computes it there), hence a prop rather than a field on the row.
   */
  lateMinutes?: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const open = !!row
  const [snapFailed, setSnapFailed] = useState(false)
  useEffect(() => setSnapFailed(false), [row])
  // The gate's location carries only `organization_branch_id`; the name comes
  // from the branch list the header already loads (cached).
  const { branches } = useBranches()
  /**
   * The last pass of the day is the one worth showing: "when did they leave".
   *
   * ⚠️ TWO `TurnstileEvent` TYPES describe the same server payload — the board's
   * (`types/dashboard`) and the tabel's (`useDayEvents`), each declaring the
   * fields its own screens read. The helpers below need the second, and the
   * fields they touch (`happen_time`, `direction_type`, `check_in_out_type`,
   * `turnstile`) are present and identically shaped in both, so the cast is
   * safe. Merging the two declarations is a separate job.
   */
  const event = (row?.exit ?? row?.entry ?? null) as DayEvent | null
  const loc = eventLocation(event)

  if (!row) return null
  const isEntry = event ? eventDirection(event) === 'entry' : null
  const snapshot = event?.photo_path || event?.photo_thumb_path || null
  const locBranch = loc as { organization_branch?: { name?: string | null } | null; organization_branch_id?: number | null } | null
  const branchName =
    locBranch?.organization_branch?.name ??
    branches.find((b) => b.id === locBranch?.organization_branch_id)?.name ??
    null

  return (
    <Modal open={open} onClose={onClose} title={t('dashboard.board.passDetail')} size="sm">
      <div>
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 rounded-inner border border-line bg-fg/[0.03] p-4">
            {/* The gate's own snapshot when it has one — that is what the pass
                IS; the profile photo only when the camera sent nothing (v1). */}
            {snapshot && !snapFailed ? (
              <a href={snapshot} target="_blank" rel="noopener noreferrer" title={t('dashboard.board.openPhoto')}>
                {/* A snapshot that will not load (expired link, storage down)
                    left an empty white box; it now falls back to the profile. */}
                <img src={snapshot} alt="" onError={() => setSnapFailed(true)} className="h-[180px] w-full max-w-[260px] rounded-inner object-cover" />
              </a>
            ) : (
              <Avatar
                src={row.employee.photo_path}
                fallbackSrc={row.employee.photo_thumb_path}
                name={row.employee.legal_name ?? ''}
                size={116}
              />
            )}
            <p className="text-center text-[14px] font-semibold text-fg">
              {row.employee.legal_name ?? t('common.unknown')}
            </p>
            <p className="text-center text-[12px] text-fg-muted">{jobTitle(row.employee)}</p>
          </div>

          <dl className="overflow-hidden rounded-inner border border-line">
            {lateMinutes != null && lateMinutes > 0 && (
              <Row icon={<Clock size={13} />} label={t('dashboard.gate.late')}>
                <Badge tone="danger">{t('dashboard.board.lateBy', { count: lateMinutes })}</Badge>
              </Row>
            )}
            {isEntry != null && (
              <Row icon={<Clock size={13} />} label={t('dashboard.colStatus')}>
                <Badge tone={isEntry ? 'success' : 'danger'}>
                  {isEntry ? t('dashboard.passIn') : t('dashboard.passOut')}
                </Badge>
              </Row>
            )}
            <Row icon={<Calendar size={13} />} label={t('vehicles.colDate')}>
              {event?.happen_time ? dayjs(event.happen_time).format('DD.MM.YYYY') : '—'}
            </Row>
            <Row icon={<Clock size={13} />} label={t('dashboard.board.passTime')}>
              {event?.happen_time ? dayjs(event.happen_time).format('HH:mm:ss') : '—'}
            </Row>
            <Row icon={<Building2 size={13} />} label={t('dashboard.colGate')}>
              {turnstileName(event) || row.turnstile || '—'}
            </Row>
            {branchName && (
              <Row icon={<Building2 size={13} />} label={t('dashboard.board.passBranch')}>
                {branchName}
              </Row>
            )}
            {loc?.address && (
              <Row icon={<MapPin size={13} />} label={t('turnstiles.fieldLocations')}>
                {loc.address}
              </Row>
            )}
          </dl>

        </div>
      </div>
    </Modal>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
      <dt className="flex items-center gap-1.5 text-[12px] text-fg-muted">
        {icon} {label}
      </dt>
      <dd className="ml-auto text-right text-[12.5px] font-semibold text-fg">{children}</dd>
    </div>
  )
}
