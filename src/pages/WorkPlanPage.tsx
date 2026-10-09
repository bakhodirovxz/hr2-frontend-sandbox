import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pagination } from '@/components/data/Pagination'
import { Avatar } from '@/components/ui/Avatar'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleDashed,
  ListChecks,
  Loader,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { BulkBar } from '@/components/data/BulkBar'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useListParams } from '@/hooks/useListParams'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useIndicators } from '@/features/kpi/useKpiAdmin'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { useStructure } from '@/features/structure/useStructure'
import { useBranchStore } from '@/store/branchStore'
import { useAuthStore } from '@/store/authStore'
import { canManageStructure } from '@/auth/canManage'
import * as roles from '@/auth/roles'
import { cn } from '@/lib/cn'
import {
  useWorkPlanMeta,
  useWorkPlanMutations,
  useWorkPlanSummary,
  useWorkPlans,
  type WorkPlan,
} from '@/features/workplan/useWorkPlan'
import { isInvalidRange } from '@/lib/dateRange'
import { formatRange } from '@/lib/format'
import { filterTile } from '@/components/ui/control'

/** Status tone by meaning, not by position — the list comes from the server. */
const TONE: Record<string, BadgeTone> = {
  planned: 'neutral',
  in_progress: 'warning',
  done: 'success',
  cancelled: 'danger',
}
const CLOSED = new Set(['done', 'cancelled'])


/**
 * Ish rejasi — periodic plans for an employee or a department, optionally tied
 * to a KPI indicator. Writing is a manager's act (`_require_manager` on the
 * server), so the buttons follow the same gate the backend uses.
 *
 * Redesign 2026-09-24: status tiles are the status filter (and count what the
 * other filters leave), «Muddati o‘tgan» is a status of its own because it is
 * the question a manager opens this page with, rows show time left, and the
 * list takes bulk status changes and deletes — each behind a confirmation.
 */
const FILTER_KEYS = ['status', 'emp', 'dept', 'from', 'to'] as const

export function WorkPlanPage() {
  const { t } = useTranslation()
  const { search, setSearch, filters, setFilter, activeFilterCount, reset, page, setPage, size, setSize } = useListParams(FILTER_KEYS)
  const currentUser = useAuthStore((s) => s.user)
  /**
   * `POST/PATCH/DELETE /work-plans` is `require_roles(admin, master-admin, hr,
   * ministr, deputy)`, but this used `canManageStructure`, which stops at
   * admin/master-admin/HR. The Work Plan page IS in ministr's and deputy's menu
   * (and in v1's DEPUTY_NAV, where the button carries no gate at all), so both
   * of them opened a page whose only action was invisible. Verified live:
   * `POST /work-plans` answers 422 for deputy and ministr, i.e. the gate lets
   * them through.
   */
  const canWrite =
    canManageStructure(currentUser) || roles.isMinister(currentUser) || roles.isDeputy(currentUser)
  const { statuses, periods } = useWorkPlanMeta()
  const statusLabel = (v: string) => statuses.find((s) => s.value === v)?.label ?? v
  const periodLabel = (v: string) => periods.find((p) => p.value === v)?.label ?? v
  const branchIdForFilters = useBranchStore((st) => st.selectedBranchId)
  const { options: employeeOptions } = useEmployeeOptions(branchIdForFilters, true)
  const { departments } = useStructure('', 1, 200)
  const departmentOptions = useMemo(
    () => departments.map((d) => ({ value: String(d.id), label: d.name ?? String(d.id) })),
    [departments],
  )
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to
  // Everything narrows on the SERVER — status (incl. «overdue»), person,
  // department, dates, search — and the list is paged there; the tiles come
  // from `/work-plans/summary` with the same filters.
  const narrow = {
    employeeId: filters.emp ?? undefined,
    departmentId: filters.dept ?? undefined,
    dateFrom: filters.from ?? undefined,
    dateTo: filters.to ?? undefined,
    search,
  }
  const today = dayjs().format('YYYY-MM-DD')
  const status = filters.status || ''
  const { rows, total, pages, loading, fetching, error, refetch } = useWorkPlans({ ...narrow, status: status || undefined, page, size })
  const summary = useWorkPlanSummary(narrow)
  const counts: Record<string, number> = { ...summary, '': summary.all ?? 0 }
  const mut = useMutationsWithBulk()
  const foldedCount = [filters.emp, filters.dept, filters.from, filters.to].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)

  // Ustun sarlavhalari `sortValue` e'lon qilardi-yu, `sort`/`onSort`
  // berilmagani uchun saralash O'LIK edi — sarlavhalar bosilmasdi ham.
  const [sort, setSort] = useState<SortState | null>(null)
  const [editing, setEditing] = useState<WorkPlan | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<WorkPlan | null>(null)
  const [closing, setClosing] = useState<WorkPlan | null>(null)
  const [bulkDelete, setBulkDelete] = useState(false)
  const [bulkStatus, setBulkStatus] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null)
  const selection = useRowSelection(rows, { resetKey: JSON.stringify([filters, search]) })

  const doDelete = async () => {
    if (!deleting) return
    const r = deleting
    setDeleting(null)
    await mut.remove.mutateAsync(r.id)
    mut.invalidate()
    setNotice({ kind: 'ok', text: t('workPlan.deleted') })
  }
  const doClose = async () => {
    if (!closing) return
    const r = closing
    setClosing(null)
    await mut.update.mutateAsync({ id: r.id, body: { status: 'done' } })
    mut.invalidate()
    setNotice({ kind: 'ok', text: t('workPlan.markedDone') })
  }
  const runBulk = async (fn: (id: number) => Promise<unknown>, okText: string) => {
    const ids = selection.selectedIds
    const failed = await mut.bulk.run(ids, fn)
    mut.invalidate()
    if (failed.length) setNotice({ kind: 'warn', text: t('list.bulkPartialFail', { count: failed.length }) })
    else {
      setNotice({ kind: 'ok', text: okText })
      selection.clear()
    }
  }

  const columns: Column<WorkPlan>[] = [
    {
      key: 'title',
      header: t('workPlan.colTitle'),
      sortValue: (r) => r.title ?? '',
      cell: (r) => (
        <div className="min-w-0 max-w-[22rem]">
          <p className="truncate font-semibold text-fg">{r.title || '—'}</p>
          {(r.kpi_indicator_name || r.description) && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-fg-subtle">
              {r.kpi_indicator_name && <Target size={12} className="shrink-0 text-brand" />}
              <span className="truncate">{r.kpi_indicator_name || r.description}</span>
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'target',
      header: t('workPlan.colEmployee'),
      sortValue: (r) => r.employee_name || r.department_name || '',
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          {r.employee_name ? (
            <Avatar src={r.employee_photo_thumb_path} fallbackSrc={r.employee_photo_path} name={r.employee_name} size={28} />
          ) : (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-info/10 text-info">
              <Building2 size={14} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-fg">{r.employee_name || r.department_name || '—'}</span>
            {r.employee_name && r.department_name && <span className="block truncate text-[11.5px] text-fg-subtle">{r.department_name}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'dates',
      header: t('workPlan.colDates'),
      sortValue: (r) => r.end_date ?? '',
      cell: (r) => <DueCell plan={r} today={today} />,
    },
    { key: 'period', header: t('workPlan.colPeriod'), cell: (r) => <span className="text-fg-muted">{(r.period_type && periodLabel(r.period_type)) || r.period_label || '—'}</span> },
    {
      key: 'planned_result',
      header: t('workPlan.colResult'),
      cell: (r) => <span className="line-clamp-2 max-w-[16rem] text-fg-muted">{r.planned_result || '—'}</span>,
    },
    { key: 'weight', header: t('workPlan.colWeight'), sortValue: (r) => r.weight ?? 0, cell: (r) => <span className="tabular-nums">{r.weight ?? '—'}</span> },
    {
      key: 'status',
      header: t('workPlan.colStatus'),
      sortValue: (r) => r.status ?? '',
      cell: (r) => <Badge tone={TONE[r.status ?? ''] ?? 'neutral'}>{(r.status && statusLabel(r.status)) || r.status_label || '—'}</Badge>,
    },
    ...(canWrite
      ? [{
          key: 'actions',
          header: '',
          cell: (r: WorkPlan) => (
            <div className="flex justify-end gap-1">
              {!CLOSED.has(r.status ?? '') && (
                <IconButton size="sm" label={t('workPlan.markDone')} onClick={() => setClosing(r)}>
                  <CheckCircle2 size={15} className="text-success" />
                </IconButton>
              )}
              <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}><Pencil size={15} /></IconButton>
              <IconButton size="sm" label={t('common.delete')} onClick={() => setDeleting(r)}><Trash2 size={15} className="text-danger" /></IconButton>
            </div>
          ),
        } as Column<WorkPlan>]
      : []),
  ]

  const tiles: [string, string, ReactNode, string][] = [
    ['', t('workPlan.filterAll'), <ListChecks key="i" size={17} />, 'from-[#8B5CF6] to-[#6D28D9]'],
    ['planned', statusLabel('planned'), <CircleDashed key="i" size={17} />, 'from-[#94A3B8] to-[#64748B]'],
    ['in_progress', statusLabel('in_progress'), <Loader key="i" size={17} />, 'from-[#FCD34D] to-[#F59E0B]'],
    ['done', statusLabel('done'), <CheckCircle2 key="i" size={17} />, 'from-[#34D399] to-[#059669]'],
    ['overdue', t('workPlan.overdue'), <AlertTriangle key="i" size={17} />, 'from-[#FB7185] to-[#E11D48]'],
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('workPlan.title')}
        subtitle={t('workPlan.subtitle')}
        actions={canWrite ? <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>{t('workPlan.create')}</Button> : undefined}
      />

      {notice && (
        <div
          role="status"
          className={cn(
            'mb-4 rounded-lg border px-3 py-2 text-sm',
            notice.kind === 'ok' ? 'border-success/30 bg-success-soft text-success' : 'border-warning/30 bg-warning-soft text-warning',
          )}
        >
          {notice.text}
        </div>
      )}

      {/* Status at a glance — each count is the filter. */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([k, label, icon, tone]) => {
          const on = status === k
          return (
            <button
              key={k || 'all'}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter('status', k)}
              className={filterTile(on, 'hover:-translate-y-0.5')}
            >
              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br text-white', tone)}>{icon}</span>
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-fg-muted">{label}</span>
                <span className={cn('block text-[20px] font-extrabold leading-tight tabular-nums', k === 'overdue' && counts.overdue > 0 ? 'text-danger' : 'text-fg')}>
                  {loading ? '…' : counts[k] ?? 0}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Search stays out; person, department and dates fold away. */}
      <div className="mb-4 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[14rem] max-w-md flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder={t('workPlan.searchPlaceholder')} />
          </div>
          <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>
        {filtersOpen && (
          <div className="grid grid-cols-1 gap-2 rounded-card border border-line bg-surface p-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* v1's Work Plan page filtered by employee, department and date
                range; the endpoint accepted all three all along. */}
            <Combobox value={filters.emp || ''} onChange={(v) => setFilter('emp', v)} options={employeeOptions} placeholder={t('workPlan.allEmployees')} />
            <Combobox value={filters.dept || ''} onChange={(v) => setFilter('dept', v)} options={departmentOptions} placeholder={t('workPlan.allDepartments')} />
            <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} invalid={rangeInvalid} aria-label={t('orders.dateFrom')} />
            <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} invalid={rangeInvalid} aria-label={t('orders.dateTo')} />
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}</div>
      ) : rows.length === 0 && !error ? (
        <Card className="p-6">
          <EmptyState
            icon={<CalendarCheck size={22} />}
            title={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('workPlan.empty')}
            description={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('workPlan.emptyHint')}
            action={activeFilterCount > 0 ? <FilterReset count={activeFilterCount} onReset={reset} /> : canWrite ? <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setCreating(true)}>{t('workPlan.create')}</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <DataTable
            tableId="work-plan"
            rows={rows}
            columns={columns}
            emptyTitle={t('workPlan.empty')}
            loading={loading}
            error={error}
            onRetry={refetch}
            sort={sort}
            onSort={setSort}
            onRowClick={canWrite ? (r) => setEditing(r) : undefined}
            selection={canWrite ? selection : undefined}
          />
          <Pagination page={page} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} loading={fetching} />
        </Card>
      )}

      {canWrite && (
        <BulkBar count={selection.count} onClear={selection.clear} progress={mut.bulk.progress}>
          <ActionMenu
            label={t('workPlan.bulkStatus')}
            items={statuses.map((s) => ({ key: s.value, label: s.label, onClick: () => setBulkStatus(s.value) }))}
          />
          <Button size="sm" variant="danger" leftIcon={<Trash2 size={14} />} onClick={() => setBulkDelete(true)}>
            {t('common.delete')}
          </Button>
        </BulkBar>
      )}

      <ConfirmDialog open={!!deleting} onClose={() => setDeleting(null)} onConfirm={doDelete} danger title={t('workPlan.deleteTitle')} description={t('workPlan.deleteConfirm')} confirmLabel={t('common.delete')} />
      <ConfirmDialog
        open={!!closing}
        onClose={() => setClosing(null)}
        onConfirm={doClose}
        title={t('workPlan.markDoneTitle')}
        description={closing?.title ?? ''}
        confirmLabel={t('workPlan.markDone')}
      />
      <ConfirmDialog
        open={bulkDelete}
        onClose={() => setBulkDelete(false)}
        onConfirm={() => { setBulkDelete(false); runBulk((id) => mut.remove.mutateAsync(id), t('workPlan.bulkDeleted', { count: selection.count })) }}
        danger
        title={t('workPlan.deleteTitle')}
        description={t('workPlan.bulkDeleteConfirm', { count: selection.count })}
        confirmLabel={t('common.delete')}
      />
      <ConfirmDialog
        open={!!bulkStatus}
        onClose={() => setBulkStatus(null)}
        onConfirm={() => {
          const v = bulkStatus!
          setBulkStatus(null)
          runBulk((id) => mut.update.mutateAsync({ id, body: { status: v } }), t('workPlan.bulkStatusDone', { count: selection.count, status: statusLabel(v) }))
        }}
        title={t('workPlan.bulkStatus')}
        description={t('workPlan.bulkStatusConfirm', { count: selection.count, status: statusLabel(bulkStatus ?? '') })}
        confirmLabel={t('common.confirm')}
      />

      <PlanModal
        open={creating || !!editing}
        plan={editing}
        loading={mut.create.isPending || mut.update.isPending}
        onClose={() => { setCreating(false); setEditing(null) }}
        onSubmit={async (body) => {
          if (editing) await mut.update.mutateAsync({ id: editing.id, body })
          else await mut.create.mutateAsync(body)
          mut.invalidate()
          setCreating(false); setEditing(null)
          setNotice({ kind: 'ok', text: t('common.saved') })
        }}
      />
    </PageContainer>
  )
}

function useMutationsWithBulk() {
  const m = useWorkPlanMutations()
  const bulk = useBulkAction()
  return { ...m, bulk }
}

/** The window plus what it means today: days left, due today, or days late. */
function DueCell({ plan, today }: { plan: WorkPlan; today: string }) {
  const { t } = useTranslation()
  const closed = CLOSED.has(plan.status ?? '')
  const diff = plan.end_date ? dayjs(plan.end_date).diff(dayjs(today), 'day') : null
  return (
    <span className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap tabular-nums text-fg">{formatRange(plan.start_date, plan.end_date)}</span>
      {!closed && diff != null && (
        <span className={cn('text-[11.5px] font-semibold', diff < 0 ? 'text-danger' : diff <= 3 ? 'text-warning' : 'text-fg-subtle')}>
          {diff < 0 ? t('ijro.daysLate', { count: -diff }) : diff === 0 ? t('ijro.dueToday') : t('ijro.daysLeft', { count: diff })}
        </span>
      )}
    </span>
  )
}

function PlanModal({ open, plan, loading, onClose, onSubmit }: {
  open: boolean
  plan: WorkPlan | null
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { periods, statuses } = useWorkPlanMeta()
  const { options: employees, loading: loadingEmps } = useEmployeeOptions(branchId, open)
  const departments = useDepartmentOptions()
  // The modal is mounted with the page (closed), and KPI is branch-bound
  // (`/me` kpi_enabled; the whole /kpi router answers 403 elsewhere). Asking
  // for indicators on page open put «KPI moduli … yoqilmagan» in the journal
  // for every branch HR who merely opened «Ish rejasi» (sweep 2026-10-05).
  const kpiOn = useAuthStore((s) => s.user?.kpi_enabled) !== false
  const { indicators } = useIndicators({}, open && kpiOn)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [period, setPeriod] = useState('month')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [plannedResult, setPlannedResult] = useState('')
  /** ⚠️ ISH REJASINING BUTUN MAZMUNI. `work_plans.kpi_indicator_id` bir
   *  rejani KPI ko'rsatkichiga bog'laydi — modul aynan shuning uchun bor.
   *  v2 uni na formada so'rardi, na yuborardi; ro'yxat esa
   *  `kpi_indicator_name` ni ustunda ko'rsatardi, ya'ni u doim bo'sh edi. */
  const [kpiIndicatorId, setKpiIndicatorId] = useState('')
  const [weight, setWeight] = useState('')
  const [status, setStatus] = useState('planned')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(plan?.title ?? '')
    setDescription(plan?.description ?? '')
    setEmployeeId(plan?.employee_id ? String(plan.employee_id) : '')
    setDepartmentId(plan?.department_id ? String(plan.department_id) : '')
    setPeriod(plan?.period_type ?? 'month')
    setStart(plan?.start_date ?? '')
    setEnd(plan?.end_date ?? '')
    setPlannedResult(plan?.planned_result ?? '')
    setKpiIndicatorId(plan?.kpi_indicator_id ? String(plan.kpi_indicator_id) : '')
    setWeight(plan?.weight != null ? String(plan.weight) : '')
    setStatus(plan?.status ?? 'planned')
    setError('')
  }, [open, plan])

  const submit = () => {
    if (!title.trim()) return setError(t('workPlan.titleRequired'))
    if (!start || !end) return setError(t('workPlan.datesRequired'))
    if (isInvalidRange(start, end)) return setError(t('list.invalidRange'))
    // The server accepts either target, but a plan addressed to nobody would
    // never appear in anyone's list.
    if (!employeeId && !departmentId) return setError(t('workPlan.targetRequired'))
    onSubmit({
      title: title.trim(),
      description: description.trim() || null,
      employee_id: employeeId ? Number(employeeId) : null,
      department_id: departmentId ? Number(departmentId) : null,
      organization_branch_id: branchId || null,
      period_type: period,
      start_date: start,
      end_date: end,
      planned_result: plannedResult.trim() || null,
      kpi_indicator_id: kpiIndicatorId ? Number(kpiIndicatorId) : null,
      weight: weight.trim() === '' ? null : Number(weight),
      status,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? t('workPlan.editTitle') : t('workPlan.create')}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={loading} onClick={submit}>{t('common.save')}</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('workPlan.colTitle')} required wide>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('workPlan.colEmployee')}>
          <Combobox value={employeeId} onChange={setEmployeeId} options={employees} loading={loadingEmps} placeholder={t('common.choose')} />
        </Field>
        <Field label={t('workPlan.colDepartment')}>
          <Combobox value={departmentId} onChange={setDepartmentId} options={departments} placeholder={t('common.choose')} />
        </Field>
        <Field label={t('workPlan.fieldPeriod')}>
          <Combobox value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p.value, label: p.label }))} clearable={false} />
        </Field>
        <Field label={t('workPlan.fieldStatus')}>
          <Combobox value={status} onChange={setStatus} options={statuses.map((s) => ({ value: s.value, label: s.label }))} clearable={false} />
        </Field>
        <Field label={t('workPlan.fieldStart')} required>
          <DateInput value={start} onChange={setStart} invalid={isInvalidRange(start, end)} />
        </Field>
        <Field label={t('workPlan.fieldEnd')} required>
          <DateInput value={end} onChange={setEnd} min={start || undefined} invalid={isInvalidRange(start, end)} />
        </Field>
        <Field label={t('workPlan.colResult')}>
          <Input value={plannedResult} onChange={(e) => setPlannedResult(e.target.value)} />
        </Field>
        <Field label={t('workPlan.colWeight')}>
          <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        {/* Without KPI there is nothing to link to; an existing link is kept
            as is (the id stays in state and is sent back unchanged). */}
        {kpiOn && (
          <Field label={t('workPlan.kpiIndicator')} hint={t('workPlan.kpiIndicatorHint')} wide>
            <Combobox
              value={kpiIndicatorId}
              onChange={setKpiIndicatorId}
              options={indicators.map((i) => ({ value: String(i.id), label: i.name ?? `#${i.id}` }))}
              placeholder={t('workPlan.kpiIndicatorNone')}
            />
          </Field>
        )}
        <Field label={t('workPlan.fieldDescription')} wide>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  )
}
