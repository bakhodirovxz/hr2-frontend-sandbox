import { useState, type ReactNode } from 'react'
import { lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { Building2 } from 'lucide-react'
import type { StatusCounts } from '@/features/dashboard/attendance'
import type { LateRankRow } from '@/features/dashboard/useKadrBlocks'
import { Donut, DonutLegend, type DonutSlice } from './Donut'
import { PanelEmpty } from './Panel'
import { IconCell, ListRow, PersonCell, RowList, StatusPill } from './rows'
import type {
  DepartmentAttendance,
  KpiSummary,
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

/* ── Tug'ilgan kunlar ───────────────────────────────────────────────────── */

/* ── Eng yaxshi xodimlar ────────────────────────────────────────────────── */

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
            sub={lt(r.job_position_name ?? r.department_name)}
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
                {lt(r.department_name) || t('common.unknown')}
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
