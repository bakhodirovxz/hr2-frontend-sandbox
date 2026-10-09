import { useMemo, useState } from 'react'
import { isScheduledWeekday } from '@/lib/workCycle'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { CalendarClock, ChevronLeft, ChevronRight, Clock, LogIn, TimerOff } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/IconButton'
import { Spinner } from '@/components/ui/Spinner'
import { Tooltip } from '@/components/ui/Tooltip'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { cn } from '@/lib/cn'
import { monthTitle } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useAttendance } from '@/features/attendance/useAttendance'
import { useMonthEvents, formatDayRange, type DayEvents } from '@/features/attendance/useDayEvents'
import { DayDetailModal } from '@/features/attendance/DayDetailModal'
import {
  CAL_COLOR,
  CAL_LABEL,
  LEGEND_STATUSES,
  mapCalStatus,
  type CalStatus,
} from '@/features/attendance/attendanceStatus'
import { useMonthDocuments } from '@/features/attendance/useDayDocuments'
import { useHolidayRange, holidayOn, type Holiday } from '@/features/holidays/useHolidays'

interface Cell {
  date: string
  day: number
  status: CalStatus
  /** No record and none expected — a day that hasn't happened yet. */
  future: boolean
  today: boolean
  holiday?: Holiday
}

export function MyAttendancePage() {
  const { t } = useTranslation()
  const employee = useAuthStore((s) => s.user?.employee)
  const employeeId = employee?.id
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const [openDate, setOpenDate] = useState<string | null>(null)

  const today = dayjs()
  const isCurrentMonth = month.isSame(today, 'month')
  const from = month.startOf('month').format('YYYY-MM-DD')
  // Never ask beyond today: the backend walks every day in the range and files
  // the ones with no events as "absent", so requesting the whole month would
  // paint days that haven't happened yet red — and inflate the absence count.
  const to = (isCurrentMonth ? today : month.endOf('month')).format('YYYY-MM-DD')

  const { rows, loading } = useAttendance({ from, to, page: 1, size: 1, employeeId })
  // Strictly the signed-in employee. `?? rows[0]` would show somebody else's
  // attendance as your own the moment the filter stops being applied.
  const me = rows.find((r) => r.id === employeeId)
  const summary = me?.attendance
  const calendar = summary?.calendar ?? {}

  const { byDay, loading: eventsLoading } = useMonthEvents(employeeId, month)
  const monthEnd = month.endOf('month').format('YYYY-MM-DD')
  const holidays = useHolidayRange(from, monthEnd)
  const docs = useMonthDocuments(employeeId, from, monthEnd)

  const cells = useMemo(
    () => buildMonthCells(month, calendar, today, holidays),
    // `today` is a fresh dayjs each render; the day string is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [month, calendar, holidays, today.format('YYYY-MM-DD')],
  )
  // Yagona manba: `date.weekdaysShort` (dushanbadan).
  const weekdays = t('date.weekdaysShort', { returnObjects: true }) as unknown as string[]
  const openCell = cells.find((c) => c && c.date === openDate) ?? null

  return (
    <PageContainer>
      <PageHeader title={t('myAttendance.title')} subtitle={t('myAttendance.subtitle')} />

      {/* Summary stat cards */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<LogIn size={18} />} tone="--success" label={t('myAttendance.present')} value={summary?.present_days_count ?? 0} />
        <StatCard icon={<Clock size={18} />} tone="--warning" label={t('myAttendance.late')} value={summary?.late_days_count ?? 0} />
        <StatCard icon={<TimerOff size={18} />} tone="--danger" label={t('myAttendance.absent')} value={summary?.absent_days_count ?? 0} />
        <StatCard icon={<CalendarClock size={18} />} tone="--brand" label={t('myAttendance.hours')} value={Math.round(summary?.work_duration_hours ?? 0)} />
      </div>

      <Card>
        <CardHeader
          title={t('myAttendance.calendar')}
          action={
            <div className="flex items-center gap-2">
              <IconButton size="sm" label={t('myAttendance.prevMonth')} onClick={() => setMonth((m) => m.subtract(1, 'month'))}>
                <ChevronLeft size={16} />
              </IconButton>
              <span className="min-w-32 text-center text-sm font-semibold text-fg">
                {monthTitle(month)}
              </span>
              <IconButton size="sm" label={t('myAttendance.nextMonth')} onClick={() => setMonth((m) => m.add(1, 'month'))} disabled={isCurrentMonth}>
                <ChevronRight size={16} />
              </IconButton>
            </div>
          }
        />
        <CardBody>
          {loading ? (
            <div className="flex h-64 items-center justify-center"><Spinner /></div>
          ) : !summary ? (
            <EmptyState title={t('myAttendance.empty')} />
          ) : (
            <div>
              {/* weekday header */}
              <div className="mb-2 grid grid-cols-7 gap-2">
                {weekdays.map((w) => (
                  <div key={w} className="text-center text-[11.5px] font-semibold text-fg-subtle">
                    {w}
                  </div>
                ))}
              </div>
              {/* day cells */}
              <div className="grid grid-cols-7 gap-2">
                {cells.map((cell, i) =>
                  cell === null ? (
                    <div key={`e${i}`} />
                  ) : (
                    <DayCell
                      key={cell.date}
                      cell={cell}
                      events={byDay.get(cell.date)}
                      lateMinutes={summary.daily_late_minutes?.[cell.date]}
                      onOpen={() => setOpenDate(cell.date)}
                    />
                  ),
                )}
              </div>

              {/* legend */}
              <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 border-t border-line pt-3">
                {LEGEND_STATUSES.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
                    <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: `rgb(var(${CAL_COLOR[s]}))` }} />
                    {t(`attendance.${CAL_LABEL[s]}`)}
                  </span>
                ))}
                <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
                  <span className="h-2 w-2 rounded-sm bg-brand" />
                  {t('myAttendance.holiday')}
                </span>
              </div>
              {eventsLoading && (
                <p className="mt-2 text-[11px] text-fg-subtle">{t('myAttendance.loadingTimes')}</p>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <DayDetailModal
        date={openDate}
        status={openCell?.status ?? 'day_off'}
        day={openDate ? byDay.get(openDate) : null}
        lateMinutes={openDate ? summary?.daily_late_minutes?.[openDate] : undefined}
        workingStart={hhmm(employee?.working_hours_start)}
        workingEnd={hhmm(employee?.working_hours_end)}
        isWorkingDay={openDate ? isScheduledWeekday(employee, openDate) : true}
        documents={docs.forDate(openDate)}
        onClose={() => setOpenDate(null)}
      />
    </PageContainer>
  )
}

function DayCell({
  cell,
  events,
  lateMinutes,
  onOpen,
}: {
  cell: Cell
  events?: DayEvents
  lateMinutes?: number
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const range = formatDayRange(events)

  // A future day carries no verdict — it gets an outline and nothing else.
  // ⚠️ Except a HOLIDAY, which is known in advance and is the one thing worth
  // reading off a future date. It used to differ only by a faintly tinted
  // border: no dot, no name, nothing the legend's «Bayram» entry pointed at.
  if (cell.future) {
    const box = (
      <div
        className={cn(
          'flex h-[68px] w-full flex-col items-center justify-center rounded-lg border border-dashed border-line',
          cell.holiday && 'border-brand/40',
        )}
      >
        <span className="text-[13px] font-medium tabular-nums text-fg-subtle">{cell.day}</span>
        {cell.holiday && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-brand" />}
      </div>
    )
    return cell.holiday ? (
      <Tooltip text={`${cell.day}-kun — ${cell.holiday.name}`} className="w-full">{box}</Tooltip>
    ) : (
      box
    )
  }

  const label = cell.holiday
    ? cell.holiday.name
    : t(`attendance.${CAL_LABEL[cell.status]}`)
  const tip = [`${cell.day}-kun — ${label}`, range, lateMinutes ? t('myAttendance.lateBy', { count: lateMinutes }) : '']
    .filter(Boolean)
    .join(' · ')

  return (
    <Tooltip text={tip} className="w-full">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          'flex h-[68px] w-full flex-col items-center justify-center rounded-lg border border-line transition-colors hover:border-brand/50',
          cell.today && 'ring-2 ring-brand ring-offset-2 ring-offset-surface',
        )}
        style={{ backgroundColor: `rgb(var(${CAL_COLOR[cell.status]}) / 0.14)` }}
      >
        <span className="text-[13px] font-semibold tabular-nums text-fg">{cell.day}</span>
        {range ? (
          // The times are the point of "Davomatim" — a coloured dot alone can't
          // answer "when did I get in".
          <span className="mt-0.5 text-[10px] leading-none tabular-nums text-fg-muted">{range}</span>
        ) : (
          <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: `rgb(var(${CAL_COLOR[cell.status]}))` }} />
        )}
        {cell.holiday && <span className="mt-0.5 h-1 w-1 rounded-full bg-brand" />}
      </button>
    </Tooltip>
  )
}

function StatCard({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `rgb(var(${tone}) / 0.14)`, color: `rgb(var(${tone}))` }}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums text-fg">{value}</p>
        <p className="truncate text-xs text-fg-muted">{label}</p>
      </div>
    </Card>
  )
}

/** API sends "09:00:00"; the UI wants "09:00". */
function hhmm(time?: string | null): string | undefined {
  return time ? time.slice(0, 5) : undefined
}

/** Month grid cells, Monday-first, with leading nulls for alignment. */
function buildMonthCells(
  month: dayjs.Dayjs,
  calendar: Record<string, string>,
  today: dayjs.Dayjs,
  holidays: Holiday[],
): (Cell | null)[] {
  const first = month.startOf('month')
  const daysInMonth = month.daysInMonth()
  const lead = (first.day() + 6) % 7 // Monday-first offset
  const cells: (Cell | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const day = first.date(d)
    const date = day.format('YYYY-MM-DD')
    const raw = calendar[date]
    cells.push({
      date,
      day: d,
      status: mapCalStatus(raw),
      // Only days with no verdict at all: a leave or trip booked for next week
      // is real information and stays coloured.
      future: !raw && day.isAfter(today, 'day'),
      today: day.isSame(today, 'day'),
      holiday: holidayOn(holidays, day),
    })
  }
  return cells
}
