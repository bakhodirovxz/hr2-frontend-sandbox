import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlertTriangle, BarChart3, Building2, CheckCircle2, ChevronRight, Clock, DoorOpen, XCircle } from 'lucide-react'
import { formatTime, getDisplayStatus, isInside, jobTitle } from '@/features/dashboard/attendance'
import type { StatusCounts } from '@/features/dashboard/attendance'
import type { AttendanceRow } from '@/types/dashboard'
import { cn } from '@/lib/cn'
import { PanelEmpty } from './Panel'
import { PersonCell, RowList, ListRow } from './rows'
import { useOpenPerson } from './EmployeeCalendarModal'
import type { IjroTask, OverdueSummary } from './useBoardData'
import {
  DrillEmpty,
  DrillModal,
  DrillPill,
  KPI_BANDS,
  PersonRow,
  matchNeedle,
  tipProps,
  useBandRows,
  type KpiSheets,
  type KpiSheetMonth,
} from './boardDrill'

const fmtDate = (d?: string | null) => (d ? dayjs(d).format('DD.MM.YYYY') : '—')

/* ════════════════════════════════════════════════════════════════════════════
 * ATTENDANCE — who is behind «Kelganlar / Kech qoldi / Kelmadi»
 *
 * Built from the SAME `dash.rows` the tiles count (`countByStatus`), so a tab
 * always holds exactly the number on its tile. A row opens the existing
 * colleague card (status, gate, phone, month tabel).
 * ══════════════════════════════════════════════════════════════════════════ */

export type AttendanceTab = 'arrived' | 'inside' | 'late' | 'absent' | 'other'
const OTHER: AttendanceRow['category'][] = ['vacation', 'trip', 'sick', 'leave', 'dekret']
const inTab = (r: AttendanceRow, tab: AttendanceTab) =>
  tab === 'arrived'
    ? r.category === 'present' || r.category === 'late'
    : tab === 'inside'
      ? isInside(r)
      : tab === 'other'
        ? OTHER.includes(r.category)
        : r.category === tab

export function AttendanceModal({
  rows,
  counts,
  tab,
  onTab,
  onClose,
}: {
  rows: AttendanceRow[]
  counts: StatusCounts
  tab: AttendanceTab | null
  onTab: (t: AttendanceTab) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const openPerson = useOpenPerson()
  const meta = {
    arrived: { icon: CheckCircle2, tone: 'success' as const },
    inside: { icon: DoorOpen, tone: 'success' as const },
    late: { icon: Clock, tone: 'warning' as const },
    absent: { icon: XCircle, tone: 'danger' as const },
    other: { icon: Building2, tone: 'brand' as const },
  }
  if (!tab) return null
  const list = rows.filter((r) => inTab(r, tab))
  return (
    <>
      <DrillModal
        open
        onClose={onClose}
        icon={meta[tab].icon}
        tone={meta[tab].tone}
        title={t('dashboard.drill.attendanceTitle')}
        subtitle={t('dashboard.drill.attendanceSub', { count: counts.total })}
        tabs={[
          { key: 'arrived', label: t('dashboard.donut.present'), count: counts.arrived },
          { key: 'inside', label: t('dashboard.insideNow'), count: counts.inside },
          { key: 'late', label: t('dashboard.donut.late'), count: counts.late },
          { key: 'absent', label: t('dashboard.donut.absent'), count: counts.absent },
          { key: 'other', label: t('dashboard.drill.otherReason'), count: counts.other },
        ]}
        active={tab}
        onTab={(k) => onTab(k as AttendanceTab)}
      >
        {(needle) => {
          const shown = list.filter((r) =>
            matchNeedle(needle, r.employee.legal_name, r.employee.department?.name, jobTitle(r.employee)),
          )
          if (shown.length === 0) return <DrillEmpty text={t('dashboard.drill.empty')} />
          return (
            <div className="flex flex-col">
              {shown.map((r) => {
                const st = getDisplayStatus(r)
                const time = formatTime(r.entry?.happen_time)
                return (
                  <PersonRow
                    key={r.id}
                    name={r.employee.legal_name ?? t('common.unknown')}
                    meta={[jobTitle(r.employee), r.employee.department?.name].filter(Boolean).join(' · ')}
                    photo={r.employee.photo_thumb_path}
                    onClick={() => {
                      onClose()
                      openPerson({
                        id: r.employee.id,
                        name: r.employee.legal_name,
                        photo: r.employee.photo_thumb_path,
                        position: jobTitle(r.employee),
                        department: r.employee.department?.name,
                      })
                    }}
                    right={
                      <>
                        {r.entry && <span className="text-[13px] font-bold tabular-nums text-fg">{time}</span>}
                        <DrillPill tone={st.tone === 'danger' ? 'danger' : r.category === 'late' ? 'warning' : st.tone === 'success' ? 'success' : 'neutral'}>
                          {r.category === 'late' ? t('dashboard.donut.late') : t(`status.${st.key}` as never)}
                        </DrillPill>
                      </>
                    }
                  />
                )
              })}
            </div>
          )
        }}
      </DrillModal>
    </>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * IJRO INTIZOMI — the tallies open who each task belongs to
 * ══════════════════════════════════════════════════════════════════════════ */

export type IjroTab = 'crit' | 'mid' | 'low' | 'overdue' | 'done' | 'depts' | `dept:${string}`
export function splitIjro(all: IjroTask[]) {
  return {
    crit: all.filter((x) => x.state === 'overdue' && x.days > 7),
    mid: all.filter((x) => x.state === 'overdue' && x.days <= 7),
    low: all.filter((x) => x.state === 'today' || x.state === 'soon'),
    overdue: all.filter((x) => x.state === 'overdue'),
    done: all.filter((x) => x.state === 'done'),
  }
}

export function DisciplineFace({
  all,
  summary,
  onOpen,
}: {
  all: IjroTask[]
  summary: OverdueSummary
  onOpen: (tab: IjroTab) => void
}) {
  const { t } = useTranslation()
  const s = splitIjro(all)
  const worst = useMemo(
    () => [...(summary.by_department ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))[0] ?? null,
    [summary],
  )
  const Tally = ({ tab, value, label, tone }: { tab: IjroTab; value: number; label: string; tone: 'danger' | 'warning' | 'neutral' }) => (
    <button
      type="button"
      onClick={() => onOpen(tab)}
      {...tipProps(label, [[t('dashboard.drill.tasks'), value], [t('dashboard.drill.tipOpen'), '']])}
      className={cn(
        'flex flex-1 flex-col items-center gap-0.5 rounded-inner py-3 transition-transform hover:-translate-y-0.5',
        tone === 'danger' && 'bg-danger/[0.10] text-danger',
        tone === 'warning' && 'bg-warning/[0.12] text-warning',
        tone === 'neutral' && 'bg-fg/[0.05] text-fg',
      )}
    >
      <span className="text-[26px] font-extrabold leading-none tabular-nums">{value}</span>
      <span className="text-[11.5px] text-fg-muted">{label}</span>
    </button>
  )
  const Line = ({ tab, label, value, tone }: { tab: IjroTab; label: string; value: number; tone?: 'danger' | 'success' }) => (
    <button
      type="button"
      onClick={() => onOpen(tab)}
      className="-mx-2 flex items-center gap-3 rounded-control px-2 py-1.5 text-left text-[12.5px] text-fg-muted transition-colors hover:bg-fg/[0.05]"
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={cn('font-bold tabular-nums', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-fg')}>
        {value}
      </span>
      <ChevronRight size={13} className="shrink-0 text-fg-subtle" />
    </button>
  )
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-evenly gap-3 px-4 pb-3 pt-1">
      <div className="flex gap-2.5">
        <Tally tab="crit" value={s.crit.length} label={t('dashboard.board.severeHigh')} tone="danger" />
        <Tally tab="mid" value={s.mid.length} label={t('dashboard.board.severeMid')} tone="warning" />
        <Tally tab="low" value={s.low.length} label={t('dashboard.board.severeLow')} tone="neutral" />
      </div>
      <div className="flex flex-col">
        <Line tab="overdue" label={t('dashboard.board.violationsThisMonth')} value={s.overdue.length} tone="danger" />
        <Line tab="done" label={t('dashboard.board.tasksClosed')} value={s.done.length} tone="success" />
        {worst && (
          <Line
            tab={`dept:${worst.department_name}`}
            label={t('dashboard.board.worstDepartment', { name: worst.department_name })}
            value={worst.count}
          />
        )}
      </div>
    </div>
  )
}

export function IjroModal({
  all,
  summary,
  tab,
  onTab,
  onClose,
}: {
  all: IjroTask[]
  summary: OverdueSummary
  tab: IjroTab | null
  onTab: (t: IjroTab) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const openPerson = useOpenPerson()
  const s = splitIjro(all)
  const depts = [...(summary.by_department ?? [])].sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
  if (!tab) return null
  const active = tab.startsWith('dept:') ? 'depts' : tab
  const label: Record<string, string> = {
    crit: t('dashboard.board.severeHigh'),
    mid: t('dashboard.board.severeMid'),
    low: t('dashboard.board.severeLow'),
    overdue: t('dashboard.drill.tabOverdue'),
    done: t('dashboard.drill.tabDone'),
    depts: t('dashboard.drill.tabDepts'),
  }
  const badge = (x: IjroTask) => {
    if (x.state === 'done') {
      const lateBy = x.completed && x.deadline ? dayjs(x.completed).diff(dayjs(x.deadline), 'day') : 0
      return lateBy > 0 ? (
        <DrillPill tone="warning">{t('dashboard.drill.closedLate', { date: fmtDate(x.completed), count: lateBy })}</DrillPill>
      ) : (
        <DrillPill tone="success">{t('dashboard.drill.closedOnTime', { date: fmtDate(x.completed) })}</DrillPill>
      )
    }
    if (x.state === 'overdue') return <DrillPill tone="danger">{t('dashboard.drill.daysOverdue', { count: x.days })}</DrillPill>
    return <DrillPill>{x.state === 'today' ? t('dashboard.drill.dueToday') : t('dashboard.drill.daysLeft', { count: x.days })}</DrillPill>
  }
  const list = (items: IjroTask[], needle: string) => {
    const shown = items.filter((x) => matchNeedle(needle, x.employeeName, x.department, x.title, x.reg))
    if (shown.length === 0) return <DrillEmpty text={t('dashboard.drill.noTasks')} />
    return (
      <div className="flex flex-col">
        {shown.map((x) => (
          <PersonRow
            key={x.id}
            name={x.employeeName || t('common.unknown')}
            meta={[x.position, x.department].filter(Boolean).join(' · ')}
            photo={x.photo}
            onClick={
              x.employeeId
                ? () => {
                    onClose()
                    openPerson({ id: x.employeeId!, name: x.employeeName, photo: x.photo, position: x.position, department: x.department })
                  }
                : undefined
            }
            right={
              <>
                <span className="text-[10.5px] text-fg-subtle">{t('dashboard.drill.deadline')}</span>
                <span className="text-[13px] font-bold tabular-nums text-fg">{fmtDate(x.deadline)}</span>
                {badge(x)}
              </>
            }
          >
            <span className="mt-1.5 line-clamp-2 text-[12.5px] text-fg-muted" title={x.title}>
              {x.reg && (
                <span className="mr-1.5 rounded-[7px] bg-brand-soft px-1.5 py-px text-[11px] font-bold text-brand-strong">{x.reg}</span>
              )}
              {x.title}
            </span>
          </PersonRow>
        ))}
      </div>
    )
  }
  return (
    <DrillModal
      open
      onClose={onClose}
      icon={AlertTriangle}
      tone="danger"
      title={t('dashboard.board.execDisciplineTitle')}
      subtitle={t('dashboard.drill.ijroSub', { count: all.length })}
      tabs={(['crit', 'mid', 'low', 'overdue', 'done', 'depts'] as const).map((k) => ({
        key: k,
        label: label[k],
        count: k === 'depts' ? depts.length : s[k].length,
      }))}
      active={active}
      onTab={(k) => onTab(k as IjroTab)}
      footer={t('dashboard.drill.ijroFoot')}
    >
      {(needle) => {
        if (tab === 'depts')
          return (
            <div className="flex flex-col">
              {depts.map((d) => (
                <button
                  key={d.department_name}
                  type="button"
                  onClick={() => onTab(`dept:${d.department_name}`)}
                  className="flex items-center gap-3 rounded-[14px] px-2 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-brand-soft text-brand-strong">
                    <Building2 size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{d.department_name}</span>
                  <span className="text-[16px] font-bold tabular-nums text-fg">{d.count}</span>
                  <ChevronRight size={15} className="text-fg-subtle" />
                </button>
              ))}
            </div>
          )
        if (tab.startsWith('dept:')) {
          const name = tab.slice(5)
          const items = all.filter((x) => x.department === name)
          return (
            <>
              <p className="mx-2 mb-2 mt-0 flex items-center gap-2 text-[12.5px] font-semibold text-fg-muted">
                <Building2 size={14} /> {name} · {t('dashboard.drill.tasksCount', { count: items.length })}
              </p>
              {list(items, needle)}
            </>
          )
        }
        return list(s[tab as keyof typeof s], needle)
      }}
    </DrillModal>
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * REAL KPI — the evaluation sheets («Baholash varaqalari»), DONE only
 * ══════════════════════════════════════════════════════════════════════════ */

export type KpiBand = (typeof KPI_BANDS)[number]['key']

function useMonthName() {
  const { t } = useTranslation()
  const months = t('date.months', { returnObjects: true }) as unknown as string[]
  return (m: string) => {
    const i = Number(m.slice(5, 7)) - 1
    return Array.isArray(months) && months[i] ? `${months[i]} ${m.slice(0, 4)}` : m
  }
}

/** Monthly average line. A month with no closed sheet is a GAP, not a zero. */
function MonthLine({ months, height = 74 }: { months: KpiSheetMonth[]; height?: number }) {
  const { t } = useTranslation()
  const monthName = useMonthName()
  // «iyun»/«iyul» both start «iyu» — the axis needs its own short names.
  const shorts = t('dashboard.drill.monthsShort', { returnObjects: true }) as unknown as string[]
  const monthShort = (m: string) => (Array.isArray(shorts) ? shorts[Number(m.slice(5, 7)) - 1] : m.slice(5, 7))
  const w = 300
  const h = height
  const vals = months.map((m) => m.average)
  const top = Math.max(10, Math.ceil(Math.max(0, ...vals.map((v) => v ?? 0)) / 5) * 5)
  const X = (i: number) => (i / Math.max(months.length - 1, 1)) * (w - 16) + 8
  const Y = (v: number) => h - 10 - (Math.min(v, top) / top) * (h - 22)
  const runs: [number, number][][] = []
  let cur: [number, number][] = []
  months.forEach((m, i) => {
    if (m.average == null) {
      if (cur.length) runs.push(cur)
      cur = []
    } else cur.push([X(i), Y(m.average)])
  })
  if (cur.length) runs.push(cur)
  const path = (r: [number, number][]) => r.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block h-[74px] w-full shrink-0 overflow-visible" role="img" aria-label={t('dashboard.drill.kpiMonthly')}>
        <line x1={0} x2={w} y1={Y(top / 2)} y2={Y(top / 2)} className="stroke-border" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        {runs.filter((r) => r.length > 1).map((r, i) => (
          <path key={i} d={`${path(r)} L${r[r.length - 1][0]},${h} L${r[0][0]},${h} Z`} className="fill-brand/10" />
        ))}
        {runs.map((r, i) => (
          <path key={i} d={path(r)} fill="none" className="stroke-brand" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        ))}
        {months.map((m, i) => (
          <g
            key={m.month}
            className="group"
            {...tipProps(
              monthName(m.month),
              m.average == null
                ? [[t('dashboard.drill.kpiState'), t('dashboard.drill.kpiNotClosed')], [t('dashboard.drill.kpiSheets'), m.total]]
                : [
                    [t('dashboard.drill.kpiAvg'), `${m.average}%`],
                    [t('dashboard.drill.kpiDone'), `${m.done} / ${m.total}`],
                    [t('dashboard.drill.kpiPositive'), m.positive],
                  ],
            )}
          >
            <rect x={X(i) - w / months.length / 2} y={0} width={w / months.length} height={h} fill="transparent" />
            <line x1={X(i)} x2={X(i)} y1={4} y2={h} className="stroke-brand opacity-0 group-hover:opacity-50" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
            {m.average == null ? (
              <circle cx={X(i)} cy={h - 10} r={2.6} className="fill-none stroke-fg-subtle" strokeDasharray="1.5 1.5" vectorEffect="non-scaling-stroke" />
            ) : (
              <circle cx={X(i)} cy={Y(m.average)} r={3.4} className="fill-surface stroke-brand transition-[r] group-hover:fill-brand" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            )}
          </g>
        ))}
      </svg>
      <div className="flex justify-between px-1 pt-0.5 text-[10.5px] text-fg-subtle">
        {months.map((m) => (
          <span key={m.month}>{monthShort(m.month)}</span>
        ))}
      </div>
    </div>
  )
}

export function KpiSheetsFace({ data, onOpen }: { data: KpiSheets | null; onOpen: (band: KpiBand) => void }) {
  const { t } = useTranslation()
  const monthName = useMonthName()
  const bands = useBandRows(data?.rows ?? [])
  if (!data?.last) return <PanelEmpty text={t('dashboard.drill.kpiEmpty')} />
  const last = data.last
  const tone = { high: 'text-success', mid: 'text-brand-strong', low: 'text-warning', zero: 'text-danger' } as const
  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 pb-3 pt-0">
      <p className="m-0 text-[11.5px] text-fg-subtle" {...tipProps(t('dashboard.drill.kpiSourceTitle'), [[t('dashboard.drill.kpiSourceRow'), '']])}>
        {t('dashboard.drill.kpiSub', { month: monthName(last.month), done: last.done, total: last.total })}
      </p>
      <div className="grid grid-cols-4 gap-1.5">
        {KPI_BANDS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => onOpen(b.key)}
            {...tipProps(t(`dashboard.drill.kpiBand_${b.key}` as never), [
              [t('dashboard.drill.employees'), bands[b.key].length],
              [t('dashboard.drill.share'), `${last.done ? Math.round((bands[b.key].length / last.done) * 100) : 0}%`],
            ])}
            className="flex flex-col rounded-inner bg-fg/[0.04] px-2.5 py-2 text-left transition-transform hover:-translate-y-0.5"
          >
            <span className={cn('text-[20px] font-extrabold leading-tight tabular-nums', tone[b.key])}>{bands[b.key].length}</span>
            <span className="line-clamp-2 text-[10.5px] leading-tight text-fg-subtle">{t(`dashboard.drill.kpiBand_${b.key}` as never)}</span>
          </button>
        ))}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-[12px] text-fg-muted">{t('dashboard.drill.kpiMonthly')}</span>
        <span className="text-[16px] font-bold tabular-nums text-fg">{last.average ?? 0}%</span>
        <span className="text-[11px] text-fg-subtle">{monthName(last.month)}</span>
      </div>
      <MonthLine months={data.intervals} />
    </div>
  )
}

export function KpiModal({
  data,
  band,
  onBand,
  onClose,
}: {
  data: KpiSheets
  band: KpiBand | null
  onBand: (b: KpiBand) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const openPerson = useOpenPerson()
  const monthName = useMonthName()
  const bands = useBandRows(data.rows)
  if (!band || !data.last) return null
  return (
    <DrillModal
      open
      onClose={onClose}
      icon={BarChart3}
      title={t('dashboard.board.kpiSummaryTitle')}
      subtitle={t('dashboard.drill.kpiSub', { month: monthName(data.last.month), done: data.last.done, total: data.last.total })}
      tabs={KPI_BANDS.map((b) => ({ key: b.key, label: t(`dashboard.drill.kpiBand_${b.key}` as never), count: bands[b.key].length, warn: b.key === 'zero' }))}
      active={band}
      onTab={(k) => onBand(k as KpiBand)}
      footer={t('dashboard.drill.kpiFoot')}
    >
      {(needle) => {
        const shown = bands[band].filter((r) => matchNeedle(needle, r.legal_name, r.job_position_name, r.department_name))
        if (shown.length === 0) return <DrillEmpty text={t('dashboard.drill.empty')} />
        return (
          <div className="flex flex-col">
            {shown.map((r) => (
              <PersonRow
                key={r.employee_id}
                name={r.legal_name ?? t('common.unknown')}
                meta={[r.job_position_name, r.department_name].filter(Boolean).join(' · ')}
                photo={r.photo_thumb_path}
                onClick={() => {
                  onClose()
                  openPerson({ id: r.employee_id, name: r.legal_name, photo: r.photo_thumb_path, position: r.job_position_name, department: r.department_name })
                }}
                right={<span className="text-[14px] font-extrabold tabular-nums text-fg">{r.result_percent}%</span>}
              />
            ))}
          </div>
        )
      }}
    </DrillModal>
  )
}

/** «Eng yaxshi xodimlar» by the REAL KPI of the latest closed month. */
export function TopKpiFace({ data }: { data: KpiSheets | null }) {
  const { t } = useTranslation()
  const openPerson = useOpenPerson()
  const monthName = useMonthName()
  const top = (data?.rows ?? []).filter((r) => r.result_percent > 0).slice(0, 5)
  if (!data?.last || top.length === 0) return <PanelEmpty text={t('dashboard.board.topEmpty')} />
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="m-0 px-4 pb-1 text-[11.5px] text-fg-subtle">{t('dashboard.drill.topSub', { month: monthName(data.last.month) })}</p>
      <RowList className="pt-1">
        {top.map((e, i) => (
          <ListRow key={e.employee_id} filled className="max-h-[58px]">
            <button type="button" onClick={() => openPerson({ id: e.employee_id, name: e.legal_name, photo: e.photo_thumb_path, position: e.job_position_name, department: e.department_name })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <span className="w-4 shrink-0 text-[12px] text-fg-subtle tabular-nums">{i + 1}.</span>
              <PersonCell name={e.legal_name ?? t('common.unknown')} sub={e.job_position_name ?? e.department_name ?? ''} photo={e.photo_thumb_path} size={30} />
            </button>
            <span
              {...tipProps(t('dashboard.drill.kpiResult'), [[monthName(data.last!.month), `${e.result_percent}%`]])}
              className="shrink-0 text-[12.5px] font-bold text-success tabular-nums"
            >
              {Math.round(e.result_percent)}%
            </span>
          </ListRow>
        ))}
      </RowList>
    </div>
  )
}
