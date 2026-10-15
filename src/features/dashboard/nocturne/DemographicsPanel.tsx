import { useEffect, useMemo, useRef, useState } from 'react'
import { lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Briefcase, CalendarDays, ChevronRight, Globe2, Users } from 'lucide-react'
import { useEmployeeStats } from '@/features/employees/useEmployeeKpi'
import { useAuthStore } from '@/store/authStore'
import { can } from '@/auth/permissions'
import { useJobPositionOptions } from '@/hooks/useReferenceData'
import { useNationalityLabel } from '@/features/employees/nationalityLabel'
import { apiGet } from '@/api/http'
import { DASHBOARD_JOB_POSITION_STATS } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { cn } from '@/lib/cn'
import { Panel, PanelEmpty } from './Panel'
import { ArcRing } from './ArcRing'
import { useOpenPerson } from './EmployeeCalendarModal'
import {
  DrillEmpty,
  DrillModal,
  DrillPill,
  PersonRow,
  matchNeedle,
  tipProps,
  useRosterRows,
  useRosterSummary,
  type DrillTab,
  type RosterGroup,
  type RosterRow,
} from './boardDrill'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

interface PositionStat {
  job_position_name?: string | null
  count: number
}

/**
 * WHO WORKS HERE — the make-up of the staff, on the board («B» board, 2026-09-24).
 *
 * Every reading is a door: a slice of the gender bar, an arc or legend row of
 * the age / nationality rings, a position bar, the seniority block — each opens
 * the people behind the number (`/dashboard/roster-composition`, filtered by
 * the SAME rule as the statistic, so the popup count equals the chart).
 *
 * MISSING DATA IS SHOWN, NOT HIDDEN. Employees without a birth date fall out of
 * the age ring and those without a position out of the bars; both get their
 * own «Kiritilmagan» row. Seniority is read from `job_acceptance_date`, which
 * on imported data holds the day the record was CREATED — the old block
 * printed «< 1 yil: 139» for a workforce hired over decades. When the roster
 * summary says so, the block says «can't be computed» and lists who.
 */
const RING = ['--chart-4', '--chart-2', '--chart-1', '--chart-3', '--chart-5', '--chart-6']
const cssVar = (name: string) =>
  `rgb(${getComputedStyle(document.documentElement).getPropertyValue(name).trim()})`

type Drill = { group: RosterGroup; key: string } | null

export function DemographicsPanel({ className }: { className?: string }) {
  const { t } = useTranslation()
  const stats = useEmployeeStats()
  const user = useAuthStore((st) => st.user)
  const positions = useJobPositionOptions()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { summary, failed: drillClosed } = useRosterSummary()
  const [drill, setDrill] = useState<Drill>(null)
  // The drill endpoint is gated like the lateness ranking. A role that cannot
  // read it keeps the plain charts — nothing clickable that would answer 403.
  const canDrill = !drillClosed
  const open = (group: RosterGroup, key: string) => canDrill && setDrill({ group, key })

  const { data: positionStats } = useQuery({
    queryKey: ['job-position-stats', branchId],
    queryFn: () =>
      apiGet<PositionStat[]>(DASHBOARD_JOB_POSITION_STATS, {
        organization_branch_id: branchId || undefined,
      }),
    enabled: can(user, 'employees'),
    staleTime: 10 * 60_000,
  })

  const natLabel = useNationalityLabel()
  const ageSlices = useMemo(
    () =>
      Object.entries(stats.age?.stats ?? {})
        .filter(([, v]) => Number(v) > 0)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([k, v], i) => ({ key: k, name: k, value: Number(v), varName: RING[i % RING.length] })),
    [stats.age],
  )
  const natSlices = useMemo(
    () =>
      (stats.nationality ?? [])
        .filter((n) => n.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)
        .map((n, i) => ({
          key: n.nationality || 'Unknown',
          name: natLabel(n.nationality),
          value: n.count,
          varName: RING[i % RING.length],
        })),
    [stats.nationality, natLabel],
  )
  const allPositions = useMemo(
    () =>
      [...(positionStats ?? [])]
        .filter((p) => p.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((p) => ({ label: lt(p.job_position_name) || '—', count: p.count })),
    // `positions` loading fills the Russian-name registry `lt` reads.
    [positionStats, positions],
  )

  const g = stats.headcount?.gender_stats ?? {}
  const genders = [
    { key: '1', label: t('employees.gender_male'), value: g.male ?? 0, varName: '--chart-4' },
    { key: '2', label: t('employees.gender_female'), value: g.female ?? 0, varName: '--chart-3' },
    { key: '0', label: t('employees.gender_unknown'), value: g.unknown ?? 0, varName: '--chart-6' },
  ]
  const genderTotal = genders.reduce((s, x) => s + x.value, 0)
  const headcount = stats.headcount?.total_count ?? genderTotal
  const pct = (v: number, of: number) => (of ? Math.round((v / of) * 100) : 0)
  const openHint = t('dashboard.drill.tipOpen')

  const loading = stats.ageLoading || stats.nationalityLoading

  return (
    <Panel wash="violet" className={className} label={t('dashboard.board.staffTitle')}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-3.5">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-brand-strong" />
          <span className="text-[15px] font-bold text-fg">{t('dashboard.board.staffTitle')}</span>
          <span className="ml-auto text-[11.5px] tabular-nums text-fg-subtle">
            {t('dashboard.board.positionsCount', { count: positions.length })}
          </span>
        </div>

        {loading ? null : stats.failed ? (
          <PanelEmpty text={t('list.loadFailed')} />
        ) : ageSlices.length === 0 && natSlices.length === 0 ? (
          <PanelEmpty text={t('dashboard.board.staffEmpty')} />
        ) : (
          <>
            {/* HEADCOUNT + the gender split — every segment and legend chip opens its people. */}
            {genderTotal > 0 && (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                <button
                  type="button"
                  disabled={!canDrill}
                  onClick={() => open('gender', '1')}
                  {...tipProps(t('dashboard.drill.byGender'), [[openHint, '']])}
                  className="flex shrink-0 items-baseline gap-2 rounded-control"
                >
                  <span className="bg-gradient-to-r from-[#0967B4] via-[#0A70C2] to-[#18A15E] bg-clip-text text-[40px] font-extrabold leading-none tracking-[-0.04em] text-transparent tabular-nums dark:from-[#C4B5FD] dark:via-[#F0ABFC] dark:to-[#7DD3FC]">
                    {headcount}
                  </span>
                  <span className="text-[12px] text-fg-subtle">{t('dashboard.drill.onRoster')}</span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-pill">
                    {genders.map((x) =>
                      x.value > 0 ? (
                        <button
                          key={x.key}
                          type="button"
                          aria-label={`${x.label}: ${x.value}`}
                          disabled={!canDrill}
                          onClick={() => open('gender', x.key)}
                          {...tipProps(x.label, [
                            [t('dashboard.drill.employees'), x.value],
                            [t('dashboard.drill.share'), `${pct(x.value, genderTotal)}%`],
                          ])}
                          className="rounded-[3px] transition-opacity hover:opacity-80"
                          style={{ flex: x.value, background: cssVar(x.varName) }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {genders.map((x) => (
                      <button
                        key={x.key}
                        type="button"
                        disabled={!canDrill || x.value === 0}
                        onClick={() => open('gender', x.key)}
                        className="flex items-center gap-1.5 rounded-control px-1.5 py-0.5 text-[12px] hover:bg-fg/[0.06] disabled:hover:bg-transparent"
                      >
                        <span className="h-2 w-2 rounded-sm" style={{ background: cssVar(x.varName) }} />
                        <span className="text-fg-muted">{x.label}</span>
                        <span className="font-bold tabular-nums text-fg">{x.value}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_1.3fr]">
              <RingColumn
                title={t('dashboard.board.byAge')}
                slices={ageSlices}
                centerValue={stats.age?.average_age ? Math.round(stats.age.average_age) : undefined}
                centerCaption={t('employees.avgAge')}
                labelFor={(x) => t('dashboard.drill.ageBin', { bin: x.name })}
                missing={summary?.no_birth_date}
                onPick={canDrill ? (key) => open('age', key) : undefined}
              />
              <RingColumn
                title={t('dashboard.board.byNationality')}
                slices={natSlices}
                labelFor={(x) => x.name}
                onPick={canDrill ? (key) => open('nationality', key) : undefined}
              />
              <PositionsAndSeniority
                positions={allPositions}
                missingPosition={summary?.no_position ?? 0}
                headcount={headcount}
                summary={summary}
                fallback={stats.experience ?? []}
                canDrill={canDrill}
                onPosition={(name) => open('position', name)}
                onSeniority={(key) => open('acceptance', key)}
              />
            </div>
          </>
        )}
      </div>

      {drill && (
        <CompositionModal
          drill={drill}
          onTab={(key) => setDrill({ ...drill, key })}
          onClose={() => setDrill(null)}
          tabs={tabsFor(drill.group)}
          natLabel={natLabel}
        />
      )}
    </Panel>
  )

  function tabsFor(group: RosterGroup): DrillTab[] {
    if (group === 'gender') return genders.map((x) => ({ key: x.key, label: x.label, count: x.value }))
    if (group === 'age')
      return [
        ...ageSlices.map((x) => ({ key: x.key, label: t('dashboard.drill.ageBin', { bin: x.name }), count: x.value })),
        ...(summary?.no_birth_date
          ? [{ key: 'none', label: t('dashboard.drill.notEntered'), count: summary.no_birth_date, warn: true }]
          : []),
      ]
    if (group === 'nationality') return natSlices.map((x) => ({ key: x.key, label: x.name, count: x.value }))
    if (group === 'acceptance')
      return [
        ...Object.entries(summary?.seniority ?? {})
          .filter(([, v]) => v > 0)
          .map(([k, v]) => ({ key: k, label: t('dashboard.drill.seniorityBand', { band: k }), count: v })),
        ...(summary?.acceptance_import_day
          ? [{ key: 'import_day', label: t('dashboard.drill.accImport'), count: summary.acceptance_import_day, warn: true }]
          : []),
        ...(summary?.acceptance_missing
          ? [{ key: 'missing', label: t('dashboard.drill.notEntered'), count: summary.acceptance_missing, warn: true }]
          : []),
      ]
    return []
  }
}

/* ── a ring with its legend under it; arcs and rows both open their slice ── */
function RingColumn({
  title,
  slices,
  centerValue,
  centerCaption,
  labelFor,
  missing,
  onPick,
}: {
  title: string
  slices: { key: string; name: string; value: number; varName: string }[]
  centerValue?: number
  centerCaption?: string
  labelFor: (x: { name: string }) => string
  missing?: number
  onPick?: (key: string) => void
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  const total = slices.reduce((s, x) => s + x.value, 0)
  const pct = (v: number) => (total ? Math.round((v / total) * 100) : 0)
  const shown = active != null ? slices[active] : undefined
  if (slices.length === 0) return null
  const tip = (x: (typeof slices)[number]) =>
    tipProps(labelFor(x), [
      [t('dashboard.drill.employees'), x.value],
      [t('dashboard.drill.share'), `${pct(x.value)}%`],
    ])

  return (
    <div className="flex min-h-0 flex-col rounded-inner bg-fg/[0.035] p-3.5">
      <p className="mb-2 text-[12px] font-semibold text-fg-muted">{title}</p>
      <div className="relative mx-auto h-[118px] w-[118px] shrink-0">
        <div role="img" aria-label={title} className="h-full w-full">
          <ArcRing
            slices={slices.map((x) => ({ key: x.key, value: x.value, fill: cssVar(x.varName) }))}
            active={active}
            onActive={setActive}
            onPick={onPick ? (i) => onPick(slices[i].key) : undefined}
            tipFor={(i) => tip(slices[i])}
          />
        </div>
        {/* The hole answers the hover: the slice under the cursor, else the ring's own figure. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-5 text-center">
          <span className="text-[22px] font-extrabold tabular-nums leading-none text-fg">
            {shown ? shown.value : (centerValue ?? total)}
          </span>
          <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-fg-subtle">
            {shown ? labelFor(shown) : (centerCaption ?? t('dashboard.drill.total'))}
          </span>
        </div>
      </div>
      <ul className="mt-3 flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {slices.map((x, i) => (
          <li key={x.key}>
            <button
              type="button"
              disabled={!onPick}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => onPick?.(x.key)}
              {...tip(x)}
              className={cn(
                'flex w-full items-center gap-2 rounded-control px-1.5 py-[2px] text-[12.5px] transition-[background,opacity]',
                active === i ? 'bg-surface' : active != null && 'opacity-45',
                onPick && 'hover:bg-surface',
              )}
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-[4px]" style={{ background: cssVar(x.varName) }} />
              {/* No % column: in a narrow ring column it squeezed «31-40» to «31…»
                  (all-branch view, 2026-09-24). The share is in the tip and the hole. */}
              <span className="min-w-0 flex-1 truncate text-left text-fg-muted">{x.name}</span>
              <span className="shrink-0 pl-1 text-right font-bold tabular-nums text-fg">{x.value}</span>
            </button>
          </li>
        ))}
        {!!missing && (
          <li>
            <button
              type="button"
              disabled={!onPick}
              onClick={() => onPick?.('none')}
              {...tipProps(t('dashboard.drill.noBirthDate'), [[t('dashboard.drill.employees'), missing]])}
              className="flex w-full items-center gap-2 rounded-control px-1.5 py-[3px] text-[12.5px] hover:bg-surface"
            >
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px] border-dashed border-fg-subtle" />
              <span className="min-w-0 flex-1 truncate text-left text-danger">{t('dashboard.drill.notEntered')}</span>
              <span className="shrink-0 pl-1 text-right font-bold tabular-nums text-fg">{missing}</span>
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

/* ── positions + seniority: side by side when the column is wide ──
   With «Barcha filiallar» the seniority block has five bands and a warning,
   and stacked under the positions it squeezed the 913-row list to two
   visible rows. Wide column → two halves; narrow → stacked, each with room. */
function PositionsAndSeniority({
  positions,
  missingPosition,
  headcount,
  summary,
  fallback,
  canDrill,
  onPosition,
  onSeniority,
}: {
  positions: { label: string; count: number }[]
  missingPosition: number
  headcount: number
  summary: ReturnType<typeof useRosterSummary>['summary']
  fallback: { year: number; count: number }[]
  canDrill: boolean
  onPosition: (name: string) => void
  onSeniority: (key: string) => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  // The threshold is a width of CONTENT, so it grows with the low-vision step.
  const lv = useLowVisionScale()
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 560 * lv))
    ro.observe(el)
    return () => ro.disconnect()
  }, [lv])
  return (
    // Stacked, the list row keeps a floor (`minmax(120px,…)`) and the card
    // scrolls: with `minmax(0,1fr)` a short panel squeezed the row below the
    // list's own min-height and the bars were drawn over «Ish staji».
    <div
      ref={ref}
      className={cn(
        'scroll-thin grid min-h-0 gap-x-5 gap-y-2 overflow-y-auto rounded-inner bg-fg/[0.035] p-3.5',
        wide ? 'grid-cols-2' : 'grid-cols-1 grid-rows-[minmax(120px,1fr)_auto]',
      )}
    >
      <div className="flex min-h-0 flex-col">
        <p className="mb-2 text-[12px] font-semibold text-fg-muted">
          {t('dashboard.board.byPosition')}
          <span className="ml-1.5 font-normal tabular-nums text-fg-subtle">· {positions.length}</span>
          {canDrill && <span className="ml-1.5 font-normal text-fg-subtle">{t('dashboard.drill.clickForList')}</span>}
        </p>
        <PositionBars rows={positions} missing={missingPosition} total={headcount} onPick={canDrill ? onPosition : undefined} />
      </div>
      <div className="flex min-h-0 flex-col">
        <p className="mb-1.5 text-[12px] font-semibold text-fg-muted">{t('employees.statExperience')}</p>
        <Seniority
          summary={summary}
          fallback={fallback}
          onOpen={canDrill ? () => onSeniority('import_day') : undefined}
          onBand={canDrill ? onSeniority : undefined}
        />
      </div>
    </div>
  )
}

/* ── every position as a bar (the column scrolls), plus «no position» ── */
function PositionBars({
  rows,
  missing,
  total,
  onPick,
}: {
  rows: { label: string; count: number }[]
  missing: number
  total: number
  onPick?: (name: string) => void
}) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  const max = Math.max(1, ...rows.map((r) => r.count))
  const Row = ({ label, count, pickKey, warn }: { label: string; count: number; pickKey: string; warn?: boolean }) => (
    <li>
      <button
        type="button"
        disabled={!onPick}
        onClick={() => onPick?.(pickKey)}
        {...tipProps(label, [
          [t('dashboard.drill.employees'), count],
          [t('dashboard.drill.share'), `${total ? Math.round((count / total) * 100) : 0}%`],
        ])}
        className="flex w-full items-center gap-2 rounded-control px-1.5 py-[3px] transition-colors hover:bg-surface disabled:hover:bg-transparent"
      >
        <span className={cn('w-[54%] shrink-0 truncate text-left text-[12px]', warn ? 'text-danger' : 'text-fg-muted')}>
          {label}
        </span>
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
          <span
            className={cn(
              'block h-full rounded-pill',
              warn
                ? 'bg-[repeating-linear-gradient(135deg,rgb(var(--danger-mark))_0_4px,transparent_4px_7px)]'
                : 'bg-gradient-to-r from-[#0967B4] to-[#18A15E]',
            )}
            style={{ width: `${Math.max(4, (count / max) * 100)}%` }}
          />
        </span>
        <span className="w-8 shrink-0 text-right text-[12px] font-bold tabular-nums text-fg">{count}</span>
      </button>
    </li>
  )
  return (
    <ul className="scroll-thin -mr-1 flex max-h-[260px] min-h-[72px] flex-1 flex-col gap-0.5 overflow-y-auto pr-1 lg:max-h-none">
      {rows.map((r) => (
        <Row key={r.label} label={r.label} count={r.count} pickKey={r.label} />
      ))}
      {missing > 0 && <Row label={t('dashboard.drill.noPosition')} count={missing} pickKey="none" warn />}
    </ul>
  )
}

/* ── seniority: honest when the hire dates are not hire dates ── */
function Seniority({
  summary,
  fallback,
  onOpen,
  onBand,
}: {
  summary: ReturnType<typeof useRosterSummary>['summary']
  fallback: { year: number; count: number }[]
  onOpen?: () => void
  onBand?: (band: string) => void
}) {
  const { t } = useTranslation()
  if (summary) {
    const suspect = summary.acceptance_import_day + summary.acceptance_missing
    const bands = Object.entries(summary.seniority).filter(([, v]) => v > 0)
    const max = Math.max(1, ...bands.map(([, v]) => v))
    return (
      <div className="flex flex-col gap-1">
        {bands.map(([k, v]) => (
          <button
            key={k}
            type="button"
            disabled={!onBand}
            onClick={() => onBand?.(k)}
            {...tipProps(t('dashboard.drill.seniorityBand', { band: k }), [
              [t('dashboard.drill.employees'), v],
              [t('dashboard.drill.tipOpen'), ''],
            ])}
            className="flex w-full items-center gap-2 rounded-control px-1.5 py-[3px] text-[12px] transition-colors hover:bg-surface disabled:hover:bg-transparent"
          >
            <span className="w-[40%] shrink-0 text-left text-fg-muted">{t('dashboard.drill.seniorityBand', { band: k })}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
              <span className="block h-full rounded-pill bg-[rgb(var(--success-mark))]" style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="shrink-0 pl-1 text-right font-bold tabular-nums text-fg">{v}</span>
          </button>
        ))}
        {suspect > 0 && (
          <button
            type="button"
            disabled={!onOpen}
            onClick={onOpen}
            {...tipProps(t('dashboard.drill.seniorityBad'), [
              [t('dashboard.drill.accImport'), summary.acceptance_import_day],
              [t('dashboard.drill.notEntered'), summary.acceptance_missing],
              [t('dashboard.drill.accSet'), summary.acceptance_set],
            ])}
            className="flex items-center gap-2.5 rounded-[12px] border border-dashed border-warning/50 bg-warning-soft px-2.5 py-2 text-left text-warning transition-transform hover:-translate-y-px"
          >
            <AlertTriangle size={15} className="shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <b className="text-[12.5px]">{t('dashboard.drill.seniorityBad')}</b>
              <span className="text-[11px] opacity-90">
                {t('dashboard.drill.seniorityBadSub', {
                  imported: summary.acceptance_import_day,
                  missing: summary.acceptance_missing,
                })}
              </span>
            </span>
            <ChevronRight size={15} className="shrink-0" />
          </button>
        )}
      </div>
    )
  }
  // No drill access: the plain chart from `experience-stats`, as before.
  const now = new Date().getFullYear()
  const acc = [0, 0, 0, 0]
  for (const r of fallback) {
    const y = now - r.year
    acc[y < 1 ? 0 : y < 5 ? 1 : y < 10 ? 2 : 3] += r.count
  }
  const labels = ['< 1', '1–5', '5–10', '10+']
  const max = Math.max(1, ...acc)
  return (
    <div className="flex flex-col gap-1.5">
      {acc.map((v, i) =>
        v > 0 ? (
          <div key={labels[i]} className="flex items-center gap-2 px-1.5 text-[12px]">
            <span className="w-[46%] shrink-0 text-fg-muted">{labels[i]}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
              <span className="block h-full rounded-pill bg-[rgb(var(--success-mark))]" style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="w-8 text-right font-bold tabular-nums text-fg">{v}</span>
          </div>
        ) : null,
      )}
    </div>
  )
}

/* ── the popup: one slice's people, with the group's other slices as tabs ── */
const GROUP_META: Record<RosterGroup, { icon: typeof Users; titleKey: string }> = {
  gender: { icon: Users, titleKey: 'dashboard.drill.byGender' },
  age: { icon: CalendarDays, titleKey: 'dashboard.drill.byAge' },
  nationality: { icon: Globe2, titleKey: 'dashboard.drill.byNationality' },
  position: { icon: Briefcase, titleKey: 'dashboard.drill.byPosition' },
  acceptance: { icon: Briefcase, titleKey: 'dashboard.drill.seniorityTitle' },
}

function CompositionModal({
  drill,
  tabs,
  onTab,
  onClose,
  natLabel,
}: {
  drill: NonNullable<Drill>
  tabs: DrillTab[]
  onTab: (key: string) => void
  onClose: () => void
  natLabel: (raw?: string | null) => string
}) {
  const { t } = useTranslation()
  const openPerson = useOpenPerson()
  const { rows, loading, failed } = useRosterRows(drill.group, drill.key)
  const meta = GROUP_META[drill.group]
  const genderLabel = (g: RosterRow['gender']) =>
    t(g === 1 ? 'employees.gender_male' : g === 2 ? 'employees.gender_female' : 'employees.gender_unknown')
  const right = (r: RosterRow) => {
    if (drill.group === 'acceptance')
      return r.job_acceptance_date ? (
        <DrillPill>{t('dashboard.drill.hired', { date: r.job_acceptance_date.split('-').reverse().join('.') })}</DrillPill>
      ) : (
        <DrillPill tone="danger">{t('dashboard.drill.noDate')}</DrillPill>
      )
    if (drill.group === 'age' || drill.group === 'gender')
      return r.age != null ? (
        <span className="text-[13px] font-bold tabular-nums text-fg">{t('dashboard.drill.years', { count: r.age })}</span>
      ) : (
        <DrillPill tone="danger">{t('dashboard.drill.noDate')}</DrillPill>
      )
    if (drill.group === 'nationality') return <DrillPill>{genderLabel(r.gender)}</DrillPill>
    return r.age != null ? <DrillPill>{t('dashboard.drill.years', { count: r.age })}</DrillPill> : null
  }
  const title =
    drill.group === 'position'
      ? drill.key === 'none'
        ? t('dashboard.drill.noPosition')
        : drill.key
      : t('dashboard.board.staffTitle')
  const foot =
    drill.group === 'gender'
      ? t('dashboard.drill.genderFoot')
      : drill.group === 'age'
        ? t('dashboard.drill.ageFoot')
        : drill.group === 'acceptance' && (drill.key === 'import_day' || drill.key === 'missing')
          ? t('dashboard.drill.accFoot')
          : drill.group === 'position' && drill.key === 'none'
            ? t('dashboard.drill.posFoot')
            : undefined

  return (
    <DrillModal
      open
      onClose={onClose}
      icon={meta.icon}
      tone={drill.key === 'none' || drill.key === 'import_day' || drill.key === 'missing' ? 'warning' : 'brand'}
      title={title}
      subtitle={drill.group === 'position' ? undefined : t(meta.titleKey as never)}
      tabs={tabs}
      active={drill.key}
      onTab={onTab}
      footer={foot}
    >
      {(needle) =>
        loading ? (
          <DrillEmpty text={t('common.loading')} />
        ) : failed ? (
          <DrillEmpty text={t('list.loadFailed')} />
        ) : (
          (() => {
            const shown = rows.filter((r) =>
              matchNeedle(needle, r.legal_name, r.job_position_name, r.department_name, natLabel(r.nationality)),
            )
            return shown.length === 0 ? (
              <DrillEmpty text={t('dashboard.drill.empty')} />
            ) : (
              <div className="flex flex-col">
                {shown.map((r) => (
                  <PersonRow
                    key={r.id}
                    name={r.legal_name ?? t('common.unknown')}
                    meta={[lt(r.job_position_name), lt(r.department_name)].filter(Boolean).join(' · ')}
                    photo={r.photo_thumb_path}
                    right={right(r)}
                    onClick={() => {
                      onClose()
                      openPerson({ id: r.id, name: r.legal_name, photo: r.photo_thumb_path, position: lt(r.job_position_name), department: lt(r.department_name) })
                    }}
                  />
                ))}
              </div>
            )
          })()
        )
      }
    </DrillModal>
  )
}
