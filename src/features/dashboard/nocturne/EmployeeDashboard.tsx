import { useTranslation } from 'react-i18next'
import { BarChart3, Building2, Cake, CalendarCheck, IdCard, ListChecks, Newspaper, ShieldCheck, Users, Zap } from 'lucide-react'
import dayjs from 'dayjs'
import { useDashboard } from '@/features/dashboard/useDashboard'
import { AttendanceStatsList } from './AttendanceStatsView'
import { CarouselPanel, type CarouselSlide } from './Carousel'
import { MyDayCard } from './MyDayCard'
import { StatTile } from './StatTile'
import { BirthdaysFace, GuestsFace } from './slides'
import { RequestsFace, TabelFace } from './employeeSlides'
import { useGuestPasses, useVisitorCounters } from './useBoardData'
import { useEmployeeBoard } from './useEmployeeBoard'
import { QuickActionsFace } from './QuickActions'
import { CompanyNewsFace, useCompanyNews } from './CompanyNewsFace'
import { MyKpiCard, useMonthLabel, useMyKpiSheets } from './MyKpiCard'
import { BoardTipHost } from './boardDrill'
import { EmployeeCalendarModal } from './EmployeeCalendarModal'
import { useState } from 'react'
import { Splitter } from '@/components/layout/Splitter'
import { useBoardLayout } from '@/hooks/useBoardLayout'
import { useMediaQuery } from '@/hooks/useMediaQuery'


/**
 * THE EMPLOYEE BOARD — NOCTURNE.
 *
 * Ported from the "Xodim Dashboard" screen of the Claude Design project
 * afd32a12. Same grammar as the HR board, turned around: the left margin is
 * YOUR day rather than the branch's minute, the big block is what YOU owe
 * rather than what the branch is late on, and the two windows carry the things
 * that concern you occasionally — your requests, your tabel, whose birthday it
 * is, what was posted.
 *
 * The branch roster used to sit behind a second tab; it is the block people
 * actually open this screen for, so it is now the board's main window — and
 * "my department" is one of its faces rather than a filter button beside it.
 */
export function EmployeeDashboard() {
  const { t } = useTranslation()
  const months = t('date.months', { returnObjects: true })

  const me = useEmployeeBoard()
  const { guests } = useGuestPasses(true)
  const { counters: visitorCounters } = useVisitorCounters(true)
  const dash = useDashboard({})
  // Company news now comes from uzgidro.uz (user, 2026-09-24), not the HR «news-posts».
  const { news } = useCompanyNews()

  const monthName = months[dayjs().month()]
  // REAL KPI: the latest CLOSED evaluation sheet, not the half-filled current month.
  const { data: myKpi } = useMyKpiSheets(!!me.employee)
  const ml = useMonthLabel()
  const kpiLast = myKpi?.last ?? null
  const [ownCalendar, setOwnCalendar] = useState(false)
  // Draggable dividers, as on the HR board — sizes kept per device, per board.
  const { layout, limits, set, resetOne, resetAll, isCustom } = useBoardLayout('employee')
  const wide = useMediaQuery('(min-width: 1280px)')
  const midWide = useMediaQuery('(min-width: 1024px)')
  const emp = me.employee

  const windowA: CarouselSlide[] = [
    // The person's own shortcuts — chosen by them (2026-09-24).
    { key: 'quick', title: t('dashboard.quick.title'), icon: Zap, content: <QuickActionsFace kind="employee" /> },
    {
      key: 'requests',
      icon: ShieldCheck,
      title: t('dashboard.board.myRequestsTitle'),
      content: <RequestsFace requests={me.requests} />,
    },
    {
      key: 'tabel',
      icon: CalendarCheck,
      title: t('dashboard.board.tabelTitle', { month: monthName }),
      content: <TabelFace tabel={me.tabel} />,
    },
  ]

  /**
   * The roster, twice: the whole branch and just my department. A two-value
   * filter does not need a row of pills when the window already turns.
   */
  const myDept = me.employee?.department
  const myDeptName = typeof myDept === 'object' && myDept ? (myDept.name ?? '') : ''
  const attendanceSlides: CarouselSlide[] = [
    {
      key: 'all',
      icon: Users,
      title: t('dashboard.board.scopeAll'),
      content: (
        <AttendanceStatsList rows={dash.rows} counts={dash.counts} loading={dash.tableLoading} scope="all" />
      ),
    },
    ...(myDeptName
      ? [{
          key: 'dept',
      icon: Building2,
          title: myDeptName,
          content: (
            <AttendanceStatsList rows={dash.rows} counts={dash.counts} loading={dash.tableLoading} scope="dept" />
          ),
        }]
      : []),
  ]

  const windowB: CarouselSlide[] = [
    {
      key: 'birthdays',
      icon: Cake,
      title: t('dashboard.birthdaysTitle'),
      content: <BirthdaysFace birthdays={dash.birthdays} />,
    },
    ...(news.length
      ? [{ key: 'news', icon: Newspaper, title: t('dashboard.board.newsTitle'), content: <CompanyNewsFace news={news} /> }]
      : []),
    // «Mehmonlar (kirdi-chiqdi)» — v1 draws this on the EMPLOYEE dashboard too
    // (`EmployeeDashboardPage.jsx`). v2 built the face but mounted it only on
    // the HR board, so an ordinary employee could not see who was visiting.
    // Only rendered when there is something to show, so a quiet day does not
    // add an empty slide to the carousel.
    ...(guests.length
      ? [{ key: 'guests', icon: IdCard, title: t('dashboard.board.guestsTitle'), content: <GuestsFace guests={guests} counters={visitorCounters} /> }]
      : []),
  ]

  return (
    <div className="board-aurora flex min-h-full flex-col gap-4 p-4 sm:p-5 xl:h-full xl:min-h-[820px]">
      {/* Floor height: see HrDashboard — short screens scroll, panels keep their size. */}
      <BoardTipHost />
      <EmployeeCalendarModal
        person={
          ownCalendar && emp
            ? {
                id: emp.id,
                name: emp.legal_name,
                photo: emp.photo_thumb_path,
                position: typeof emp.job_position === 'object' ? emp.job_position?.name : emp.job_position,
                department: typeof emp.department === 'object' ? emp.department?.name : null,
              }
            : null
        }
        onClose={() => setOwnCalendar(false)}
      />
      <div className="flex flex-1 flex-col gap-4 xl:min-h-0 xl:flex-row">
        <MyDayCard
          employee={me.employee}
          arrivedAt={me.arrivedAt}
          workedMinutes={me.workedMinutes}
          summary={me.summary}
          kpiPercent={kpiLast?.mine ?? null}
          kpiMonth={kpiLast ? ml.full(kpiLast.month) : undefined}
          todayEvents={me.todayEvents}
          onOpenDay={() => setOwnCalendar(true)}
          week={me.week}
          loading={me.loading}
          className="xl:shrink-0"
          style={wide ? { width: layout.leftW } : undefined}
        />
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
            {/* The board's main window: who is in today. "My department" is
                simply the window's second face — no extra tab, no filter row. */}
            <CarouselPanel
              slides={attendanceSlides}
              intervalSec={0}
              wash="violet"
              className="h-[440px] lg:h-auto lg:min-h-[360px] lg:flex-1 xl:min-h-0"
            />
            {midWide && (
              <Splitter
                orientation="vertical"
                value={layout.tilesW}
                onChange={(v) => set('tilesW', v)}
                onReset={() => resetOne('tilesW')}
                min={limits.tilesW[0]}
                max={limits.tilesW[1]}
                invert
                label={t('board.resizeTiles')}
              />
            )}
            <div
              className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:shrink-0 lg:grid-cols-1"
              style={midWide ? { width: layout.tilesW } : undefined}
            >
              <StatTile
                label={t('dashboard.board.statMyTasks')}
                value={me.taskCounts.overdue + me.taskCounts.today + me.taskCounts.soon}
                sub={t('dashboard.board.chipOverdue', { count: me.taskCounts.overdue })}
                icon={ListChecks}
                tone="brand"
                loading={me.tasksLoading}
                progress={0}
              />
              <StatTile
                label={t('dashboard.board.statAttendance', { month: monthName })}
                value={`${me.attendancePct}%`}
                sub={t('dashboard.board.ofWorkDaysShort', {
                  done: me.tabel.present + me.tabel.late,
                  total: me.tabel.counted,
                })}
                icon={CalendarCheck}
                tone="success"
                loading={me.loading}
                progress={me.attendancePct}
                onClick={() => setOwnCalendar(true)}
                tip={{ title: t('dashboard.board.statAttendance', { month: monthName }), rows: [
                  [t('attendance.stPresent'), me.tabel.present],
                  [t('attendance.stLate'), me.tabel.late],
                  [t('attendance.stAbsent'), me.tabel.absent],
                ] }}
              />
              <StatTile
                label={kpiLast ? t('dashboard.myKpi.tile', { month: ml.full(kpiLast.month) }) : t('dashboard.board.statKpi')}
                value={kpiLast?.mine == null ? '—' : `${Math.round(kpiLast.mine)}%`}
                sub={kpiLast?.rank ? t('dashboard.myKpi.tileSub', { position: kpiLast.rank.position, of: kpiLast.rank.of }) : undefined}
                icon={BarChart3}
                tone="info"
                progress={kpiLast?.mine ?? 0}
              />
              <StatTile
                label={t('dashboard.board.statRequests')}
                value={me.pendingRequests}
                sub={t('leave.statusPending')}
                icon={ShieldCheck}
                tone="warning"
                loading={me.leavesLoading}
                progress={0}
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
                invert
                label={t('board.resizeBottom')}
              />
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
            <CarouselPanel slides={windowA} wash="violet" className="h-[340px] xl:h-full" />
            <MyKpiCard className="h-[340px] xl:h-full" />
            <CarouselPanel slides={windowB} wash="success" offsetSec={4} className="h-[340px] md:col-span-2 xl:col-span-1 xl:h-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
