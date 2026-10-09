import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'
import { monthTitle } from '@/lib/format'
import { isScheduledWeekday, type WorkScheduleSource } from '@/lib/workCycle'
import { holidayOn, useHolidayRange, type Holiday } from '@/features/holidays/useHolidays'
import { CAL_COLOR, CAL_LABEL, LEGEND_STATUSES, mapCalStatus, type CalStatus } from './attendanceStatus'
import { DayDetailModal } from './DayDetailModal'
import { useAttendance } from './useAttendance'
import { formatDayRange, useMonthEvents, type DayEvents } from './useDayEvents'

/** Kalendar ko'rsatadigan xodim — normallashtirilgan qator yoki xodim kartasi. */
export interface CalendarEmployee extends WorkScheduleSource {
  id: number
  working_hours_start?: string | null
  working_hours_end?: string | null
  lunch_start_time?: string | null
  lunch_end_time?: string | null
  department?: { organization_branch_id?: number | null } | null
  primary_organization_branch_id?: number | null
}

interface Cell {
  date: string
  day: number
  status: CalStatus
  /** Holat yo'q va kun hali kelmagan — bo'sh katak. */
  empty: boolean
  today: boolean
  holiday?: Holiday
}

const hhmm = (v?: string | null) => (v ? v.slice(0, 5) : undefined)

/**
 * XODIMNING OYLIK DAVOMAT KALENDARI (v1 `EmployeeAttendanceCalendar`).
 *
 * Har kun: tabeldagi holat (`normalized` — buyruq asosidagi ta'til, safar,
 * kasallik ham shu yerda), turniketdagi birinchi kirish va oxirgi chiqish,
 * bayram nomi («Bayramlar»dan). O'tgan kunni bosish — kun tafsiloti: reja va
 * fakt, tanaffuslar, ichkarida bo'lgan vaqt, barcha o'tishlar.
 *
 * `compact` — xodim davomati paneli uchun kichik kataklar.
 */
export function MonthCalendar({
  employee,
  month,
  onMonthChange,
  compact = false,
}: {
  employee: CalendarEmployee
  month: dayjs.Dayjs
  onMonthChange: (m: dayjs.Dayjs) => void
  compact?: boolean
}) {
  const { t } = useTranslation()
  const [openDate, setOpenDate] = useState<string | null>(null)

  const from = month.startOf('month').format('YYYY-MM-DD')
  const to = month.endOf('month').format('YYYY-MM-DD')
  const { rows, loading } = useAttendance({ from, to, page: 1, size: 1, employeeId: employee.id })
  const summary = rows.find((r) => r.id === employee.id)?.attendance
  const { byDay } = useMonthEvents(employee.id, month)
  const branchId = employee.department?.organization_branch_id ?? employee.primary_organization_branch_id ?? null
  const holidays = useHolidayRange(from, to, branchId)

  const todayIso = dayjs().format('YYYY-MM-DD')
  const cells = useMemo(() => {
    const calendar = summary?.calendar ?? {}
    const first = month.startOf('month')
    const out: (Cell | null)[] = []
    for (let i = 0; i < (first.day() + 6) % 7; i++) out.push(null)
    for (let d = 1; d <= month.daysInMonth(); d++) {
      const day = first.date(d)
      const date = day.format('YYYY-MM-DD')
      const raw = calendar[date]
      const holiday = holidayOn(holidays, day)
      // Bayram kuni turniket qaydi bo'lmasa — «Bayram» (v1 ham shunday).
      const status: CalStatus = holiday && !byDay.get(date) ? 'holiday' : mapCalStatus(raw)
      out.push({
        date,
        day: d,
        status,
        // Kelajakdagi ish kuni — hukmsiz bo'sh katak; dam olish, bayram va
        // oldindan ma'lum safar/ta'til belgisi bilan qoladi.
        empty: !raw && !holiday && date > todayIso,
        today: date === todayIso,
        holiday,
      })
    }
    return out
  }, [summary, month, holidays, byDay, todayIso])

  const weekdays = t('date.weekdaysShort', { returnObjects: true }) as unknown as string[]
  const openCell = cells.find((c) => c?.date === openDate) ?? null

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className={cn('font-semibold text-fg', compact ? 'text-[14px]' : 'text-[16px]')}>{monthTitle(month)}</h3>
        <div className="flex items-center gap-1.5">
          <IconButton size="sm" label={t('davomat.prevMonth')} onClick={() => onMonthChange(month.subtract(1, 'month'))}>
            <ChevronLeft size={16} />
          </IconButton>
          <IconButton size="sm" label={t('davomat.nextMonth')} onClick={() => onMonthChange(month.add(1, 'month'))}>
            <ChevronRight size={16} />
          </IconButton>
          <Button size="sm" variant="secondary" onClick={() => onMonthChange(dayjs().startOf('month'))}>
            {t('davomat.today')}
          </Button>
        </div>
      </div>

      <div className={cn('mb-1.5 grid grid-cols-7', compact ? 'gap-1' : 'gap-2')}>
        {weekdays.map((w) => (
          <div key={w} className="text-center text-[11px] font-semibold uppercase text-fg-subtle">
            {w}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className={cn('grid grid-cols-7', compact ? 'gap-1' : 'gap-2')}>
          {cells.map((cell, i) =>
            cell ? (
              <DayCell
                key={cell.date}
                cell={cell}
                compact={compact}
                events={byDay.get(cell.date)}
                lateMinutes={summary?.daily_late_minutes?.[cell.date]}
                onOpen={() => setOpenDate(cell.date)}
              />
            ) : (
              <div key={`e${i}`} />
            ),
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line pt-3">
        {LEGEND_STATUSES.map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: `rgb(var(${CAL_COLOR[s]}))` }} />
            {t(`attendance.${CAL_LABEL[s]}`)}
          </span>
        ))}
      </div>

      <DayDetailModal
        date={openDate}
        status={openCell?.status ?? 'day_off'}
        day={openDate ? byDay.get(openDate) : null}
        lateMinutes={openDate ? summary?.daily_late_minutes?.[openDate] : undefined}
        workingStart={hhmm(employee.working_hours_start)}
        workingEnd={hhmm(employee.working_hours_end)}
        lunchStart={employee.lunch_start_time}
        lunchEnd={employee.lunch_end_time}
        isWorkingDay={openDate ? isScheduledWeekday(employee, openDate) : true}
        onClose={() => setOpenDate(null)}
      />
    </div>
  )
}

function DayCell({
  cell,
  compact,
  events,
  lateMinutes,
  onOpen,
}: {
  cell: Cell
  compact: boolean
  events?: DayEvents
  lateMinutes?: number
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const range = formatDayRange(events)
  const height = compact ? 'h-14' : 'h-[76px]'

  if (cell.empty) {
    return (
      <div className={cn('flex w-full flex-col items-center justify-center rounded-lg border border-dashed border-line', height)}>
        <span className="text-[12px] font-medium tabular-nums text-fg-subtle">{cell.day}</span>
      </div>
    )
  }

  const label = cell.holiday && cell.status === 'holiday' ? cell.holiday.name : t(`attendance.${CAL_LABEL[cell.status]}`)
  const tip = [`${String(cell.day).padStart(2, '0')} — ${label}`, range, lateMinutes ? t('myAttendance.lateBy', { count: lateMinutes }) : '']
    .filter(Boolean)
    .join(' · ')
  const color = CAL_COLOR[cell.status]

  return (
    <Tooltip text={tip} className="w-full">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border border-line px-0.5 transition-colors hover:border-brand/50',
          height,
          cell.today && 'ring-2 ring-brand ring-offset-1 ring-offset-surface',
        )}
        style={{ backgroundColor: `rgb(var(${color}) / 0.14)` }}
      >
        <span className={cn('font-semibold tabular-nums text-fg', compact ? 'text-[12px]' : 'text-[13px]')}>{cell.day}</span>
        <span className="h-1 w-6 rounded-full" style={{ backgroundColor: `rgb(var(${color}))` }} />
        <span className={cn('max-w-full truncate leading-none tabular-nums text-fg-muted', compact ? 'text-[9px]' : 'text-[10.5px]')}>
          {range || (compact ? '' : label)}
        </span>
        {!compact && !!lateMinutes && (
          <span className="text-[10px] font-semibold leading-none text-warning">+{lateMinutes}{t('attendance.minuteShort')}</span>
        )}
      </button>
    </Tooltip>
  )
}
