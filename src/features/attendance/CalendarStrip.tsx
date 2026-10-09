import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Tooltip } from '@/components/ui/Tooltip'
import { formatUzShort } from '@/lib/format'
import { CAL_COLOR, CAL_LABEL, mapCalStatus } from './attendanceStatus'

/** A horizontal strip of one dot per day in [from, to], coloured by status. */
export function CalendarStrip({
  calendar,
  from,
  to,
}: {
  calendar: Record<string, string>
  from: string
  to: string
}) {
  const { t } = useTranslation()

  const days = useMemo(() => {
    const out: { date: string; status: ReturnType<typeof mapCalStatus> }[] = []
    let d = dayjs(from)
    const end = dayjs(to)
    let guard = 0
    while ((d.isBefore(end) || d.isSame(end, 'day')) && guard < 400) {
      const key = d.format('YYYY-MM-DD')
      out.push({ date: key, status: mapCalStatus(calendar[key]) })
      d = d.add(1, 'day')
      guard++
    }
    return out
  }, [calendar, from, to])

  return (
    <div className="flex flex-wrap items-center gap-1">
      {days.map((day) => (
        <Tooltip key={day.date} text={`${formatUzShort(day.date)} — ${t(`attendance.${CAL_LABEL[day.status]}`)}`}>
          <span
            className="block h-2.5 w-2.5 rounded-[3px]"
            style={{ backgroundColor: `rgb(var(${CAL_COLOR[day.status]}))` }}
          />
        </Tooltip>
      ))}
    </div>
  )
}
