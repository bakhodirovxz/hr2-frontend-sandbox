import { ImportWizard } from '@/features/import/ImportWizard'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Archive, Download, KeyRound, MoreHorizontal, Pencil, Plus, RadioTower, Trash2, Upload } from 'lucide-react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Avatar } from '@/components/ui/Avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { IconButton } from '@/components/ui/IconButton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { ArchivedTable } from '@/features/employees/ArchivedTable'
import { ArchiveEmployeeModal } from '@/features/employees/ArchiveEmployeeModal'
import { Segmented } from '@/components/ui/Segmented'
import { Pagination } from '@/components/data/Pagination'
import { BulkBar } from '@/components/data/BulkBar'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { BulkEditGrid } from '@/components/data/BulkEditGrid'
import { fetchEmployeesByIds, useEmployeeMutations } from '@/features/employees/useEmployees'
import { employeeGridFields } from '@/features/employees/employeeGridFields'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { allowedFlags, EmployeeFormDrawer, SetPasswordModal } from '@/features/employees/EmployeeFormDrawer'
import { EmployeeExportModal } from '@/features/employees/EmployeeExportModal'
import { useToast } from '@/components/ui/Toast'
import { apiPost } from '@/api/http'
import { EMPLOYEE_SYNC_TURNSTILE, ORGANIZATION_BRANCH_SYNC_EMPLOYEES } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import * as roles from '@/auth/roles'
import type { Employee } from '@/types'
import {
  KPI_SORTS,
  EMPLOYEE_ORDER,
  type EmployeeOrder,
  useEmployeeKpiList,
  useEmployeeStats,
  type EmployeeKpiRow,
  type KpiSort,
} from '@/features/employees/useEmployeeKpi'
/**
 * ⚠️ LAZY + VISIBILITY-GATED. This strip is the only thing on the roster that
 * touches `recharts`, and recharts is a 413 KB chunk that was being downloaded
 * on every visit to the most-used list in the product. The strip renders BELOW
 * the table (deliberately — see the comment at its render site), so nobody sees
 * it before scrolling.
 */
const EmployeeStatsRow = lazy(() =>
  import('@/features/employees/EmployeeStatsRow').then((m) => ({ default: m.EmployeeStatsRow })),
)
import { KpiBar, Sparkline } from '@/features/employees/kpiCells'
import { STATUS_KPI_RANGE, STATUS_TONE, kpiStatusKey, type KpiStatusKey } from '@/features/employees/kpiStatus'
import { KpiRangeSlider } from '@/features/employees/KpiRangeSlider'
import type { Translation } from '@/i18n/uz'

const FILTER_KEYS = ['dept', 'pos', 'status', 'arch', 'sort', 'kmin', 'kmax', 'order', 'dir'] as const

const STATUS_KEYS: KpiStatusKey[] = ['excellent', 'good', 'average', 'risk', 'problem']
const STATUS_LABEL: Record<KpiStatusKey, keyof Translation['employees']> = {
  excellent: 'statusExcellent',
  good: 'statusGood',
  average: 'statusAverage',
  risk: 'statusRisk',
  problem: 'statusProblem',
}

export function EmployeesPage() {
  const { t } = useTranslation()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters } =
    useListParams(FILTER_KEYS)
  const debouncedSearch = search

  // Only a value the API knows is sent (anything else is a 422).
  const sort = (KPI_SORTS as readonly string[]).includes(filters.sort) ? (filters.sort as KpiSort) : undefined
  // Column-header sorting — on the SERVER, across every page (the table only
  // holds one page). Validated before it is sent.
  const orderBy = (EMPLOYEE_ORDER as readonly string[]).includes(filters.order) ? (filters.order as EmployeeOrder) : undefined
  const orderDir: 'asc' | 'desc' = filters.dir === 'desc' ? 'desc' : 'asc'
  const tableSort: SortState | null = orderBy ? { key: orderBy === 'name' ? 'employee' : orderBy, dir: orderDir } : null
  // The archive switch is a tab, not a filter — it stays when filters clear.
  const filterCount = [filters.dept, filters.pos, filters.status, filters.kmin, sort, search].filter(Boolean).length
  // kmin/kmax were counted in the badge but never cleared, so the KPI range
  // survived «Filtrlarni tozalash».
  const resetFilters = () => setFilters({ dept: null, pos: null, status: null, sort: null, q: null, kmin: null, kmax: null })
  const foldedCount = [filters.pos, filters.status, filters.kmin, sort].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)

  const departmentOptions = useDepartmentOptions()
  const jobPositionOptions = useJobPositionOptions()


  // The "Status" filter selects a KPI band (excellent/good/…/problem).
  // A chosen band wins; otherwise the free slider's own range applies. Same
  // precedence as v1 — the band is the coarse answer, the slider the precise one.
  const bandRange = filters.status ? STATUS_KPI_RANGE[filters.status as KpiStatusKey] : undefined
  const sliderRange =
    filters.kmin || filters.kmax
      ? { min: Number(filters.kmin || 0), max: Number(filters.kmax || 100) }
      : undefined
  const kpiRange = bandRange ?? sliderRange

  const { rows, total, pages, loading, fetching, error, refetch, loadAllIds } = useEmployeeKpiList({
    page,
    size,
    search: debouncedSearch,
    departmentId: filters.dept,
    jobPositionId: filters.pos,
    kpiMin: kpiRange?.min,
    kpiMax: kpiRange?.max,
    sort,
    orderBy,
    orderDir,
  })

  /**
   * ⚠️ MEASURED, NOT ASSUMED: this strip is NOT below the fold. The table area
   * scrolls inside its own card, so on a 1440x900 screen the strip starts at
   * y=790 — visible without scrolling. Gating it on visibility was tried and
   * REVERTED: it changed nothing about what loads and pushed LCP from 0.9 s to
   * 2.0 s, because the chart then painted a second late in plain sight.
   *
   * The 413 KB `recharts` chunk it pulls is therefore a genuine cost of showing
   * these charts, not a loading mistake. It stays split into its own chunk (the
   * import below is `lazy`) so the routes that draw NO chart do not carry it.
   */
  const stats = useEmployeeStats()

  // Selection survives paging; «select all N» loads every id of the filter.
  const selection = useRowSelection(rows, {
    total,
    loadAllIds,
    resetKey: JSON.stringify([debouncedSearch, filters.dept, filters.pos, filters.status, filters.kmin, filters.kmax, sort, filters.arch]),
  })
  const { update, remove, invalidate } = useEmployeeMutations()
  const [importing, setImporting] = useState(false)
  const bulk = useBulkAction()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [archiving, setArchiving] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)

  // Edit flows: the KPI rows lack full fields, so we pull complete records first.
  const [editing, setEditing] = useState<Employee | null>(null)
  const [rowLoadingId, setRowLoadingId] = useState<number | null>(null)
  const [bulkRows, setBulkRows] = useState<Employee[] | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [passwordFor, setPasswordFor] = useState<Employee | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [syncingId, setSyncingId] = useState<number | null>(null)
  const [branchSyncing, setBranchSyncing] = useState(false)
  const [confirmBranchSync, setConfirmBranchSync] = useState(false)

  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const branchId = useBranchStore((s) => s.selectedBranchId)
  // Only loaded while the bulk grid is open — the roster screen itself has no
  // use for the full branch roster as options.
  const { options: supervisorOptions } = useEmployeeOptions(branchId, !!bulkRows)
  const allowedFlagKeys = useMemo(() => allowedFlags(user) as readonly string[], [user])
  // Writing to the personnel register is kadr + master admin (the backend
  // enforces the same set; a button that always 403s only wastes a click).
  // ⚠️ Same predicate as the server's `_can_crud_employees` (HR + site master-admin). The wider
  // `isMasterAdmin` also matched a ministr, who got 403 on create/password/turnstile-sync.
  const canManage = roles.isHR(user) || roles.isSiteMasterAdmin(user)
  // The archive is HR's and the administrator's (`_require_employee_crud`);
  // a deputy or minister got the tab and a 403 behind it (role sweep 2026-09-25).
  const onArchive = canManage && !!filters.arch
  /* TZ C1/C3 «Руководители»: a department head may open a record in a
     department they head (`line_manager_department_ids`) and edit their own
     subordinates — the list carries the per-row verdict as `can_edit`. */
  const isLineManager = (user?.headed_department_ids?.length ?? 0) > 0
  const canCreate = canManage || isLineManager
  const canEditRow = (row: { can_edit?: boolean | null }) => row.can_edit ?? canManage

  const confirm = useConfirm()
  const syncOne = async (id: number) => {
    setSyncingId(id)
    try {
      await apiPost(EMPLOYEE_SYNC_TURNSTILE(id), {})
      toast.ok(t('employees.syncQueued'))
    } catch (e) {
      toast.error(errorMessage(e, t('employees.syncFailed')))
    } finally {
      setSyncingId(null)
    }
  }

  const syncBranch = async () => {
    setConfirmBranchSync(false)
    if (!branchId) return
    setBranchSyncing(true)
    try {
      await apiPost(ORGANIZATION_BRANCH_SYNC_EMPLOYEES(branchId), {})
      toast.ok(t('employees.syncQueued'))
    } catch (e) {
      toast.error(errorMessage(e, t('employees.syncFailed')))
    } finally {
      setBranchSyncing(false)
    }
  }

  const openRowEdit = async (id: number) => {
    setRowLoadingId(id)
    const [full] = await fetchEmployeesByIds([id])
    setRowLoadingId(null)
    if (full) setEditing(full)
    else setNotice({ kind: 'warn', text: t('list.loadFailed') })
  }

  const openPasswordFor = async (id: number) => {
    setRowLoadingId(id)
    const [full] = await fetchEmployeesByIds([id])
    setRowLoadingId(null)
    if (full) setPasswordFor(full)
  }

  const openBulkEdit = async () => {
    setBulkLoading(true)
    const full = await fetchEmployeesByIds(selection.selectedIds)
    setBulkLoading(false)
    if (full.length) setBulkRows(full)
  }

  const saveBulk = async (patches: Record<number, Record<string, unknown>>) => {
    const ids = Object.keys(patches).map(Number)
    setBulkRows(null)
    const failed = await bulk.run(ids, (id) => update.mutateAsync({ id, body: patches[id] }))
    invalidate()
    if (failed.length) setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    else {
      setNotice({ kind: 'ok', text: t('employees.bulkEditApplied', { count: ids.length }) })
      selection.clear()
    }
  }

  const statusOptions = useMemo(
    () => STATUS_KEYS.map((k) => ({ value: k, label: t(`employees.${STATUS_LABEL[k]}`) })),
    [t],
  )
  const sortOptions = useMemo(
    () => [
      { value: 'best_kpi', label: t('employees.sortBestKpi') },
      { value: 'worst_kpi', label: t('employees.sortWorstKpi') },
    ],
    [t],
  )

  const doDelete = async () => {
    const ids = selection.selectedIds
    setConfirmDelete(false)
    const failed = await bulk.run(ids, (id) => remove.mutateAsync(id))
    invalidate()
    if (failed.length) setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    else {
      setNotice({ kind: 'ok', text: t('employees.deleted', { count: ids.length }) })
      selection.clear()
    }
  }

  const columns: Column<EmployeeKpiRow>[] = [
    {
      key: 'employee',
      sortValue: (row) => row.legal_name ?? null,
      header: t('employees.colEmployee'),
      skeleton: 'w-48',
      // The name is the way INTO the person: their card, their T-2, their
      // orders. Without this the profile route had no entrance at all.
      cell: (row) => (
        <Link
          to={`/employees/${row.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-3 rounded-inner outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Avatar src={row.photo_thumb_path} fallbackSrc={row.photo_path} name={row.legal_name} size={34} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-fg underline-offset-2 hover:underline">
              {row.legal_name || t('common.unknown')}
              {/* O'rindosh — asosiy ish joyi boshqa filialda. Belgisiz kadr
                  bu odamni oddiy xodim deb o'ylab, kartochkasini tahrirlashga
                  urinardi (u yerda BOSHQA filialning bo'limi turadi). */}
              {row.employment_type && row.employment_type !== 'main' && (
                <span className="ml-1.5 rounded-full bg-warning-soft px-1.5 py-0.5 align-middle text-[10px] font-semibold text-warning">
                  {t('assignments.badge')}
                </span>
              )}
            </p>
            <p className="truncate text-[11px] text-fg-muted">{row.job_position_name || '—'}</p>
          </div>
        </Link>
      ),
    },
    {
      key: 'department',
      sortValue: (row) => row.department_name ?? null,
      header: t('employees.colDepartment'),
      className: 'text-fg-muted',
      // One line: a long department name wrapped the row to three lines and the
      // table read as uneven stripes. The full name is on hover.
      cell: (row) => {
        const name = row.department_name || t('employees.departmentNotSet')
        return (
          <span className="block max-w-[14rem] truncate" title={name}>
            {name}
          </span>
        )
      },
    },
    {
      key: 'job',
      header: t('employees.colJob'),
      defaultHidden: true,
      className: 'text-fg-muted',
      cell: (row) => row.job_position_name || '—',
      sortValue: (row) => row.job_position_name ?? null,
    },
    {
      key: 'kpi',
      sortValue: (row) => row.kpi_percentage ?? null,
      header: t('employees.colKpi'),
      skeleton: 'w-24',
      cell: (row) => <KpiBar value={row.kpi_percentage} />,
    },
    {
      key: 'done',
      sortValue: (row) => row.completed_tasks_count ?? null,
      header: t('employees.taskDone'),
      className: 'text-center font-semibold tabular-nums text-success',
      headerClassName: 'text-center',
      skeleton: 'w-6',
      cell: (row) => row.completed_tasks_count,
    },
    {
      key: 'late',
      sortValue: (row) => row.late_tasks_count ?? null,
      header: t('employees.taskLate'),
      className: 'text-center font-semibold tabular-nums text-warning',
      headerClassName: 'text-center',
      skeleton: 'w-6',
      cell: (row) => row.late_tasks_count,
    },
    {
      key: 'missed',
      sortValue: (row) => row.overuded_tasks_counnt ?? null,
      header: t('employees.taskMissed'),
      className: 'text-center font-semibold tabular-nums text-danger',
      headerClassName: 'text-center',
      skeleton: 'w-6',
      cell: (row) => row.overuded_tasks_counnt,
    },
    {
      key: 'attendance',
      sortValue: (row) => row.attendance_percentage ?? null,
      header: t('employees.colAttendance'),
      className: 'font-semibold tabular-nums text-brand-strong',
      skeleton: 'w-10',
      cell: (row) => `${row.attendance_percentage}%`,
    },
    {
      key: 'trend',
      header: t('employees.colTrend'),
      skeleton: 'w-16',
      cell: (row) => (
        <Sparkline
          series={row.kpi_status?.map((m) => Number(m.kpi_percentage) || 0) ?? []}
          kpi={row.kpi_percentage}
        />
      ),
    },
    {
      key: 'status',
      header: t('employees.colStatus'),
      skeleton: 'w-16',
      cell: (row) => {
        const key = kpiStatusKey(row.kpi_percentage)
        return <Badge tone={STATUS_TONE[key]}>{t(`employees.${STATUS_LABEL[key]}`)}</Badge>
      },
    },
    {
      key: 'actions',
      header: '',
      headerClassName: 'w-32',
      className: 'pr-4 text-right',
      skeleton: 'w-8',
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {/*
            ⚠️ THE PENCIL USED TO BE UNGATED while every icon beside it checked
            `canManage`. The Employees page is in the menu for ministr and
            deputy, so those two saw an edit control that `PATCH /employees/{id}`
            answers with 403 — verified live. v1 gates the same button on
            `canManageEmployees` (EmployeesTable.jsx:54); this restores that.
          */}
          {canEditRow(row) && (
            <IconButton
              size="sm"
              label={t('employees.editRow')}
              disabled={rowLoadingId === row.id}
              onClick={() => openRowEdit(row.id)}
            >
              <Pencil size={15} />
            </IconButton>
          )}
          {canManage && (
            <>
              <IconButton
                size="sm"
                label={t('employees.setPassword')}
                disabled={rowLoadingId === row.id}
                onClick={() => openPasswordFor(row.id)}
              >
                <KeyRound size={15} />
              </IconButton>
              <IconButton
                size="sm"
                label={t('employees.syncOne')}
                disabled={syncingId === row.id}
                onClick={async () => {
                  // Pushes the record to every turnstile — ask first.
                  if (!(await confirm({ kind: 'action', subject: row.legal_name, confirmLabel: t('employees.syncOne') }))) return
                  syncOne(row.id)
                }}
              >
                <RadioTower size={15} />
              </IconButton>
            </>
          )}
        </div>
      ),
    },
  ]

  return (
    <PageContainer>
      <ImportWizard
        entity="employees"
        open={importing}
        onClose={() => setImporting(false)}
        onDone={() => { invalidate(); refetch() }}
      />
      <PageHeader
        title={t('employees.title')}
        subtitle={t('employees.subtitle')}
        actions={
          <>
            {/*
              ⚠️ NOT ON THE ARCHIVE TAB. `/employees/export-excel` only knows
              about ACTIVE employees, so on the archive tab this button used to
              hand back the live roster while the table showed leavers — a file
              that says something different from the screen it was pressed on,
              with passport and JSHSHIR columns in it.
            */}
            {!onArchive && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportOpen(true)}
                leftIcon={<Download size={14} />}
              >
                Excel
              </Button>
            )}
            {canManage && (
              <ActionMenu
                label={t('staff.more')}
                icon={<MoreHorizontal size={14} />}
                width={300}
                items={[
                  { key: 'import', label: t('import.button'), icon: <Upload size={14} />, onClick: () => setImporting(true) },
                  // Pushes every face to the branch's turnstiles — confirmed in its own dialog.
                  { key: 'sync', label: t('employees.syncBranch'), icon: <RadioTower size={14} />, loading: branchSyncing, onClick: () => setConfirmBranchSync(true) },
                ]}
              />
            )}
            {canCreate && (
              <Button size="sm" onClick={() => setCreating(true)} leftIcon={<Plus size={15} />}>
                {t('employees.newEmployee')}
              </Button>
            )}
          </>
        }
      />

      {notice && (
        <div
          role="status"
          className={
            notice.kind === 'ok'
              ? 'mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success'
              : 'mb-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning'
          }
        >
          {notice.text}
        </div>
      )}

      {/* Employee KPI table */}
      {/* The table takes the screen (it was a fixed 640px showing FIVE rows,
          the charts below took the rest) — redesign 2026-09-24. One toolbar
          row: active/archive, search, department; the rest folds away. */}
      <Card className="mb-4 flex h-[calc(100dvh-10rem)] min-h-[560px] flex-col overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-line p-3 lg:flex-row lg:flex-wrap lg:items-center">
          {canManage && (
          <Segmented
            value={onArchive ? 'archive' : 'active'}
            onChange={(v) => setFilter('arch', v === 'archive' ? '1' : '')}
            options={[
              { value: 'active', label: t('employees.tabActive') },
              { value: 'archive', label: t('employees.tabArchive') },
            ]}
          />
          )}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('employees.searchPlaceholder')}
            className="flex-1 lg:max-w-xs"
          />
          <Combobox
            value={filters.dept}
            onChange={(v) => setFilter('dept', v)}
            options={departmentOptions}
            placeholder={t('employees.allDepartments')}
            className="w-full lg:w-52"
          />
          {/* Position/status/KPI/sort have no counterpart on the archive. */}
          {!onArchive && (
            <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
          )}
          <FilterReset count={filterCount} onReset={resetFilters} />
          <span className="text-[12px] tabular-nums text-fg-subtle lg:ml-auto">{t('employees.totalEmployees', { count: total })}</span>
          {!onArchive && filtersOpen && (
            <div className="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Combobox value={filters.pos} onChange={(v) => setFilter('pos', v)} options={jobPositionOptions} placeholder={t('employees.allPositions')} />
              <Combobox value={filters.status} onChange={(v) => setFilter('status', v)} options={statusOptions} placeholder={t('employees.allStatuses')} />
              {/* Free range — only meaningful when no preset band is chosen. */}
              {!filters.status && (
                <KpiRangeSlider
                  min={sliderRange?.min}
                  max={sliderRange?.max}
                  onCommit={(r) => {
                    setFilter('kmin', r.min == null ? '' : String(r.min))
                    setFilter('kmax', r.max == null ? '' : String(r.max))
                  }}
                />
              )}
              <Combobox value={sort ?? ''} onChange={(v) => setFilter('sort', v)} options={sortOptions} placeholder={t('employees.sortDefault')} />
            </div>
          )}
        </div>

        {onArchive ? (
          <ArchivedTable search={search} page={page} size={size} setPage={setPage} setSize={setSize} departmentId={filters.dept} />
        ) : (
        <>
        <DataTable
        tableId="employees"
          rows={rows}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          // Checkboxes follow the BulkBar they feed: gating one and not the
          // other left ministr/deputy ticking rows that produced no bar.
          selection={canManage ? selection : undefined}
          // The whole row opens the profile, not just the name: on a
          // 1100px-wide row the name is a small target at the far left.
          rowHref={(r) => `/employees/${r.id}`}
          sort={tableSort}
          onSort={(next) => {
            const key = next.key === 'employee' ? 'name' : next.key
            setFilters({ order: (EMPLOYEE_ORDER as readonly string[]).includes(key) ? key : null, dir: next.dir === 'desc' ? 'desc' : null, page: null })
          }}
          emptyTitle={t('employees.empty')}
          emptyDescription={t('employees.emptyHint')}
          filtered={filterCount > 0}
          minWidth={1100}
          density="compact"
        />


        <Pagination
          page={page}
          size={size}
          total={total}
          pages={pages}
          onPage={setPage}
          onSize={setSize}
          loading={fetching}
        />
        </>
        )}
      </Card>

      {/* ⚠️ THE ROSTER COMES FIRST. This strip used to sit ABOVE the table, so
          the page opened on four charts and the list — the reason anyone comes
          here — started below the fold. It is context for the list, not the
          headline, and now reads after it. */}
      <div className="mt-4">
        <Suspense fallback={<Skeleton className="h-[220px] w-full" />}>
        <EmployeeStatsRow
          age={stats.age}
          ageLoading={stats.ageLoading}
          nationality={stats.nationality}
          nationalityLoading={stats.nationalityLoading}
          kpiTrend={stats.kpiTrend}
          kpiTrendLoading={stats.kpiTrendLoading}
          headcount={stats.headcount}
          headcountLoading={stats.headcountLoading}
          experience={stats.experience}
          experienceLoading={stats.experienceLoading}
        />
        </Suspense>
      </div>

      {/* Same reasoning as the row pencil: bulk edit, archive and delete are all
          HR-or-master-admin on the server, so a reader who cannot manage
          employees must not be offered them — least of all bulk DELETE. */}
      <BulkBar count={canManage ? selection.count : 0} onClear={selection.clear} progress={bulk.progress} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
        <Button
          size="sm"
          variant="secondary"
          leftIcon={<Pencil size={15} />}
          loading={bulkLoading}
          onClick={openBulkEdit}
        >
          {t('employees.bulkEdit')}
        </Button>
        {/* Archiving is the single-row action: it needs one reason for one
            person, which a bulk bar cannot ask for sensibly. */}
        {selection.count === 1 && (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Archive size={15} />}
            onClick={() => setArchiving(selection.selectedIds[0] as number)}
          >
            {t('employees.archiveAction')}
          </Button>
        )}
        <Button size="sm" variant="danger" leftIcon={<Trash2 size={15} />} onClick={() => setConfirmDelete(true)}>
          {t('common.delete')}
        </Button>
      </BulkBar>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        danger
        title={t('employees.deleteTitle')}
        description={t('employees.deleteConfirm', { count: selection.count })}
        confirmLabel={t('common.delete')}
      />

      <ArchiveEmployeeModal
        open={archiving != null}
        employeeId={archiving}
        employeeName={rows.find((r) => r.id === archiving)?.legal_name}
        onClose={() => setArchiving(null)}
        onDone={(msg) => { selection.clear(); invalidate(); setNotice({ kind: 'ok', text: msg }) }}
      />

      <BulkEditGrid
        open={!!bulkRows}
        rows={bulkRows ?? []}
        fields={employeeGridFields(t, departmentOptions, jobPositionOptions, supervisorOptions, allowedFlagKeys)}
        title={t('employees.bulkEditTitle')}
        description={t('employees.bulkEditGridHint', { count: bulkRows?.length ?? 0 })}
        rowLabel={(e) => e.legal_name ?? ''}
        onClose={() => setBulkRows(null)}
        onSave={saveBulk}
        saving={bulk.progress.running}
      />

      <EmployeeFormDrawer
        open={creating || !!editing}
        employee={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        onSaved={() => {
          invalidate()
          setNotice({ kind: 'ok', text: editing ? t('employees.saved') : t('employees.created') })
        }}
      />

      <SetPasswordModal employee={passwordFor} onClose={() => setPasswordFor(null)} />

      <EmployeeExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filters={{ search: debouncedSearch, departmentId: filters.dept, jobPositionId: filters.pos }}
        // The endpoint has no KPI notion at all (no `kpi_min`/`kpi_max`), so a
        // KPI band or slider narrows the TABLE and cannot narrow the FILE. Say
        // so rather than shipping a wider roster than the screen shows.
        kpiFilterActive={!!filters.status || !!filters.kmin || !!filters.kmax}
      />

      <ConfirmDialog
        open={confirmBranchSync}
        onClose={() => setConfirmBranchSync(false)}
        onConfirm={syncBranch}
        title={t('employees.syncBranchTitle')}
        description={t('employees.syncBranchConfirm')}
        confirmLabel={t('employees.syncBranch')}
        loading={branchSyncing}
      />
    </PageContainer>
  )
}
