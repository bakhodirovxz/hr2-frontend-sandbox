import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  Cake,
  CheckCircle2,
  Clock,
  IdCard,
  Trophy,
  Users,
  AlertTriangle,
  XCircle,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { PageContainer } from '@/components/layout/Page'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { formatTime } from '@/features/dashboard/attendance'
import { useBranchStore } from '@/store/branchStore'
import { WS_STATUS } from '@/features/monitoring/useAttendanceSocket'
import { ijroTabRange, useMonitoring, type OverdueTask } from '@/features/monitoring/useMonitoring'
import { useLateEmployees } from '@/features/dashboard/useLateEmployees'
import type { AttendanceRow, Birthday, TurnstileEvent } from '@/types/dashboard'
import { PassDetailModal } from '@/features/dashboard/nocturne/PassDetailModal'
import type { LateEmployeeRow } from '@/features/dashboard/useLateEmployees'

/**
 * MONITORING — the wall board.
 *
 * Ported from the Claude Design project afd32a12, screen "Monitoring"
 * (2026-08-28). This screen is read from across a room by people who are not
 * operating it, so it is built to a different rule than the rest of the app:
 * NOTHING is behind a click. Three columns, every panel scrolls on its own,
 * and the whole thing fills the viewport rather than the document.
 *
 *   left   — who is doing well, who keeps being late, whose birthday is near
 *   centre — today's four numbers, then the one table that needs the room:
 *            overdue executive tasks, filterable by month
 *   right  — the two live registers: guests at the gate, and who came in late
 *
 * ⚠️ DRAWN IN THE NIGHT PALETTE, BUILT IN TOKENS. The design arrived as the
 * dark screen; the user asked for light everywhere. Every colour here is a
 * token, so the board reads in both renditions without a second stylesheet.
 */

/* ── Panel ─────────────────────────────────────────────────────────────── */

function Panel({
  title,
  icon,
  tone,
  extra,
  grow,
  children,
}: {
  title: string
  icon: React.ReactNode
  /** The wash across the panel's top-left — the design gives each block its
   *  own tint so the wall reads as regions, not a grid of identical boxes. */
  tone: 'success' | 'danger' | 'brand' | 'info' | 'warning'
  extra?: React.ReactNode
  grow?: string
  children: React.ReactNode
}) {
  return (
    <section
      className="flex min-h-0 flex-col overflow-hidden rounded-2xl bg-surface shadow-md"
      style={{
        flex: grow ?? '1',
        backgroundImage: `linear-gradient(165deg, rgb(var(--${tone}-mark, var(--${tone})) / 0.07), transparent 50%)`,
      }}
    >
      <div className="flex shrink-0 items-center gap-2 px-3.5 pb-2 pt-3">
        <span className={cn('shrink-0', `text-${tone}`)}>{icon}</span>
        <span className="text-[12px] font-semibold text-fg">{title}</span>
        {extra && <span className="ml-auto flex items-center gap-1">{extra}</span>}
      </div>
      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-[3px] overflow-y-auto px-2 pb-2.5">
        {children}
      </div>
    </section>
  )
}

const ROW = 'flex items-center gap-2.5 rounded-inner px-2 py-1.5 transition-colors hover:bg-surface-2'

function Name({ name, sub, photo }: { name: string; sub?: string | null; photo?: string | null }) {
  return (
    <>
      <Avatar src={photo} name={name} size={28} className="shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[12px] font-medium text-fg">{name}</span>
        {sub && <span className="truncate text-[10.5px] text-fg-subtle">{sub}</span>}
      </span>
    </>
  )
}

/** Jonli belgi. ⚠️ `live=false` bo'lganda PULSLAMAYDI va so'nadi — aks holda
 *  aloqa uzilganda ham taxta «jonli» ko'rinib, eski ma'lumotni yangidek
 *  ko'rsatardi. */
function Pulse({ tone, live = true }: { tone: 'success' | 'info'; live?: boolean }) {
  return (
    <span
      className={cn(
        'h-1.5 w-1.5 rounded-pill',
        live ? 'animate-pulse' : 'opacity-40',
        tone === 'success' ? 'bg-success-mark' : 'bg-info',
      )}
    />
  )
}

/* ── Page ──────────────────────────────────────────────────────────────── */

export function MonitoringPage() {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  // v1: the Ijro table opens on the CURRENT month's tab.
  const [monthIdx, setMonthIdx] = useState(() => dayjs().month() + 1)
  const m = useMonitoring(branchId, monthIdx)
  const stats = m.stats as Record<string, number | undefined>

  /**
   * KECH QOLGANLAR — SERVERDAN, brauzerda hisoblanmaydi (v1 pariteti).
   *
   * The board used to build this list itself out of the raw turnstile feed:
   * first entrance of the day vs `working_hours_start`. That rule does not
   * know the navbatchilik shift, a rest day, a night shift, or the leave and
   * order excuses the server already applies — so the wall could brand
   * someone late while the attendance screen called the same day a rest day,
   * with nothing on screen to say which was right. Web v1 closed exactly this
   * by reading `GET /dashboard/late-employees`; v2 now reads the same answer.
   *
   * The live socket is still what makes the panel feel live: a pass event
   * re-runs this query (below) instead of appending a browser verdict to it.
   */
  const late = useLateEmployees({ branchId })

  /**
   * Jonli hodisa kelganda ro'yxat qayta so'raladi — lekin THROTTLE bilan, eng
   * ko'pi 30 soniyada bir marta (v1 dagi qoidaning o'zi).
   *
   * WHY THROTTLED. Morning rush puts a pass through the socket every couple of
   * seconds; refetching on each one would be a heavy query several times a
   * minute for a list that can only change when somebody walks in late. The
   * 2s floor is there so the FIRST event after a quiet spell still lands
   * quickly — the panel must not look frozen for half a minute.
   */
  const lateRefetch = late.refetch
  const passCount = m.employeeEvents.length
  const lateTimer = useRef<number | null>(null)
  const lateLastAt = useRef(0)
  useEffect(() => {
    if (!passCount || !branchId) return
    if (lateTimer.current) return
    const wait = Math.max(2_000, 30_000 - (Date.now() - lateLastAt.current))
    lateTimer.current = window.setTimeout(() => {
      lateTimer.current = null
      lateLastAt.current = Date.now()
      void lateRefetch()
    }, wait)
  }, [passCount, branchId, lateRefetch])
  useEffect(
    () => () => {
      if (lateTimer.current) window.clearTimeout(lateTimer.current)
    },
    [],
  )

  // «Barchasi» + 12 oy. Oy SERVERDA filtrlanadi (useMonitoring → date_from/to).
  const months = useMemo(
    () => [
      t('monitoring.allMonths'),
      ...Array.from({ length: 12 }, (_, i) => t(`date.month_${i + 1}` as 'date.month_1')),
    ],
    [t],
  )

  // Chip count = tasks whose deadline falls in the month the tab reports on
  // (the previous one); an empty chip is a dead click.
  const monthCounts = useMemo(() => {
    const c = Array(13).fill(0) as number[]
    for (let i = 1; i <= 12; i++) {
      const r = ijroTabRange(i)
      if (r) c[i] = m.overdueByMonth[r.from.slice(0, 7)] ?? 0
    }
    return c
  }, [m.overdueByMonth])

  const violations = useMemo(() => {
    const list = m.overdueTasks as (OverdueTask & {
      task_index?: string
      deadline_date?: string
      task_completed?: string | null
    })[]
    return list
      .map((v, i) => {
        const deadline = v.deadline_date ?? v.deadline ?? null
        // Kechikish: bajarilgan bo'lsa bajarilgan sanagacha, aks holda BUGUNGACHA.
        const end = v.task_completed ? dayjs(v.task_completed) : dayjs()
        const days = deadline ? Math.max(0, end.diff(dayjs(deadline), 'day')) : 0
        const mo = Math.floor(days / 30)
        return {
          key: v.id,
          num: `${i + 1}.`,
          name: v.employee?.legal_name || t('common.unknown'),
          photo: v.employee?.photo_thumb_path ?? null,
          position:
            (v.employee as { job_position?: { name?: string } } | null)?.job_position?.name ||
            v.department?.name ||
            '',
          reg: v.task_index ? `№ ${v.task_index}` : '—',
          deadline: deadline ? dayjs(deadline).format('DD.MM.YYYY') : '—',
          overdue: mo
            ? t('monitoring.overdueMonths', { months: mo, days: days % 30 })
            : t('monitoring.overdueDays', { count: days }),
        }
      })
  }, [m.overdueTasks, t])

  const live = m.wsStatus === WS_STATUS.CONNECTED

  const cards = [
    { key: 'total', icon: <Users size={19} />, tone: 'brand', label: t('monitoring.totalEmployees'), value: stats.total_employees_count ?? 0 },
    { key: 'present', icon: <CheckCircle2 size={19} />, tone: 'success', label: t('monitoring.presentToday'), value: stats.present_employees_count ?? 0 },
    // ⚠️ Zaxira son ham endi SERVER ro'yxatidan olinadi — brauzer hisobidan
    // emas. Aks holda kartochka bir raqamni, yonidagi panel boshqasini
    // ko'rsatishi mumkin edi.
    { key: 'late', icon: <Clock size={19} />, tone: 'warning', label: t('monitoring.lateToday'), value: stats.late_employees_count ?? late.latecomers.length },
    { key: 'absent', icon: <XCircle size={19} />, tone: 'danger', label: t('monitoring.absentToday'), value: stats.absent_employees_count ?? 0 },
  ] as const

  /* The pass the reader clicked open in the latecomers panel. */
  const [latePass, setLatePass] = useState<LateEmployeeRow | null>(null)

  if (!branchId) {
    return (
      <PageContainer>
        <EmptyState title={t('monitoring.pickBranch')} />
      </PageContainer>
    )
  }


  return (
    <div className="flex flex-col gap-3.5 p-4 sm:p-5 xl:h-full xl:min-h-0 xl:flex-row">
      {/* ── Chap ustun ───────────────────────────────────────────────── */}
      <aside className="flex shrink-0 flex-col gap-3.5 xl:w-[300px] xl:min-h-0">
        <Panel title={t('monitoring.topEmployees')} icon={<Trophy size={15} />} tone="success" grow="1.2">
          {m.topEmployees.length === 0 ? (
            <Empty text={t('monitoring.noData')} />
          ) : (
            m.topEmployees.slice(0, 8).map((e, i) => {
              const pct = Math.round(Number(e.kpi_percentage ?? 0))
              return (
                <div key={e.id} className={ROW}>
                  <span className="w-3.5 text-[11px] text-fg-subtle [font-variant-numeric:tabular-nums]">
                    {i + 1}.
                  </span>
                  <Name name={e.legal_name ?? ''} sub={e.job_position_name} photo={e.photo_thumb_path || e.photo_path} />
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="h-[3px] w-11 overflow-hidden rounded-pill bg-fg/10">
                      <span
                        className="block h-full rounded-pill bg-success-mark"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </span>
                    <span className="text-[11px] font-semibold text-success [font-variant-numeric:tabular-nums]">
                      {pct}%
                    </span>
                  </span>
                </div>
              )
            })
          )}
        </Panel>

        {m.seesLateness && (
        <Panel title={t('monitoring.frequentLate')} icon={<AlertTriangle size={15} />} tone="danger" grow="1.2">
          {m.frequentLate.length === 0 ? (
            <Empty text={t('monitoring.noLate')} />
          ) : (
            m.frequentLate.map((r, i) => (
              <div key={r.employee_id ?? i} className={ROW}>
                <span className="w-3.5 text-[11px] text-fg-subtle [font-variant-numeric:tabular-nums]">
                  {i + 1}.
                </span>
                <Name
                  name={r.employee_name ?? ''}
                  sub={r.job_position_name ?? r.department_name ?? undefined}
                  photo={r.photo_path}
                />
                <span className="shrink-0 rounded-pill bg-danger/[0.12] px-2.5 py-[3px] text-[10.5px] font-semibold text-danger">
                  {t('monitoring.timesLate', { count: r.late_count ?? 0 })}
                </span>
              </div>
            ))
          )}
        </Panel>
        )}

        <Panel title={t('monitoring.birthdays')} icon={<Cake size={15} />} tone="brand">
          {m.birthdays.length === 0 ? (
            <Empty text={t('monitoring.noBirthdays')} />
          ) : (
            (m.birthdays as Birthday[]).slice(0, 8).map((b) => (
              <div key={b.id} className={ROW}>
                <Name
                  name={b.legal_name ?? ''}
                  sub={typeof b.job_position === 'string' ? b.job_position : b.job_position?.name}
                  photo={b.photo_thumb_path}
                />
                <span
                  className={cn(
                    'shrink-0 text-[10.5px] font-semibold',
                    b.days_left === 0 ? 'text-success' : 'text-fg-subtle',
                  )}
                >
                  {b.days_left === 0
                    ? t('monitoring.birthdayToday')
                    : t('monitoring.inDays', { count: b.days_left ?? 0 })}
                </span>
              </div>
            ))
          )}
        </Panel>
      </aside>

      {/* ── Markaz ───────────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 xl:min-h-0">
        <div className="grid shrink-0 grid-cols-2 gap-3.5 lg:grid-cols-4">
          {cards.map((c) => (
            <div
              key={c.key}
              className="flex items-center gap-3 rounded-xl bg-surface p-3.5 shadow-md"
              style={{
                backgroundImage: `linear-gradient(160deg, rgb(var(--${c.tone}-mark, var(--${c.tone})) / 0.13), transparent 60%)`,
              }}
            >
              <span
                className={cn(
                  'grid h-[42px] w-[42px] shrink-0 place-items-center rounded-xl',
                  `bg-${c.tone}/[0.14] text-${c.tone}`,
                )}
              >
                {c.icon}
              </span>
              <span className="flex min-w-0 flex-col leading-tight">
                {/* ⚠️ `truncate` EMAS: «Bugun kech qolganlar» bitta qatorga
                    sig'maydi va «BUGUN KECH QO…» bo'lib kesilardi — devordan
                    o'qiladigan taxtada yorliq to'liq turishi kerak. */}
                <span className="text-[11.5px] leading-[1.25] text-fg-subtle">
                  {c.label}
                </span>
                <span className={cn('text-[26px] font-bold [font-variant-numeric:tabular-nums]', `text-${c.tone}`)}>
                  {c.value}
                </span>
              </span>
            </div>
          ))}
        </div>

        <section
          className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface shadow-md"
          style={{ backgroundImage: 'linear-gradient(165deg, rgb(var(--danger-mark) / 0.06), transparent 45%)' }}
        >
          <div className="flex shrink-0 flex-col gap-2.5 px-4 pb-2.5 pt-3.5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={17} className="text-danger" />
              <h2 className="text-base font-semibold text-fg">{t('monitoring.violationsTitle')}</h2>
              {/* v1 rule: a month's tab reports the month BEFORE it. */}
              {monthIdx > 0 && (
                <span className="ml-auto text-[11.5px] text-fg-subtle">
                  {t('monitoring.deadlinesOf', { month: t(`date.month_${((monthIdx + 10) % 12) + 1}` as 'date.month_1') })}
                </span>
              )}
            </div>
            {/* One scrolling row: wrapped, «Dekabr» sat alone on a second line. */}
            <div className="scroll-thin -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {months.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setMonthIdx(i)}
                  aria-pressed={monthIdx === i}
                  disabled={i > 0 && monthCounts[i] === 0 && monthIdx !== i}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-default disabled:opacity-40',
                    monthIdx === i
                      ? 'bg-brand text-fg-on-brand'
                      : 'bg-fg/[0.06] text-fg-muted enabled:hover:bg-fg/[0.12] enabled:hover:text-fg',
                  )}
                >
                  {label}
                  {monthCounts[i] > 0 && <span className={cn('tabular-nums', monthIdx === i ? 'opacity-80' : 'text-fg-subtle')}>{monthCounts[i]}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="scroll-thin min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="sticky top-0 z-10 bg-danger/[0.05] backdrop-blur">
                <tr className="text-[11.5px] text-fg-subtle">
                  <th className="w-12 px-4 py-2 text-left font-semibold">№</th>
                  <th className="px-2 py-2 text-left font-semibold">{t('monitoring.colName')}</th>
                  <th className="w-[120px] px-2 py-2 text-left font-semibold">{t('monitoring.colReg')}</th>
                  <th className="w-[110px] px-2 py-2 text-center font-semibold">{t('monitoring.colDeadline')}</th>
                  <th className="w-[150px] px-4 py-2 text-center font-semibold">{t('monitoring.colOverdue')}</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.key} className="transition-colors hover:bg-surface-2">
                    <td className="px-4 py-2 text-[12px] text-fg-subtle [font-variant-numeric:tabular-nums]">
                      {v.num}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2.5">
                        <Name name={v.name} sub={v.position} photo={v.photo} />
                      </span>
                    </td>
                    <td className="px-2 py-2 text-[12px] text-fg-muted [font-variant-numeric:tabular-nums]">
                      {v.reg}
                    </td>
                    <td className="px-2 py-2 text-center text-[12px] text-fg-muted [font-variant-numeric:tabular-nums]">
                      {v.deadline}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className="rounded-pill bg-danger/[0.12] px-2.5 py-[3px] text-[11px] font-semibold text-danger">
                        {v.overdue}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {violations.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-fg-subtle">
                <CheckCircle2 size={34} className="text-success/50" />
                <span className="text-[13px]">{t('monitoring.noViolations')}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── O'ng ustun ───────────────────────────────────────────────── */}
      <aside className="flex shrink-0 flex-col gap-3.5 xl:w-[330px] xl:min-h-0">
        <Panel
          title={t('monitoring.guestsLive')}
          icon={<IdCard size={15} />}
          tone="info"
          extra={<Pulse tone="info" live={live} />}
        >
          {m.visitorEvents.length === 0 ? (
            <Empty text={t('monitoring.noGuests')} />
          ) : (
            (m.visitorEvents as TurnstileEvent[]).slice(0, 20).map((g, i) => (
              <div key={g.id ?? i} className={ROW}>
                <Name
                  name={
                    (g as { invitation?: { guest_name?: string } }).invitation?.guest_name ||
                    g.employee?.legal_name ||
                    t('common.unknown')
                  }
                  sub={(g as { invitation?: { host_name?: string } }).invitation?.host_name ?? g.turnstile_name}
                  photo={g.photo_thumb_path || g.photo_path || g.employee?.photo_thumb_path}
                />
                <span className="flex shrink-0 flex-col items-end leading-tight">
                  <span className="text-[11.5px] text-fg-muted [font-variant-numeric:tabular-nums]">
                    {formatTime(g.happen_time)}
                  </span>
                  <span className="text-[10px] font-semibold text-success">
                    {t('monitoring.entered')}
                  </span>
                </span>
              </div>
            ))
          )}
        </Panel>

        <Panel
          title={t('monitoring.lateLive')}
          icon={<Clock size={15} />}
          tone="warning"
          grow="1.6"
          extra={
            <span className="flex items-center gap-1">
              <Pulse tone="success" live={live} />
              <span
                className={cn(
                  'text-[9px] font-bold tracking-[0.12em]',
                  live ? 'text-success' : 'text-fg-subtle',
                )}
              >
                {live ? 'LIVE' : t('monitoring.offline')}
              </span>
            </span>
          }
        >
          {late.latecomers.length === 0 ? (
            <Empty text={t('monitoring.noLateToday')} />
          ) : (
            late.latecomers.map((l) => (
              <button
                type="button"
                key={l.event_id ?? l.employee_id}
                onClick={() => setLatePass(l)}
                className={cn(ROW, 'w-full text-left transition-colors hover:bg-surface-2/60')}
              >
                <Name
                  name={l.employee?.legal_name ?? ''}
                  sub={l.employee?.department?.name}
                  /* THE GATE SNAPSHOT, not the profile portrait. The server
                     started returning `pic_uri`/`photo_path` for exactly this
                     (and `useLateEmployees` already typed them), but the row
                     kept reading the stale profile thumbnail — so the one
                     picture that proves who actually walked through was never
                     the one on screen. `pic_uri` is HikCentral's `Vsm://…`
                     locator (not fetchable by a browser), so only a real URL
                     is taken, in snapshot → profile order. */
                  photo={[l.photo_path, l.pic_uri, l.employee?.photo_thumb_path].find((v) => !!v && /^(https?:)?\//.test(v)) ?? null}
                />
                <span className="flex shrink-0 flex-col items-end gap-0.5 leading-tight">
                  <span className="rounded-pill bg-danger/[0.12] px-2 py-px text-[10px] font-semibold text-danger">
                    {/* ⚠️ Oldingi minus OLIB TASHLANDI: `lateBy` matnining
                        o'zi «+{{count}} daq», ya'ni qator «−+15 daq» bo'lib
                        chiqardi. Kechikish MUSBAT daqiqa. */}
                    {t('dashboard.board.lateBy', { count: l.late_minutes })}
                  </span>
                  <span className="text-[11.5px] text-fg-muted [font-variant-numeric:tabular-nums]">
                    {formatTime(l.happen_time)}
                  </span>
                </span>
              </button>
            ))
          )}
        </Panel>
      </aside>

      {/*
        v1 gives this row a target: clicking a latecomer opens the pass — which
        gate, at what time, and how far that gate is from the person's own
        branch. In v2 the row was inert, so the panel could flag someone as late
        and then offer no way to look into it. `PassDetailModal` already exists
        and is wired from the tabel; it only ever needed this second caller.
      */}
      <PassDetailModal row={toAttendanceRow(latePass)} lateMinutes={latePass?.late_minutes} onClose={() => setLatePass(null)} />
    </div>
  )
}

/**
 * Adapts a latecomer row to what `PassDetailModal` reads.
 *
 * ⚠️ THE CAST IS DELIBERATE AND NARROW. `LateEmployeeRow.employee` declares
 * only the handful of fields the board prints ({name} shaped department and
 * position), while `Employee` describes the full record. The modal touches
 * `legal_name`, the photo, the position title and `department.organization_branch_id`
 * — all present or safely absent here — so widening the row is cheaper than
 * merging the two employee declarations, which is a separate job.
 */
function toAttendanceRow(l: LateEmployeeRow | null): AttendanceRow | null {
  if (!l) return null
  const entry = {
    happen_time: l.happen_time,
    direction_type: l.direction_type ?? 'entrance',
    turnstile: l.turnstile ?? null,
  } as TurnstileEvent
  return {
    id: l.employee_id,
    employee: {
      ...(l.employee ?? {}),
      id: l.employee?.id ?? l.employee_id,
      // The board's row knows the person's OWN branch; the modal reads it off
      // `department` to measure the distance to the gate.
      department: l.employee?.department
        ? { ...l.employee.department, organization_branch_id: l.employee_branch_id ?? undefined }
        : l.employee_branch_id
          ? { organization_branch_id: l.employee_branch_id }
          : null,
    },
    turnstile: l.turnstile?.acs_dev_name ?? null,
    entry,
    exit: null,
    hasExited: false,
    category: 'late',
  } as AttendanceRow
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-[12px] text-fg-subtle">{text}</p>
}
