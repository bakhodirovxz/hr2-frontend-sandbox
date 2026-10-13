import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, FileSpreadsheet, KeyRound, Pencil, Plus, Settings2, Trash2, Users } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useConfirm } from '@/components/data/useConfirm'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/cn'
import { canManageEmployee, canOpenEmployeeCard, canManageEmployees, canWrite, canWriteOrg, isLineManager, isSiteMasterAdmin, readsOrg } from '@/auth/permissions'
import { ArchivedTable } from '@/features/employees/ArchivedTable'
import { ArchiveEmployeeModal } from '@/features/employees/ArchiveEmployeeModal'
import { ArchiveSettingsModal } from '@/features/employees/ArchiveSettingsModal'
import { EmployeeExportModal } from '@/features/employees/EmployeeExportModal'
import { EmployeeFormDrawer } from '@/features/employees/EmployeeFormDrawer'
import { EmployeePasswordModal } from '@/features/employees/EmployeePasswordModal'
import { HeadlineCards, KpiInsights } from '@/features/employees/RosterInsights'
import { KpiBar, Sparkline } from '@/features/employees/kpiCells'
import { KpiRangeSlider } from '@/features/employees/KpiRangeSlider'
import { STATUS_KPI_RANGE, STATUS_TONE, kpiStatusKey, type KpiStatusKey } from '@/features/employees/kpiStatus'
import { useEmployeeKpiList, useEmployeeStats } from '@/features/employees/useEmployeeKpi'
import { useEmployeeMutations, useEmployeeRows } from '@/features/employees/useEmployees'
import { fmtDate, usePersonnelLabels } from '@/features/employees/format'
import { useNationalityLabel } from '@/features/employees/nationalityLabel'
import { CONTRACT_TYPES, type EmployeeKpiRow, type EmployeeRow } from '@/features/employees/types'

/** recharts lives only in this strip — kept in its own chunk. */
const EmployeeStatsRow = lazy(() => import('@/features/employees/EmployeeStatsRow').then((m) => ({ default: m.EmployeeStatsRow })))

const FILTER_KEYS = ['department_id', 'pos', 'contract', 'kstatus', 'kmin', 'kmax', 'status'] as const
const STATUS_KEYS: KpiStatusKey[] = ['excellent', 'good', 'average', 'risk', 'problem']

type Target = { id: number; legal_name?: string | null }

/**
 * «Xodimlar» (TZ C1, C2, C4, 4.2.7): analytics (headline, demographics,
 * KPI insights), the roster with search / department / position / status
 * («Ishlayapti» / «Arxivda», `?status=archive`) / contract filters, the
 * archive tab, add / edit drawer, set password, archive (C4) and the Excel
 * export. HR, management, administrators and department heads get the KPI
 * roster; a rank-and-file employee gets the plain roster of his level.
 */
export function EmployeesPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const labels = usePersonnelLabels()
  const natLabel = useNationalityLabel()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters, activeFilterCount } = useListParams(FILTER_KEYS)

  const adminView = readsOrg(user, 'employees') || isLineManager(user)
  const hr = canManageEmployees(user)
  const canCreate = canWrite(user, 'employees', 'edit')
  const canFull = canWriteOrg(user, 'employees', 'full')
  const archiveTab = hr && filters.status === 'archive'

  const band = filters.kstatus ? STATUS_KPI_RANGE[filters.kstatus as KpiStatusKey] : undefined
  const slider = filters.kmin || filters.kmax ? { min: filters.kmin ? Number(filters.kmin) : undefined, max: filters.kmax ? Number(filters.kmax) : undefined } : undefined
  const kpiRange = band ?? slider

  const base = { page, size, search, departmentId: filters.department_id, jobPositionId: filters.pos, contractType: filters.contract }
  const kpiList = useEmployeeKpiList({ ...base, kpiMin: kpiRange?.min, kpiMax: kpiRange?.max }, adminView && !archiveTab)
  const plainList = useEmployeeRows(base, !adminView && !archiveTab)
  const stats = useEmployeeStats()

  const departmentOptions = useDepartmentOptions()
  const positionOptions = useJobPositionOptions()
  const contractOptions = useMemo(() => CONTRACT_TYPES.map((c) => ({ value: c, label: t(`personnel.contract.${c}`) })), [t])
  const statusOptions = useMemo(() => STATUS_KEYS.map((k) => ({ value: k, label: t(`personnel.kpiStatus.${k}`) })), [t])

  const { remove } = useEmployeeMutations()
  const [drawer, setDrawer] = useState<{ open: boolean; id: number | null }>({ open: false, id: null })
  const [archiveTarget, setArchiveTarget] = useState<Target | null>(null)
  const [pwdTarget, setPwdTarget] = useState<Target | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [archiveSettingsOpen, setArchiveSettingsOpen] = useState(false)

  // Archive tab keeps the search and the department; the rest only narrows the active roster.
  const filterCount = activeFilterCount - (filters.status ? 1 : 0)
  const resetFilters = () => setFilters({ q: null, department_id: null, pos: null, contract: null, kstatus: null, kmin: null, kmax: null })
  const setTab = (v: 'active' | 'archive') => setFilters({ status: v === 'archive' ? 'archive' : null, pos: null, contract: null, kstatus: null, kmin: null, kmax: null })

  const hardDelete = async (row: Target) => {
    const ok = await confirm({ kind: 'delete', title: t('personnel.card.deleteTitle'), description: t('personnel.card.deleteConfirm', { name: row.legal_name ?? '' }) })
    if (!ok) return
    try {
      await remove.mutateAsync(row.id)
      toast.ok(t('personnel.card.deleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const rowActions = (row: { id: number; legal_name?: string | null; department_id?: number | null; supervisor_id?: number | null }) => {
    const items = []
    if (canManageEmployee(user, row))
      items.push({ key: 'edit', label: t('common.edit'), icon: <Pencil size={14} />, onClick: () => setDrawer({ open: true, id: row.id }) })
    if (hr) items.push({ key: 'pwd', label: t('personnel.pwd.title'), icon: <KeyRound size={14} />, onClick: () => setPwdTarget(row) })
    if (canFull) {
      items.push({ key: 'archive', label: t('personnel.archive.title'), icon: <Archive size={14} />, onClick: () => setArchiveTarget(row) })
      items.push({ key: 'delete', label: t('common.delete'), icon: <Trash2 size={14} />, danger: true, onClick: () => void hardDelete(row) })
    }
    if (!items.length) return null
    return (
      <div onClick={(e) => e.stopPropagation()} className="flex justify-end">
        <ActionMenu label={t('personnel.list.actions')} items={items} variant="ghost" size="sm" />
      </div>
    )
  }

  const openable = (r: { id: number; department_id?: number | null; supervisor_id?: number | null }) => canOpenEmployeeCard(user, r)

  const nameCell = (r: { id: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null; department_id?: number | null; supervisor_id?: number | null }, sub?: string | null) => {
    const body = (
      <>
        <Avatar src={r.photo_thumb_path} fallbackSrc={r.photo_path} name={r.legal_name} size={34} />
        <span className="min-w-0">
          <span className={cn('block truncate text-[13px] font-semibold text-fg', openable(r) && 'hover:underline')}>{r.legal_name || t('common.unknown')}</span>
          <span className="block truncate text-[11px] text-fg-muted">{sub || '—'}</span>
        </span>
      </>
    )
    // A colleague whose card the server would refuse (403 employee_card_forbidden)
    // is shown as plain text, not as a link to an error page.
    return openable(r) ? (
      <Link to={`/employees/${r.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-3 rounded-inner outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    ) : (
      <div className="flex items-center gap-3">{body}</div>
    )
  }

  const kpiColumns: Column<EmployeeKpiRow>[] = [
    { key: 'n', header: '#', headerClassName: 'w-10', className: 'text-fg-subtle tabular-nums', cell: (_r, i) => (page - 1) * size + i + 1 },
    { key: 'name', header: t('personnel.list.colName'), skeleton: 'w-48', lockVisible: true, cell: (r) => nameCell(r, r.job_position_name) },
    { key: 'department', header: t('personnel.f.department'), cell: (r) => <span className="block max-w-[14rem] truncate text-fg-muted" title={r.department_name ?? ''}>{r.department_name || '—'}</span> },
    { key: 'contract', header: t('personnel.f.contractType'), className: 'whitespace-nowrap text-fg-muted', cell: (r) => labels.contract(r.contract_type) || '—' },
    { key: 'kpi', header: t('personnel.list.colKpi'), skeleton: 'w-24', cell: (r) => <KpiBar value={Number(r.kpi_percentage) || 0} /> },
    { key: 'attendance', header: t('personnel.list.colAttendance'), className: 'font-semibold tabular-nums text-brand-strong', cell: (r) => `${Math.round(Number(r.attendance_percentage) || 0)}%` },
    {
      key: 'trend',
      header: t('personnel.list.colTrend'),
      cell: (r) => (
        <Sparkline
          series={[...(r.kpi_status ?? [])].sort((a, b) => a.month.localeCompare(b.month)).map((m) => Number(m.kpi_percentage) || 0)}
          kpi={Number(r.kpi_percentage) || 0}
        />
      ),
    },
    {
      key: 'status',
      header: t('personnel.list.colStatus'),
      cell: (r) => {
        const k = kpiStatusKey(Number(r.kpi_percentage) || 0)
        return <Badge tone={STATUS_TONE[k]}>{t(`personnel.kpiStatus.${k}`)}</Badge>
      },
    },
    { key: 'actions', header: '', label: t('personnel.list.actions'), headerClassName: 'w-12', lockVisible: true, cell: (r) => rowActions(r) },
  ]

  const plainColumns: Column<EmployeeRow>[] = [
    { key: 'name', header: t('personnel.list.colName'), skeleton: 'w-48', lockVisible: true, cell: (r) => nameCell(r, r.job_position?.name) },
    { key: 'department', header: t('personnel.f.department'), className: 'text-fg-muted', cell: (r) => r.department?.name || '—' },
    { key: 'nationality', header: t('personnel.f.nationality'), className: 'text-fg-muted', cell: (r) => (r.nationality ? natLabel(r.nationality) : '—') },
    { key: 'birth', header: t('personnel.f.birthDate'), className: 'tabular-nums text-fg-muted', cell: (r) => fmtDate(r.birth_date) },
    { key: 'gender', header: t('personnel.f.gender'), className: 'text-fg-muted', cell: (r) => labels.gender(r.gender) || '—' },
    { key: 'contract', header: t('personnel.f.contractType'), className: 'whitespace-nowrap text-fg-muted', cell: (r) => labels.contract(r.contract_type) || '—' },
    { key: 'actions', header: '', label: t('personnel.list.actions'), headerClassName: 'w-12', lockVisible: true, cell: (r) => rowActions(r) },
  ]

  const list = adminView ? kpiList : plainList
  const filterReset = <FilterReset count={filterCount} onReset={resetFilters} />

  return (
    <PageContainer>
      <PageHeader
        title={t('personnel.list.title')}
        subtitle={t('personnel.list.subtitle')}
        actions={
          <>
            {!archiveTab && (
              <Button variant="outline" leftIcon={<FileSpreadsheet size={16} />} onClick={() => setExportOpen(true)}>
                {t('personnel.list.export')}
              </Button>
            )}
            {canCreate && (
              <Button leftIcon={<Plus size={16} />} onClick={() => setDrawer({ open: true, id: null })}>
                {t('common.add')}
              </Button>
            )}
          </>
        }
      />

      <HeadlineCards adminView={adminView} averageAge={stats.age?.average_age ?? 0} ageLoading={stats.ageLoading} />

      <Card className="mb-4 flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 pt-3 pb-2">
          <h2 className="text-[14px] font-semibold text-fg">{archiveTab ? t('personnel.list.archiveTitle') : t('personnel.list.overview')}</h2>
          {hr && (
            <Segmented
              size="sm"
              value={archiveTab ? 'archive' : 'active'}
              onChange={setTab}
              options={[
                { value: 'active', label: t('personnel.list.tabActive'), icon: <Users size={13} /> },
                { value: 'archive', label: t('personnel.list.tabArchive'), icon: <Archive size={13} /> },
              ]}
            />
          )}
          {/* TZ C4 1087: the restore term — a site-wide setting (master only). */}
          {archiveTab && isSiteMasterAdmin(user) && (
            <Button size="sm" variant="ghost" className="ml-auto" leftIcon={<Settings2 size={14} />} onClick={() => setArchiveSettingsOpen(true)}>
              {t('hrExt.archiveSettings.title')}
            </Button>
          )}
        </div>
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('personnel.list.search')} className="flex-1 lg:max-w-xs" />
          {hr && (
            <Combobox
              value={archiveTab ? 'archive' : 'active'}
              onChange={(v) => setTab(v === 'archive' ? 'archive' : 'active')}
              options={[
                { value: 'active', label: t('personnel.state.workingShort') },
                { value: 'archive', label: t('personnel.state.archivedShort') },
              ]}
              hidePlaceholderOption
              clearable={false}
              aria-label={t('personnel.list.employmentState')}
              className="w-full lg:w-40"
            />
          )}
          <Combobox value={filters.department_id} onChange={(v) => setFilter('department_id', v)} options={departmentOptions} placeholder={t('personnel.list.allDepartments')} className="w-full lg:w-56" />
          {!archiveTab && (
            <>
              <Combobox value={filters.pos} onChange={(v) => setFilter('pos', v)} options={positionOptions} placeholder={t('personnel.list.allPositions')} className="w-full lg:w-52" />
              <Combobox value={filters.contract} onChange={(v) => setFilter('contract', v)} options={contractOptions} placeholder={t('personnel.list.allContracts')} className="w-full lg:w-52" />
              {adminView && (
                <>
                  <Combobox
                    value={filters.kstatus}
                    onChange={(v) => setFilters({ kstatus: v || null, kmin: null, kmax: null })}
                    options={statusOptions}
                    placeholder={t('personnel.list.allStatuses')}
                    className="w-full lg:w-44"
                  />
                  {!filters.kstatus && (
                    <KpiRangeSlider
                      min={slider?.min}
                      max={slider?.max}
                      onCommit={(r) => setFilters({ kmin: r.min == null ? null : String(r.min), kmax: r.max == null ? null : String(r.max) })}
                    />
                  )}
                </>
              )}
            </>
          )}
          {filterReset}
        </div>

        {archiveTab ? (
          <ArchivedTable
            search={search}
            departmentId={filters.department_id}
            page={page}
            size={size}
            setPage={setPage}
            setSize={setSize}
            filtered={filterCount > 0}
            emptyAction={filterReset}
            canRestore={canFull}
          />
        ) : (
          <>
            {adminView ? (
              <DataTable
                tableId="employees-kpi"
                rows={kpiList.data?.items ?? []}
                columns={kpiColumns}
                loading={kpiList.isLoading}
                error={kpiList.error}
                onRetry={() => void kpiList.refetch()}
                onRowClick={(r) => navigate(`/employees/${r.id}`)}
                emptyTitle={t('personnel.list.empty')}
                filtered={filterCount > 0}
                emptyAction={filterReset}
                minWidth={1100}
              />
            ) : (
              <DataTable
                tableId="employees-plain"
                rows={plainList.data?.items ?? []}
                columns={plainColumns}
                loading={plainList.isLoading}
                error={plainList.error}
                onRetry={() => void plainList.refetch()}
                onRowClick={(r) => { if (openable(r)) navigate(`/employees/${r.id}`) }}
                rowClassName={(r) => (openable(r) ? '' : '!cursor-default')}
                emptyTitle={t('personnel.list.empty')}
                filtered={filterCount > 0}
                emptyAction={filterReset}
                minWidth={980}
              />
            )}
            <Pagination
              page={page}
              size={size}
              total={list.data?.total ?? 0}
              pages={list.data?.pages ?? 0}
              onPage={setPage}
              onSize={setSize}
              loading={list.isFetching}
            />
          </>
        )}
      </Card>

      <Suspense fallback={<Skeleton className="h-56 w-full rounded-card" />}>
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
      {adminView && <KpiInsights />}

      <EmployeeFormDrawer
        open={drawer.open}
        editId={drawer.id}
        onClose={() => setDrawer({ open: false, id: null })}
        onSaved={(res) => {
          if (res.created) navigate(`/employees/${res.id}`)
        }}
      />
      <ArchiveEmployeeModal employee={archiveTarget} onClose={() => setArchiveTarget(null)} />
      <EmployeePasswordModal target={pwdTarget} onClose={() => setPwdTarget(null)} />
      <ArchiveSettingsModal open={archiveSettingsOpen} onClose={() => setArchiveSettingsOpen(false)} />
      <EmployeeExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filters={{ search, departmentId: filters.department_id, jobPositionId: filters.pos }}
        kpiFilterActive={!!kpiRange || !!filters.contract}
      />
    </PageContainer>
  )
}
