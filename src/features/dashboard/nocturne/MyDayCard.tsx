import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Avatar } from '@/components/ui/Avatar'
import { eventDirection, formatMinutes, type TurnstileEvent } from '@/features/attendance/useDayEvents'
import { CAL_COLOR, CAL_LABEL } from '@/features/attendance/attendanceStatus'
import type { Employee } from '@/types'
import type { AttendanceSummary } from '@/features/attendance/useAttendance'
import { Panel, PanelEmpty } from './Panel'
import { tipProps } from './boardDrill'
import { ListRow, RowList } from './rows'
import type { MyDay } from './useEmployeeBoard'

/**
 * MENING KUNIM — the employee board's left margin.
 *
 * The HR board opens on the branch; this one opens on YOU. The two readings at
 * the top are the only live ones on the whole screen (what time you badged in,
 * how long you have actually been inside), the three lines under them are the
 * month so far, and the log below is this week — Monday down to today, newest
 * first, because the day you are asking about is almost always the last one.
 */
export function MyDayCard({
  employee,
  arrivedAt,
  workedMinutes,
  summary,
  kpiPercent,
  kpiMonth,
  todayEvents = [],
  onOpenDay,
  week,
  loading,
  className,
  style,
}: {
  employee?: Employee | null
  arrivedAt: string | null
  workedMinutes: number
  summary?: AttendanceSummary
  kpiPercent: number | null
  /** The month the KPI figure belongs to (the latest CLOSED evaluation sheet). */
  kpiMonth?: string
  /** Today's passes — drawn as the day's path. */
  todayEvents?: TurnstileEvent[]
  /** A week row opens the person's own month calendar. */
  onOpenDay?: () => void
  week: MyDay[]
  loading?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const { t } = useTranslation()
  const months = t('date.months', { returnObjects: true })
  const weekdays = t('date.weekdays', { returnObjects: true })

  const jp = employee?.job_position
  const jobName = typeof jp === 'object' ? (jp?.name ?? '') : (jp ?? '')
  const dept = employee?.department
  const deptName = typeof dept === 'object' && dept ? (dept.name ?? '') : ''
  const subtitle = [jobName, deptName].filter(Boolean).join(' · ')

  return (
    <Panel className={className} style={style} label={t('dashboard.board.myDayTitle')}>
      <div className="flex shrink-0 flex-col gap-3.5 px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-3">
          <Avatar
            src={employee?.photo_thumb_path}
            fallbackSrc={employee?.photo_path}
            name={employee?.legal_name}
            size={52}
          />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[15px] font-semibold text-fg">
              {employee?.legal_name ?? t('common.user')}
            </span>
            <span className="truncate text-[12px] text-fg-subtle">
              {subtitle || t('common.positionNotSet')}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Reading
            label={t('dashboard.board.arrivedToday')}
            value={arrivedAt ?? '—'}
            tone="success"
          />
          <Reading
            label={t('dashboard.board.workedToday')}
            value={
              workedMinutes > 0
                ? formatMinutes(workedMinutes, t('common.hourShort'), t('common.minuteShort'))
                : '—'
            }
            tone="brand"
          />
        </div>

        <div className="flex flex-col gap-[7px]">
          <Line
            label={t('dashboard.board.workedDaysThisMonth')}
            value={`${summary?.present_days_count ?? 0}`}
          />
          <Line
            label={t('dashboard.board.lateThisMonth')}
            value={`${summary?.late_days_count ?? 0}`}
            tone="warning"
          />
          <Line
            label={t('dashboard.board.kpiThisMonth', { month: kpiMonth ?? months[dayjs().month()] })}
            value={kpiPercent == null ? '—' : `${Math.round(kpiPercent)}%`}
            tone="success"
          />
        </div>
      </div>

      <DayPath events={todayEvents} />

      <div className="h-px shrink-0 bg-line" />

      <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-3">
        <span className="text-[13px] font-bold text-fg">{t('dashboard.board.myAttendanceTitle')}</span>
        <span className="text-[11px] text-fg-subtle">{t('dashboard.board.thisWeek')}</span>
      </div>

      {week.length === 0 ? (
        <PanelEmpty text={loading ? t('common.loading') : t('dashboard.board.weekEmpty')} />
      ) : (
        <RowList className="gap-1">
          {week.map((d) => {
            const day = dayjs(d.iso)
            const label = `${weekdays[day.day()]}, ${day.date()}-${months[day.month()]}`
            const token = CAL_COLOR[d.status]
            return (
              <ListRow key={d.iso} onClick={onOpenDay}>
                <span
                  className="h-8 w-1 shrink-0 rounded-pill"
                  style={{ background: `rgb(var(${token}))` }}
                />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium capitalize text-fg">
                    {label}
                  </span>
                  <span className="truncate text-[11px] text-fg-subtle [font-variant-numeric:tabular-nums]">
                    {d.range || '—'}
                  </span>
                </span>
                <span
                  className="shrink-0 text-[11px] font-semibold"
                  style={{ color: `rgb(var(${token}))` }}
                >
                  {d.open
                    ? t('dashboard.board.atWork')
                    : t(`attendance.${CAL_LABEL[d.status]}` as never)}
                </span>
              </ListRow>
            )
          })}
        </RowList>
      )}
    </Panel>
  )
}

/**
 * TODAY'S PATH — 07:00 to 23:00, the stretches spent inside as bars and every
 * pass as a tick. «Kirdi 09:02, chiqdi 19:54» says when; the path says how the
 * day went (the lunch break, the afternoon errand) at a glance.
 */
function DayPath({ events }: { events: TurnstileEvent[] }) {
  const { t } = useTranslation()
  if (events.length === 0) return null
  const H0 = 7
  const H1 = 23
  const x = (iso?: string | null) => {
    const d = dayjs(iso)
    const h = d.hour() + d.minute() / 60
    return Math.min(100, Math.max(0, ((h - H0) / (H1 - H0)) * 100))
  }
  const segs: [number, number, string, string][] = []
  let open: TurnstileEvent | null = null
  for (const e of events) {
    if (eventDirection(e) === 'entry') open = open ?? e
    else if (open) {
      segs.push([x(open.happen_time), x(e.happen_time), dayjs(open.happen_time).format('HH:mm'), dayjs(e.happen_time).format('HH:mm')])
      open = null
    }
  }
  if (open) segs.push([x(open.happen_time), x(dayjs().toISOString()), dayjs(open.happen_time).format('HH:mm'), '…'])
  const ins = events.filter((e) => eventDirection(e) === 'entry').length
  return (
    <div className="shrink-0 px-4 pb-3.5">
      <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
        <span className="font-bold text-fg">{t('dashboard.myDay.path')}</span>
        <span className="text-fg-subtle">{t('dashboard.myDay.pathSub', { ins, outs: events.length - ins })}</span>
      </div>
      <div className="relative h-4 rounded-pill bg-fg/[0.06]">
        {segs.map(([a, b, from, to], i) => (
          <span
            key={i}
            {...tipProps(t('dashboard.myDay.inside'), [[from, to]])}
            className="absolute top-0.5 h-3 rounded-pill bg-gradient-to-r from-[#0A70C2] to-[#2FC96B]"
            style={{ left: `${a}%`, width: `${Math.max(1.5, b - a)}%` }}
          />
        ))}
        {events.map((e) => (
          <span
            key={e.id}
            {...tipProps(eventDirection(e) === 'entry' ? t('dashboard.passIn') : t('dashboard.passOut'), [[dayjs(e.happen_time).format('HH:mm'), e.turnstile?.acs_dev_name ?? '']])}
            className="absolute -bottom-1.5 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-fg-subtle"
            style={{ left: `${x(e.happen_time)}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-fg-subtle">
        {[7, 9, 11, 13, 15, 17, 19, 21, 23].map((h) => (
          <span key={h}>{String(h).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  )
}

function Reading({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'success' | 'brand'
}) {
  return (
    <div
      className={`flex flex-1 flex-col gap-px rounded-control px-3 py-2.5 leading-tight ${
        tone === 'success' ? 'bg-success/[0.09]' : 'bg-brand/[0.09]'
      }`}
    >
      <span className="text-[11.5px] font-semibold text-fg-muted">{label}</span>
      <span
        className={`text-[24px] font-extrabold tracking-[-0.03em] [font-variant-numeric:tabular-nums] ${
          tone === 'success' ? 'text-success' : 'text-brand-strong'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function Line({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'warning' | 'success'
}) {
  const cls = tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-fg'
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] text-fg-muted">
      <span className="truncate">{label}</span>
      <span className={`shrink-0 font-semibold [font-variant-numeric:tabular-nums] ${cls}`}>
        {value}
      </span>
    </div>
  )
}
