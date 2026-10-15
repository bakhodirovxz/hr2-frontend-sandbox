import { Suspense, lazy, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, Building2, CheckCircle2, Clock, Target, Timer, Users, XCircle, Zap } from 'lucide-react'
import { Splitter } from '@/components/layout/Splitter'
import { useBoardLayout } from '@/hooks/useBoardLayout'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useDashboard } from '@/features/dashboard/useDashboard'
import { useDiscipline } from '@/features/dashboard/useKadrBlocks'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { can, readsOrg } from '@/auth/permissions'
import { CarouselPanel, type CarouselSlide } from './Carousel'
/*
 * ⚠️ LAZY: this is the ONLY thing pulling recharts (426 KB) into the dashboard
 * chunk, and the dashboard is the landing route — so opening «/» paid for the
 * chart library from the first byte. Round 2 split `charts` off precisely so
 * the routes that never draw a chart would not carry it; the default route was
 * quietly the exception. The panel sits below the boards, so arriving a beat
 * later costs nothing.
 */
const DemographicsPanel = lazy(() =>
  import('./DemographicsPanel').then((m) => ({ default: m.DemographicsPanel })),
)
import { DeferUntilVisible } from '@/components/DeferUntilVisible'
import { LiveFeed } from './LiveFeed'
import { StatTile } from './StatTile'
import { DeptAttendanceFace, KpiSummaryFace, LateRankFace, StatusRingFace } from './slides'
import { useDepartmentsAttendance, useKpiSummary } from './useBoardData'
import { BoardTipHost } from './boardDrill'
import { PersonCalendarProvider } from './EmployeeCalendarModal'
import { QuickActionsFace } from './QuickActions'
import { AttendanceModal, type AttendanceTab } from './boardFaces'

/**
 * THE HR BOARD — NOCTURNE.
 *
 * Ported from the "HR Dashboard v2" screen of the design mock-ups
 * The composition is the design's, and so is its argument:
 *
 *   · the LEFT MARGIN is the minute — the register beside the turnstile;
 *   · the TOP OF THE MAIN COLUMN is the day's problem — what is late and whose
 *     it is — with the four readings of the roster stacked beside it;
 *   · the BOTTOM ROW is everything a personnel department also has to know but
 *     nobody needs all at once, so it is three WINDOWS that turn: the roster's
 *     shape and the noticeboard; birthdays, the KPI ranking and the lateness
 *     ranking; the execution summary and today's guests.
 *
 * Every figure comes off an endpoint that already exists. A block whose
 * endpoint is closed to this role goes quiet — it never shows a stub.
 */
export function HrDashboard() {
  const { t } = useTranslation()

  // Jonli tashrif panelidagi kun tanlagichi. 0 = bugun.
  const [feedDay, setFeedDay] = useState(0)
  /**
   * PANEL SIZES THE READER CHOSE. The dividers between the panels can be
   * dragged, and where they were put is kept on this device — see
   * `useBoardLayout`. The composition only becomes side-by-side at `lg`/`xl`;
   * below that the panels stack and a dragged width would mean nothing, so the
   * handles are not rendered and the designed sizes apply.
   */
  const { layout, limits, set, resetOne, resetAll, isCustom } = useBoardLayout()
  const wide = useMediaQuery('(min-width: 1280px)')
  const midWide = useMediaQuery('(min-width: 1024px)')
  const dash = useDashboard({}, feedDay)
  // Doska bo'limi ochiladigan tile'ning ro'yxati (kim kelgan / kech / kelmagan).
  const [attTab, setAttTab] = useState<AttendanceTab | null>(null)
  const user = useAuthStore((s) => s.user)
  // Bloklar foydalanuvchi o'qiy oladigan modul bo'yicha: endpoint yopiq bo'lsa
  // so'rov ham, slayd ham yo'q.
  const lateAllowed = readsOrg(user, 'attendance')
  const kpiAllowed = !!user?.kpi_enabled && readsOrg(user, 'kpi')
  const { rows: lateRank } = useDiscipline(lateAllowed)
  const { summary: kpiSummary, period: kpiPeriod } = useKpiSummary(kpiAllowed)
  const { rows: deptRows } = useDepartmentsAttendance(can(user, 'attendance'))

  const c = dash.counts
  const pct = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0)

  const windowA: CarouselSlide[] = [
    // Foydalanuvchining o'zi tanlagan tezkor havolalari.
    { key: 'quick', title: t('dashboard.quick.title'), icon: Zap, content: <QuickActionsFace kind="hr" /> },
    {
      key: 'status',
      title: t('dashboard.statusTitle'),
      icon: Target,
      content: <StatusRingFace counts={c} onOpen={setAttTab} />,
    },
  ]

  const windowB: CarouselSlide[] = [
    ...(lateAllowed
      ? [{ key: 'late', title: t('dashboard.board.lateRankTitle'), icon: Timer, content: <LateRankFace rows={lateRank} /> }]
      : []),
    ...(kpiAllowed
      ? [
          {
            key: 'kpi-summary',
            title: t('dashboard.board.kpiSummaryTitle'),
            icon: BarChart3,
            content: <KpiSummaryFace summary={kpiSummary} period={kpiPeriod} />,
          },
        ]
      : []),
  ]

  const windowC: CarouselSlide[] = [
    {
      key: 'departments',
      title: t('dashboard.board.deptAttendanceTitle'),
      icon: Building2,
      content: <DeptAttendanceFace rows={deptRows} />,
    },
  ]

  const windows = [
    { key: 'a', slides: windowA, wash: 'violet' as const },
    { key: 'b', slides: windowB, wash: 'success' as const },
    { key: 'c', slides: windowC, wash: 'info' as const },
  ].filter((w) => w.slides.length > 0)

  return (
    <PersonCalendarProvider>
    {/* `xl:min-h-[820px]`: the board fills the screen, but never below the height
        its panels were designed for — on a short screen (a 1280×800 laptop, or
        the low-vision A+ step, where 1000px tall reads as 800) the page scrolls
        instead of crushing the tiles into each other. rem after the build, so
        the floor grows with the font step. */}
    <div className="board-aurora flex flex-col gap-4 p-4 sm:p-5 xl:h-full xl:min-h-[820px] xl:flex-row">
      <BoardTipHost />
      <AttendanceModal rows={dash.rows} counts={c} tab={attTab} onTab={setAttTab} onClose={() => setAttTab(null)} />
      {/* Wrapped rather than given a `style` prop: the dragged width belongs to
          the SLOT the panel sits in, and LiveFeed keeps its own API. */}
      <div
        className="flex min-h-0 shrink-0 flex-col"
        style={wide ? { width: layout.leftW } : undefined}
      >
        <LiveFeed
          rows={dash.rows}
          events={dash.events}
          entries={dash.entriesToday}
          exits={dash.exitsToday}
          loading={dash.loading}
          dayOffset={feedDay}
          onDayOffset={setFeedDay}
          className="h-[520px] xl:h-auto xl:min-h-0 xl:flex-1"
        />
      </div>

      {wide && (
        <Splitter
          orientation="vertical"
          value={layout.leftW}
          onChange={(v) => set('leftW', v)}
          onReset={() => resetOne('leftW')}
          min={limits.leftW[0]}
          max={limits.leftW[1]}
          label={t('board.resizeLeft')}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-4 xl:min-h-0">
        <div className="flex flex-col gap-4 lg:flex-row xl:min-h-0 xl:flex-1">
          {/* ⚠️ «Diqqat talab qilinadigan ishlar» O'RNIGA xodimlar tarkibi.
              Eski panel muddati o'tgan topshiriqlarni ko'rsatardi va ko'p
              kunlari BO'SH turardi — taxta ustuni hech nima demasdi. */}
          {/* ⚠️ THE `charts` CHUNK IS 413 KB AND IT WAS ARRIVING ON FIRST PAINT.
              `lazy()` defers an import by a tick, not until the element is
              needed — and this element was rendered unconditionally. It sits
              below the boards, so it now mounts when scrolled to. */}
          <DeferUntilVisible
            minHeight={300}
            className="min-h-[380px] lg:min-h-[300px] lg:flex-1 xl:min-h-0"
          >
            {/* The fallback must keep the panel's box: with `null` the stat
                tiles slid into this column while the 413 KB chunk loaded and
                slid back when it arrived — CLS 0.30 on the home page, measured
                2026-09-19. */}
            <Suspense
              fallback={
                <div className="min-h-[380px] lg:min-h-[300px] lg:flex-1 xl:min-h-0" aria-hidden />
              }
            >
              <DemographicsPanel className="min-h-[380px] lg:min-h-[300px] lg:flex-1 xl:min-h-0" />
            </Suspense>
          </DeferUntilVisible>
          {midWide && (
            <Splitter
              orientation="vertical"
              value={layout.tilesW}
              onChange={(v) => set('tilesW', v)}
              onReset={() => resetOne('tilesW')}
              min={limits.tilesW[0]}
              max={limits.tilesW[1]}
              // The handle sits BEFORE the column it sizes, so dragging right
              // must shrink it, not grow it.
              invert
              label={t('board.resizeTiles')}
            />
          )}
          <div
            className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:shrink-0 lg:grid-cols-1"
            style={midWide ? { width: layout.tilesW } : undefined}
          >
            <StatTile
              label={t('dashboard.board.statTotal')}
              value={c.total}
              sub={t('dashboard.board.byRoster')}
              icon={Users}
              tone="brand"
              loading={dash.loading}
              progress={100}
              onClick={() => setAttTab('arrived')}
              tip={{ title: t('dashboard.board.statTotal'), rows: [
                [t('dashboard.donut.present'), c.arrived],
                [t('dashboard.donut.absent'), c.absent],
                [t('dashboard.drill.otherReason'), c.other],
              ] }}
            />
            <StatTile
              label={t('dashboard.board.statArrived')}
              value={c.arrived}
              sub={t('dashboard.board.attendancePct', { pct: pct(c.arrived) })}
              icon={CheckCircle2}
              tone="success"
              loading={dash.loading}
              progress={pct(c.arrived)}
              onClick={() => setAttTab('arrived')}
              tip={{ title: t('dashboard.board.statArrived'), rows: [
                [t('dashboard.drill.onTime'), c.present],
                [t('dashboard.donut.late'), c.late],
                [t('dashboard.insideNow'), c.inside],
              ] }}
            />
            <StatTile
              label={t('dashboard.gate.late')}
              value={c.late}
              sub={`${pct(c.late)}%`}
              icon={Clock}
              tone="warning"
              loading={dash.loading}
              progress={pct(c.late)}
              onClick={() => setAttTab('late')}
              tip={{ title: t('dashboard.gate.late'), rows: [[t('dashboard.drill.employees'), c.late], [t('dashboard.drill.tipOpen'), '']] }}
            />
            <StatTile
              label={t('dashboard.gate.absent')}
              value={c.absent}
              sub={`${pct(c.absent)}%`}
              icon={XCircle}
              tone="danger"
              loading={dash.loading}
              progress={pct(c.absent)}
              onClick={() => setAttTab('absent')}
              tip={{ title: t('dashboard.gate.absent'), rows: [[t('dashboard.drill.employees'), c.absent], [t('dashboard.drill.tipOpen'), '']] }}
            />
          </div>
        </div>

        {wide && (
          <div className="relative">
            <Splitter
              orientation="horizontal"
              value={layout.bottomH}
              onChange={(v) => set('bottomH', v)}
              onReset={() => resetOne('bottomH')}
              min={limits.bottomH[0]}
              max={limits.bottomH[1]}
              // Below the handle, so dragging down shrinks the row.
              invert
              label={t('board.resizeBottom')}
            />
            {/* One way back to the designed board. Only drawn once something
                has actually been moved — an always-visible reset on a board
                nobody has touched is just noise. */}
            {isCustom && (
              <button
                type="button"
                onClick={resetAll}
                className="absolute right-0 top-1/2 -translate-y-1/2 rounded-pill bg-surface-2 px-2.5 py-0.5 text-[11px] text-fg-muted transition-colors hover:text-fg"
              >
                {t('board.resetLayout')}
              </button>
            )}
          </div>
        )}

        <div
          className={cn(
            'grid gap-4 md:grid-cols-2 xl:shrink-0',
            windows.length >= 3 ? 'xl:grid-cols-3' : 'xl:grid-cols-2',
          )}
          style={wide ? { height: layout.bottomH } : undefined}
        >
          {windows.map((w, i) => (
            <CarouselPanel
              key={w.key}
              eyebrow={t('dashboard.board.sectionEyebrow')}
              slides={w.slides}
              wash={w.wash}
              offsetSec={i * 3}
              className={cn('h-[360px] xl:h-full', i === 0 && windows.length === 3 && 'md:col-span-2 xl:col-span-1')}
            />
          ))}
        </div>
      </div>
    </div>
    </PersonCalendarProvider>
  )
}
