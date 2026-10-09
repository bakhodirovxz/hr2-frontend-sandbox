import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'

/**
 * Which days made up someone's lateness, and by how much.
 *
 * The count alone ("late: 7") does not tell HR whether that is seven minutes
 * spread over seven mornings or seven hours on one. `daily_late_minutes` has
 * always been in the summary response — v1 opens it from the lateness cell,
 * v2 rendered the number as plain text and dropped the breakdown.
 */
export function LateDaysModal({
  open,
  onClose,
  name,
  dailyLateMinutes,
}: {
  open: boolean
  onClose: () => void
  name: string
  dailyLateMinutes?: Record<string, number>
}) {
  const { t } = useTranslation()
  const rows = Object.entries(dailyLateMinutes ?? {})
    .filter(([, m]) => (m ?? 0) > 0)
    .sort(([a], [b]) => a.localeCompare(b))

  const weekdays = t('date.weekdays', { returnObjects: true }) as unknown as string[]
  return (
    <Modal open={open} onClose={onClose} title={`${t('attendance.lateDetailTitle')} — ${name}`}>
      {rows.length === 0 ? (
        <EmptyState title={t('attendance.noLateDays')} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(([date, minutes]) => (
            <li key={date} className="flex items-center justify-between gap-3 py-2">
              <span className="tabular-nums text-fg">{dayjs(date).format('DD.MM.YYYY')}</span>
              {/* dayjs's `dddd` is English without a loaded locale; the name comes from the dictionary. */}
              <span className="text-[12px] text-fg-muted">{weekdays[dayjs(date).day()] ?? ''}</span>
              <span className="tabular-nums font-semibold text-warning">
                {Math.floor(minutes / 60) > 0 ? `${Math.floor(minutes / 60)}${t('attendance.hourShort')} ` : ''}
                {minutes % 60}{t('attendance.minuteShort')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
