import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { isScheduledWeekday } from '@/lib/workCycle'
import { dayMonth } from '@/lib/format'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import dayjs, { type Dayjs } from 'dayjs'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, FileText, LogIn, LogOut, MapPin, Phone, PhoneCall } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { useAttendance } from '@/features/attendance/useAttendance'
import {
  eventDirection,
  eventLocation,
  formatDayRange,
  insideMinutes,
  turnstileName,
  useMonthEvents,
} from '@/features/attendance/useDayEvents'
import { CAL_COLOR, CAL_LABEL, mapCalStatus, type CalStatus } from '@/features/attendance/attendanceStatus'
import { useMonthDocuments } from '@/features/attendance/useDayDocuments'
import { holidayOn, useHolidayRange } from '@/features/holidays/useHolidays'
import { usePhoneContact } from '@/features/phone/usePhoneDirectory'
import { useAuthStore } from '@/store/authStore'
import { pathVerdict } from '@/components/layout/navConfig'
import { PassDetailModal } from './PassDetailModal'
import type { AttendanceRow } from '@/types/dashboard'

/**
 * AN EMPLOYEE'S MONTH, opened from any person on the home board (2026-09-24).
 *
 * The user asked for v1's «Davomat statistikasi» calendar — schedule chip,
 * actual first-in/last-out, holiday / day-off / trip chips per day — with one
 * addition: pick ANY day and see that day's passes. So the day's detail sits
 * beside the month instead of in a second modal, and every past day is
 * selectable, not only the ones with passes.
 *
 * Built from what already exists: the month statuses (`/normalized`), the
 * month's passes (`useMonthEvents`), holidays, and the orders / requests that
 * explain a day. Phone numbers are open information (user, 2026-09-24).
 */
export interface CalendarPerson {
  id: number
  name?: string | null
  photo?: string | null
  position?: string | null
  department?: string | null
}

const hhmm = (t?: string | null) => (t ?? '').slice(0, 5)
/** «998909491277» → «+998 90 949 12 77»; anything else is shown as stored. */
const fmtPhone = (raw: string) => {
  const d = raw.replace(/\D/g, '')
  if (d.length === 12) return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`
  if (d.length === 9) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`
  return raw
}

/**
 * One calendar for the whole board: any person row anywhere on it (a drill
 * popup, a ranking, the attendance list) calls `useOpenPerson()(person)`.
 * Outside a provider it falls back to the profile page.
 */
const OpenPersonCtx = createContext<((p: CalendarPerson) => void) | null>(null)

export function PersonCalendarProvider({ children }: { children: ReactNode }) {
  const [person, setPerson] = useState<CalendarPerson | null>(null)
  return (
    <OpenPersonCtx.Provider value={setPerson}>
      {children}
      <EmployeeCalendarModal person={person} onClose={() => setPerson(null)} />
    </OpenPersonCtx.Provider>
  )
}

export function useOpenPerson() {
  const open = useContext(OpenPersonCtx)
  const navigate = useNavigate()
  return useCallback(
    (p: CalendarPerson) => (open ? open(p) : navigate(`/employees/${p.id}`)),
    [open, navigate],
  )
}

export function EmployeeCalendarModal({ person, onClose }: { person: CalendarPerson | null; onClose: () => void }) {
  if (!person) return null
  return <CalendarBody person={person} onClose={onClose} />
}

function CalendarBody({ person, onClose }: { person: CalendarPerson; onClose: () => void }) {
  const { t } = useTranslation()
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const today = dayjs().startOf('day')
  const [picked, setPicked] = useState<Dayjs>(today)
  const from = month.format('YYYY-MM-DD')
  const monthEnd = month.endOf('month')
  // The whole month is asked for, coming days included: an order / leave /
  // trip entered ahead must show here too. The server leaves a coming day
  // without such a mark empty — it never invents an absence.
  const to = monthEnd.format('YYYY-MM-DD')

  const att = useAttendance({ from, to, page: 1, size: 1, employeeId: person.id })
  const row = att.rows[0]
  const cal = row?.attendance?.calendar ?? {}
  const lateBy = row?.attendance?.daily_late_minutes ?? {}
  const { byDay, loading: evLoading } = useMonthEvents(person.id, month)
  const holidays = useHolidayRange(from, monthEnd.format('YYYY-MM-DD'))
  const docs = useMonthDocuments(person.id, from, monthEnd.format('YYYY-MM-DD'))
  const contact = usePhoneContact(person.id)
  // The profile link only for an account that may open employee profiles —
  // an ordinary employee looking at a colleague gets the calendar, not the file.
  const user = useAuthStore((s) => s.user)
  const canProfile = pathVerdict(`/employees/${person.id}`, user) === 'ok'
  const [pass, setPass] = useState<import('@/features/attendance/useDayEvents').TurnstileEvent | null>(null)
  const passRow = useMemo<AttendanceRow | null>(() => {
    if (!pass) return null
    const entry = eventDirection(pass) === 'entry'
    return {
      id: person.id,
      employee: {
        id: person.id,
        legal_name: person.name ?? row?.legal_name ?? '',
        photo_path: row?.photo_path ?? person.photo ?? null,
        photo_thumb_path: row?.photo_thumb_path ?? person.photo ?? null,
        job_position: person.position ?? '',
        department: row?.department ?? null,
      },
      turnstile: turnstileName(pass),
      entry: entry ? pass : null,
      exit: entry ? null : pass,
      hasExited: !entry,
      category: 'present',
    } as unknown as AttendanceRow
  }, [pass, person, row])

  const start = hhmm(row?.working_hours_start) || '09:00'
  const end = hhmm(row?.working_hours_end) || '18:00'
  // Two-week-cycle part-timers work different days in alternate weeks.
  const isWorkDay = (d: Dayjs) => isScheduledWeekday(row, d.format('YYYY-MM-DD'))
  const weekdays = t('date.weekdays', { returnObjects: true }) as unknown as string[]
  const monthName = (t('date.months', { returnObjects: true }) as unknown as string[])[month.month()]

  // Monday-first grid, whole weeks.
  const cells = useMemo(() => {
    const first = month.startOf('month')
    const lead = (first.day() + 6) % 7
    const out: Dayjs[] = []
    for (let i = -lead; out.length < 42; i++) out.push(first.add(i, 'day'))
    const needed = Math.ceil((lead + month.daysInMonth()) / 7) * 7
    return out.slice(0, needed)
  }, [month])

  const statusOf = (d: Dayjs): CalStatus | null => {
    const raw = cal[d.format('YYYY-MM-DD')]
    return raw ? mapCalStatus(raw) : null
  }
  const counts = row?.attendance

  return (
    <Modal
      open
      onClose={onClose}
      size="full"
      bodyFill
      title={
        <span className="flex items-center gap-3">
          <Avatar src={person.photo ?? row?.photo_thumb_path} name={person.name ?? row?.legal_name ?? ''} size={42} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[16px] font-bold">{person.name ?? row?.legal_name}</span>
            <span className="truncate text-[12.5px] font-normal text-fg-subtle">
              {[person.position, person.department].filter(Boolean).join(' · ')}
            </span>
          </span>
        </span>
      }
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-5 pb-5 pt-4 lg:flex-row">
        {/* ── the month ── */}
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays size={17} className="text-brand-strong" />
            <h3 className="m-0 text-[20px] font-extrabold tracking-[-0.02em] text-fg">
              {monthName && monthName[0].toUpperCase() + monthName.slice(1)} {month.year()}
            </h3>
            <div className="ml-2 flex flex-wrap gap-1.5 text-[12px]">
              <Stat tone="success" label={t('attendance.stPresent')} value={counts?.present_days_count} />
              <Stat tone="warning" label={t('attendance.stLate')} value={counts?.late_days_count} />
              <Stat tone="danger" label={t('attendance.stAbsent')} value={counts?.absent_days_count} />
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {contact?.phone_number && (
                <a href={`tel:${contact.phone_number}`} className="flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-fg hover:bg-brand-soft">
                  <Phone size={14} className="text-brand-strong" /> {fmtPhone(contact.phone_number)}
                </a>
              )}
              {contact?.internal_phone_number && (
                <span className="flex items-center gap-1.5 rounded-pill bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-fg">
                  <PhoneCall size={14} className="text-brand-strong" /> {contact.internal_phone_number}
                </span>
              )}
              <span className="mx-1 h-6 w-px bg-border" />
              <NavBtn label={t('common.prev')} onClick={() => setMonth(month.subtract(1, 'month'))}>
                <ChevronLeft size={16} />
              </NavBtn>
              <NavBtn label={t('common.next')} onClick={() => setMonth(month.add(1, 'month'))}>
                <ChevronRight size={16} />
              </NavBtn>
              <button
                type="button"
                onClick={() => {
                  setMonth(today.startOf('month'))
                  setPicked(today)
                }}
                className="h-8 rounded-control bg-brand-soft px-3 text-[12.5px] font-bold text-brand-strong hover:bg-brand/20"
              >
                {t('date.today')}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[12px] font-bold text-fg-muted">
            {[1, 2, 3, 4, 5, 6, 0].map((i) => (
              <div key={i} className="rounded-control bg-surface-2 py-2 capitalize">
                {weekdays?.[i]}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const iso = d.format('YYYY-MM-DD')
              const inMonth = d.month() === month.month()
              const st = statusOf(d)
              const ev = byDay.get(iso)
              const range = formatDayRange(ev)
              const hol = holidayOn(holidays, d)
              const late = lateBy[iso] ?? 0
              const future = d.isAfter(today)
              const off = !hol && (st === 'day_off' || (!st && !isWorkDay(d)))
              const leave = st && !['present', 'late', 'absent', 'early_leave', 'day_off'].includes(st)
              const isPicked = d.isSame(picked, 'day')
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={!inMonth}
                  onClick={() => setPicked(d)}
                  className={cn(
                    'flex min-h-[86px] flex-col gap-1 rounded-inner border p-2 text-left transition-colors',
                    !inMonth && 'invisible',
                    isPicked ? 'border-brand bg-brand-soft/60 ring-1 ring-brand' : 'border-border hover:bg-surface-2',
                    d.isSame(today, 'day') && !isPicked && 'border-brand/50',
                  )}
                >
                  <span className={cn('text-[17px] font-bold leading-none tabular-nums', hol ? 'text-danger' : off ? 'text-fg-subtle' : 'text-fg')}>
                    {d.format('DD')}
                  </span>
                  <span className="mt-auto flex flex-col gap-1">
                    {hol && <Chip className="bg-[#FF60A8]/15 text-[#D6247A] dark:text-[#FF8CC4]">{hol.name}</Chip>}
                    {!hol && off && !ev && <Chip className="bg-danger/10 text-danger">{t('dashboard.cal.dayOff')}</Chip>}
                    {leave && <Chip className="font-semibold" color={CAL_COLOR[st as CalStatus]}>{t(`attendance.${CAL_LABEL[st as CalStatus]}` as never)}</Chip>}
                    {range && (
                      <>
                        {!off && !hol && <Chip className="bg-brand-soft text-brand-strong">{start}–{end}</Chip>}
                        <Chip className={late > 0 ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'}>
                          {range}
                          {late > 0 && <b className="ml-1">+{late}</b>}
                        </Chip>
                      </>
                    )}
                    {!range && st === 'absent' && !future && <Chip className="bg-danger-soft text-danger">{t('attendance.stAbsent')}</Chip>}
                    {/* Present with no turnstile pass (an auto-present employee):
                        without this the day read as an empty cell. */}
                    {!range && (st === 'present' || st === 'late') && <Chip className="bg-success-soft text-success">{t('attendance.stPresent')}</Chip>}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="m-0 text-[11.5px] text-fg-subtle">{t('dashboard.cal.hint')}</p>
        </section>

        {/* ── the picked day ── */}
        <DayPanel
          day={picked}
          status={statusOf(picked)}
          holidayName={holidayOn(holidays, picked)?.name}
          events={byDay.get(picked.format('YYYY-MM-DD'))?.all ?? []}
          loading={evLoading}
          late={lateBy[picked.format('YYYY-MM-DD')] ?? 0}
          plan={isWorkDay(picked) ? `${start}–${end}` : null}
          workEnd={end}
          lunch={{ start: row?.lunch_start_time, end: row?.lunch_end_time }}
          // A colleague's orders / requests are listed only where the viewer may open them.
          documents={docs.forDate(picked.format('YYYY-MM-DD')).filter((d) =>
            pathVerdict(d.href, user) === 'ok',
          )}
          profileHref={canProfile ? `/employees/${person.id}` : null}
          onNavigate={onClose}
          onPass={setPass}
        />
        <PassDetailModal row={passRow} onClose={() => setPass(null)} />
      </div>
    </Modal>
  )
}

function DayPanel({
  day,
  status,
  holidayName,
  events,
  loading,
  late,
  plan,
  workEnd,
  lunch,
  documents,
  profileHref,
  onNavigate,
  onPass,
}: {
  day: Dayjs
  status: CalStatus | null
  holidayName?: string
  events: import('@/features/attendance/useDayEvents').TurnstileEvent[]
  loading: boolean
  late: number
  plan: string | null
  workEnd: string
  lunch: { start?: string | null; end?: string | null }
  documents: ReturnType<ReturnType<typeof useMonthDocuments>['forDate']>
  profileHref: string | null
  onNavigate: () => void
  onPass: (e: import('@/features/attendance/useDayEvents').TurnstileEvent) => void
}) {
  const { t } = useTranslation()
  const weekdays = t('date.weekdays', { returnObjects: true }) as unknown as string[]
  const inside = events.length ? insideMinutes(events, workEnd, lunch) : 0
  const firstIn = events.find((e) => eventDirection(e) === 'entry')
  const lastOut = [...events].reverse().find((e) => eventDirection(e) === 'exit')
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 rounded-card bg-surface-2/60 p-4 lg:w-[340px]">
      <div>
        <p className="m-0 text-[12px] capitalize text-fg-subtle">{weekdays?.[day.day()]}</p>
        <h3 className="m-0 text-[18px] font-extrabold text-fg">
          {dayMonth(day)} {day.year()}
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {holidayName && <Chip className="bg-[#FF60A8]/15 text-[#D6247A] dark:text-[#FF8CC4]">{holidayName}</Chip>}
          {status && (
            <Chip color={CAL_COLOR[status]} className="font-semibold">
              {t(`attendance.${CAL_LABEL[status]}` as never)}
            </Chip>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Kv label={t('dashboard.cal.plan')} value={plan ?? t('dashboard.cal.dayOff')} />
        <Kv label={t('dashboard.cal.fact')} value={firstIn ? `${dayjs(firstIn.happen_time).format('HH:mm')}–${lastOut ? dayjs(lastOut.happen_time).format('HH:mm') : '…'}` : '—'} />
        <Kv label={t('dashboard.cal.late')} value={late > 0 ? t('dashboard.cal.minutes', { count: late }) : '—'} tone={late > 0 ? 'warning' : undefined} />
        <Kv label={t('dashboard.cal.inside')} value={inside ? `${Math.floor(inside / 60)}:${String(inside % 60).padStart(2, '0')}` : '—'} />
      </div>

      {documents.length > 0 && (
        <div className="flex flex-col gap-1">
          {documents.map((d) => (
            <Link key={`${d.kind}-${d.id}`} to={d.href} onClick={onNavigate} className="flex items-center gap-2 rounded-control bg-surface px-2.5 py-2 text-[12.5px] text-fg hover:bg-brand-soft">
              <FileText size={14} className="shrink-0 text-brand-strong" />
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              {d.number && <span className="text-fg-subtle">№{d.number}</span>}
            </Link>
          ))}
        </div>
      )}

      <p className="m-0 flex items-center gap-2 text-[12.5px] font-bold text-fg-muted">
        <Clock3 size={14} /> {t('dashboard.cal.passes', { count: events.length })}
      </p>
      <ol className="flex min-h-[120px] flex-1 flex-col gap-1 overflow-y-auto">
        {loading ? (
          <li className="m-auto text-[12.5px] text-fg-subtle">{t('common.loading')}</li>
        ) : events.length === 0 ? (
          <li className="m-auto text-center text-[12.5px] text-fg-subtle">{t('dashboard.cal.noPasses')}</li>
        ) : (
          events.map((e) => {
            const dir = eventDirection(e)
            const loc = eventLocation(e)
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onPass(e)}
                  title={t('dashboard.cal.openPass')}
                  className="flex w-full items-center gap-2.5 rounded-control bg-surface px-2.5 py-2 text-left transition-colors hover:bg-brand-soft"
                >
                <PassThumb src={e.photo_thumb_path || e.photo_path} entry={dir === 'entry'} />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[12.5px] font-semibold text-fg">{turnstileName(e) || '—'}</span>
                  {loc?.name && (
                    <span className="flex items-center gap-1 truncate text-[11px] text-fg-subtle">
                      <MapPin size={11} /> {loc.name}
                    </span>
                  )}
                </span>
                <span className="flex flex-col items-end leading-tight">
                  <b className="text-[13px] tabular-nums text-fg">{dayjs(e.happen_time).format('HH:mm:ss')}</b>
                  <span className={cn('text-[11px] font-semibold', dir === 'entry' ? 'text-success' : 'text-fg-muted')}>
                    {dir === 'entry' ? t('dashboard.passIn') : t('dashboard.passOut')}
                  </span>
                </span>
                </button>
              </li>
            )
          })
        )}
      </ol>
      {profileHref && (
        <Link to={profileHref} onClick={onNavigate} className="flex items-center justify-center gap-1.5 rounded-control py-2 text-[12.5px] font-bold text-brand-strong hover:bg-brand-soft">
          <ExternalLink size={14} /> {t('dashboard.cal.openProfile')}
        </Link>
      )}
    </aside>
  )
}

/** The gate's snapshot; the direction icon when there is none or it fails to load. */
function PassThumb({ src, entry }: { src?: string | null; entry: boolean }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken)
    return <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} className="h-9 w-9 shrink-0 rounded-[10px] object-cover" />
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px]', entry ? 'bg-success-soft text-success' : 'bg-surface-2 text-fg-muted')}>
      {entry ? <LogIn size={15} /> : <LogOut size={15} />}
    </span>
  )
}

function Chip({ children, className, color }: { children: React.ReactNode; className?: string; color?: string }) {
  return (
    <span
      className={cn('block truncate rounded-[7px] px-1.5 py-[3px] text-center text-[11px] font-semibold leading-tight', className)}
      style={color ? { background: `rgb(var(${color}) / 0.16)`, color: `rgb(var(${color}))` } : undefined}
    >
      {children}
    </span>
  )
}

function Stat({ tone, label, value }: { tone: 'success' | 'warning' | 'danger'; label: string; value?: number }) {
  return (
    <span
      className={cn(
        'rounded-pill px-2.5 py-1 font-semibold',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'danger' && 'bg-danger-soft text-danger',
      )}
    >
      {label} <b className="tabular-nums">{value ?? '—'}</b>
    </span>
  )
}

function Kv({ label, value, tone }: { label: string; value: string; tone?: 'warning' }) {
  return (
    <div className="rounded-control bg-surface px-3 py-2">
      <p className="m-0 text-[11px] text-fg-subtle">{label}</p>
      <p className={cn('m-0 text-[15px] font-bold tabular-nums', tone === 'warning' ? 'text-warning' : 'text-fg')}>{value}</p>
    </div>
  )
}

function NavBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-control bg-surface-2 text-fg hover:bg-brand-soft">
      {children}
    </button>
  )
}
