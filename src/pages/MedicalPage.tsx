import { useEffect, useMemo, useRef, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlertTriangle, Check, CheckCircle2, Clock, Download, HeartPulse, Paperclip, Pencil, Stethoscope, Trash2, Users, X } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { RequireRole } from '@/components/layout/RequireRole'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { BulkBar } from '@/components/data/BulkBar'
import { useConfirm } from '@/components/data/useConfirm'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useListParams } from '@/hooks/useListParams'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useFilterReset } from '@/hooks/useFilterReset'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useBranches } from '@/hooks/useBranches'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { Segmented } from '@/components/ui/Segmented'
import { formatAppDate, formatDateTime } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { Avatar } from '@/components/ui/Avatar'
import { IconButton } from '@/components/ui/IconButton'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { cn } from '@/lib/cn'
import type { Employee } from '@/types'
import {
  useDoctors,
  useMedicalAdminMutations,
  useMedicalDetail,
  useMedicalEmployees,
  medicalExportParams,
  useMedicalMutations,
  useSpecialties,
  type Checkup,
  type Doctor,
  type MedicalRow,
} from '@/features/medical/useMedical'
import { filterTile } from '@/components/ui/control'

/**
 * Sog'liq ko'rigi — the periodic checkup register.
 *
 * Row status comes from the server (`passed` / `due_soon` / `overdue`): the
 * cycle length and the "due soon" window live in `models.medical`, and
 * recomputing them here would let the two drift apart on a screen people use to
 * decide who must be sent to the clinic.
 */
const STATUS_TONE: Record<string, BadgeTone> = { passed: 'success', due_soon: 'warning', overdue: 'danger' }
const INDEX_TONE: Record<string, BadgeTone> = { excellent: 'success', good: 'info', poor: 'danger' }

const MEDICAL_FILTERS = ['status', 'index', 'branch', 'dept', 'pos', 'year'] as const

function MedicalPageInner() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const lp = useListParams(['status', 'index', 'branch', 'dept', 'pos', 'year', 'tab'])
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter } = lp
  // `tab` is a view switch, not a filter — it must survive "clear filters".
  const { count: activeFilterCount, reset } = useFilterReset(lp, MEDICAL_FILTERS)

  /**
   * The narrowing the SCREEN is under — one object, used for the table and for
   * the export alike. They used to be written out separately and had drifted:
   * the list sent nine parameters, the export sent two (`search`, `status`), so
   * a sheet exported from a page filtered by branch, department, position,
   * health index or year came out with everybody in it.
   */
  const medicalFilters = {
    search: search,
    status: filters.status,
    // The branch is a FILTER on this register, never a fence — see the hook.
    branchId: filters.branch,
    departmentId: filters.dept,
    jobPositionId: filters.pos,
    healthIndex: filters.index,
    year: filters.year,
  }
  // Ustun sarlavhalari `sortValue` e'lon qilardi-yu, `sort`/`onSort`
  // berilmagani uchun saralash O'LIK edi — sarlavhalar bosilmasdi ham.
  // The order now goes to the SERVER (`sort_by`/`sort_dir`): the table only
  // holds one page, so sorting it locally reordered 50 of 2 363 rows.
  const [sort, setSort] = useState<SortState | null>(null)
  const serverSortable = new Set(['legal_name', 'last_checkup_date', 'checkup_count'])
  const { rows, total, pages, loading, fetching, error: fetchingError, refetch: fetchingRefetch, loadAllIds } = useMedicalEmployees({
    page, size, ...medicalFilters,
    sortBy: sort && serverSortable.has(sort.key) ? sort.key : undefined,
    sortDir: sort?.dir,
  })
  // Counts for the status tiles: the same narrowing, one row each (the list
  // is paged on the server, so counting the page would lie).
  const countArgs = { page: 1, size: 1, ...medicalFilters }
  const countAll = useMedicalEmployees({ ...countArgs, status: '' }).total
  const countPassed = useMedicalEmployees({ ...countArgs, status: 'passed' }).total
  const countSoon = useMedicalEmployees({ ...countArgs, status: 'due_soon' }).total
  const countOverdue = useMedicalEmployees({ ...countArgs, status: 'overdue' }).total
  const foldedCount = [filters.branch, filters.dept, filters.pos, filters.index, filters.year].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)
  const [openEmployee, setOpenEmployee] = useState<MedicalRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const mut = useMedicalMutations()
  // Selection survives paging; «select all N» loads every id of the filter.
  const selection = useRowSelection(rows as (MedicalRow & { id: number })[], {
    total,
    loadAllIds,
    resetKey: JSON.stringify(medicalFilters),
  })
  /** Bir xil ko'rikni N xodimga yozish — DOKTORNING amali. Server `checkups/bulk`
   *  da ruxsati yo'q xodimlarni jimgina o'tkazib yuboradi va `failed` da
   *  qaytaradi, shu bois oyna natijani ko'rsatadi. */
  const canBulk = !!user?.medical_specialties?.length || !!user?.is_medical_manager
  const tab = filters.tab || 'employees'
  const canManageDoctors = !!user?.is_medical_manager
  const { branches } = useBranches()
  const branchOptions = useMemo(
    () => branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })),
    [branches],
  )
  const departmentOptions = useDepartmentOptions()
  const positionOptions = useJobPositionOptions()
  /** Five years back is as far as an annual index is ever looked up. */
  const yearOptions = useMemo(() => {
    const now = dayjs().year()
    return Array.from({ length: 5 }, (_, i) => ({ value: String(now - i), label: String(now - i) }))
  }, [])

  /**
   * The file carries what the screen is narrowed to — and, by the server's
   * deliberate choice, never the conclusion or recommendation text: an exported
   * sheet travels hand to hand, and medical confidentiality does not go with it.
   */
  const exportExcel = async () => {
    setExporting(true)
    try {
      await downloadFile({
        url: 'medical/export-excel',
        method: 'post',
        mime: XLSX_MIME,
        filename: `Tibbiy_korik_${dayjs().format('DD.MM.YYYY')}.xlsx`,
        params: medicalExportParams(medicalFilters),
      })
      toast.ok(t('medical.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('medical.exportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const columns: Column<MedicalRow>[] = [
    {
      key: 'legal_name',
      header: t('medical.colEmployee'),
      sortValue: (r) => r.legal_name ?? '',
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar src={r.photo_thumb_path} fallbackSrc={r.photo_path} name={r.legal_name ?? '?'} size={32} />
          <div className="min-w-0">
            <p className="truncate font-medium text-fg">{r.legal_name || '—'}</p>
            <p className="truncate text-[11.5px] text-fg-subtle">
              {[r.department_name, r.job_position_name].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>
      ),
    },
    // No `sortValue`: the server cannot order by branch, and a page-only sort would mislead.
    { key: 'branch_name', header: t('medical.colBranch'), cell: (r) => r.branch_name || '—' },
    {
      key: 'last_checkup_date',
      header: t('medical.colLast'),
      sortValue: (r) => r.last_checkup_date ?? '',
      cell: (r) => <span className="tabular-nums">{r.last_checkup_date ? formatAppDate(r.last_checkup_date) : '—'}</span>,
    },
    { key: 'checkup_count', header: t('medical.colCount'), sortValue: (r) => r.checkup_count, cell: (r) => <span className="tabular-nums">{r.checkup_count}</span> },
    {
      key: 'status',
      header: t('medical.colStatus'),
      cell: (r) =>
        r.status ? <Badge tone={STATUS_TONE[r.status] ?? 'neutral'} className="whitespace-nowrap">{t(`medical.status_${r.status}` as never)}</Badge> : '—',
    },
    {
      key: 'annual_index',
      header: t('medical.colIndex'),
      cell: (r) =>
        r.annual_index ? (
          <Badge tone={INDEX_TONE[r.annual_index] ?? 'neutral'} className="whitespace-nowrap">
            {t(`medical.index_${r.annual_index}` as never)}
            {r.annual_index_year ? ` · ${r.annual_index_year}` : ''}
          </Badge>
        ) : (
          '—'
        ),
    },
  ]

  if (user?.medical_enabled !== true) {
    return (
      <PageContainer>
        <PageHeader title={t('medical.title')} subtitle={t('medical.subtitle')} />
        <Card className="p-6">
          <EmptyState icon={<HeartPulse size={22} />} title={t('medical.noAccess')} description={t('medical.noAccessHint')} />
        </Card>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('medical.title')}
        subtitle={t('medical.subtitle')}
        actions={
          user?.medical_can_export ? (
            <Button variant="outline" size="sm" loading={exporting} leftIcon={<Download size={14} />} onClick={exportExcel}>
              Excel
            </Button>
          ) : undefined
        }
      />

      {notice && (
        <p role="status" className="mb-4 rounded-inner border border-success/30 bg-success-soft px-3 py-2 text-[12.5px] text-success">
          {notice}
        </p>
      )}

      {canManageDoctors && (
        <div className="mb-4">
          <Segmented
            value={tab}
            onChange={(v) => setFilter('tab', v === 'employees' ? '' : v)}
            options={[
              { value: 'employees', label: t('medical.tabEmployees') },
              { value: 'doctors', label: t('medical.tabDoctors') },
              { value: 'specialties', label: t('medical.tabSpecialties') },
            ]}
          />
        </div>
      )}

      {tab === 'doctors' && <DoctorsPanel />}
      {tab === 'specialties' && <SpecialtiesPanel />}

      {tab === 'employees' && (
        <>
      {/* The whole organisation goes through this clinic, so narrowing the list
          is how anyone finds their own people in it: branch, department,
          position, checkup status, health index and year. */}
      {/* Status at a glance — each count is the filter (redesign 2026-09-24). */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {([
          ['', t('medical.filterAll'), countAll, <Users key="i" size={17} />, 'from-[#8B5CF6] to-[#6D28D9]'],
          ['passed', t('medical.status_passed'), countPassed, <CheckCircle2 key="i" size={17} />, 'from-[#34D399] to-[#059669]'],
          ['due_soon', t('medical.status_due_soon'), countSoon, <Clock key="i" size={17} />, 'from-[#FCD34D] to-[#F59E0B]'],
          ['overdue', t('medical.status_overdue'), countOverdue, <AlertTriangle key="i" size={17} />, 'from-[#FB7185] to-[#E11D48]'],
        ] as const).map(([k, label, value, icon, tone]) => {
          const on = (filters.status || '') === k
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter('status', k)}
              className={filterTile(on, 'hover:-translate-y-0.5')}
            >
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br text-white', tone)}>{icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-fg-muted">{label}</span>
                <span className="block text-[20px] font-extrabold leading-tight tabular-nums text-fg">{value ?? '…'}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Search stays out; the five narrowing selects fold away (seven controls
          in one row squeezed the table). The badge says how many are on. */}
      <div className="mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] max-w-md flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder={t('medical.searchPlaceholder')} />
          </div>
          <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>
        {filtersOpen && (
          <div className="grid grid-cols-1 gap-2 rounded-card border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-5">
            <Combobox value={filters.branch || ''} onChange={(v) => setFilter('branch', v)} options={branchOptions} placeholder={t('medical.allBranches')} />
            <Combobox value={filters.dept || ''} onChange={(v) => setFilter('dept', v)} options={departmentOptions} placeholder={t('medical.allDepartments')} />
            <Combobox value={filters.pos || ''} onChange={(v) => setFilter('pos', v)} options={positionOptions} placeholder={t('medical.allPositions')} />
            <Combobox
              value={filters.index || ''}
              onChange={(v) => setFilter('index', v)}
              options={[
                { value: 'excellent', label: t('medical.index_excellent') },
                { value: 'good', label: t('medical.index_good') },
                { value: 'poor', label: t('medical.index_poor') },
              ]}
              placeholder={t('medical.allIndexes')}
            />
            <Combobox value={filters.year || ''} onChange={(v) => setFilter('year', v)} options={yearOptions} placeholder={t('medical.currentYear')} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : (
        <Card className="overflow-hidden p-0">
          <DataTable
        tableId="medical"
            rows={rows}
            columns={columns}
            filtered={activeFilterCount > 0}
            emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
            emptyTitle={t('medical.empty')}
            loading={fetching}
          error={fetchingError}
          onRetry={fetchingRefetch}
            onRowClick={(r) => setOpenEmployee(r)}
            sort={sort}
            onSort={setSort}
            selection={canBulk ? selection : undefined}
          />
          <Pagination page={page} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} />
        </Card>
      )}

      {canBulk && (
        <BulkBar count={selection.count} onClear={selection.clear} total={selection.total} onSelectAll={selection.selectAllMatching} selectingAll={selection.selectingAll}>
          <Button size="sm" leftIcon={<Stethoscope size={14} />} onClick={() => setBulkOpen(true)}>
            {t('medical.bulkCheckup')}
          </Button>
        </BulkBar>
      )}

      <BulkCheckupModal
        open={bulkOpen}
        employeeIds={selection.selectedIds}
        onClose={() => setBulkOpen(false)}
        onDone={(msg) => { setBulkOpen(false); selection.clear(); mut.invalidate(); setNotice(msg) }}
      />

        </>
      )}

      <EmployeeCard
        row={openEmployee}
        onClose={() => setOpenEmployee(null)}
        onError={(e) => toast.error(errorMessage(e, t('common.actionFailed')))}
      />
    </PageContainer>
  )
}

/** One employee's medical card: the checkup history plus the annual index. */
function EmployeeCard({ row, onClose, onError }: { row: MedicalRow | null; onClose: () => void; onError: (e: unknown) => void }) {
  const { t } = useTranslation()
  const { detail, loading, refetch } = useMedicalDetail(row?.id ?? null)
  const mut = useMedicalMutations()
  const [adding, setAdding] = useState(false)
  const [editingCheckup, setEditingCheckup] = useState<Checkup | null>(null)
  const [deletingCheckup, setDeletingCheckup] = useState<Checkup | null>(null)
  const [indexing, setIndexing] = useState(false)

  const checkups = useMemo(
    () => [...(detail?.checkups ?? [])].sort((a, b) => String(b.checkup_date ?? '').localeCompare(String(a.checkup_date ?? ''))),
    [detail],
  )

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      size="lg"
      title={
        row?.legal_name ? (
          <span className="flex min-w-0 items-center gap-2.5">
            <Avatar src={row.photo_thumb_path} fallbackSrc={row.photo_path} name={row.legal_name} size={30} />
            <span className="truncate">{row.legal_name}</span>
          </span>
        ) : (
          t('medical.card')
        )
      }
    >
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {row?.status && <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>{t(`medical.status_${row.status}` as never)}</Badge>}
            {row?.annual_index && (
              <Badge tone={INDEX_TONE[row.annual_index] ?? 'neutral'}>
                {t(`medical.index_${row.annual_index}` as never)}{row.annual_index_year ? ` · ${row.annual_index_year}` : ''}
              </Badge>
            )}
            <span className="ml-auto flex gap-2">
              {detail?.can_add_checkup && (
                <Button size="sm" leftIcon={<Stethoscope size={14} />} onClick={() => setAdding(true)}>{t('medical.addCheckup')}</Button>
              )}
              {detail?.can_set_annual_index && (
                <Button size="sm" variant="secondary" onClick={() => setIndexing(true)}>{t('medical.setIndex')}</Button>
              )}
            </span>
          </div>

          <section>
            <h4 className="mb-2 text-[13px] font-semibold text-fg">{t('medical.history')}</h4>
            {checkups.length === 0 ? (
              <EmptyState title={t('medical.noCheckups')} />
            ) : (
              <ul className="divide-y divide-line">
                {checkups.map((c) => (
                  <li key={c.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium tabular-nums text-fg">{c.checkup_date ? formatAppDate(c.checkup_date) : '—'}</span>
                      {c.specialty_name && <Badge tone="neutral">{c.specialty_name}</Badge>}
                      {c.doctor_name && <span className="text-[11.5px] text-fg-subtle">{c.doctor_name}</span>}
                      {/* Serverning O'Z bayroqlari — mijozda qayta chiqarilmaydi. */}
                      <span className="ml-auto flex shrink-0 gap-1">
                        {c.can_edit && (
                          <IconButton size="sm" label={t('common.edit')} onClick={() => setEditingCheckup(c)}>
                            <Pencil size={13} />
                          </IconButton>
                        )}
                        {c.can_delete && (
                          <IconButton size="sm" label={t('common.delete')} onClick={() => setDeletingCheckup(c)}>
                            <Trash2 size={13} className="text-danger" />
                          </IconButton>
                        )}
                      </span>
                    </div>
                    {c.conclusion && <p className="mt-1 text-[13px] text-fg-muted">{c.conclusion}</p>}
                    {c.recommendation && <p className="mt-0.5 text-[12.5px] text-fg-subtle">{c.recommendation}</p>}
                    <CheckupFiles
                      checkup={c}
                      isDoctor={!!detail?.can_add_checkup}
                      onChanged={async () => { mut.invalidate(); await refetch() }}
                      onError={onError}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(detail?.annual_indexes?.length ?? 0) > 0 && (
            <section>
              <h4 className="mb-2 text-[13px] font-semibold text-fg">{t('medical.annualIndexes')}</h4>
              <ul className="divide-y divide-line">
                {detail!.annual_indexes.map((a, i) => (
                  <li key={a.id ?? i} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="tabular-nums text-fg">{a.year ?? '—'}</span>
                    {a.health_index && <Badge tone={INDEX_TONE[a.health_index] ?? 'neutral'}>{t(`medical.index_${a.health_index}` as never)}</Badge>}
                    {a.index_note && <span className="text-[12.5px] text-fg-muted">{a.index_note}</span>}
                    {a.set_at && <span className="ml-auto text-[11.5px] text-fg-subtle">{formatDateTime(a.set_at)}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <CheckupModal
        open={adding || !!editingCheckup}
        employeeId={row?.id ?? null}
        checkup={editingCheckup}
        loading={mut.addCheckup.isPending || mut.updateCheckup.isPending}
        onClose={() => { setAdding(false); setEditingCheckup(null) }}
        onSaved={async () => { setAdding(false); setEditingCheckup(null); mut.invalidate(); await refetch() }}
        onError={onError}
      />
      <ConfirmDialog
        open={!!deletingCheckup}
        onClose={() => setDeletingCheckup(null)}
        onConfirm={async () => {
          const c = deletingCheckup
          setDeletingCheckup(null)
          if (!c) return
          try {
            await mut.removeCheckup.mutateAsync(c.id)
            mut.invalidate()
            await refetch()
          } catch (e) {
            onError(e)
          }
        }}
        danger
        title={t('medical.deleteCheckupTitle')}
        description={t('medical.deleteCheckupConfirm')}
        confirmLabel={t('common.delete')}
      />
      <AnnualIndexModal
        open={indexing}
        employeeId={row?.id ?? null}
        loading={mut.setAnnualIndex.isPending}
        onClose={() => setIndexing(false)}
        onSaved={async () => { setIndexing(false); mut.invalidate(); await refetch() }}
        onError={onError}
      />
    </Modal>
  )
}

/** Yaratish VA tahrirlash. `updateCheckup` v2 da yozilgan edi, hech kim
 *  chaqirmasdi — ya'ni doktor xato kiritilgan xulosani tuzata olmasdi. */
function CheckupModal({ open, employeeId, checkup, loading, onClose, onSaved, onError }: {
  open: boolean
  employeeId: number | null
  /** null = yangi yozuv. */
  checkup?: Checkup | null
  loading: boolean
  onClose: () => void
  onSaved: () => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const mut = useMedicalMutations()
  const mySpecialties = useAuthStore((s) => s.user?.medical_specialties) ?? []
  const { specialties } = useSpecialties(open && mySpecialties.length === 0)
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [conclusion, setConclusion] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')
  const [error, setError] = useState('')
  const isEdit = !!checkup?.id

  useEffect(() => {
    if (!open) return
    setError('')
    setDate(checkup?.checkup_date?.slice(0, 10) ?? dayjs().format('YYYY-MM-DD'))
    setConclusion(checkup?.conclusion ?? '')
    setRecommendation(checkup?.recommendation ?? '')
    setSpecialtyId(checkup?.specialty_id ? String(checkup.specialty_id) : '')
  }, [open, checkup])

  // A doctor with exactly one specialty never picks it — the server fills it in.
  const options = (mySpecialties.length ? mySpecialties : specialties).map((s) => ({ value: String(s.id), label: s.name ?? `#${s.id}` }))
  const needsPick = options.length > 1

  const submit = async () => {
    if (!employeeId && !isEdit) return
    if (!date) return setError(t('medical.dateRequired'))
    if (needsPick && !specialtyId) return setError(t('medical.specialtyRequired'))
    try {
      const body = {
        checkup_date: date,
        conclusion: conclusion.trim() || null,
        recommendation: recommendation.trim() || null,
        specialty_id: specialtyId ? Number(specialtyId) : null,
      }
      if (isEdit) await mut.updateCheckup.mutateAsync({ id: checkup!.id, body })
      else await mut.addCheckup.mutateAsync({ employee_id: employeeId, ...body })
      onSaved()
    } catch (e) {
      onError(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? t('medical.editCheckup') : t('medical.addCheckup')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={loading} onClick={submit}>{t('common.save')}</Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <Field label={t('medical.checkupDate')} required>
          <DateInput value={date} onChange={setDate} />
        </Field>
        {needsPick && (
          <Field label={t('medical.specialty')} required>
            <Combobox value={specialtyId} onChange={setSpecialtyId} options={options} placeholder={t('common.choose')} />
          </Field>
        )}
        <Field label={t('medical.conclusion')}>
          <Textarea rows={3} value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
        </Field>
        <Field label={t('medical.recommendation')}>
          <Textarea rows={3} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
        </Field>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}

function AnnualIndexModal({ open, employeeId, loading, onClose, onSaved, onError }: {
  open: boolean
  employeeId: number | null
  loading: boolean
  onClose: () => void
  onSaved: () => void
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const mut = useMedicalMutations()
  const [year, setYear] = useState(String(dayjs().year()))
  const [index, setIndex] = useState('good')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const submit = async () => {
    if (!employeeId) return
    if (!year.trim()) return setError(t('medical.yearRequired'))
    try {
      await mut.setAnnualIndex.mutateAsync({
        employee_id: employeeId,
        year: Number(year),
        health_index: index,
        index_note: note.trim() || null,
      })
      onSaved()
    } catch (e) {
      onError(e)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('medical.setIndex')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={loading} onClick={submit}>{t('common.save')}</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('medical.year')} required>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </Field>
        <Field label={t('medical.colIndex')} required>
          <Combobox
            value={index}
            onChange={setIndex}
            clearable={false}
            options={[
              { value: 'excellent', label: t('medical.index_excellent') },
              { value: 'good', label: t('medical.index_good') },
              { value: 'poor', label: t('medical.index_poor') },
            ]}
          />
        </Field>
        <Field label={t('medical.note')} wide>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <FormError className="sm:col-span-2">{error}</FormError>
      </div>
    </Modal>
  )
}

/**
 * ⚠️ The gate has to sit OUTSIDE the component, not in an early return inside
 * it: hooks run before any `return`, so an inner check still fired the register
 * query and collected 403s for an employee who may not open the module at all.
 */
export function MedicalPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  return (
    <RequireRole allowed={user?.medical_enabled === true} title={t('medical.title')}>
      <MedicalPageInner />
    </RequireRole>
  )
}

/**
 * WHO examines — the clinic's doctors and the specialties each covers.
 *
 * Deliberately here and not on the employee card: the `is_doctor` flag is in
 * the server's `_ADMIN_ONLY_EMPLOYEE_FIELDS` and is refused on
 * `PATCH /employees/{id}`, precisely so that appointing a doctor stays a
 * clinic-HR act rather than a checkbox any HR user can tick.
 */
function DoctorsPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const { doctors, loading } = useDoctors(true)
  const { specialties } = useSpecialties(true)
  const mut = useMedicalAdminMutations()
  const [picked, setPicked] = useState<Employee | null>(null)
  const [editing, setEditing] = useState<Doctor | null>(null)
  const [specIds, setSpecIds] = useState<number[]>([])
  const [removing, setRemoving] = useState<Doctor | null>(null)

  const openEditor = (d: Doctor) => {
    setEditing(d)
    setSpecIds((d.specialties ?? []).map((s) => s.id))
  }

  const save = async () => {
    const employeeId = editing?.employee_id ?? editing?.id
    if (!employeeId) return
    try {
      await mut.setDoctor.mutateAsync({ employeeId, body: { specialty_ids: specIds } })
      toast.ok(t('medical.doctorSaved'))
      setEditing(null)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-ui border-b border-line p-3">
        <div>
          <p className="text-[14px] font-semibold text-fg">{t('medical.tabDoctors')}</p>
          <p className="text-[12px] text-fg-subtle">{t('medical.doctorsHint')}</p>
        </div>
        <div className="ml-auto w-[18rem]">
          <EmployeePicker
            value={picked}
            allBranches
            onChange={(emp) => {
              setPicked(null)
              if (emp) openEditor({ employee_id: emp.id, legal_name: emp.legal_name, specialties: [] })
            }}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : doctors.length === 0 ? (
        <EmptyState icon={<Stethoscope size={20} />} title={t('medical.doctorsEmpty')} description={t('medical.doctorsEmptyHint')} />
      ) : (
        <ul className="divide-y divide-line/60">
          {doctors.map((d) => (
            <li key={d.employee_id ?? d.id} className="flex items-center gap-3 px-4 py-2.5">
              <Avatar name={d.legal_name ?? ''} src={d.photo_thumb_path ?? undefined} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{d.legal_name || '—'}</span>
                <span className="block truncate text-[11.5px] text-fg-subtle">
                  {(d.specialties ?? []).map((s) => s.name).filter(Boolean).join(', ') ||
                    [d.department_name, d.job_position_name].filter(Boolean).join(' · ') ||
                    '—'}
                </span>
              </span>
              <Button size="sm" variant="outline" onClick={() => openEditor(d)}>
                {t('common.edit')}
              </Button>
              <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(d)}>
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.legal_name ?? t('medical.addDoctor')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} loading={mut.setDoctor.isPending}>{t('common.save')}</Button>
          </>
        }
      >
        <Field label={t('medical.doctorSpecialties')}>
          <div className="flex flex-wrap gap-1.5">
            {specialties.map((sp) => {
              const on = specIds.includes(sp.id)
              return (
                <button
                  key={sp.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSpecIds((p) => (on ? p.filter((x) => x !== sp.id) : [...p, sp.id]))}
                  className={cn(
                    'h-control-sm rounded-pill border px-3 text-[12px] transition-colors',
                    on ? 'border-brand bg-brand text-fg-on-brand' : 'border-line text-fg-muted hover:text-fg',
                  )}
                >
                  {sp.name}
                </button>
              )
            })}
          </div>
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('medical.doctorRemoveTitle')}
        description={t('medical.doctorRemoveConfirm', { name: removing?.legal_name ?? '' })}
        loading={mut.removeDoctor.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const employeeId = removing?.employee_id ?? removing?.id
          if (!employeeId) return
          try {
            await mut.removeDoctor.mutateAsync(employeeId)
            toast.ok(t('medical.doctorRemoved'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </Card>
  )
}

/**
 * BIR XIL KO'RIK — N XODIMGA (`medical/checkups/bulk`).
 *
 * Hook v2 da yozilgan edi (`useMedical.ts` `bulkCheckup`), lekin uni hech kim
 * chaqirmasdi: davriy ko'rikdan o'tgan butun bo'limni birma-bir kiritish
 * kerak edi. Server ruxsati yo'q xodimlarni JIMGINA o'tkazib yuboradi va
 * `failed` ro'yxatida qaytaradi — shuning uchun natija ko'rsatiladi.
 */
function BulkCheckupModal({ open, employeeIds, onClose, onDone }: {
  open: boolean
  employeeIds: number[]
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useMedicalAdminMutations()
  const mySpecialties = useAuthStore((s) => s.user?.medical_specialties) ?? []
  const { specialties } = useSpecialties(open && mySpecialties.length === 0)
  const [date, setDate] = useState(dayjs().format('YYYY-MM-DD'))
  const [conclusion, setConclusion] = useState('')
  const [recommendation, setRecommendation] = useState('')
  const [specialtyId, setSpecialtyId] = useState('')

  useEffect(() => {
    if (!open) return
    setDate(dayjs().format('YYYY-MM-DD'))
    setConclusion('')
    setRecommendation('')
    setSpecialtyId('')
  }, [open])

  const options = (mySpecialties.length ? mySpecialties : specialties).map((sp) => ({
    value: String(sp.id),
    label: sp.name ?? `#${sp.id}`,
  }))
  const needsPick = options.length > 1

  const submit = async () => {
    try {
      const res = await mut.bulkCheckup.mutateAsync({
        employee_ids: employeeIds,
        checkup_date: date,
        conclusion: conclusion.trim() || null,
        recommendation: recommendation.trim() || null,
        specialty_id: specialtyId ? Number(specialtyId) : null,
      })
      const created = res?.created ?? employeeIds.length
      const failed = res?.failed?.length ?? 0
      onDone(
        failed > 0
          ? t('medical.bulkPartial', { created, failed })
          : t('medical.bulkDone', { count: created }),
      )
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('medical.bulkCheckup')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={mut.bulkCheckup.isPending}
            disabled={!date || employeeIds.length === 0 || (needsPick && !specialtyId)}
            onClick={submit}
          >
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3">
        <p className="text-[12.5px] text-fg-muted">
          {t('medical.bulkHint', { count: employeeIds.length })}
        </p>
        <Field label={t('medical.checkupDate')} required>
          <DateInput value={date} onChange={setDate} />
        </Field>
        {needsPick && (
          <Field label={t('medical.specialty')} required>
            <Combobox value={specialtyId} onChange={setSpecialtyId} options={options} placeholder={t('common.choose')} />
          </Field>
        )}
        <Field label={t('medical.conclusion')}>
          <Textarea rows={3} value={conclusion} onChange={(e) => setConclusion(e.target.value)} />
        </Field>
        <Field label={t('medical.recommendation')}>
          <Textarea rows={2} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/** The catalogue of examination types a doctor can be assigned to. */
function SpecialtiesPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { specialties, loading } = useSpecialties(true)
  const mut = useMedicalAdminMutations()
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState<{ id: number; name?: string | null } | null>(null)
  const [renaming, setRenaming] = useState<{ id: number; name?: string | null } | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const runSpecialty = async (p: Promise<unknown>) => {
    try {
      await p
      toast.ok(t('medical.specialtySaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const saveRename = async () => {
    if (!renaming || !renameValue.trim()) return
    const id = renaming.id
    setRenaming(null)
    await runSpecialty(mut.updateSpecialty.mutateAsync({ id, body: { name: renameValue.trim() } }))
  }

  const add = async () => {
    if (!name.trim()) return
    try {
      await mut.addSpecialty.mutateAsync({ name: name.trim() })
      setName('')
      toast.ok(t('medical.specialtySaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-end gap-ui border-b border-line p-3">
        <div>
          <p className="text-[14px] font-semibold text-fg">{t('medical.tabSpecialties')}</p>
          <p className="text-[12px] text-fg-subtle">{t('medical.specialtiesHint')}</p>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <div className="w-[16rem]">
            <Field label={t('medical.specialtyName')}>
              <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            </Field>
          </div>
          <Button size="sm" onClick={add} loading={mut.addSpecialty.isPending} disabled={!name.trim()}>
            {t('medical.specialtyAdd')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : specialties.length === 0 ? (
        <EmptyState icon={<Stethoscope size={20} />} title={t('medical.specialtiesEmpty')} description={t('medical.specialtiesEmptyHint')} />
      ) : (
        <ul className="divide-y divide-line/60">
          {specialties.map((sp) => (
            <li key={sp.id} className="flex items-center gap-3 px-4 py-2.5">
              {renaming?.id === sp.id ? (
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveRename() }}
                  className="h-8 flex-1"
                  autoFocus
                />
              ) : (
                <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{sp.name}</span>
              )}
              {/* «Faol» — turni o'chirmasdan iste'moldan chiqarish. v2 da
                  `updateSpecialty` yozilgan edi, hech kim chaqirmasdi: turni
                  faqat yaratish va butunlay o'chirish mumkin edi. */}
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirm({ kind: 'status', subject: sp.name }))) return
                  await runSpecialty(
                    mut.updateSpecialty.mutateAsync({ id: sp.id, body: { is_active: sp.is_active === false } }),
                  )
                }}
                title={t('medical.toggleActive')}
              >
                <Badge tone={sp.is_active === false ? 'neutral' : 'success'}>
                  {sp.is_active === false ? t('dictionaries.inactive') : t('medical.active')}
                </Badge>
              </button>
              {renaming?.id === sp.id ? (
                <>
                  <IconButton size="sm" label={t('common.save')} onClick={() => saveRename()}>
                    <Check size={14} />
                  </IconButton>
                  <IconButton size="sm" label={t('common.cancel')} onClick={() => setRenaming(null)}>
                    <X size={14} />
                  </IconButton>
                </>
              ) : (
                <IconButton
                  size="sm"
                  label={t('common.edit')}
                  onClick={() => { setRenameValue(sp.name ?? ''); setRenaming({ id: sp.id, name: sp.name }) }}
                >
                  <Pencil size={14} />
                </IconButton>
              )}
              <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving({ id: sp.id, name: sp.name })}>
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('medical.specialtyRemoveTitle')}
        description={t('medical.specialtyRemoveConfirm', { name: removing?.name ?? '' })}
        loading={mut.removeSpecialty.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await mut.removeSpecialty.mutateAsync(removing.id)
            toast.ok(t('medical.specialtyRemoved'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </Card>
  )
}

/**
 * The scans and lab results behind one checkup.
 *
 * Uploading and removing is the record author's right — the server computes it
 * as `can_edit` / `can_delete` and the UI just draws what it is told, rather
 * than re-deriving "am I the doctor" from the role.
 */
function CheckupFiles({
  checkup,
  isDoctor,
  onChanged,
  onError,
}: {
  checkup: Checkup
  /**
   * ⚠️ `can_edit` ALONE IS NOT THE GATE. Both file routes run
   * `_assert_doctor` BEFORE the author check, and `_can_edit_checkup` lets a
   * master-admin through — so a master-admin is told `can_edit: true` and then
   * gets 403 «Ko'rik yozuvini faqat doktor kiritadi» on upload (verified live
   * against TEST, checkup #362). The doctor half comes from the detail's own
   * `can_add_checkup`, which IS `scoping_is_doctor`.
   */
  isDoctor: boolean
  onChanged: () => void | Promise<void>
  onError: (e: unknown) => void
}) {
  const { t } = useTranslation()
  const mut = useMedicalMutations()
  const inputRef = useRef<HTMLInputElement>(null)
  const [removing, setRemoving] = useState<number | null>(null)
  const files = checkup.files ?? []

  const canAttach = isDoctor && !!checkup.can_edit
  const canDetach = isDoctor && !!checkup.can_delete

  if (files.length === 0 && !canAttach) return null

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {files.map((f) => (
        <span
          key={f.id}
          className="inline-flex max-w-full items-center gap-1 rounded-lg border border-line bg-surface-2 py-1 pl-2 pr-1 text-[11.5px]"
        >
          <Paperclip size={12} className="shrink-0 text-fg-subtle" />
          {f.file_url ? (
            <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="truncate text-brand hover:underline">
              {f.original_filename || `#${f.id}`}
            </a>
          ) : (
            <span className="truncate text-fg">{f.original_filename || `#${f.id}`}</span>
          )}
          {canDetach && (
            <button
              type="button"
              aria-label={t('common.delete')}
              className="grid h-5 w-5 shrink-0 place-items-center rounded text-danger hover:bg-danger/10"
              onClick={() => setRemoving(f.id)}
            >
              <X size={12} />
            </button>
          )}
        </span>
      ))}

      {canAttach && (
        <>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            aria-label={t('medical.addFile')}
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                await mut.addCheckupFile.mutateAsync({ id: checkup.id, file })
                await onChanged()
              } catch (err) {
                onError(err)
              } finally {
                if (inputRef.current) inputRef.current.value = ''
              }
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Paperclip size={13} />}
            loading={mut.addCheckupFile.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {t('medical.addFile')}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={removing != null}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const id = removing
          setRemoving(null)
          if (id == null) return
          try {
            await mut.removeCheckupFile.mutateAsync(id)
            await onChanged()
          } catch (err) {
            onError(err)
          }
        }}
        danger
        loading={mut.removeCheckupFile.isPending}
        title={t('medical.fileDeleteTitle')}
        description={t('medical.fileDeleteConfirm')}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
