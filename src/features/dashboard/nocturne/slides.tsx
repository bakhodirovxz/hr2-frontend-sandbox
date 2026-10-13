import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { inTashkent } from '@/lib/format'
import { Building2 } from 'lucide-react'
import { formatTime } from '@/features/dashboard/attendance'
import type { StatusCounts } from '@/features/dashboard/attendance'
import type { LateRankRow } from '@/features/dashboard/useKadrBlocks'
import type { Birthday, NewsPost, TurnstileEvent } from '@/types/dashboard'
import { Donut, DonutLegend, type DonutSlice } from './Donut'
import { PanelEmpty } from './Panel'
import { IconCell, ListRow, PersonCell, RowList, StatusPill, ToneText } from './rows'
import { guestRow } from './guestRow'
import type {
  DepartmentAttendance,
  IjroTask,
  KpiSummary,
  OverdueSummary,
  TopEmployee,
  VisitorCounters,
} from './useBoardData'

/** The body of a carousel face: a padded column that fills the window. */
function Face({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`flex min-h-0 flex-1 flex-col ${className ?? ''}`}>{children}</div>
}

/* ── Xodimlar holati ────────────────────────────────────────────────────── */

/**
 * Which statuses the attendance page can actually be narrowed to.
 *
 * Its `filter_type` accepts `late` and `absent` and nothing else, so only those
 * two get a way through. Sending "vacation" there would land on an unfiltered
 * page — a link that lies about where it goes is worse than no link.
 */
const ROSTER_LINK: Record<string, string> = {
  late: '/employee-attendance?type=late',
  absent: '/employee-attendance?type=absent',
}

/** Legend key → the attendance popup's tab (B board). */
const OPEN_TAB: Record<string, 'arrived' | 'late' | 'absent' | 'other'> = {
  present: 'arrived',
  late: 'late',
  absent: 'absent',
  vacation: 'other',
  trip: 'other',
  sick: 'other',
}

export function StatusRingFace({
  counts,
  onOpen,
}: {
  counts: StatusCounts
  /** When given, a legend row opens the people behind it instead of narrowing the ring. */
  onOpen?: (tab: 'arrived' | 'late' | 'absent' | 'other') => void
}) {
  const { t } = useTranslation()
  const [picked, setPicked] = useState<string | null>(null)
  const slices: DonutSlice[] = [
    { key: 'present', label: t('dashboard.donut.present'), value: counts.present, token: '--chart-1' },
    { key: 'late', label: t('dashboard.donut.late'), value: counts.late, token: '--chart-2' },
    { key: 'absent', label: t('dashboard.donut.absent'), value: counts.absent, token: '--chart-3' },
    { key: 'vacation', label: t('status.vacation'), value: counts.vacation + counts.leave + counts.dekret, token: '--chart-4' },
    { key: 'trip', label: t('status.trip'), value: counts.trip, token: '--chart-5' },
    { key: 'sick', label: t('status.sick'), value: counts.sick, token: '--chart-6' },
  ]
  const link = picked ? ROSTER_LINK[picked] : undefined

  // A 116 px ring leaves the legend ~150 px in the 280 px board column of a
  // 1280 px laptop; at 148 px the labels collapsed to «Kel…», «Ke…», «K…»
  // (audit 2026-09-21). The face has a fixed height, so wrapping is not an
  // option here — the ring gives way instead.
  return (
    <Face className="!flex-row items-center gap-4 px-4 pb-3 pt-2 sm:px-5">
      <Donut
        slices={slices}
        total={counts.total}
        caption={t('dashboard.totalCenter')}
        activeKey={picked}
        size={116}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <DonutLegend
          slices={slices}
          activeKey={picked}
          onSelect={onOpen ? (key) => key && onOpen(OPEN_TAB[key]) : setPicked}
        />
        {link && (
          <Link
            to={link}
            className="inline-flex items-center gap-1 self-start rounded-control px-1.5 text-[11.5px] font-medium text-brand-strong hover:underline"
          >
            {t('dashboard.board.openList')} →
          </Link>
        )}
      </div>
    </Face>
  )
}

/* ── Yangiliklar ────────────────────────────────────────────────────────── */

export function NewsFace({ news }: { news: NewsPost[] }) {
  const { t } = useTranslation()
  if (news.length === 0) return <PanelEmpty text={t('dashboard.board.newsEmpty')} />
  return (
    <RowList className="gap-2 pt-1">
      {news.map((n) => (
        <div
          key={n.id}
          className="flex flex-1 flex-col justify-center gap-1 rounded-inner bg-fg/[0.035] px-3.5 py-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-fg">{n.title ?? '—'}</span>
            {n.created_at && (
              <span className="shrink-0 text-[11px] text-fg-subtle">
                {inTashkent(n.created_at).format('DD.MM.YYYY')}
              </span>
            )}
          </div>
          {n.description && (
            <p className="m-0 line-clamp-3 text-[12px] leading-[1.45] text-fg-muted">
              {n.description}
            </p>
          )}
        </div>
      ))}
    </RowList>
  )
}

/* ── Tug'ilgan kunlar ───────────────────────────────────────────────────── */

export function BirthdaysFace({ birthdays }: { birthdays: Birthday[] }) {
  const { t } = useTranslation()
  if (birthdays.length === 0) return <PanelEmpty text={t('dashboard.birthdaysEmpty')} />
  return (
    <RowList className="pt-1">
      {birthdays.slice(0, 6).map((b) => {
        const jp = b.job_position
        const days = b.days_left ?? 0
        return (
          <ListRow key={b.id} filled className="max-h-[58px]">
            <PersonCell
              name={b.legal_name ?? t('common.unknown')}
              sub={typeof jp === 'object' ? (jp?.name ?? '') : (jp ?? '')}
              photo={b.photo_thumb_path}
              photoFull={b.photo_path}
              size={30}
            />
            <ToneText
              tone={days === 0 ? 'success' : 'neutral'}
              className="shrink-0 text-[11px] font-semibold"
            >
              {days === 0
                ? t('dashboard.birthdayToday')
                : `${t('dashboard.daysCount', { count: days })} ${t('dashboard.daysLeftLabel')}`}
            </ToneText>
          </ListRow>
        )
      })}
    </RowList>
  )
}

/* ── Eng yaxshi xodimlar ────────────────────────────────────────────────── */

export function TopEmployeesFace({ top }: { top: TopEmployee[] }) {
  const { t } = useTranslation()
  if (top.length === 0) return <PanelEmpty text={t('dashboard.board.topEmpty')} />
  return (
    <RowList className="pt-1">
      {top.map((e, i) => (
        <ListRow key={e.id ?? i} filled className="max-h-[58px]">
          <span className="w-4 shrink-0 text-[12px] text-fg-subtle [font-variant-numeric:tabular-nums]">
            {i + 1}.
          </span>
          <PersonCell
            name={e.legal_name ?? t('common.unknown')}
            sub={e.job_position_name ?? e.department_name ?? ''}
            photo={e.photo_thumb_path}
            photoFull={e.photo_path}
            size={30}
          />
          <span className="shrink-0 text-[12px] font-bold text-success [font-variant-numeric:tabular-nums]">
            {Math.round(Number(e.kpi_percentage ?? 0))}%
          </span>
        </ListRow>
      ))}
    </RowList>
  )
}

/* ── Kechga qoluvchilar ─────────────────────────────────────────────────── */

export function LateRankFace({ rows }: { rows: LateRankRow[] }) {
  const { t } = useTranslation()
  if (rows.length === 0) return <PanelEmpty text={t('dashboard.disciplineEmpty')} />
  return (
    <RowList className="pt-1">
      {rows.slice(0, 6).map((r, i) => (
        <ListRow key={r.employee_id ?? i} filled className="max-h-[58px]">
          <span className="w-4 shrink-0 text-[12px] text-fg-subtle [font-variant-numeric:tabular-nums]">
            {i + 1}.
          </span>
          <PersonCell
            name={r.employee_name ?? t('common.unknown')}
            sub={r.job_position_name ?? r.department_name ?? ''}
            photo={r.photo_thumb_path}
            photoFull={r.photo_path}
            size={30}
          />
          <StatusPill tone="danger">{t('dashboard.lateTimes', { count: r.late_count })}</StatusPill>
        </ListRow>
      ))}
    </RowList>
  )
}

/* ── Ijro intizomi (jamlanma) ───────────────────────────────────────────── */

export function DisciplineFace({
  tasks,
  summary,
  worstDepartment,
}: {
  tasks: IjroTask[]
  summary: OverdueSummary
  worstDepartment: { department_name: string; count: number } | null
}) {
  const { t } = useTranslation()
  // Severity is the AGE of the miss, not its existence: a fortnight-old
  // deadline and yesterday's are different problems.
  const critical = tasks.filter((x) => x.state === 'overdue' && x.days > 7).length
  const mid = tasks.filter((x) => x.state === 'overdue' && x.days <= 7).length
  const low = tasks.filter((x) => x.state === 'today' || x.state === 'soon').length
  const done = tasks.filter((x) => x.state === 'done').length
  const total = summary.total ?? tasks.filter((x) => x.state === 'overdue').length

  return (
    <Face className="justify-evenly gap-3 px-4 pb-3 pt-1">
      <div className="flex gap-2.5">
        <Tally value={critical} label={t('dashboard.board.severeHigh')} tone="danger" />
        <Tally value={mid} label={t('dashboard.board.severeMid')} tone="warning" />
        <Tally value={low} label={t('dashboard.board.severeLow')} tone="neutral" />
      </div>
      <div className="flex flex-col gap-[7px]">
        <Line label={t('dashboard.board.violationsThisMonth')} value={`${total}`} />
        <Line label={t('dashboard.board.tasksClosed')} value={`${done}`} tone="success" />
        {worstDepartment && (
          <Line
            label={t('dashboard.board.worstDepartment', { name: worstDepartment.department_name })}
            value={`${worstDepartment.count}`}
          />
        )}
      </div>
    </Face>
  )
}

function Tally({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'danger' | 'warning' | 'neutral' | 'success'
}) {
  const cls = {
    danger: 'bg-danger/[0.10] text-danger',
    warning: 'bg-warning/[0.10] text-warning',
    neutral: 'bg-fg/[0.05] text-fg-muted',
    // KPI jamlanmasidagi «yuqori KPI» — yaxshi natija ijobiy tonda turadi.
    success: 'bg-success/[0.10] text-success',
  }[tone]
  return (
    <div className={`flex flex-1 flex-col items-center gap-0.5 rounded-inner py-3 ${cls}`}>
      <span className="text-[27px] font-bold leading-none [font-variant-numeric:tabular-nums]">
        {value}
      </span>
      {/* ⚠️ `text-fg-subtle` EMAS: bu yorliq RANGLI tinit ustida turadi
          (`bg-warning/[0.10]`), u yer fonini qoraytiradi va subtle 4.39:1 ga
          tushardi. Muted bu yerda ham ikkilamchi daraja, ham AA. */}
      <span className="text-[11.5px] text-fg-muted">{label}</span>
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
  tone?: 'success'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12px] text-fg-muted">
      <span className="truncate">{label}</span>
      <span
        className={`shrink-0 font-semibold [font-variant-numeric:tabular-nums] ${
          tone === 'success' ? 'text-success' : 'text-fg'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

/* ── Mehmonlar ──────────────────────────────────────────────────────────── */

/**
 * Uchta raqam + so'nggi tashriflar — web v1 ning «Mehmonlar tashrifi»
 * kartochkasi.
 *
 * WHY THE COUNTERS SIT ABOVE THE FEED. The feed answers "who is here now",
 * which is worth nothing without the scale it sits in: a branch with three
 * passes today and four thousand guests on file is a quiet day, and the same
 * three passes with eleven guests on file is a busy one. v1 prints the three
 * together for exactly that reason, and each comes off its own endpoint —
 * they are not derivable from one another.
 *
 * A counter the role cannot read stays HIDDEN rather than printing 0: a
 * refused endpoint and an empty branch must never look the same.
 */
function VisitorCounter({
  value,
  label,
  tone,
  suffix,
}: {
  value: number
  label: string
  tone: 'info' | 'success' | 'warning'
  suffix?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
      <span
        className={`text-[22px] font-bold leading-none [font-variant-numeric:tabular-nums] ${
          tone === 'info' ? 'text-info' : tone === 'success' ? 'text-success' : 'text-warning'
        }`}
      >
        {value}
        {suffix && <span className="ml-0.5 text-[11px] font-semibold">{suffix}</span>}
      </span>
      <span className="min-w-0 flex-1 text-[10.5px] leading-tight text-fg-muted">{label}</span>
    </div>
  )
}

export function GuestsFace({
  guests,
  counters,
}: {
  guests: TurnstileEvent[]
  counters?: VisitorCounters
}) {
  const { t } = useTranslation()
  const strip =
    counters &&
    (counters.all != null || counters.today != null || counters.avgServiceMinutes != null) ? (
      <div className="flex shrink-0 items-center gap-3 border-b border-fg/[0.07] px-3 pb-2.5 pt-1">
        {counters.all != null && (
          <VisitorCounter value={counters.all} label={t('dashboard.board.guestsAll')} tone="info" />
        )}
        {counters.today != null && (
          <VisitorCounter
            value={counters.today}
            label={t('dashboard.board.guestsToday')}
            tone="success"
          />
        )}
        {counters.avgServiceMinutes != null && (
          <VisitorCounter
            value={counters.avgServiceMinutes}
            suffix={t('dashboard.board.minutesShort')}
            label={t('dashboard.board.guestsAvgService')}
            tone="warning"
          />
        )}
      </div>
    ) : null

  if (guests.length === 0) {
    return (
      <Face>
        {strip}
        <PanelEmpty text={t('dashboard.board.guestsEmpty')} />
      </Face>
    )
  }
  return (
    <Face>
      {strip}
      <RowList className="pt-1">
      {guests.slice(0, 6).map((g, i) => {
        const entry = g.direction_type === 'entrance' || g.check_in_out_type === 1
        const guest = guestRow(g, t)
        return (
          <ListRow key={g.id ?? i} filled className="max-h-[58px]">
            <PersonCell name={guest.name} sub={guest.sub} photo={guest.photo} photoFull={guest.photoFull} size={30} />
            <span className="flex shrink-0 flex-col items-end leading-tight">
              <span className="text-[12px] text-fg-muted [font-variant-numeric:tabular-nums]">
                {formatTime(g.happen_time)}
              </span>
              <ToneText tone={entry ? 'success' : 'neutral'} className="text-[10px] font-semibold">
                {entry ? t('dashboard.passIn') : t('dashboard.passOut')}
              </ToneText>
            </span>
          </ListRow>
        )
      })}
      </RowList>
    </Face>
  )
}

/* ── Bo'limlar bo'yicha davomat ─────────────────────────────────────────── */

/**
 * TODAY'S MOVEMENT, DEPARTMENT BY DEPARTMENT (`/dashboard/departments-attendance`).
 *
 * ⚠️ NOT A CHART. The interesting reading here is the ORDER — which units are
 * moving and which are quiet — and a ranked list says that with the exact
 * counts attached, where a six-slice pie would say it worse and hide the
 * small departments entirely. The gender split rides along as text because
 * that is what the endpoint carries and what the personnel department asks
 * for next; it is never colour-coded, so nothing here depends on hue.
 *
 * `total_attendances` counts PASSES, not people — the label says so.
 */
export function DeptAttendanceFace({ rows }: { rows: DepartmentAttendance[] }) {
  const { t } = useTranslation()
  if (rows.length === 0) return <PanelEmpty text={t('dashboard.board.deptAttendanceEmpty')} />
  return (
    <RowList className="pt-1">
      {rows.slice(0, 6).map((r, i) => {
        const g = r.gender_stats
        return (
          <ListRow key={r.department_id ?? i} filled className="max-h-[58px]">
            <IconCell icon={Building2} tone="brand" size={30} />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-[12.5px] font-medium text-fg">
                {r.department_name || t('common.unknown')}
              </span>
              {g && (
                <span className="truncate text-[11px] text-fg-subtle [font-variant-numeric:tabular-nums]">
                  {t('employees.gender_male')} {g.male} · {t('employees.gender_female')} {g.female}
                </span>
              )}
            </span>
            <StatusPill tone="brand">
              {t('dashboard.board.deptAttendancePasses', { count: r.total_attendances ?? 0 })}
            </StatusPill>
          </ListRow>
        )
      })}
    </RowList>
  )
}

/* ── KPI jamlanmasi ─────────────────────────────────────────────────────── */

/**
 * THE BRANCH'S KPI, SPLIT INTO ITS THREE TAILS (`/dashboard/kpi-summary`).
 *
 * ⚠️ THE ENDPOINT REFUSES A BARE CALL — `date_from`/`date_to` are required and
 * a request without them answers 422, not an empty summary. The window is
 * printed under the tallies so the reader knows which month they are looking
 * at; the board would otherwise show three numbers with no period attached,
 * which is the one thing that makes a KPI figure unarguable-with.
 *
 * The counts come from the server. Nothing here re-buckets a percentage in
 * the browser — the thresholds that decide "good" belong to the KPI service.
 */
export function KpiSummaryFace({
  summary,
  period,
}: {
  summary: KpiSummary | null
  period: { from: string; to: string }
}) {
  const { t } = useTranslation()
  if (!summary) return <PanelEmpty text={t('dashboard.board.kpiSummaryEmpty')} />
  const fmt = (d: string) => dayjs(d).format('DD.MM.YYYY')
  return (
    <Face className="justify-evenly gap-3 px-4 pb-3 pt-1">
      <div className="flex gap-2.5">
        <Tally value={summary.good_kpi_employee_count} label={t('dashboard.board.kpiGood')} tone="success" />
        <Tally value={summary.medium_kpi_employee_count} label={t('dashboard.board.kpiMedium')} tone="warning" />
        <Tally value={summary.bad_kpi_employee_count} label={t('dashboard.board.kpiBad')} tone="danger" />
      </div>
      <div className="flex flex-col gap-[7px]">
        <Line label={t('dashboard.board.statTotal')} value={`${summary.employee_total_count}`} />
        <Line
          label={t('dashboard.board.kpiAvgAttendance')}
          value={`${summary.average_attendance_percentage}%`}
          tone="success"
        />
        <span className="text-[11px] text-fg-subtle [font-variant-numeric:tabular-nums]">
          {t('dashboard.board.kpiPeriod', { from: fmt(period.from), to: fmt(period.to) })}
        </span>
      </div>
    </Face>
  )
}
