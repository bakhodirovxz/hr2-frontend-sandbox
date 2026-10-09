import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Download, LogOut, PencilLine, UserX } from 'lucide-react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Segmented } from '@/components/ui/Segmented'
import { Checkbox } from '@/components/ui/Checkbox'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { LateDaysModal } from '@/features/attendance/LateDaysModal'
import { EarlyLeaveDaysModal } from '@/features/attendance/EarlyLeaveDaysModal'
import { mapCalStatus } from '@/features/attendance/attendanceStatus'
import { Pagination } from '@/components/data/Pagination'
import { useListParams } from '@/hooks/useListParams'
import { useBranchStore } from '@/store/branchStore'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useHasSubordinates } from '@/features/employees/useEmployees'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useAttendance, defaultAttendanceRange, type AttendanceRow, type AttendanceSortKey } from '@/features/attendance/useAttendance'
import { CalendarStrip } from '@/features/attendance/CalendarStrip'
import { CAL_COLOR, CAL_LABEL, LEGEND_STATUSES } from '@/features/attendance/attendanceStatus'
import { DateInput } from '@/components/ui/DateInput'
import { downloadFile } from '@/lib/download'
import { errorMessage } from '@/api/errorMessage'
import { useToast } from '@/components/ui/Toast'
import { IconButton } from '@/components/ui/IconButton'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import { ManualAttendanceModal } from '@/features/attendance/ManualAttendanceModal'
import { AttendanceSheet } from '@/features/attendance/AttendanceSheet'
import { AttendanceLockBar } from '@/features/attendance/AttendanceLockBar'
// Ko'p tanlovli tanlagich — hisobotlar shaklidagi bilan BITTA komponent
// (KPI varaqalari tabi ham shuni ishlatadi), takror yozilmasin.
import { MultiPicker } from '@/features/reports/MultiPicker'

const FILTER_KEYS = ['dept', 'pos', 'from', 'to', 'type', 'worker', 'sort', 'dir', 'team'] as const

/** Table column → server `sort_by`. Only these columns are sortable. */
const SORT_COLUMNS: Record<string, AttendanceSortKey> = {
  present: 'present',
  absent: 'absent',
  late: 'late',
  hours: 'hours',
}

/**
 * Early departures in the period. The server counts them
 * (`early_leave_days_count`, with the exit time per day in
 * `daily_early_leave`); the calendar fallback only serves a response from an
 * older API that does not carry the field yet.
 */
function countEarly(row: AttendanceRow): number {
  const n = row.attendance?.early_leave_days_count
  if (typeof n === 'number') return n
  const cal = row.attendance?.calendar ?? {}
  return Object.values(cal).filter((v) => mapCalStatus(v) === 'early_leave').length
}

export function AttendancePage() {
  const { t } = useTranslation()
  const [lateFor, setLateFor] = useState<AttendanceRow | null>(null)
  const [earlyFor, setEarlyFor] = useState<AttendanceRow | null>(null)
  const [sheetFor, setSheetFor] = useState<AttendanceRow | null>(null)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters } = useListParams(FILTER_KEYS)

  const def = useMemo(() => defaultAttendanceRange(), [])
  const from = filters.from || def.from
  const to = filters.to || def.to
  // The default window goes INTO the URL, so a copied link opens on the same
  // days later — not on whatever month it is when the link is opened.
  useEffect(() => {
    if (!filters.from || !filters.to) {
      setFilters({ from, to, page: page > 1 ? String(page) : null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to])
  const rangeInvalid = from > to

  // Server ordering. Both halves are validated here so a hand-edited URL can
  // never send a value the API rejects with 422.
  const sortBy = SORT_COLUMNS[filters.sort]
  const sortDir: 'asc' | 'desc' = filters.dir === 'asc' ? 'asc' : 'desc'
  const sort: SortState | null = sortBy ? { key: filters.sort, dir: sortDir } : null

  // "Only my team" is offered to someone who supervises anyone.
  const hasTeam = useHasSubordinates()
  const supervised = hasTeam && filters.team === '1'

  // Correcting a day is an HR action (`_require_hr` on the server).
  const currentUser = useAuthStore((st) => st.user)
  // Server: `require_roles("hr","admin","master-admin")` — a ministr got 403 (measured).
  const canCorrect = roles.isHR(currentUser) || roles.isSiteMasterAdmin(currentUser)
  const [correcting, setCorrecting] = useState<{ id: number; legal_name?: string | null } | null>(null)

  const departmentOptions = useDepartmentOptions()
  const jobPositionOptions = useJobPositionOptions()

  // KO'P TANLOV (2026-09-22): bir necha bo'lim / lavozim. URL'da vergul bilan
  // (`?dept=3,7`) — havola nusxa ko'chirilsa ham o'sha tanlov ochiladi; API'ga
  // esa takrorlanuvchi `department_ids` bo'lib ketadi. Eski bitta qiymatli
  // havola (`?dept=3`) shu o'qishda BIR ELEMENTLI ro'yxat bo'lib ishlayveradi.
  const deptIds = useMemo(() => (filters.dept ? filters.dept.split(',').filter(Boolean) : []), [filters.dept])
  const posIds = useMemo(() => (filters.pos ? filters.pos.split(',').filter(Boolean) : []), [filters.pos])
  const setIds = (key: 'dept' | 'pos', next: (string | number)[]) =>
    setFilter(key, next.map(String).join(','))

  const { rows, total, pages, loading, fetching, error, refetch } = useAttendance({
    from,
    to,
    page,
    size,
    search,
    departmentIds: deptIds,
    jobPositionIds: posIds,
    filterType: filters.type,
    workerType: filters.worker || 'regular',
    sortBy,
    sortDir,
    supervised,
    enabled: !rangeInvalid,
  })

  // Dates count as a filter only when they differ from the default window.
  const rangeChanged = from !== def.from || to !== def.to
  const filterCount =
    [filters.dept, filters.pos, filters.type, filters.worker, supervised ? '1' : '', search].filter(Boolean).length +
    (rangeChanged ? 1 : 0)
  const resetFilters = () =>
    setFilters({ dept: null, pos: null, type: null, worker: null, team: null, sort: null, dir: null, q: null, from: def.from, to: def.to })

  const jobTitle = (r: AttendanceRow) =>
    typeof r.job_position === 'string' ? r.job_position : r.job_position?.name

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'employee',
      header: t('attendance.colEmployee'),
      skeleton: 'w-48',
      cell: (r) => (
        <div className="flex items-center gap-3">
          <Avatar src={r.photo_thumb_path} fallbackSrc={r.photo_path} name={r.legal_name} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-fg">{r.legal_name || t('common.unknown')}</p>
            <p className="truncate text-[11px] text-fg-muted">{jobTitle(r) || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'dept',
      header: t('attendance.colDepartment'),
      className: 'text-fg-muted',
      // One line, full name on hover — long names wrapped rows to 2–3 lines.
      cell: (r) => (
        <span className="block max-w-[16rem] truncate" title={r.department?.name || ''}>
          {r.department?.name || '—'}
        </span>
      ),
    },
    {
      key: 'present',
      header: t('attendance.colPresent'),
      sortValue: (r) => r.attendance.present_days_count,
      className: 'text-center font-semibold tabular-nums text-success',
      headerClassName: 'text-center',
      skeleton: 'w-8',
      cell: (r) => r.attendance.present_days_count,
    },
    {
      key: 'absent',
      header: t('attendance.colAbsent'),
      sortValue: (r) => r.attendance.absent_days_count,
      className: 'text-center font-semibold tabular-nums text-danger',
      headerClassName: 'text-center',
      skeleton: 'w-8',
      cell: (r) => r.attendance.absent_days_count,
    },
    {
      key: 'late',
      header: t('attendance.colLate'),
      sortValue: (r) => r.attendance.late_days_count,
      className: 'text-center font-semibold tabular-nums text-warning',
      headerClassName: 'text-center',
      skeleton: 'w-8',
      // Clicking the number opens WHICH days and by how much — v1 does the same
      // from this cell. The breakdown is already in the response.
      cell: (r) =>
        r.attendance.late_days_count > 0 ? (
          <button
            type="button"
            onClick={() => setLateFor(r)}
            className="underline decoration-dotted underline-offset-2 hover:text-fg"
          >
            {r.attendance.late_days_count}
          </button>
        ) : (
          r.attendance.late_days_count
        ),
    },
    {
      key: 'early',
      header: t('attendance.colEarly'),
      // `'early'` was ALREADY declared as an accepted server sort key
      // (`ATTENDANCE_SORT_KEYS`) — the column it would sort was never drawn.
      sortValue: (r) => countEarly(r),
      className: 'text-center font-semibold tabular-nums text-info',
      headerClassName: 'text-center',
      skeleton: 'w-8',
      // Which days, and at what time they left («17:30 (18:00 gacha)») — the
      // same drill the lateness cell has.
      cell: (r) =>
        countEarly(r) > 0 && r.attendance.daily_early_leave ? (
          <button
            type="button"
            onClick={() => setEarlyFor(r)}
            className="underline decoration-dotted underline-offset-2 hover:text-fg"
          >
            {countEarly(r)}
          </button>
        ) : (
          countEarly(r)
        ),
    },
    {
      key: 'hours',
      header: t('attendance.colHours'),
      sortValue: (r) => r.attendance.work_duration_hours,
      className: 'text-center font-semibold tabular-nums text-brand-strong',
      headerClassName: 'text-center',
      skeleton: 'w-10',
      // Soat bo'yicha o'rindoshda raqamning o'zi yetarli emas — «62 soat» ko'p
      // yoki kammi, faqat kelishuv normasi bilan ma'lum bo'ladi.
      cell: (r) => {
        const hours = `${Math.round(r.attendance.work_duration_hours)} ${t('attendance.hoursUnit')}`
        const norm = r.attendance.concurrent_post?.norm_hours_for_range
        if (norm == null) return hours
        return (
          <span className="inline-flex flex-col leading-tight">
            <span>{hours}</span>
            <span className="text-[11px] font-normal text-fg-muted">
              {t('assignments.normLabel')}: {Math.round(norm)} {t('attendance.hoursUnit')}
            </span>
          </span>
        )
      },
    },
    ...(canCorrect
      ? [
          {
            key: 'fix',
            header: '',
            headerClassName: 'w-10',
            cell: (r: AttendanceRow) => (
              <IconButton
                size="sm"
                label={t('manual.action')}
                onClick={(e) => {
                  e.stopPropagation()
                  setCorrecting({ id: r.id, legal_name: r.legal_name })
                }}
              >
                <PencilLine size={14} />
              </IconButton>
            ),
          } as Column<AttendanceRow>,
        ]
      : []),
    {
      key: 'calendar',
      header: t('attendance.colCalendar'),
      skeleton: 'w-40',
      cell: (r) => <CalendarStrip calendar={r.attendance.calendar} from={from} to={to} />,
    },
  ]

  const toggleType = (v: 'late' | 'absent' | 'early_leave') => setFilter('type', filters.type === v ? '' : v)

  /**
   * DAVOMATNI EKSPORT QILISH — v1 dagi «Yuklash» tugmalari (kechikkanlar,
   * kelmaganlar, umumiy) v2 ga o'tmagan edi: butun sahifada birorta ham
   * eksport yo'q edi, kadr esa oyni yakunlashda aynan shu faylni oladi.
   *
   * ⚠️ SERVER QURADI, EKRAN EMAS.
   *
   * Bu tugma avval `exportTable` bilan EKRANDAGI qatorlarni yuborardi — ya'ni
   * FAQAT joriy sahifani (standarti 25 qator) va 6 ta ustunni. Jadval
   * yonida «212 tadan 25 tasi ko'rsatilmoqda» deb turgani holda fayl 25
   * qatordan iborat bo'lardi va buni hech kim sezmasdi. v1 esa butun
   * filtrlangan davrni serverdan olardi.
   *
   * Shuning uchun `normalized/export-excel` — u ekrandagi HAR BIR filtrni
   * oladi. Kam parametr yuborish jimgina BOSHQA hujjat yasaydi.
   */
  /*
   * ONE SOURCE FOR THE TABLE AND THE FILES.
   *
   * ⚠️ THE EXPORTS WERE THREE PARAMETERS SHORT and nobody could see it. The
   * table is narrowed by `organization_branch_id`, `filter_type` and
   * `worker_type`; the files sent none of the first two and defaulted the
   * third differently. So with a branch selected the screen showed one branch
   * and the workbook contained all 28 — a file that leaves the building with
   * data the viewer was never shown. The "Kechikkanlar" chip was ignored too.
   *
   * The branch is the sharpest of the three because this page never reads it
   * itself: `useAttendance` adds it internally, so the export had no way to
   * inherit it. Building both from this object is what stops them drifting
   * again — the same shape `useMedical` uses for its list and export.
   */
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const exportParams = {
    date_from: from,
    date_to: to,
    organization_branch_id: branchId || undefined,
    department_ids: deptIds.length ? deptIds : undefined,
    job_position_ids: posIds.length ? posIds : undefined,
    // The list defaults to 'regular'; the file must not quietly widen to
    // regular + ГПХ because the value happens to be empty.
    worker_type: filters.worker || 'regular',
    supervised: supervised || undefined,
    search: search || undefined,
    sort_by: sortBy || undefined,
    sort_dir: sortDir || undefined,
  }

  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const [exportingKind, setExportingKind] = useState<'late' | 'absent' | 'early_leave' | null>(null)
  const exportRows = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: 'turnstile-attendance-events/normalized/export-excel',
        // `filter_type` too: the late/absent chip narrows the table, so a file
        // without it is a different document from the one on screen.
        params: { ...exportParams, filter_type: filters.type || undefined },
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${t('attendance.title')}_${from}_${to}.xlsx`,
      })
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setExporting(false)
    }
  }

  /**
   * The LATE / ABSENT report, built by the SERVER.
   *
   * The Excel button beside it exports what is on screen — the loaded page,
   * with the columns the table happens to show. This one is a different
   * document: the server walks the whole filtered period and produces the
   * summary personnel actually hand upward. Doing that in the browser would
   * mean pulling every day of every employee just to add them up.
   */
  const exportLateAbsent = async (filterType: 'late' | 'absent' | 'early_leave') => {
    setExportingKind(filterType)
    try {
      await downloadFile({
        url: 'turnstile-attendance-events/normalized/export-late-absent',
        // ⚠️ EVERY filter the screen applies, not just some of them. Sending
        // a subset silently produces a different document from the one being
        // looked at — a position or worker-type filter would be dropped and
        // nobody would know the file was wider than the table.
        // Here `filter_type` is the REPORT's own kind, not the screen chip.
        params: { ...exportParams, filter_type: filterType },
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `${t(
          filterType === 'late' ? 'attendance.colLate'
            : filterType === 'early_leave' ? 'attendance.colEarly'
            : 'attendance.colAbsent',
        )}_${from}_${to}.xlsx`,
      })
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setExportingKind(null)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('attendance.title')}
        subtitle={t('attendance.subtitle')}
        actions={
          /* Four equal «download» buttons → one menu (redesign 2026-09-24):
             they are one decision — which Excel — not four tasks. */
          <span data-tour="att-export" className="contents">
            <ActionMenu
              label={t('staff.download')}
              icon={<Download size={14} />}
              width={290}
              items={[
                { key: 'all', label: t('attendance.exportAll'), hint: t('attendance.exportAllHint'), icon: <Download size={14} />, loading: exporting, disabled: rows.length === 0, onClick: exportRows },
                { key: 'late', label: t('attendance.exportLate'), icon: <Clock size={14} />, loading: exportingKind === 'late', divider: true, onClick: () => exportLateAbsent('late') },
                { key: 'absent', label: t('attendance.exportAbsent'), icon: <UserX size={14} />, loading: exportingKind === 'absent', onClick: () => exportLateAbsent('absent') },
                { key: 'early', label: t('attendance.exportEarly'), hint: t('attendance.earlyLeaveHint'), icon: <LogOut size={14} />, loading: exportingKind === 'early_leave', onClick: () => exportLateAbsent('early_leave') },
              ]}
            />
          </span>
        }
      />

      {/* Is the month on screen still open? A closed period refuses corrections
          and leave orders on the server, so the answer belongs above the table
          and not in an error message after the fact. */}
      <AttendanceLockBar branchId={branchId} from={from} to={to} canManage={canCorrect} />

      {/* ГПХ staff are a SEPARATE list, not a filter on the same one — they are
          paid and reported apart, and the server refuses to mix them. */}
      <div className="mb-3">
        <Segmented
          value={filters.worker || 'regular'}
          onChange={(v) => setFilters({ worker: v === 'regular' ? '' : v, page: '1' })}
          options={[
            { value: 'regular', label: t('attendance.workerRegular') },
            { value: 'gpx', label: t('attendance.workerGpx') },
          ]}
        />
      </div>

      <Card className="flex h-[calc(100dvh-11rem)] flex-col overflow-hidden">
        {/* Toolbar */}
        <div data-tour="att-filters" className="flex flex-col gap-2.5 border-b border-line p-4 xl:flex-row xl:flex-wrap xl:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('attendance.searchPlaceholder')}
            className="flex-1 xl:max-w-xs"
          />
          {/* Ko'p tanlovli — chiplar maydon ostida turadi, ro'yxat tanlash
              paytida ochiq qoladi (MultiPicker). */}
          <div className="w-full xl:w-56">
            <MultiPicker
              value={deptIds}
              onChange={(v) => setIds('dept', v)}
              options={departmentOptions}
              placeholder={t('attendance.allDepartments')}
            />
          </div>
          <div className="w-full xl:w-56">
            <MultiPicker
              value={posIds}
              onChange={(v) => setIds('pos', v)}
              options={jobPositionOptions}
              placeholder={t('attendance.allPositions')}
            />
          </div>
          <div className="flex items-center gap-2">
            <DateInput value={from} onChange={(v) => setFilter('from', v)} invalid={rangeInvalid} aria-label={t('attendance.dateFrom')} className="w-40" />
            <span className="text-fg-subtle">—</span>
            <DateInput value={to} onChange={(v) => setFilter('to', v)} invalid={rangeInvalid} aria-label={t('attendance.dateTo')} className="w-40" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={filters.type === 'late' ? 'primary' : 'secondary'} onClick={() => toggleType('late')}>
              {t('attendance.onlyLate')}
            </Button>
            <Button size="sm" variant={filters.type === 'absent' ? 'danger' : 'secondary'} onClick={() => toggleType('absent')}>
              {t('attendance.onlyAbsent')}
            </Button>
            <Button size="sm" variant={filters.type === 'early_leave' ? 'primary' : 'secondary'} title={t('attendance.earlyLeaveHint')} onClick={() => toggleType('early_leave')}>
              {t('attendance.onlyEarly')}
            </Button>
          </div>
          {hasTeam && (
            <Checkbox
              checked={supervised}
              onChange={(e) => setFilter('team', e.target.checked ? '1' : '')}
              label={t('attendance.onlyMyTeam')}
            />
          )}
          <FilterReset count={filterCount} onReset={resetFilters} />
          {rangeInvalid && (
            <p role="alert" className="w-full text-xs text-danger">{t('list.invalidRange')}</p>
          )}
        </div>

        {/* Legend + count */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {LEGEND_STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: `rgb(var(${CAL_COLOR[s]}))` }} />
                {t(`attendance.${CAL_LABEL[s]}`)}
              </span>
            ))}
          </div>
          <span className="text-xs text-fg-muted tabular-nums" aria-live="polite">
            {t('attendance.showing', { shown: rows.length, total })}
          </span>
        </div>

        <DataTable
        tableId="attendance"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={t('attendance.empty')}
          emptyDescription={t('attendance.emptyHint')}
          filtered={filterCount > 0}
          minWidth={1200}
          // A row opens that person's timesheet in a side sheet (v1's drawer):
          // the list, its filters and scroll stay put behind it.
          onRowClick={setSheetFor}
          density="compact"
          sort={sort}
          onSort={(next) => setFilters({ sort: SORT_COLUMNS[next.key] ? next.key : null, dir: next.dir })}
        />

        <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
      </Card>
      <AttendanceSheet
        row={sheetFor}
        from={from}
        to={to}
        onClose={() => setSheetFor(null)}
        onCorrect={
          canCorrect
            ? (r) => {
                // One dialog at a time: Escape must not close both.
                setSheetFor(null)
                setCorrecting({ id: r.id, legal_name: r.legal_name })
              }
            : undefined
        }
      />
      {canCorrect && <ManualAttendanceModal employee={correcting} onClose={() => setCorrecting(null)} />}
      <LateDaysModal
        open={lateFor != null}
        onClose={() => setLateFor(null)}
        name={lateFor?.legal_name ?? ''}
        dailyLateMinutes={lateFor?.attendance?.daily_late_minutes}
      />
      <EarlyLeaveDaysModal
        open={earlyFor != null}
        onClose={() => setEarlyFor(null)}
        name={earlyFor?.legal_name ?? ''}
        days={earlyFor?.attendance?.daily_early_leave}
      />
    </PageContainer>
  )
}
