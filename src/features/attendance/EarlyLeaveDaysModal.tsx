import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import type { EarlyLeaveDay } from './useAttendance'

/**
 * Which days someone left before the end of their working window, and when.
 *
 * The count alone ("early: 3") is not what HR acts on — they need the exit
 * time against the end of the day: «17:30 (18:00 gacha)». The server ships
 * exactly that per day in `daily_early_leave`, beside the calendar (a day
 * can be both late and left early, so it is not a calendar status).
 */
export function EarlyLeaveDaysModal({
  open,
  onClose,
  name,
  days,
}: {
  open: boolean
  onClose: () => void
  name: string
  days?: Record<string, EarlyLeaveDay>
}) {
  const { t } = useTranslation()
  const rows = Object.entries(days ?? {}).sort(([a], [b]) => a.localeCompare(b))

  const weekdays = t('date.weekdays', { returnObjects: true }) as unknown as string[]
  return (
    <Modal open={open} onClose={onClose} title={`${t('attendance.earlyDetailTitle')} — ${name}`}>
      {rows.length === 0 ? (
        <EmptyState title={t('attendance.noEarlyDays')} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(([date, d]) => {
            const m = Number(d?.minutes) || 0
            return (
              <li key={date} className="flex items-center justify-between gap-3 py-2">
                <span className="tabular-nums text-fg">{dayjs(date).format('DD.MM.YYYY')}</span>
                {/* dayjs's `dddd` is English without a loaded locale; the name comes from the dictionary. */}
                <span className="text-[12px] text-fg-muted">{weekdays[dayjs(date).day()] ?? ''}</span>
                <span className="flex items-baseline gap-2">
                  <span className="tabular-nums font-semibold text-info">{d?.left_at}</span>
                  <span className="text-[12px] text-fg-muted">
                    ({t('attendance.earlyWorkEnd', { time: d?.work_end })})
                  </span>
                  <span className="tabular-nums text-[12px] text-fg-muted">
                    −{Math.floor(m / 60) > 0 ? `${Math.floor(m / 60)}${t('attendance.hourShort')} ` : ''}
                    {m % 60}{t('attendance.minuteShort')}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
