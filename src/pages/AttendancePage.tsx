import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { ChevronRight, Clock, Download, UserX } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { errorMessage } from '@/api/errorMessage'
import { TURNSTILE_ATTENDANCE_EVENTS } from '@/api/endpoints'
import { downloadFile, XLSX_MIME } from '@/lib/download'
import { monthShort } from '@/lib/format'
import { canWrite } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { CAL_COLOR, CAL_LABEL, LEGEND_STATUSES, mapCalStatus } from '@/features/attendance/attendanceStatus'
import { AttendanceDetailDrawer } from '@/features/attendance/AttendanceDetailDrawer'
import { CalendarStrip } from '@/features/attendance/CalendarStrip'
import { LateDaysModal } from '@/features/attendance/LateDaysModal'
import { ManualAttendanceModal } from '@/features/attendance/ManualAttendanceModal'
import { formatHours } from '@/features/attendance/period'
import {
  ATTENDANCE_SORT_KEYS,
  attendanceParams,
  defaultAttendanceRange,
  useAttendance,
  type AttendanceRow,
  type AttendanceSortKey,
} from '@/features/attendance/useAttendance'

const FILTER_KEYS = ['dept', 'pos', 'from', 'to', 'type', 'sort', 'dir'] as const

const earlyCount = (r: AttendanceRow) =>
  Object.values(r.attendance?.calendar ?? {}).filter((v) => mapCalStatus(v) === 'early_leave').length

/** «Ivanov Ivan Ivanovich» → nom va otasining ismi alohida qatorda (v1). */
function splitName(full?: string | null) {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length <= 2) return { name: parts.join(' '), rest: '' }
  return { name: parts.slice(0, 2).join(' '), rest: parts.slice(2).join(' ') }
}

/**
 * XODIMLAR DAVOMATI (TZ I2 «Учёт посещаемости», v1 `EmployeeAttendancePage`).
 *
 * Normallashtirilgan tabel: F.I.Sh. qidiruvi, bo'lim, lavozim, davr, tez
 * filtrlar (kechikkanlar / kelmaganlar), server tomonda saralash. Qator —
 * xodim davomati paneli; «Qo'lda tuzatish» — `attendance >= edit` (kadr
 * o'z darajasida, bo'lim boshlig'i o'z bo'linmasida). Yuklash: kechikkanlar,
 * kelmaganlar va umumiy tabel — ekrandagi filtrlar bilan, server quradi.
 */
export function AttendancePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const canCorrect = canWrite(user, 'attendance')
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters } = useListParams(FILTER_KEYS)

  const def = useMemo(() => defaultAttendanceRange(), [])
  const from = filters.from || def.from
  const to = filters.to || def.to
  // Standart davr URL'ga yoziladi — nusxa olingan havola keyin ham o'sha kunlarni ochadi.
  useEffect(() => {
    if (!filters.from || !filters.to) setFilters({ from, to, page: page > 1 ? String(page) : null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.from, filters.to])
  const rangeInvalid = from > to

  const sortBy = (ATTENDANCE_SORT_KEYS as readonly string[]).includes(filters.sort)
    ? (filters.sort as AttendanceSortKey)
    : undefined
  const sortDir: 'asc' | 'desc' = filters.dir === 'asc' ? 'asc' : 'desc'
  const sort: SortState | null = sortBy ? { key: sortBy, dir: sortDir } : null
  const filterType = filters.type === 'late' || filters.type === 'absent' ? filters.type : ''

  const departmentOptions = useDepartmentOptions()
  const jobPositionOptions = useJobPositionOptions()

  const listArgs = { from, to, search, departmentId: filters.dept, jobPositionId: filters.pos, filterType }
  const { rows, total, pages, loading, fetching, error, refetch } = useAttendance({
    ...listArgs,
    page,
    size,
    sortBy,
    sortDir,
    enabled: !rangeInvalid,
  })

  const [opened, setOpened] = useState<AttendanceRow | null>(null)
  const [correcting, setCorrecting] = useState<AttendanceRow | null>(null)
  const [lateFor, setLateFor] = useState<AttendanceRow | null>(null)
  const [photo, setPhoto] = useState<AttendanceRow | null>(null)

  const rangeChanged = from !== def.from || to !== def.to
  const filterCount = [filters.dept, filters.pos, filterType, search].filter(Boolean).length + (rangeChanged ? 1 : 0)
  const resetFilters = () =>
    setFilters({ dept: null, pos: null, type: null, sort: null, dir: null, q: null, from: def.from, to: def.to })
  const preset = (kind: 'month' | 'year') => {
    const now = dayjs()
    setFilters({
      from: now.startOf(kind).format('YYYY-MM-DD'),
      to: now.endOf(kind).format('YYYY-MM-DD'),
    })
  }

  // Ro'yxat va fayllar BITTA parametr to'plamidan — yuklangan fayl ekrandagidan farq qilmaydi.
  const exportBase = attendanceParams(listArgs, branchId)
  const [exporting, setExporting] = useState<'all' | 'late' | 'absent' | null>(null)
  const runExport = async (kind: 'all' | 'late' | 'absent') => {
    setExporting(kind)
    const stamp = dayjs().format('DD.MM.YYYY')
    try {
      if (kind === 'all') {
        await downloadFile({
          url: `${TURNSTILE_ATTENDANCE_EVENTS}/normalized/export-excel`,
          params: exportBase,
          mime: XLSX_MIME,
          filename: `Davomat_${stamp}.xlsx`,
        })
      } else {
        await downloadFile({
          url: `${TURNSTILE_ATTENDANCE_EVENTS}/normalized/export-late-absent`,
          // Bu yerda `filter_type` — hisobotning O'Z turi, ekrandagi chip emas.
          params: { ...exportBase, filter_type: kind },
          mime: XLSX_MIME,
          filename: `${kind === 'late' ? 'Kechikganlar' : 'Kelmaganlar'}_${stamp}.xlsx`,
        })
      }
    } catch (e) {
      toast.error(errorMessage(e, t('davomat.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  const calendarHeader = (() => {
    const a = monthShort(from)
    const b = monthShort(to)
    return t('davomat.colCalendar', { months: a === b && from.slice(0, 7) === to.slice(0, 7) ? a : `${a}–${b}` })
  })()

  const jobTitle = (r: AttendanceRow) => (typeof r.job_position === 'string' ? r.job_position : r.job_position?.name)

  const columns: Column<AttendanceRow>[] = [
    {
      key: 'employee',
      header: t('davomat.colEmployee'),
      skeleton: 'w-48',
      cell: (r) => {
        const { name, rest } = splitName(r.legal_name)
        const hasPhoto = !!(r.photo_path || r.photo_thumb_path)
        return (
          <div className="flex items-center gap-3">
            <Avatar
              src={r.photo_thumb_path}
              fallbackSrc={r.photo_path}
              name={r.legal_name}
              size={34}
              onClick={hasPhoto ? () => setPhoto(r) : undefined}
            />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-fg">{name || t('davomat.unknown')}</p>
              <p className="truncate text-[11px] text-fg-muted">{rest || jobTitle(r) || ''}</p>
            </div>
          </div>
        )
      },
    },
    {
      key: 'dept',
      header: t('davomat.colDepartment'),
      className: 'text-fg-muted',
      cell: (r) => (
        <span className="block max-w-[16rem] truncate" title={r.department?.name || ''}>
          {r.department?.name || '—'}
        </span>
      ),
    },
    {
      key: 'present',
      header: t('davomat.colPresent'),
      sortValue: (r) => r.attendance.present_days_count,
      className: 'text-center font-semibold tabular-nums text-success whitespace-nowrap',
      headerClassName: 'text-center',
      skeleton: 'w-10',
      cell: (r) => t('davomat.nDays', { n: r.attendance.present_days_count ?? 0 }),
    },
    {
      key: 'absent',
      header: t('davomat.colAbsent'),
      sortValue: (r) => r.attendance.absent_days_count,
      className: 'text-center font-semibold tabular-nums text-warning whitespace-nowrap',
      headerClassName: 'text-center',
      skeleton: 'w-10',
      cell: (r) => t('davomat.nDays', { n: r.attendance.absent_days_count ?? 0 }),
    },
    {
      key: 'late',
      header: t('davomat.colLate'),
      sortValue: (r) => r.attendance.late_days_count,
      className: 'text-center font-semibold tabular-nums text-danger whitespace-nowrap',
      headerClassName: 'text-center',
      skeleton: 'w-10',
      // Qaysi kunlar va qancha — v1 ham shu katakdan ochadi.
      cell: (r) =>
        (r.attendance.late_days_count ?? 0) > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setLateFor(r)
            }}
            className="underline decoration-dotted underline-offset-2 hover:text-fg"
          >
            {t('davomat.nTimes', { n: r.attendance.late_days_count })}
          </button>
        ) : (
          t('davomat.nTimes', { n: 0 })
        ),
    },
    {
      key: 'early',
      header: t('davomat.colEarly'),
      sortValue: (r) => earlyCount(r),
      className: 'text-center font-semibold tabular-nums text-info whitespace-nowrap',
      headerClassName: 'text-center',
      skeleton: 'w-10',
      cell: (r) => t('davomat.nTimes', { n: earlyCount(r) }),
    },
    {
      key: 'hours',
      header: t('davomat.colHours'),
      sortValue: (r) => r.attendance.work_duration_hours,
      className: 'text-center font-semibold tabular-nums text-fg whitespace-nowrap',
      headerClassName: 'text-center',
      skeleton: 'w-12',
      cell: (r) => t('davomat.nHours', { n: formatHours(r.attendance.work_duration_hours) }),
    },
    {
      key: 'calendar',
      header: calendarHeader,
      skeleton: 'w-40',
      cell: (r) => (
        <div className="max-w-[16rem]">
          <CalendarStrip calendar={r.attendance.calendar ?? {}} from={from} to={to} />
        </div>
      ),
    },
    {
      key: 'open',
      header: '',
      headerClassName: 'w-8',
      className: 'text-fg-subtle',
      cell: () => <ChevronRight size={16} />,
    },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('davomat.title')}
        subtitle={t('davomat.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Clock size={14} />}
              loading={exporting === 'late'}
              disabled={rangeInvalid}
              onClick={() => runExport('late')}
            >
              {t('davomat.lateOnes')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<UserX size={14} />}
              loading={exporting === 'absent'}
              disabled={rangeInvalid}
              onClick={() => runExport('absent')}
            >
              {t('davomat.absentOnes')}
            </Button>
            <Button
              size="sm"
              leftIcon={<Download size={14} />}
              loading={exporting === 'all'}
              disabled={rangeInvalid}
              onClick={() => runExport('all')}
            >
              {t('davomat.exportAll')}
            </Button>
          </div>
        }
      />

      <Card className="flex h-[calc(100dvh-11rem)] min-h-[32rem] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-4 xl:flex-row xl:flex-wrap xl:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('davomat.searchPlaceholder')}
            className="flex-1 xl:max-w-xs"
          />
          <Combobox
            value={filters.dept}
            onChange={(v) => setFilter('dept', v)}
            options={departmentOptions}
            placeholder={t('davomat.allDepartments')}
            className="w-full xl:w-56"
          />
          <Combobox
            value={filters.pos}
            onChange={(v) => setFilter('pos', v)}
            options={jobPositionOptions}
            placeholder={t('davomat.allPositions')}
            className="w-full xl:w-56"
          />
          <div className="flex flex-wrap items-center gap-2">
            <DateInput
              value={from}
              onChange={(v) => setFilter('from', v)}
              invalid={rangeInvalid}
              aria-label={t('davomat.dateFrom')}
              className="w-40"
            />
            <span className="text-fg-subtle">—</span>
            <DateInput
              value={to}
              onChange={(v) => setFilter('to', v)}
              invalid={rangeInvalid}
              aria-label={t('davomat.dateTo')}
              className="w-40"
            />
            <Button size="sm" variant="ghost" onClick={() => preset('month')}>
              {t('davomat.thisMonth')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => preset('year')}>
              {t('davomat.thisYear')}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={filterType === 'late' ? 'primary' : 'secondary'}
              aria-pressed={filterType === 'late'}
              onClick={() => setFilter('type', filterType === 'late' ? '' : 'late')}
            >
              {t('davomat.lateOnes')}
            </Button>
            <Button
              size="sm"
              variant={filterType === 'absent' ? 'danger' : 'secondary'}
              aria-pressed={filterType === 'absent'}
              onClick={() => setFilter('type', filterType === 'absent' ? '' : 'absent')}
            >
              {t('davomat.absentOnes')}
            </Button>
          </div>
          <FilterReset count={filterCount} onReset={resetFilters} />
          {rangeInvalid && (
            <p role="alert" className="w-full text-xs text-danger">
              {t('davomat.rangeInvalid')}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {LEGEND_STATUSES.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: `rgb(var(${CAL_COLOR[s]}))` }} />
                {t(`attendance.${CAL_LABEL[s]}`)}
              </span>
            ))}
          </div>
          <span className="text-xs tabular-nums text-fg-muted" aria-live="polite">
            {t('davomat.showing', { shown: rows.length, total })}
          </span>
        </div>

        <DataTable
          tableId="tz-attendance"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          emptyTitle={t('davomat.empty')}
          emptyDescription={t('davomat.emptyHint')}
          filtered={filterCount > 0}
          minWidth={1200}
          onRowClick={setOpened}
          density="compact"
          sort={sort}
          onSort={(next) =>
            setFilters({
              sort: (ATTENDANCE_SORT_KEYS as readonly string[]).includes(next.key) ? next.key : null,
              dir: next.dir,
            })
          }
        />

        <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
      </Card>

      <AttendanceDetailDrawer
        row={opened}
        from={from}
        to={to}
        canCorrect={canCorrect}
        onClose={() => setOpened(null)}
        onCorrect={(r) => {
          // Bir vaqtda bitta oyna: Escape ikkalasini yopmasin.
          setOpened(null)
          setCorrecting(r)
        }}
      />
      {canCorrect && (
        <ManualAttendanceModal employee={correcting} defaultDate={from} onClose={() => setCorrecting(null)} />
      )}
      <LateDaysModal
        open={lateFor != null}
        onClose={() => setLateFor(null)}
        name={lateFor?.legal_name ?? ''}
        dailyLateMinutes={lateFor?.attendance?.daily_late_minutes}
      />
      <Modal open={!!photo} onClose={() => setPhoto(null)} title={photo?.legal_name ?? ''} size="md">
        {photo && (
          <img
            src={photo.photo_path || photo.photo_thumb_path || ''}
            alt={photo.legal_name ?? ''}
            crossOrigin="anonymous"
            className="mx-auto max-h-[70vh] rounded-inner object-contain"
          />
        )}
      </Modal>
    </PageContainer>
  )
}

