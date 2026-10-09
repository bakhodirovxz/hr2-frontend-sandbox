import { Suspense, lazy, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BarChart3, Zap, Cake, CheckCircle2, Clock, IdCard, Newspaper, Target, Timer, Trophy, Users, XCircle } from 'lucide-react'
import { Splitter } from '@/components/layout/Splitter'
import { useBoardLayout } from '@/hooks/useBoardLayout'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useDashboard } from '@/features/dashboard/useDashboard'
import { useDiscipline } from '@/features/dashboard/useKadrBlocks'
import { useAuthStore } from '@/store/authStore'
import { canSeeLateness } from '@/auth/roles'
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
import { BirthdaysFace, GuestsFace, LateRankFace, StatusRingFace } from './slides'
import { useGuestPasses, useIjroTasks, useOverdueSummary, useVisitorCounters } from './useBoardData'
import { BoardTipHost, useKpiSheets } from './boardDrill'
import { PersonCalendarProvider } from './EmployeeCalendarModal'
import { QuickActionsFace } from './QuickActions'
import { CompanyNewsFace, useCompanyNews } from './CompanyNewsFace'
import {
  AttendanceModal,
  DisciplineFace,
  IjroModal,
  KpiModal,
  KpiSheetsFace,
  TopKpiFace,
  type AttendanceTab,
  type IjroTab,
  type KpiBand,
} from './boardFaces'

/**
 * THE HR BOARD — NOCTURNE.
 *
 * Ported from the "HR Dashboard v2" screen of the Claude Design project
 * afd32a12. The composition is the design's, and so is its argument:
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
  const { all: ijroAll } = useIjroTasks()
  // Company news now comes from uzgidro.uz (user, 2026-09-24), not the HR «news-posts».
  const { news } = useCompanyNews()
  // REAL KPI (evaluation sheets). The old `kpi-summary` / `employee-kpi` were
  // computed from turnstile presence — attendance under a KPI label.
  const { data: kpiSheets, failed: kpiClosed } = useKpiSheets(true)
  // Popups: who is behind a tile, an ijro tally, a KPI band.
  const [attTab, setAttTab] = useState<AttendanceTab | null>(null)
  const [ijroTab, setIjroTab] = useState<IjroTab | null>(null)
  const [kpiBand, setKpiBand] = useState<KpiBand | null>(null)
  // Closed to some roles (a KPI admin, say): then no request and no slide,
  // like every other block on this board whose endpoint the role cannot read.
  const lateAllowed = canSeeLateness(useAuthStore((s) => s.user))
  const { rows: lateRank } = useDiscipline(lateAllowed)
  const { guests } = useGuestPasses(true)
  const { summary } = useOverdueSummary(true)
  // Mehmon hisoblagichlari — `retry: false`: roli yopiq bo'lsa blok jim qoladi.
  // «Bo'limlar davomati» slaydi 2026-09-24 da foydalanuvchi so'rovi bilan olib tashlandi.
  const { counters: visitorCounters } = useVisitorCounters(true)

  const c = dash.counts
  const pct = (n: number) => (c.total ? Math.round((n / c.total) * 100) : 0)

  const windowA: CarouselSlide[] = [
    // The person's own shortcuts — chosen by them (2026-09-24).
    { key: 'quick', title: t('dashboard.quick.title'), icon: Zap, content: <QuickActionsFace kind="hr" /> },
    {
      key: 'status',
      title: t('dashboard.statusTitle'),
      icon: Target,
      content: <StatusRingFace counts={c} onOpen={setAttTab} />,
    },
    ...(news.length
      ? [{ key: 'news', title: t('dashboard.board.newsTitle'), icon: Newspaper, content: <CompanyNewsFace news={news} /> }]
      : []),
  ]

  const windowB: CarouselSlide[] = [
    {
      key: 'birthdays',
      title: t('dashboard.birthdaysTitle'),
      icon: Cake,
      content: <BirthdaysFace birthdays={dash.birthdays} />,
    },
    // A role the KPI sheets are closed to gets neither KPI face — no stub numbers.
    ...(kpiClosed
      ? []
      : [{ key: 'top', title: t('dashboard.board.topTitle'), icon: Trophy, content: <TopKpiFace data={kpiSheets} /> }]),
    ...(lateAllowed
      ? [{ key: 'late', title: t('dashboard.board.lateRankTitle'), icon: Timer, content: <LateRankFace rows={lateRank} /> }]
      : []),
    ...(kpiClosed
      ? []
      : [
          {
            key: 'kpi-summary',
            title: t('dashboard.board.kpiSummaryTitle'),
            icon: BarChart3,
            content: <KpiSheetsFace data={kpiSheets} onOpen={setKpiBand} />,
          },
        ]),
  ]

  const windowC: CarouselSlide[] = [
    {
      key: 'discipline',
      title: t('dashboard.board.execDisciplineTitle'),
      icon: AlertTriangle,
      content: <DisciplineFace all={ijroAll} summary={summary} onOpen={setIjroTab} />,
    },
    {
      key: 'guests',
      title: t('dashboard.board.guestsTitle'),
      icon: IdCard,
      content: <GuestsFace guests={guests} counters={visitorCounters} />,
    },
  ]

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
      <IjroModal all={ijroAll} summary={summary} tab={ijroTab} onTab={setIjroTab} onClose={() => setIjroTab(null)} />
      {kpiSheets && <KpiModal data={kpiSheets} band={kpiBand} onBand={setKpiBand} onClose={() => setKpiBand(null)} />}
      {/* Wrapped rather than given a `style` prop: the dragged width belongs to
          the SLOT the panel sits in, and LiveFeed keeps its own API. */}
      <div
        className="flex min-h-0 shrink-0 flex-col"
        style={wide ? { width: layout.leftW } : undefined}
      >
        <LiveFeed
          rows={dash.rows}
          events={dash.events}
          guests={guests}
          entries={dash.entriesToday}
          exits={dash.exitsToday}
          loading={dash.loading}
          dayOffset={feedDay}
          onDayOffset={setFeedDay}
          wsStatus={dash.wsStatus}
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
          className="grid gap-4 md:grid-cols-2 xl:shrink-0 xl:grid-cols-3"
          style={wide ? { height: layout.bottomH } : undefined}
        >
          <CarouselPanel
            eyebrow={t('dashboard.board.sectionEyebrow')}
            slides={windowA}
            wash="violet"
            className="h-[360px] md:col-span-2 xl:col-span-1 xl:h-full"
          />
          <CarouselPanel
            eyebrow={t('dashboard.board.sectionEyebrow')}
            slides={windowB}
            wash="success"
            offsetSec={3}
            className="h-[360px] xl:h-full"
          />
          <CarouselPanel
            eyebrow={t('dashboard.board.sectionEyebrow')}
            slides={windowC}
            wash="info"
            offsetSec={6}
            className="h-[360px] xl:h-full"
          />
        </div>
      </div>
    </div>
    </PersonCalendarProvider>
  )
}
