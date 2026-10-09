import { ImportWizard } from '@/features/import/ImportWizard'
import { queryClient } from '@/api/queryClient'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  BellRing,
  ListChecks,
  Columns3,
  Download,
  FileCode2,
  FileText,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Upload,
  MoreHorizontal,
} from 'lucide-react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import dayjs from 'dayjs'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { Button, Card, Checkbox, EmptyState, Select, useToast } from '@/components/ui'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { cn } from '@/lib/cn'
import { PDF_MIME, XLSX_MIME, XML_MIME, downloadFile } from '@/lib/download'
import {
  STAFF_POSITIONS_EXPORT_EXCEL,
  STAFF_POSITIONS_EXPORT_PDF,
  STAFF_POSITIONS_EXPORT_XML,
} from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { StaffPositionModal } from '@/features/staff/StaffPositionModal'
import { VacancyNotifyModal } from '@/features/staff/VacancyNotifyModal'
import { ExportColumnsModal } from '@/features/staff/ExportColumnsModal'
import { BulkStaffModal } from '@/features/staff/BulkStaffModal'
import {
  STAFF_CATEGORIES,
  canManageStaff,
  fmtUnits,
  useStaffIssues,
  useStaffMutations,
  useStaffPositions,
  useStaffSummary,
  type StaffPosition,
} from '@/features/staff/useStaffPositions'
import { tabPill } from '@/components/ui/control'

type Tab = 'shtat' | 'vakansiya' | 'muammo'

/** Table column → server `sort_by`; only these columns are sortable. */
const SORT_COLUMNS: Record<string, string> = {
  department: 'department',
  position: 'job_position',
  category: 'category',
  planned: 'planned_units',
}

const CATEGORY_TONE: Record<string, string> = {
  rahbar: 'bg-warning/[0.13] text-warning',
  mutaxassis: 'bg-brand/[0.14] text-brand-strong',
  xizmatchi: 'bg-info/[0.12] text-info',
  ishchi: 'bg-success/[0.12] text-success',
}

/**
 * SHTAT VA VAKANSIYA — TZ 4.2.6 + 4.2.10.
 *
 * Three readings of ONE register, because the same rows answer three different
 * questions and splitting them into three screens would let the numbers drift:
 *
 *   · SHTAT — the establishment as approved: planned vs occupied, per post;
 *   · VAKANSIYA — only the lines with an opening, which is what the portal
 *     export publishes and what the announcement fields belong to;
 *   · MUAMMOLAR — the register's own defects (an employee with no department
 *     never reaches the table at all, so a screen that only showed the table
 *     would quietly under-count the whole organisation).
 *
 * Occupied units are DERIVED from live employees and can never be typed in;
 * only the planned figure is an editorial decision, and every change to it
 * asks for a reason and lands in the row's change log.
 */
export function StaffPositionsPage() {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const manage = canManageStaff(user)
  const [importing, setImporting] = useState(false)

  // The backend may add a new issue code before the dictionary catches up; a
  // missing key must show the code, never `staff.issue_<code>`.
  const label = (key: string, fallback: string) =>
    i18n.exists(key) ? t(key as never) : fallback
  const branchId = useBranchStore((s) => s.selectedBranchId)

  const { search, page, size, filters, setSearch, setPage, setSize, setFilter, setFilters } =
    useListParams(['tab', 'dept', 'pos', 'cat', 'closed', 'sort', 'dir'])
  // A pasted ?tab=muammo link still lands on the list for a non-manager.
  const tab = ((filters.tab as Tab) === 'muammo' && !manage ? 'shtat' : (filters.tab as Tab)) || 'shtat'
  const includeClosed = filters.closed === '1'
  const debouncedSearch = search

  // TZ 4.2.10: «сортировка по возрастанию и убыванию по любому столбцу» — on
  // the SERVER, across every page. Sorting the page in hand only shuffled the
  // 50 rows on screen. Both halves are validated before they are sent.
  const sortBy = SORT_COLUMNS[filters.sort]
  const sortDir: 'asc' | 'desc' = filters.dir === 'desc' ? 'desc' : 'asc'
  const sort: SortState | null = sortBy ? { key: filters.sort, dir: sortDir } : null

  const filterCount = [filters.dept, filters.pos, filters.cat, filters.closed, search].filter(Boolean).length
  const resetFilters = () => setFilters({ dept: null, pos: null, cat: null, closed: null, q: null })

  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()

  const query = {
    page,
    size,
    search: debouncedSearch,
    departmentId: filters.dept,
    jobPositionId: filters.pos,
    category: filters.cat,
    onlyVacant: tab === 'vakansiya',
    includeClosed,
    sortBy,
    sortDir,
  }
  const { rows, total, pages, loading, denied, error, refetch } = useStaffPositions(query, tab !== 'muammo')
  const { summary, failed: summaryFailed } = useStaffSummary()
  const issues = useStaffIssues(tab === 'muammo')

  const { close, reopen } = useStaffMutations()

  // Bulk edit is scoped to ONE department: that is the unit a staffing decision
  // is actually made in, and it keeps the dialog short enough to check by eye.
  const [bulkDept, setBulkDept] = useState<string | null>(null)

  // Departments present on the CURRENT page — bulk edit works on what the user
  // can see, never on rows hidden behind a filter or another page.
  const bulkDepartments = useMemo(() => {
    const names = new Set<string>()
    for (const r of rows) if (r.department_name) names.add(r.department_name)
    return Array.from(names).sort()
  }, [rows])
  const bulkRows = useMemo(
    () => (bulkDept ? rows.filter((r) => r.department_name === bulkDept) : []),
    [rows, bulkDept],
  )
  const [editRow, setEditRow] = useState<StaffPosition | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [closeTarget, setCloseTarget] = useState<StaffPosition | null>(null)
  const [exporting, setExporting] = useState<string | null>(null)
  const [notifyOpen, setNotifyOpen] = useState(false)
  // Chosen Excel columns. EMPTY means "every column" — the server treats an
  // absent `columns` param that way, so the picker never has to enumerate the
  // full set just to say "all".
  const [exportCols, setExportCols] = useState<string[]>([])
  const [colsOpen, setColsOpen] = useState(false)

  const doExport = async (format: 'excel' | 'pdf' | 'xml') => {
    const cfg = {
      excel: { url: STAFF_POSITIONS_EXPORT_EXCEL, mime: XLSX_MIME, ext: 'xlsx' },
      pdf: { url: STAFF_POSITIONS_EXPORT_PDF, mime: PDF_MIME, ext: 'pdf' },
      xml: { url: STAFF_POSITIONS_EXPORT_XML, mime: XML_MIME, ext: 'xml' },
    }[format]
    const base =
      format === 'xml' ? 'Vakansiyalar_UZGIDRO' : tab === 'vakansiya' ? 'Vakansiyalar' : 'Shtat_jadvali'
    setExporting(format)
    try {
      await downloadFile({
        url: cfg.url,
        method: 'post',
        mime: cfg.mime,
        filename: `${base}_${dayjs().format('DD.MM.YYYY')}.${cfg.ext}`,
        params: {
          organization_branch_id: branchId || undefined,
          search: debouncedSearch || undefined,
          department_id: filters.dept || undefined,
          job_position_id: filters.pos || undefined,
          category: filters.cat || undefined,
          only_vacant: tab === 'vakansiya' || undefined,
          // The chosen COLUMN SORT travels with the file. v1 forwards the whole
          // list query (`const { page, size, ...params } = listParams`); v2 was
          // rebuilding the params by hand and left these two out, so a table
          // sorted by department exported in the server's default order.
          sort_by: sortBy || undefined,
          sort_dir: sortBy ? sortDir : undefined,
          // Excel only: PDF and XML have a fixed layout server-side.
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

  const toggleClosed = async () => {
    if (!closeTarget?.id) return
    try {
      if (closeTarget.is_closed) await reopen.mutateAsync({ id: closeTarget.id })
      else await close.mutateAsync({ id: closeTarget.id })
      toast.ok(closeTarget.is_closed ? t('staff.reopened') : t('staff.closed'))
      setCloseTarget(null)
    } catch (e) {
      toast.error(errorMessage(e, t('staff.saveFailed')))
    }
  }

  const columns: Column<StaffPosition & { id: number }>[] = useMemo(() => {
    const base: Column<StaffPosition & { id: number }>[] = [
      {
        key: 'department',
        skeleton: 'w-[260px]',
        header: t('employees.colDepartment'),
        sortValue: (r) => r.department_name ?? '',
        cell: (r) => (
          <span className="block truncate font-medium text-fg">{r.department_name || '—'}</span>
        ),
      },
      {
        key: 'position',
        skeleton: 'w-[220px]',
        header: t('employees.colPosition'),
        sortValue: (r) => r.job_position_name ?? '',
        cell: (r) => <span className="block truncate text-fg-muted">{r.job_position_name || '—'}</span>,
      },
      {
        key: 'razryad',
        skeleton: 'w-8',
        header: t('structure.colRazryad'),
        className: 'w-[90px] tabular-nums text-fg-muted',
        sortValue: (r) => r.razryad ?? -1,
        cell: (r) => r.razryad ?? '—',
      },
      {
        key: 'category',
        skeleton: 'w-20',
        header: t('staff.category'),
        className: 'w-[130px]',
        sortValue: (r) => r.category ?? '',
        cell: (r) =>
          r.category ? (
            <span
              className={cn(
                'inline-flex rounded-pill px-2.5 py-1 text-[11px] font-semibold',
                CATEGORY_TONE[r.category] ?? 'bg-fg/[0.06] text-fg-muted',
              )}
            >
              {t(`staff.cat_${r.category}` as never)}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
      {
        key: 'planned',
        skeleton: 'w-8',
        header: t('staff.planned'),
        className: 'w-[90px] text-right tabnum',
        sortValue: (r) => Number(r.planned_units ?? 0),
        cell: (r) => fmtUnits(r.planned_units),
      },
      {
        key: 'occupied',
        skeleton: 'w-8',
        header: t('staff.occupied'),
        className: 'w-[90px] text-right tabnum',
        cell: (r) => fmtUnits(r.occupied_units),
      },
      {
        key: 'vacant',
        skeleton: 'w-8',
        header: t('staff.vacant'),
        className: 'w-[90px] text-right tabnum',
        cell: (r) => {
          const n = Number(r.vacant_units ?? 0)
          return (
            <span className={n > 0 ? 'font-semibold text-success' : n < 0 ? 'font-semibold text-danger' : 'text-fg-muted'}>
              {fmtUnits(r.vacant_units)}
            </span>
          )
        },
      },
      {
        key: 'since',
        skeleton: 'w-20',
        header: t('staff.vacantSince'),
        className: 'w-[130px] tabnum text-fg-muted',
        cell: (r) =>
          r.vacancy_open_date ? dayjs(r.vacancy_open_date).format('DD.MM.YYYY') : '—',
      },
      // Vacancy detail — the server has always returned these (StaffPositionRead)
      // and the edit modal writes them, but the list never drew them, so an open
      // vacancy showed no requirements, no closing date and nobody to contact.
      {
        key: 'candidate_requirements',
        skeleton: 'w-40',
        header: t('staff.requirements'),
        className: 'w-[220px]',
        cell: (r) =>
          r.candidate_requirements ? (
            <span className="line-clamp-2 text-fg-muted" title={r.candidate_requirements}>
              {r.candidate_requirements}
            </span>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
      {
        key: 'application_deadline',
        skeleton: 'w-20',
        header: t('staff.deadline'),
        className: 'w-[120px] tabular-nums',
        sortValue: (r) => r.application_deadline ?? '',
        cell: (r) => {
          if (!r.application_deadline) return <span className="text-fg-subtle">—</span>
          // A deadline already gone is the thing a recruiter needs to spot.
          const past = dayjs(r.application_deadline).isBefore(dayjs(), 'day')
          return (
            <span className={past ? 'font-medium text-danger' : 'text-fg-muted'}>
              {dayjs(r.application_deadline).format('DD.MM.YYYY')}
            </span>
          )
        },
      },
      {
        key: 'contact',
        skeleton: 'w-32',
        header: t('staff.contactPerson'),
        className: 'w-[180px]',
        cell: (r) =>
          r.contact_person || r.contact_phone || r.contact_email ? (
            <div className="flex flex-col text-[12px] leading-tight">
              {r.contact_person && <span className="text-fg">{r.contact_person}</span>}
              {r.contact_phone && <span className="text-fg-muted">{r.contact_phone}</span>}
              {r.contact_email && <span className="truncate text-fg-muted">{r.contact_email}</span>}
            </div>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
      {
        key: 'state',
        skeleton: 'w-16',
        header: t('dictionaries.colStatus'),
        className: 'w-[120px]',
        cell: (r) =>
          !r.has_staff_row ? (
            <span className="inline-flex rounded-pill bg-warning/[0.13] px-2.5 py-1 text-[11px] font-semibold text-warning">
              {t('staff.noStaffRow')}
            </span>
          ) : r.is_closed ? (
            <span className="inline-flex rounded-pill bg-fg/[0.06] px-2.5 py-1 text-[11px] font-semibold text-fg-subtle">
              {t('staff.closedState')}
            </span>
          ) : (
            <span className="inline-flex rounded-pill bg-success/[0.12] px-2.5 py-1 text-[11px] font-semibold text-success">
              {t('staff.openState')}
            </span>
          ),
      },
    ]

    if (!manage) return base
    return [
      ...base,
      {
        key: 'actions',
        skeleton: 'w-16',
        header: '',
        className: 'w-[92px]',
        cell: (r) => (
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditRow(r)
                setModalOpen(true)
              }}
              aria-label={t('common.edit')}
              title={t('common.edit')}
              className="grid h-icon-xs w-icon-xs place-items-center rounded-tag bg-fg/[0.06] text-fg-muted transition-colors hover:bg-fg/[0.12] hover:text-fg"
            >
              <Pencil size={13} />
            </button>
            {r.id != null && (
              <button
                type="button"
                onClick={() => setCloseTarget(r)}
                aria-label={r.is_closed ? t('staff.reopen') : t('staff.close')}
                title={r.is_closed ? t('staff.reopen') : t('staff.close')}
                className="grid h-icon-xs w-icon-xs place-items-center rounded-tag bg-fg/[0.06] text-fg-muted transition-colors hover:bg-fg/[0.12] hover:text-fg"
              >
                {r.is_closed ? <LockOpen size={13} /> : <Lock size={13} />}
              </button>
            )}
          </div>
        ),
      },
    ]
  }, [manage, t])

  // A virtual row (employees but no approved line) has no id — the table keys
  // on one, so synthesise a stable local key from the pair it represents.
  const tableRows = useMemo(
    () =>
      rows.map((r, i) => ({
        ...r,
        id: r.id ?? -(r.department_id * 10000 + r.job_position_id + i),
      })) as (StaffPosition & { id: number })[],
    [rows],
  )

  return (
    <PageContainer className="flex min-h-full flex-col">
      <ImportWizard entity="staff_positions" open={importing} onClose={() => setImporting(false)} onDone={() => {
        refetch()
        // The summary tiles and the issues panel are separate queries.
        void queryClient.invalidateQueries({ queryKey: ['staff-positions'] })
      }} />
      <PageHeader
        title={t('nav.staffPositions')}
        subtitle={t('staff.subtitle')}
        actions={
          /* Eight equal buttons became two menus and the primary action
             (redesign 2026-09-24). Each item keeps its own server gate. */
          <>
            <ActionMenu
              label={t('staff.download')}
              icon={<Download size={14} />}
              items={[
                { key: 'excel', label: 'Excel', icon: <Download size={14} />, loading: exporting === 'excel', onClick: () => doExport('excel') },
                { key: 'pdf', label: 'PDF', icon: <FileText size={14} />, loading: exporting === 'pdf', onClick: () => doExport('pdf') },
                // `/export-xml` is require_structure_manager (HR / master): the
                // portal feed carries salaries and contacts.
                ...(manage ? [{ key: 'xml', label: 'XML', hint: t('staff.xmlHint'), icon: <FileCode2 size={14} />, loading: exporting === 'xml', onClick: () => doExport('xml') }] : []),
                {
                  key: 'cols',
                  label: `${t('staff.exportColumns')}${exportCols.length > 0 ? ` (${exportCols.length})` : ''}`,
                  hint: t('staff.exportColumnsHint'),
                  icon: <Columns3 size={14} />,
                  divider: true,
                  onClick: () => setColsOpen(true),
                },
              ]}
            />
            {manage && (
              <ActionMenu
                label={t('staff.more')}
                icon={<MoreHorizontal size={14} />}
                width={300}
                items={[
                  { key: 'import', label: t('import.button'), icon: <Upload size={14} />, onClick: () => setImporting(true) },
                  ...(bulkDepartments.length > 0 ? [{ key: 'bulk', label: t('staff.bulkEdit'), hint: t('staff.bulkEditHint'), icon: <ListChecks size={14} />, onClick: () => setBulkDept(bulkDepartments[0]) }] : []),
                  { key: 'notify', label: t('staff.notifyTitle'), hint: t('staff.notifyHint'), icon: <BellRing size={14} />, onClick: () => setNotifyOpen(true) },
                ]}
              />
            )}
            {manage && (
              <Button
                size="sm"
                onClick={() => {
                  setEditRow(null)
                  setModalOpen(true)
                }}
                leftIcon={<Plus size={15} />}
              >
                {t('staff.newRow')}
              </Button>
            )}
          </>
        }
      />

      {/* ── The establishment at a glance ────────────────────────────── */}
      {/* Rendered before the numbers arrive as well: the strip appearing
          later pushed the whole table down by its height (CLS 0.05). */}
      {!summaryFailed && (
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t('staff.planned')} value={summary ? fmtUnits(summary.planned_units) : '…'} />
        <Stat label={t('staff.occupied')} value={summary ? fmtUnits(summary.occupied_units) : '…'} tone="brand" />
        {/* Negative vacancy = more people than approved places — a problem, not good news. */}
        <Stat
          label={t('staff.vacant')}
          value={summary ? fmtUnits(summary.vacant_units) : '…'}
          tone={summary && Number(summary.vacant_units) < 0 ? 'danger' : 'success'}
          hint={summary && Number(summary.vacant_units) < 0 ? t('staff.overstaffed') : undefined}
        />
        <Stat label={t('staff.rows')} value={summary ? String(summary.rows) : '…'} />
      </div>
      )}

      <Card className="flex min-h-[520px] flex-col">
        {/* Tabs */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-4 py-3">
          {/* «Muammolar» reads /staff-positions/issues, which is gated by
              require_structure_manager (HR / master) — a deputy or ministr
              got the tab and a «Ruxsat yo'q» panel behind it. */}
          {(manage ? (['shtat', 'vakansiya', 'muammo'] as Tab[]) : (['shtat', 'vakansiya'] as Tab[])).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilters({ tab: k === 'shtat' ? null : k, page: null })}
              aria-pressed={tab === k}
              className={tabPill(tab === k)}
            >
              {t(`staff.tab_${k}` as never)}
              {k === 'muammo' && issues.total > 0 ? ` (${issues.total})` : ''}
            </button>
          ))}
        </div>

        {tab === 'muammo' ? (
          <div className="scroll-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {issues.loading ? (
              <p className="text-sm text-fg-subtle">{t('common.loading')}</p>
            ) : issues.denied ? (
              <EmptyState
                icon={<Lock size={20} />}
                title={t('staff.denied')}
                description={t('staff.deniedHint')}
              />
            ) : issues.groups.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle size={20} />}
                title={t('staff.noIssues')}
                description={t('staff.noIssuesHint')}
              />
            ) : (
              issues.groups.map((g) => (
                <div key={g.code} className="rounded-inner border border-line bg-surface-2/40 p-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h3 className="text-[14px] font-bold text-fg">
                      {label(`staff.issue_${g.code}`, g.code)}
                    </h3>
                    <span className="rounded-pill bg-warning/[0.13] px-2 py-0.5 text-[11px] font-semibold text-warning">
                      {g.total}
                    </span>
                  </div>
                  {label(`staff.issueHint_${g.code}`, '') && (
                    <p className="mt-1 text-xs text-fg-muted">
                      {label(`staff.issueHint_${g.code}`, '')}
                    </p>
                  )}
                  {g.rows.length > 0 && (
                    <ul className="mt-2.5 flex flex-wrap gap-1.5">
                      {g.rows.slice(0, 40).map((r, i) => (
                        <li
                          key={`${g.code}-${r.id ?? i}`}
                          className="rounded-tag bg-fg/[0.06] px-2 py-1 text-[12px] text-fg-muted"
                          title={r.detail ?? undefined}
                        >
                          {r.name ?? '—'}
                          {r.count ? ` · ${r.count}` : ''}
                        </li>
                      ))}
                      {g.rows.length > 40 && (
                        <li className="px-2 py-1 text-[12px] text-fg-subtle">
                          +{g.rows.length - 40}
                        </li>
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
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t('staff.searchPlaceholder')}
                className="w-full max-w-[260px]"
              />
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
                options={STAFF_CATEGORIES.map((c) => ({
                  value: c,
                  label: t(`staff.cat_${c}` as never),
                }))}
                placeholder={t('staff.allCategories')}
                aria-label={t('staff.category')}
                wrapperClassName="w-[170px]"
              />
              <Checkbox
                checked={includeClosed}
                onChange={(e) => setFilter('closed', e.target.checked ? '1' : '')}
                label={t('staff.includeClosed')}
              />
              <FilterReset count={filterCount} onReset={resetFilters} />
            </div>

            {denied ? (
              <EmptyState
                icon={<Lock size={20} />}
                title={t('staff.denied')}
                description={t('staff.deniedHint')}
              />
            ) : (
              <>
                <DataTable
        tableId="staff-positions"
                  rows={tableRows}
                  columns={columns}
                  onRowClick={manage ? (r) => { setEditRow(r); setModalOpen(true) } : undefined}
                  loading={loading}
          error={error}
          onRetry={refetch}
                  emptyTitle={tab === 'vakansiya' ? t('staff.noVacancies') : t('staff.empty')}
                  emptyDescription={t('staff.emptyHint')}
                  minWidth={1080}
                  density="compact"
                  filtered={filterCount > 0}
                  sort={sort}
                  onSort={(next) => setFilters({ sort: SORT_COLUMNS[next.key] ? next.key : null, dir: next.dir })}
                />
                <Pagination
                  page={page}
                  size={size}
                  total={total}
                  pages={pages}
                  onPage={setPage}
                  onSize={setSize}
                  loading={loading}
                />
              </>
            )}
          </>
        )}
      </Card>

      <StaffPositionModal open={modalOpen} onClose={() => setModalOpen(false)} row={editRow} />
      <ExportColumnsModal
        open={colsOpen}
        onClose={() => setColsOpen(false)}
        selected={exportCols}
        onApply={setExportCols}
      />
      <BulkStaffModal
        open={!!bulkDept}
        onClose={() => setBulkDept(null)}
        departmentName={bulkDept ?? ''}
        rows={bulkRows}
      />
      <VacancyNotifyModal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        branchId={branchId}
        canManage={manage}
      />

      <ConfirmDialog
        open={!!closeTarget}
        onClose={() => setCloseTarget(null)}
        onConfirm={toggleClosed}
        title={closeTarget?.is_closed ? t('staff.reopenTitle') : t('staff.closeTitle')}
        description={
          closeTarget?.is_closed ? t('staff.reopenConfirm') : t('staff.closeConfirm')
        }
        danger={!closeTarget?.is_closed}
        loading={close.isPending || reopen.isPending}
        confirmLabel={closeTarget?.is_closed ? t('staff.reopen') : t('staff.close')}
      />
    </PageContainer>
  )
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string
  value: string
  tone?: 'brand' | 'success' | 'danger'
  hint?: string
}) {
  return (
    <Card className="px-4 py-3">
      <p className="text-[11.5px] text-fg-subtle">{label}{hint && <span className="ml-1.5 font-semibold text-danger">· {hint}</span>}</p>
      <p
        className={cn(
          'tabnum mt-0.5 text-[26px] font-bold leading-none',
          tone === 'brand' ? 'text-brand-strong' : tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-fg',
        )}
      >
        {value}
      </p>
    </Card>
  )
}
