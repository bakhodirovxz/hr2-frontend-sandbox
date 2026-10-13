import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useSearchParams } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BellRing,
  Check,
  Columns3,
  Copy,
  Download,
  FileCode2,
  FileText,
  Globe,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { filterChip, tabPill } from '@/components/ui/control'
import { FilterReset } from '@/components/data/FilterReset'
import { LoadError } from '@/components/data/LoadError'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { TD_COMPACT, TD_MESSAGE, TH } from '@/components/data/tableStyles'
import { errorMessage } from '@/api/errorMessage'
import {
  STAFF_POSITIONS_EXPORT_EXCEL,
  STAFF_POSITIONS_EXPORT_PDF,
  STAFF_POSITIONS_EXPORT_XML,
} from '@/api/endpoints'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { cn } from '@/lib/cn'
import { PDF_MIME, XLSX_MIME, XML_MIME, downloadFile } from '@/lib/download'
import { useAuthStore } from '@/store/authStore'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { CopyVacancyModal } from '@/features/staff/CopyVacancyModal'
import { JobPortalsModal } from '@/features/staff/JobPortalsModal'
import { VacancyStatusModal } from '@/features/staff/VacancyStatusModal'
import { RequiredLanguagesChips } from '@/features/vacancies/RequiredLanguagesChips'
import { BulkStaffModal } from '@/features/staff/BulkStaffModal'
import { ExportColumnsModal } from '@/features/staff/ExportColumnsModal'
import { StaffCloseModal } from '@/features/staff/StaffCloseModal'
import { StaffPositionModal } from '@/features/staff/StaffPositionModal'
import { VacancyApplicationsPanel } from '@/features/staff/VacancyApplicationsPanel'
import { VacancyNotifyModal } from '@/features/staff/VacancyNotifyModal'
import {
  STAFF_CATEGORIES,
  VACANCY_STATUSES,
  canCreateVacancy,
  canManageStaff,
  fmtUnits,
  headDepartmentIds,
  staffListParams,
  useStaffIssues,
  useStaffMutations,
  useStaffPosition,
  useStaffPositions,
  useStaffSummary,
  type StaffPosition,
} from '@/features/staff/useStaffPositions'

type Tab = 'shtat' | 'muammo' | 'arizalar'
const FILTER_KEYS = ['tab', 'vacant', 'dept', 'pos', 'cat', 'closed', 'sort', 'dir', 'ann'] as const
/** Server `sort_by` keys (StaffPositionService._SORTABLE). */
const SORTABLE = ['department', 'job_position', 'category', 'razryad', 'planned_units'] as const

const CATEGORY_TONE: Record<string, string> = {
  rahbar: 'bg-warning/[0.13] text-warning',
  mutaxassis: 'bg-brand/[0.14] text-brand-strong',
  xizmatchi: 'bg-info/[0.12] text-info',
  ishchi: 'bg-success/[0.12] text-success',
}

const rowKey = (r: StaffPosition) => `${r.department_id}-${r.job_position_id}`

/**
 * SHTAT VA VAKANSIYALAR — TZ 4.2.6, 4.2.10, V1, V2, V3.
 *
 * Vacancies are not typed in: the backend derives them (approved − occupied),
 * so the same register answers the establishment question and the vacancy
 * one; «Faqat bo'sh o'rinlar» switches the table to the vacancy view. Rows are
 * grouped by department — the unit a staffing decision is made in, and the
 * unit the bulk editor works on.
 *
 * Manage (edit, reduce, bulk, XML, settings, issues, applications) —
 * `canWriteOrg(user,'vacancies','full')`; a department head may only OPEN a
 * vacancy in his own and lower units (`canWrite(user,'vacancies')`).
 * `?open={id}` opens one staff line.
 */
export function StaffPositionsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const manage = canManageStaff(user)
  const canCreate = canCreateVacancy(user)
  const headIds = useMemo(() => headDepartmentIds(user), [user])
  const isHeadOnly = !manage && (headIds?.length ?? 0) > 0

  const { search, page, size, filters, setSearch, setPage, setSize, setFilter, setFilters } =
    useListParams(FILTER_KEYS)
  const requested = (filters.tab as Tab) || 'shtat'
  // A pasted ?tab=muammo link still lands on the table for a non-manager.
  const tab: Tab = requested !== 'shtat' && !manage ? 'shtat' : requested
  const onlyVacant = filters.vacant === '1'
  // TZ V2 1304: the announcement status (open / paused / closed). The server
  // list has no such filter, so with it on the whole register (≤ 500 rows) is
  // read and narrowed here; «Faqat bo'sh o'rinlar» is open announcements only.
  const annStatus = !onlyVacant && (VACANCY_STATUSES as readonly string[]).includes(filters.ann) ? filters.ann : ''
  const sortBy = (SORTABLE as readonly string[]).includes(filters.sort) ? filters.sort : ''
  const sortDir: 'asc' | 'desc' = filters.dir === 'desc' ? 'desc' : 'asc'

  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()

  const query = {
    page: annStatus ? 1 : page,
    size: annStatus ? 500 : size,
    search,
    departmentId: filters.dept || (isHeadOnly && headIds!.length === 1 ? headIds![0] : undefined),
    jobPositionId: filters.pos,
    category: filters.cat,
    onlyVacant,
    includeClosed: filters.closed === '1',
    sortBy,
    sortDir,
  }
  const list = useStaffPositions(query, tab === 'shtat')
  const { summary, failed: summaryFailed } = useStaffSummary()
  const issues = useStaffIssues(manage)

  // A head sees his own units only (TZ V1 «Руководители»).
  const rows = useMemo(() => {
    let out = isHeadOnly ? list.rows.filter((r) => headIds!.includes(Number(r.department_id))) : list.rows
    if (annStatus) out = out.filter((r) => r.has_staff_row !== false && (r.vacancy_status || 'open') === annStatus)
    return out
  }, [list.rows, isHeadOnly, headIds, annStatus])
  const groups = useMemo(() => {
    const map = new Map<string, StaffPosition[]>()
    for (const r of rows) {
      const name = r.department_name || t('orgRef.noDepartment')
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(r)
    }
    return [...map.entries()].map(([name, items]) => ({
      name,
      rows: items,
      planned: items.reduce((s, r) => s + Number(r.planned_units || 0), 0),
      occupied: items.reduce((s, r) => s + Number(r.occupied_units || 0), 0),
      vacant: items.reduce((s, r) => s + Number(r.vacant_units || 0), 0),
    }))
  }, [rows, t])

  const [drawer, setDrawer] = useState<{ row: StaffPosition | null; vacancy: boolean } | null>(null)
  const [closeRow, setCloseRow] = useState<StaffPosition | null>(null)
  const [bulk, setBulk] = useState<{ name: string; rows: StaffPosition[] } | null>(null)
  const [colsOpen, setColsOpen] = useState(false)
  const [notifyOpen, setNotifyOpen] = useState(false)
  const [exportCols, setExportCols] = useState<string[]>([])
  const [exporting, setExporting] = useState<string | null>(null)
  const [copySource, setCopySource] = useState<StaffPosition | null>(null)
  const [statusTarget, setStatusTarget] = useState<{ row: StaffPosition; status: 'paused' | 'open' } | null>(null)
  const [portalsOpen, setPortalsOpen] = useState(false)
  const master = isSiteMasterAdmin(user)

  // `?open=12` — open that staff line and drop the parameter.
  const [params, setParams] = useSearchParams()
  const openParam = Number(params.get('open')) || null
  const opened = useStaffPosition(manage ? openParam : null)
  useEffect(() => {
    if (!openParam) return
    if (!manage || opened.data || opened.isError) {
      if (opened.data) setDrawer({ row: opened.data, vacancy: false })
      if (opened.isError) toast.error(errorMessage(opened.error, t('orgRef.notFound')))
      setParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          sp.delete('open')
          return sp
        },
        { replace: true },
      )
    }
  }, [openParam, manage, opened.data, opened.isError, opened.error, setParams, toast, t])

  const toggleSort = (key: string) =>
    setFilters({ sort: key, dir: sortBy === key && sortDir === 'asc' ? 'desc' : null })

  const filterCount = [filters.dept, filters.pos, filters.cat, filters.closed, filters.vacant, annStatus, search].filter(Boolean).length
  const resetFilters = () => setFilters({ dept: null, pos: null, cat: null, closed: null, vacant: null, ann: null, q: null })

  /* TZ 4.2.10 «Экспорт данных в форматы Excel, PDF и XML» — with the filters
     on screen; XML is the uzgidro.uz portal feed (open places only). */
  const doExport = async (format: 'excel' | 'pdf' | 'xml') => {
    const cfg = {
      excel: { url: STAFF_POSITIONS_EXPORT_EXCEL, mime: XLSX_MIME, ext: 'xlsx' },
      pdf: { url: STAFF_POSITIONS_EXPORT_PDF, mime: PDF_MIME, ext: 'pdf' },
      xml: { url: STAFF_POSITIONS_EXPORT_XML, mime: XML_MIME, ext: 'xml' },
    }[format]
    const base = format === 'xml' ? 'Vakansiyalar_UZGIDRO' : onlyVacant ? 'Vakansiyalar' : 'Shtat_jadvali'
    setExporting(format)
    try {
      await downloadFile({
        url: cfg.url,
        method: 'post',
        mime: cfg.mime,
        filename: `${base}_${dayjs().format('DD.MM.YYYY')}.${cfg.ext}`,
        params: {
          ...staffListParams(query),
          columns: format === 'excel' && exportCols.length ? exportCols : undefined,
        },
      })
      toast.ok(t('staff.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('staff.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'shtat', label: t('staff.tab_shtat') },
    ...(manage
      ? [
          { key: 'muammo' as Tab, label: `${t('staff.tab_muammo')}${issues.groups.length ? ` (${issues.groups.length})` : ''}` },
          { key: 'arizalar' as Tab, label: t('orgRef.tabApplications') },
        ]
      : []),
  ]
  const colSpan = onlyVacant ? 12 : 8

  return (
    <PageContainer className="flex min-h-full flex-col">
      <PageHeader
        title={t('nav.staffing')}
        subtitle={t('staff.subtitle')}
        actions={
          <>
            <ActionMenu
              label={t('staff.download')}
              icon={<Download size={14} />}
              width={300}
              items={[
                { key: 'excel', label: 'Excel', icon: <Download size={14} />, loading: exporting === 'excel', onClick: () => doExport('excel') },
                { key: 'pdf', label: 'PDF', icon: <FileText size={14} />, loading: exporting === 'pdf', onClick: () => doExport('pdf') },
                ...(manage
                  ? [
                      { key: 'xml', label: 'XML', hint: t('staff.xmlHint'), icon: <FileCode2 size={14} />, loading: exporting === 'xml', onClick: () => doExport('xml') },
                      {
                        key: 'cols',
                        label: `${t('staff.exportColumns')}${exportCols.length ? ` (${exportCols.length})` : ''}`,
                        hint: t('staff.exportColumnsHint'),
                        icon: <Columns3 size={14} />,
                        divider: true,
                        onClick: () => setColsOpen(true),
                      },
                      { key: 'notify', label: t('staff.notifyTitle'), hint: t('staff.notifyHint'), icon: <BellRing size={14} />, onClick: () => setNotifyOpen(true) },
                    ]
                  : []),
                ...(master
                  ? [{ key: 'portals', label: t('ordVac.portalsTitle'), hint: t('ordVac.portalsMenuHint'), icon: <Globe size={14} />, divider: !manage, onClick: () => setPortalsOpen(true) }]
                  : []),
              ]}
            />
            {canCreate && (
              <Button size="sm" variant="secondary" leftIcon={<Megaphone size={15} />} onClick={() => setDrawer({ row: null, vacancy: true })}>
                {t('orgRef.createVacancy')}
              </Button>
            )}
            {manage && (
              <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setDrawer({ row: null, vacancy: false })}>
                {t('orgRef.add')}
              </Button>
            )}
          </>
        }
      />

      {/* «Nechta rahbar, nechta mutaxassis» — the totals by category. */}
      {!summaryFailed && (
        <div className="mb-4 flex flex-wrap gap-3">
          <SummaryCard
            label={t('orgRef.total_')}
            value={summary ? `${fmtUnits(summary.occupied_units)} / ${fmtUnits(summary.planned_units)}` : '…'}
            unit={t('orgRef.occupiedPlanned')}
            lines={
              summary
                ? [
                    <span key="v" className="text-success">
                      {t('orgRef.vacantInRows', { units: fmtUnits(summary.vacant_units), rows: summary.vacant_rows })}
                    </span>,
                    Number(summary.over_units) > 0 ? (
                      <span key="o" className="text-danger">
                        {t('orgRef.overUnits', { units: fmtUnits(summary.over_units) })}
                      </span>
                    ) : null,
                  ]
                : []
            }
          />
          {(summary?.by_category ?? []).map((b) => (
            <SummaryCard
              key={b.category ?? 'none'}
              label={b.category ? t(`staff.cat_${b.category}` as never) : t('orgRef.noCategory')}
              value={`${fmtUnits(b.occupied_units)} / ${fmtUnits(b.planned_units)}`}
              lines={[
                <span key="v" className={Number(b.vacant_units) > 0 ? 'text-success' : 'text-fg-subtle'}>
                  {t('orgRef.vacantUnits', { units: fmtUnits(b.vacant_units) })}
                  {Number(b.over_units) > 0 && (
                    <span className="text-danger"> · {t('orgRef.overShort', { units: fmtUnits(b.over_units) })}</span>
                  )}
                </span>,
              ]}
            />
          ))}
        </div>
      )}

      <Card className="flex min-h-[520px] flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-4 py-3" role="tablist">
          {tabs.map((x) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={tab === x.key}
              onClick={() => setFilters({ tab: x.key === 'shtat' ? null : x.key, page: null })}
              className={tabPill(tab === x.key)}
            >
              {x.label}
            </button>
          ))}
        </div>

        {tab === 'arizalar' ? (
          <VacancyApplicationsPanel />
        ) : tab === 'muammo' ? (
          <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {issues.loading ? (
              <p className="text-sm text-fg-subtle">{t('common.loading')}</p>
            ) : issues.error ? (
              <LoadError error={issues.error} onRetry={() => void issues.refetch()} />
            ) : issues.groups.length === 0 ? (
              <EmptyState icon={<Check size={20} />} title={t('staff.noIssues')} description={t('staff.noIssuesHint')} />
            ) : (
              issues.groups.map((g) => (
                <div key={g.code} className="rounded-inner border border-line bg-surface-2/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle size={15} className="text-warning" />
                    <h3 className="text-[14px] font-bold text-fg">
                      {i18n.exists(`staff.issue_${g.code}`) ? t(`staff.issue_${g.code}` as never) : g.code}
                    </h3>
                    <Badge tone="warning">{g.total}</Badge>
                  </div>
                  {i18n.exists(`staff.issueHint_${g.code}`) && (
                    <p className="mt-1 text-xs text-fg-muted">{t(`staff.issueHint_${g.code}` as never)}</p>
                  )}
                  {g.rows.length > 0 && (
                    <ul className="mt-2.5 flex flex-col gap-1">
                      {g.rows.slice(0, 30).map((r, i) => (
                        <li key={`${g.code}-${r.id ?? i}`} className="flex flex-wrap gap-2 text-[12.5px] text-fg-muted">
                          <span className="text-fg">· {r.name ?? '—'}</span>
                          {r.count != null && (
                            <span className="text-warning">{t('orgRef.recordsCount', { count: r.count })}</span>
                          )}
                          {r.detail && <span className="text-fg-subtle">{r.detail}</span>}
                        </li>
                      ))}
                      {g.total > 30 && (
                        <li className="text-[12px] text-fg-subtle">{t('orgRef.andMore', { count: g.total - 30 })}</li>
                      )}
                    </ul>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <SearchInput value={search} onChange={setSearch} placeholder={t('staff.searchPlaceholder')} className="w-full max-w-[260px]" />
              <Select
                value={filters.dept}
                onChange={(e) => setFilter('dept', e.target.value)}
                options={departments}
                placeholder={t('dashboard.allDepartments')}
                aria-label={t('employees.colDepartment')}
                wrapperClassName="w-[200px]"
              />
              <Select
                value={filters.pos}
                onChange={(e) => setFilter('pos', e.target.value)}
                options={positions}
                placeholder={t('dashboard.allPositions')}
                aria-label={t('employees.colPosition')}
                wrapperClassName="w-[200px]"
              />
              <Select
                value={filters.cat}
                onChange={(e) => setFilter('cat', e.target.value)}
                options={[
                  ...STAFF_CATEGORIES.map((c) => ({ value: c, label: t(`staff.cat_${c}` as const) })),
                  { value: 'none', label: t('orgRef.noCategory') },
                ]}
                placeholder={t('staff.allCategories')}
                aria-label={t('staff.category')}
                wrapperClassName="w-[170px]"
              />
              <button
                type="button"
                aria-pressed={onlyVacant}
                onClick={() => setFilter('vacant', onlyVacant ? '' : '1')}
                className={filterChip(onlyVacant)}
              >
                {t('orgRef.onlyVacant')}
                {!!summary?.vacant_rows && <Badge tone="success">{summary.vacant_rows}</Badge>}
              </button>
              {!onlyVacant && (
                <Select
                  value={annStatus}
                  onChange={(e) => setFilter('ann', e.target.value)}
                  options={VACANCY_STATUSES.map((v) => ({ value: v, label: vacancyStatusLabel(t, v) }))}
                  placeholder={t('ordVac.allAnnStatuses')}
                  aria-label={t('staff.vacancyStatus')}
                  wrapperClassName="w-[190px]"
                />
              )}
              <Checkbox
                checked={filters.closed === '1'}
                onChange={(e) => setFilter('closed', e.target.checked ? '1' : '')}
                label={t('staff.includeClosed')}
              />
              <FilterReset count={filterCount} onReset={resetFilters} />
            </div>

            <div className="scroll-thin min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="sticky top-0 z-[1] border-b border-line bg-surface-2">
                  <tr>
                    <th className={cn(TH, 'w-12')}>#</th>
                    <SortTh label={t('employees.colPosition')} k="job_position" sortBy={sortBy} dir={sortDir} onSort={toggleSort} />
                    <SortTh label={t('staff.category')} k="category" sortBy={sortBy} dir={sortDir} onSort={toggleSort} className="w-[130px]" />
                    <SortTh label={t('structure.colRazryad')} k="razryad" sortBy={sortBy} dir={sortDir} onSort={toggleSort} className="w-[100px]" />
                    <SortTh label={t('orgRef.colPlanned')} k="planned_units" sortBy={sortBy} dir={sortDir} onSort={toggleSort} className="w-[110px]" />
                    <th className={cn(TH, 'w-[80px]')}>{t('staff.occupied')}</th>
                    <th className={cn(TH, 'w-[80px]')}>{t('orgRef.colVacant')}</th>
                    {onlyVacant && <th className={cn(TH, 'w-[120px]')}>{t('orgRef.vacantSince')}</th>}
                    {onlyVacant && <th className={cn(TH, 'w-[240px]')}>{t('staff.requirements')}</th>}
                    {onlyVacant && <th className={cn(TH, 'w-[120px]')}>{t('orgRef.deadlineShort')}</th>}
                    {onlyVacant && <th className={cn(TH, 'w-[180px]')}>{t('orgRef.contact')}</th>}
                    <th className={cn(TH, 'w-[150px] text-right')}>{t('orgRef.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.error ? (
                    <tr>
                      <td colSpan={colSpan} className="p-6">
                        <LoadError error={list.error} onRetry={() => void list.refetch()} />
                      </td>
                    </tr>
                  ) : list.loading ? (
                    <tr>
                      <td colSpan={colSpan} className={TD_MESSAGE}>
                        {t('common.loading')}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan} className="p-6">
                        <EmptyState
                          title={onlyVacant ? t('orgRef.noVacant') : t('staff.empty')}
                          description={filterCount ? t('staff.emptyHint') : undefined}
                          action={<FilterReset count={filterCount} onReset={resetFilters} />}
                        />
                      </td>
                    </tr>
                  ) : (
                    groups.map((g) => (
                      <Fragment key={g.name}>
                        <tr className="border-y border-line bg-brand-soft/60">
                          <td colSpan={colSpan} className="px-6 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <span className="text-[12px] font-bold uppercase tracking-wider text-brand-strong">{g.name}</span>
                              <span className="flex flex-wrap items-center gap-3 text-[12px] text-fg-muted">
                                <span>
                                  {t('orgRef.groupLine', {
                                    count: g.rows.length,
                                    planned: fmtUnits(g.planned),
                                    occupied: fmtUnits(g.occupied),
                                  })}
                                  {g.vacant !== 0 && (
                                    <>
                                      {' · '}
                                      {t('orgRef.colVacant').toLowerCase()}{' '}
                                      <b className={g.vacant > 0 ? 'text-success' : 'text-danger'}>{fmtUnits(g.vacant)}</b>
                                    </>
                                  )}
                                </span>
                                {manage && !onlyVacant && (
                                  <Button size="sm" variant="outline" onClick={() => setBulk({ name: g.name, rows: g.rows })}>
                                    {t('orgRef.editDepartment')}
                                  </Button>
                                )}
                              </span>
                            </div>
                          </td>
                        </tr>
                        {g.rows.map((r, idx) => (
                          <StaffRow
                            key={rowKey(r)}
                            row={r}
                            index={idx + 1}
                            manage={manage}
                            canCopy={canCreate}
                            onlyVacant={onlyVacant}
                            onEdit={() => setDrawer({ row: r, vacancy: false })}
                            onClose={() => setCloseRow(r)}
                            onCopy={() => setCopySource(r)}
                            onStatus={(status) => setStatusTarget({ row: r, status })}
                          />
                        ))}
                      </Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {annStatus ? (
              <p className="border-t border-line px-6 py-3 text-[12.5px] text-fg-muted">{t('ordVac.annFiltered', { count: rows.length })}</p>
            ) : (
              <Pagination page={page} size={size} total={list.total} pages={list.pages} onPage={setPage} onSize={setSize} loading={list.loading} />
            )}
          </>
        )}
      </Card>

      <StaffPositionModal
        open={!!drawer}
        onClose={() => setDrawer(null)}
        row={drawer?.row ?? null}
        vacancyMode={!!drawer?.vacancy}
        allowedDepartmentIds={isHeadOnly ? headIds : null}
        onCopy={canCreate ? (r) => setCopySource(r) : undefined}
      />
      <CopyVacancyModal
        source={copySource}
        allowedDepartmentIds={isHeadOnly ? headIds : null}
        onClose={() => setCopySource(null)}
        onCopied={(created) => {
          setCopySource(null)
          // «заполняет форму данными из выбранной вакансии» — the copy opens for review.
          setDrawer(manage ? { row: created, vacancy: false } : null)
        }}
      />
      <VacancyStatusModal target={statusTarget} onClose={() => setStatusTarget(null)} />
      {master && <JobPortalsModal open={portalsOpen} onClose={() => setPortalsOpen(false)} />}
      <StaffCloseModal row={closeRow} onClose={() => setCloseRow(null)} />
      <BulkStaffModal open={!!bulk} onClose={() => setBulk(null)} departmentName={bulk?.name ?? ''} rows={bulk?.rows ?? []} />
      <ExportColumnsModal open={colsOpen} onClose={() => setColsOpen(false)} selected={exportCols} onApply={setExportCols} />
      <VacancyNotifyModal open={notifyOpen} onClose={() => setNotifyOpen(false)} />
    </PageContainer>
  )
}

function SortTh({
  label,
  k,
  sortBy,
  dir,
  onSort,
  className,
}: {
  label: string
  k: string
  sortBy: string
  dir: 'asc' | 'desc'
  onSort: (k: string) => void
  className?: string
}) {
  const active = sortBy === k
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={cn(TH, className)} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} className={cn('inline-flex items-center gap-1 hover:text-fg', active && 'text-brand-strong')}>
        {label}
        <Icon size={12} className={active ? '' : 'opacity-40'} />
      </button>
    </th>
  )
}

function SummaryCard({ label, value, unit, lines }: { label: string; value: string; unit?: string; lines: ReactNode[] }) {
  return (
    <Card className="min-w-[170px] px-4 py-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</p>
      <p className="tabnum mt-0.5 text-[20px] font-bold leading-tight text-fg">
        {value}
        {unit && <span className="ml-1.5 text-[12px] font-normal text-fg-subtle">{unit}</span>}
      </p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className="tabnum mt-0.5 text-[12px]">
          {l}
        </p>
      ))}
    </Card>
  )
}

/** One staff line. The planned figure is edited in place (v1 «inline»): Enter saves, Esc cancels. */
function StaffRow({
  row,
  index,
  manage,
  canCopy,
  onlyVacant,
  onEdit,
  onClose,
  onCopy,
  onStatus,
}: {
  row: StaffPosition
  index: number
  manage: boolean
  canCopy: boolean
  onlyVacant: boolean
  onEdit: () => void
  onClose: () => void
  onCopy: () => void
  onStatus: (status: 'paused' | 'open') => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { create, update } = useStaffMutations()
  const [editing, setEditing] = useState<string | null>(null)
  const virtual = row.has_staff_row === false
  const vacant = Number(row.vacant_units ?? 0)

  const save = async () => {
    if (editing == null) return
    const units = Number(editing)
    if (editing.trim() === '' || !Number.isFinite(units) || units < 0) {
      toast.error(t('staff.unitsInvalid'))
      return
    }
    if (!virtual && units === Number(row.planned_units)) {
      setEditing(null)
      return
    }
    try {
      // No approved line yet (employees, but no staff row) — this CREATES it.
      if (virtual) {
        await create.mutateAsync({
          department_id: row.department_id,
          job_position_id: row.job_position_id,
          planned_units: units,
          reason: t('orgRef.addedToStaff'),
        })
      } else {
        await update.mutateAsync({ id: row.id as number, body: { planned_units: units } })
      }
      toast.ok(virtual ? t('orgRef.addedToStaff') : t('staff.updated'))
      setEditing(null)
    } catch (e) {
      toast.error(errorMessage(e, t('staff.saveFailed')))
    }
  }

  return (
    <tr className={cn('border-b border-line/60 hover:bg-surface-2/40', virtual && 'bg-danger/[0.04]', row.is_closed && 'opacity-50')}>
      <td className={cn(TD_COMPACT, 'tabnum text-fg-subtle')}>{index}</td>
      <td className={TD_COMPACT}>
        <span className={cn('text-fg', row.is_closed && 'line-through')}>{row.job_position_name || '—'}</span>
        {virtual && (
          <span title={t('orgRef.noStaffRowHint')} className="ml-2 align-middle">
            <Badge tone="danger">{t('orgRef.noStaffRow')}</Badge>
          </span>
        )}
        {row.is_closed && (
          <span className="ml-2 align-middle">
            <Badge tone="neutral">{t('orgRef.reducedBadge')}</Badge>
          </span>
        )}
        {!virtual && !row.is_closed && (row.vacancy_status === 'paused' || row.vacancy_status === 'closed') && (
          <span className="ml-2 align-middle" title={t('staff.vacancyStatus')}>
            <Badge tone={row.vacancy_status === 'paused' ? 'warning' : 'neutral'} dot>
              {vacancyStatusLabel(t, row.vacancy_status)}
            </Badge>
          </span>
        )}
        {row.recruiter_name && (
          <span className="block text-[11.5px] text-fg-subtle">
            {t('ordVac.recruiter')}: {row.recruiter_name}
          </span>
        )}
      </td>
      <td className={TD_COMPACT}>
        {row.category ? (
          <span className={cn('inline-flex rounded-pill px-2.5 py-1 text-[11px] font-semibold', CATEGORY_TONE[row.category] ?? 'bg-fg/[0.06] text-fg-muted')}>
            {t(`staff.cat_${row.category}` as const)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        )}
      </td>
      <td className={cn(TD_COMPACT, 'tabnum text-fg-muted')}>{row.razryad ?? '—'}</td>
      <td className={TD_COMPACT}>
        {editing != null ? (
          <span className="flex items-center gap-1">
            <Input
              type="number"
              step="0.5"
              min="0"
              autoFocus
              value={editing}
              aria-label={t('orgRef.colPlanned')}
              wrapperClassName="w-[76px]"
              onChange={(e) => setEditing(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save()
                if (e.key === 'Escape') setEditing(null)
              }}
            />
            <IconButton size="sm" label={t('common.save')} onClick={() => void save()}>
              <Check size={14} className="text-success" />
            </IconButton>
          </span>
        ) : manage && !onlyVacant && !virtual && !row.is_closed ? (
          <button
            type="button"
            title={t('orgRef.inlineHint')}
            onClick={() => setEditing(fmtUnits(row.planned_units))}
            className="tabnum rounded px-2 py-1 text-fg hover:bg-fg/[0.06]"
          >
            {fmtUnits(row.planned_units)}
          </button>
        ) : (
          <span className="tabnum px-2 text-fg">{fmtUnits(row.planned_units)}</span>
        )}
      </td>
      <td className={cn(TD_COMPACT, 'tabnum text-fg-muted')}>{fmtUnits(row.occupied_units)}</td>
      <td className={TD_COMPACT}>
        <span className={cn('tabnum', vacant > 0 ? 'font-semibold text-success' : vacant < 0 ? 'font-semibold text-danger' : 'text-fg-subtle')}>
          {fmtUnits(row.vacant_units)}
        </span>
      </td>
      {onlyVacant && (
        <td className={cn(TD_COMPACT, 'tabnum text-fg-muted')}>
          {row.vacancy_open_date ? dayjs(row.vacancy_open_date).format('DD.MM.YYYY') : '—'}
        </td>
      )}
      {onlyVacant && (
        <td className={TD_COMPACT}>
          {row.candidate_requirements ? (
            <span className="line-clamp-2 text-fg-muted" title={row.candidate_requirements}>
              {row.candidate_requirements}
            </span>
          ) : (
            !row.required_languages?.length && <span className="text-fg-subtle">{t('orgRef.announcementEmpty')}</span>
          )}
          <RequiredLanguagesChips value={row.required_languages} />
        </td>
      )}
      {onlyVacant && (
        <td className={cn(TD_COMPACT, 'tabnum')}>
          {row.application_deadline ? (
            <span className={dayjs(row.application_deadline).isBefore(dayjs(), 'day') ? 'text-danger' : 'text-fg-muted'}>
              {dayjs(row.application_deadline).format('DD.MM.YYYY')}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </td>
      )}
      {onlyVacant && (
        <td className={cn(TD_COMPACT, 'text-[12px] leading-tight')}>
          {row.contact_person || row.contact_phone || row.contact_email ? (
            <div className="flex flex-col">
              {row.contact_person && <span className="text-fg">{row.contact_person}</span>}
              {row.contact_phone && <span className="text-fg-muted">{row.contact_phone}</span>}
              {row.contact_email && <span className="truncate text-fg-subtle">{row.contact_email}</span>}
            </div>
          ) : (
            <span className="text-fg-subtle">—</span>
          )}
        </td>
      )}
      <td className={cn(TD_COMPACT, 'text-right')}>
        {!manage && canCopy && !virtual && row.id && (
          <IconButton size="sm" label={t('ordVac.copy')} onClick={onCopy}>
            <Copy size={14} />
          </IconButton>
        )}
        {manage && (
          <span className="inline-flex justify-end gap-1">
            {virtual ? (
              !onlyVacant && (
                <Button size="sm" variant="outline" onClick={() => setEditing(fmtUnits(row.occupied_units))}>
                  {t('orgRef.addToStaff')}
                </Button>
              )
            ) : onlyVacant ? (
              <>
                <IconButton size="sm" label={t('orgRef.editAnnouncement')} onClick={onEdit}>
                  <Megaphone size={14} />
                </IconButton>
                <IconButton size="sm" label={t('ordVac.pause')} onClick={() => onStatus('paused')}>
                  <Pause size={14} />
                </IconButton>
                <IconButton size="sm" label={t('ordVac.copy')} onClick={onCopy}>
                  <Copy size={14} />
                </IconButton>
              </>
            ) : (
              <>
                {!row.is_closed && row.vacancy_status === 'paused' && (
                  <IconButton size="sm" label={t('ordVac.resume')} onClick={() => onStatus('open')}>
                    <Play size={14} className="text-success" />
                  </IconButton>
                )}
                {!row.is_closed && (row.vacancy_status || 'open') === 'open' && Number(row.vacant_units ?? 0) > 0 && (
                  <IconButton size="sm" label={t('ordVac.pause')} onClick={() => onStatus('paused')}>
                    <Pause size={14} />
                  </IconButton>
                )}
                <IconButton size="sm" label={t('ordVac.copy')} onClick={onCopy}>
                  <Copy size={14} />
                </IconButton>
                <IconButton size="sm" label={t('common.edit')} onClick={onEdit}>
                  <Pencil size={14} />
                </IconButton>
                <IconButton size="sm" label={row.is_closed ? t('staff.reopen') : t('orgRef.reduceRow')} onClick={onClose}>
                  {row.is_closed ? <RotateCcw size={14} /> : <Archive size={14} />}
                </IconButton>
              </>
            )}
          </span>
        )}
      </td>
    </tr>
  )
}

/** Announcement status label — TZ V2 1304 adds «To'xtatilgan» (paused). */
function vacancyStatusLabel(t: TFunction, v?: string | null): string {
  if (v === 'paused') return t('ordVac.vacPaused')
  if (v === 'closed') return t('staff.vacClosed')
  return t('staff.vacOpen')
}
