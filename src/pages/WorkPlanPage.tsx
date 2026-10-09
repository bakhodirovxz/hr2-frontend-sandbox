import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { CalendarDays, CheckCircle2, CircleDashed, List, ListChecks, Loader, Pencil, Plus, Target, Trash2, XCircle } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { filterTile } from '@/components/ui/control'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import { useBranchStore } from '@/store/branchStore'
import { useAuthStore } from '@/store/authStore'
import { canWrite as canWriteModule } from '@/auth/permissions'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { isInvalidRange } from '@/lib/dateRange'
import { formatRange } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  indicatorApplies,
  priorityOf,
  usePlanEmployee,
  usePlanIndicators,
  useWorkPlanCalendar,
  useWorkPlanMeta,
  useWorkPlanMutations,
  useWorkPlans,
  type OverlapTask,
  type Priority,
  type WorkPlan,
} from '@/features/workplan/useWorkPlan'
import {
  CALENDAR_SCALES,
  PriorityChip,
  WorkPlanCalendar,
  calendarRange,
  isoDate,
  parseDate,
  type CalendarScale,
} from '@/features/workplan/WorkPlanCalendar'

const TONE: Record<string, BadgeTone> = { planned: 'neutral', in_progress: 'warning', done: 'success', cancelled: 'danger' }
const STATUS_ICON: Record<string, ReactNode> = {
  planned: <CircleDashed size={17} />,
  in_progress: <Loader size={17} />,
  done: <CheckCircle2 size={17} />,
  cancelled: <XCircle size={17} />,
}
const dmy = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '—')
/** The longest window a period type allows — the server checks the same (422). */
const MAX_DAYS: Record<string, number> = { month: 31, quarter: 92, year: 366 }

const FILTER_KEYS = ['view', 'scale', 'at', 'emp', 'dept', 'priority', 'status', 'from', 'to'] as const
const NARROWING = ['emp', 'dept', 'priority', 'status', 'from', 'to'] as const

/**
 * Ish rejasi — TZ K2 «Планирование работ». Tasks of an employee or a
 * department for a period, tied to a KPI indicator (KPI collects the FACT,
 * this is the PLAN). A list and a calendar (month / quarter / year); overlapping
 * dates of one employee are reported by the server (409 `work_plan_overlap`)
 * and may be saved anyway on purpose.
 */
export function WorkPlanPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const canWrite = canWriteModule(user, 'work_plans')
  const { filters, setFilter, setFilters, page, setPage, size, setSize } = useListParams(FILTER_KEYS)
  const { statuses, priorities } = useWorkPlanMeta()
  const statusLabel = (v: string) => statuses.find((s) => s.value === v)?.label ?? v
  const branchId = useBranchStore((s) => s.selectedBranchId)

  // The list opens on the current month (as v1 did); clearing a date shows every period.
  // `ready` holds the list query back until that default is in the URL.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    setReady(true)
    if (!filters.from && !filters.to && !new URLSearchParams(window.location.search).has('from')) {
      setFilters({ from: dayjs().startOf('month').format('YYYY-MM-DD'), to: dayjs().endOf('month').format('YYYY-MM-DD') })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const view = filters.view === 'calendar' ? 'calendar' : 'list'
  const scale: CalendarScale = CALENDAR_SCALES.includes(filters.scale as CalendarScale) ? (filters.scale as CalendarScale) : 'month'
  const anchor = useMemo(() => parseDate(filters.at) ?? new Date(), [filters.at])
  const range = useMemo(() => calendarRange(scale, anchor), [scale, anchor])
  const status = filters.status || ''
  const narrow = { employeeId: filters.emp, departmentId: filters.dept, priority: filters.priority }

  const list = useWorkPlans({ ...narrow, dateFrom: filters.from, dateTo: filters.to }, ready && view === 'list')
  const cal = useWorkPlanCalendar({ ...narrow, status }, isoDate(range.from), isoDate(range.to), view === 'calendar')

  // `/work-plans` is not paged: the status counts are taken from the same
  // answer, and the status filter narrows it here.
  const counts = useMemo(() => {
    const c: Record<string, number> = { '': list.rows.length }
    for (const r of list.rows) c[r.status ?? ''] = (c[r.status ?? ''] ?? 0) + 1
    return c
  }, [list.rows])
  const shown = useMemo(() => (status ? list.rows.filter((r) => r.status === status) : list.rows), [list.rows, status])
  const totalWeight = shown.reduce((a, r) => a + (r.weight ?? 0), 0)
  const [sort, setSort] = useState<SortState | null>(null)
  const pages = Math.max(1, Math.ceil(shown.length / size))

  const departments = useDepartmentOptions(branchId)
  const [empQuery, setEmpQuery] = useState('')
  const empSearch = useEmployeeSearch(branchId, true, empQuery)

  const [editing, setEditing] = useState<WorkPlan | 'new' | null>(null)
  const [deleting, setDeleting] = useState<WorkPlan | null>(null)
  const mut = useWorkPlanMutations()

  // The date range belongs to the list; the calendar has its own period.
  const narrowCount = NARROWING.filter((k) => filters[k] && (view === 'list' || (k !== 'from' && k !== 'to'))).length
  const resetFilters = () =>
    setFilters(Object.fromEntries(NARROWING.filter((k) => view === 'list' || (k !== 'from' && k !== 'to')).map((k) => [k, null])))
  const rangeInvalid = isInvalidRange(filters.from, filters.to)

  const columns: Column<WorkPlan>[] = [
    {
      key: 'title',
      header: t('workPlan.colTitle'),
      sortValue: (r) => r.title ?? '',
      cell: (r) => (
        <div className="min-w-0 max-w-[22rem]">
          <p className="truncate font-semibold text-fg">{r.title || '—'}</p>
          {r.description && <p className="mt-0.5 line-clamp-2 text-[12px] text-fg-subtle">{r.description}</p>}
        </div>
      ),
    },
    {
      key: 'target',
      header: t('workPlan.colFor'),
      sortValue: (r) => r.employee_name || r.department_name || '',
      cell: (r) => <span className="text-fg">{r.employee_name || r.department_name || '—'}</span>,
    },
    {
      key: 'kpi',
      header: t('workPlan.kpiIndicator'),
      cell: (r) =>
        r.kpi_indicator_name ? (
          <span className="flex max-w-[16rem] items-start gap-1.5 text-fg-muted">
            <Target size={12} className="mt-[3px] shrink-0 text-brand" />
            <span className="line-clamp-2">{r.kpi_indicator_name}</span>
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        ),
    },
    {
      key: 'dates',
      header: t('workPlan.colDates'),
      sortValue: (r) => r.start_date ?? '',
      cell: (r) => (
        <span className="flex flex-col">
          <span className="whitespace-nowrap tabular-nums text-fg">{formatRange(r.start_date, r.end_date)}</span>
          <span className="text-[11.5px] text-fg-subtle">{r.period_type ? t(`workPlan.period_${r.period_type}` as never, { defaultValue: r.period_label ?? '' }) : ''}</span>
        </span>
      ),
    },
    { key: 'result', header: t('workPlan.colResult'), cell: (r) => <span className="line-clamp-2 max-w-[14rem] text-fg-muted">{r.planned_result || '—'}</span> },
    { key: 'weight', header: t('workPlan.colWeight'), sortValue: (r) => r.weight ?? 0, cell: (r) => <span className="tabular-nums">{r.weight ?? '—'}</span> },
    { key: 'priority', header: t('workPlan.colPriority'), sortValue: (r) => ['low', 'medium', 'high'].indexOf(priorityOf(r)), cell: (r) => <PriorityChip value={priorityOf(r)} /> },
    {
      key: 'status',
      header: t('workPlan.colStatus'),
      sortValue: (r) => r.status ?? '',
      cell: (r) => <Badge tone={TONE[r.status ?? ''] ?? 'neutral'}>{r.status ? statusLabel(r.status) : '—'}</Badge>,
    },
    ...(canWrite
      ? [
          {
            key: 'actions',
            header: '',
            cell: (r: WorkPlan) => (
              <div className="flex justify-end gap-1">
                <IconButton size="sm" label={t('common.edit')} onClick={(e) => { e.stopPropagation(); setEditing(r) }}>
                  <Pencil size={15} />
                </IconButton>
                <IconButton size="sm" label={t('common.delete')} onClick={(e) => { e.stopPropagation(); setDeleting(r) }}>
                  <Trash2 size={15} className="text-danger" />
                </IconButton>
              </div>
            ),
          } as Column<WorkPlan>,
        ]
      : []),
  ]

  // Paged on the client, so the WHOLE list is sorted before it is cut.
  const sortCol = sort ? columns.find((c) => c.key === sort.key) : undefined
  const sorted = sortCol?.sortValue
    ? [...shown].sort((a, b) => {
        const x = sortCol.sortValue!(a) ?? ''
        const y = sortCol.sortValue!(b) ?? ''
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
        return sort!.dir === 'asc' ? c : -c
      })
    : shown
  const pageRows = sorted.slice((page - 1) * size, page * size)

  const tiles: [string, string, ReactNode][] = [
    ['', t('workPlan.filterAll'), <ListChecks key="i" size={17} />],
    ...statuses.map((s) => [s.value, s.label, STATUS_ICON[s.value] ?? <CircleDashed size={17} />] as [string, string, ReactNode]),
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('workPlan.title')}
        subtitle={t('workPlan.subtitle')}
        actions={canWrite ? <Button leftIcon={<Plus size={16} />} onClick={() => setEditing('new')}>{t('workPlan.create')}</Button> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={view}
          onChange={(v) => setFilter('view', v === 'list' ? '' : v)}
          options={[
            { value: 'list', label: t('workPlan.viewList'), icon: <List size={14} /> },
            { value: 'calendar', label: t('workPlan.viewCalendar'), icon: <CalendarDays size={14} /> },
          ]}
        />
        {view === 'list' && (
          <>
            <div className="w-40">
              <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} invalid={rangeInvalid} aria-label={t('workPlan.fieldStart')} />
            </div>
            <div className="w-40">
              <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} invalid={rangeInvalid} aria-label={t('workPlan.fieldEnd')} />
            </div>
          </>
        )}
        <Combobox
          value={filters.dept}
          onChange={(v) => setFilter('dept', v)}
          options={departments}
          placeholder={t('workPlan.allDepartments')}
          className="w-full sm:w-60"
        />
        <Combobox
          value={filters.emp}
          onChange={(v) => setFilter('emp', v)}
          options={empSearch.options}
          onSearchChange={setEmpQuery}
          loading={empSearch.loading}
          hasMore={empSearch.hasMore}
          onLoadMore={empSearch.loadMore}
          placeholder={t('workPlan.allEmployees')}
          className="w-full sm:w-64"
        />
        <Combobox
          value={filters.priority}
          onChange={(v) => setFilter('priority', v)}
          options={priorities}
          placeholder={t('workPlan.allPriorities')}
          className="w-full sm:w-48"
        />
        {view === 'calendar' && (
          <Combobox
            value={status}
            onChange={(v) => setFilter('status', v)}
            options={statuses}
            placeholder={t('workPlan.filterAll')}
            className="w-full sm:w-48"
          />
        )}
        <FilterReset count={narrowCount} onReset={resetFilters} />
      </div>
      {rangeInvalid && view === 'list' && <p role="alert" className="-mt-2 mb-3 text-xs text-danger">{t('list.invalidRange')}</p>}

      {view === 'calendar' ? (
        <WorkPlanCalendar
          items={cal.rows}
          scale={scale}
          anchor={anchor}
          onScale={(s) => setFilter('scale', s === 'month' ? '' : s)}
          onAnchor={(d) => setFilter('at', isoDate(d))}
          onOpen={(r) => setEditing(r)}
          loading={cal.loading}
          statusLabel={statusLabel}
        />
      ) : (
        <>
          {/* Status at a glance — each count is the status filter. */}
          <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map(([k, label, icon]) => (
              <button key={k || 'all'} type="button" aria-pressed={status === k} onClick={() => setFilter('status', k)} className={filterTile(status === k)}>
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px]', k === 'done' ? 'bg-success-soft text-success' : k === 'cancelled' ? 'bg-danger-soft text-danger' : k === 'in_progress' ? 'bg-warning-soft text-warning' : 'bg-brand-soft text-brand-strong')}>
                  {icon}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-fg-muted">{label}</span>
                  <span className="block text-[20px] font-extrabold leading-tight tabular-nums text-fg">{list.loading ? '…' : counts[k] ?? 0}</span>
                </span>
              </button>
            ))}
          </div>

          <Card className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center justify-end gap-3 border-b border-line px-4 py-2 text-[12.5px] text-fg-muted">
              <span>{t('workPlan.totals', { count: shown.length, weight: totalWeight.toFixed(1) })}</span>
            </div>
            <DataTable
              tableId="work-plan"
              rows={pageRows}
              columns={columns}
              loading={list.loading}
              error={list.error}
              onRetry={list.refetch}
              emptyTitle={narrowCount ? t('list.noResultsFiltered') : t('workPlan.empty')}
              emptyDescription={narrowCount ? t('list.noResultsFilteredHint') : canWrite ? t('workPlan.emptyHint') : undefined}
              sort={sort}
              onSort={setSort}
              onRowClick={(r) => setEditing(r)}
            />
            <Pagination page={page} pages={pages} total={shown.length} size={size} onPage={setPage} onSize={setSize} loading={list.fetching} />
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        danger
        title={t('workPlan.deleteTitle')}
        description={deleting ? `«${deleting.title ?? ''}» — ${t('workPlan.deleteConfirm')}` : ''}
        confirmLabel={t('common.delete')}
        loading={mut.remove.isPending}
        onConfirm={async () => {
          if (!deleting) return
          try {
            await mut.remove.mutateAsync(deleting.id)
            toast.ok(t('workPlan.deleted'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setDeleting(null)
          }
        }}
      />

      <PlanModal
        value={editing}
        readOnly={!canWrite}
        defaults={{ start: filters.from, end: filters.to }}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null)
          toast.ok(t('common.saved'))
        }}
      />
    </PageContainer>
  )
}

interface PlanForm {
  title: string
  description: string
  employee_id: string
  department_id: string
  period_type: string
  start_date: string
  end_date: string
  kpi_indicator_id: string
  planned_result: string
  weight: string
  status: string
  priority: Priority
}

function PlanModal({
  value,
  readOnly,
  defaults,
  onClose,
  onSaved,
}: {
  value: WorkPlan | 'new' | null
  readOnly: boolean
  defaults: { start?: string; end?: string }
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const open = !!value
  const row = value && value !== 'new' ? value : null
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const kpiOn = !!useAuthStore((s) => s.user?.kpi_enabled)
  const { periods, statuses, priorities } = useWorkPlanMeta()
  const departments = useDepartmentOptions(branchId)
  const [empQuery, setEmpQuery] = useState('')
  const empSearch = useEmployeeSearch(branchId, open && !row, empQuery)
  const mut = useWorkPlanMutations()

  const [f, setF] = useState<PlanForm>(() => blank(defaults))
  const [error, setError] = useState('')
  const [overlap, setOverlap] = useState<OverlapTask[] | null>(null)

  useEffect(() => {
    if (!open) return
    setError('')
    setOverlap(null)
    setEmpQuery('')
    setF(
      row
        ? {
            title: row.title ?? '',
            description: row.description ?? '',
            employee_id: row.employee_id ? String(row.employee_id) : '',
            department_id: row.department_id ? String(row.department_id) : '',
            period_type: row.period_type ?? 'month',
            start_date: row.start_date ?? '',
            end_date: row.end_date ?? '',
            kpi_indicator_id: row.kpi_indicator_id ? String(row.kpi_indicator_id) : '',
            planned_result: row.planned_result ?? '',
            weight: row.weight != null ? String(row.weight) : '',
            status: row.status ?? 'planned',
            priority: priorityOf(row),
          }
        : blank(defaults),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row])

  const set = <K extends keyof PlanForm>(k: K, v: PlanForm[K]) => setF((p) => ({ ...p, [k]: v }))

  // TZ K2: the indicator list holds only what is assigned to the chosen
  // employee (or department) — the server's `assignee_matches` rule.
  const indicators = usePlanIndicators(open && kpiOn)
  const planEmp = usePlanEmployee(f.employee_id ? Number(f.employee_id) : null, open && kpiOn)
  const indicatorOptions = useMemo(() => {
    const deptId = f.department_id ? Number(f.department_id) : null
    const emp = f.employee_id ? planEmp : null
    return indicators
      .filter((i) => i.is_active !== false && (indicatorApplies(i, emp, deptId) || String(i.id) === f.kpi_indicator_id))
      .map((i) => ({ value: String(i.id), label: i.name, subLabel: i.measure ?? undefined }))
  }, [indicators, planEmp, f.employee_id, f.department_id, f.kpi_indicator_id])

  const save = async (allowOverlap: boolean) => {
    setError('')
    if (!f.title.trim()) return setError(t('workPlan.titleRequired'))
    if (!row && !f.employee_id && !f.department_id) return setError(t('workPlan.targetRequired'))
    if (!f.start_date || !f.end_date) return setError(t('workPlan.datesRequired'))
    if (isInvalidRange(f.start_date, f.end_date)) return setError(t('list.invalidRange'))
    if (f.weight.trim() !== '') {
      const w = Number(f.weight)
      if (!Number.isFinite(w) || w < 0 || w > 100) return setError(t('workPlan.weightRange'))
    }
    const max = MAX_DAYS[f.period_type]
    if (max) {
      const span = dayjs(f.end_date).diff(dayjs(f.start_date), 'day') + 1
      if (span > max) return setError(t('workPlan.periodTooLong', { n: max, span }))
    }
    const body: Record<string, unknown> = {
      title: f.title.trim(),
      description: f.description.trim() || null,
      period_type: f.period_type,
      start_date: f.start_date,
      end_date: f.end_date,
      kpi_indicator_id: f.kpi_indicator_id ? Number(f.kpi_indicator_id) : null,
      planned_result: f.planned_result.trim() || null,
      weight: f.weight.trim() === '' ? null : Number(f.weight),
      status: f.status,
      priority: f.priority,
      ...(allowOverlap ? { allow_overlap: true } : {}),
    }
    setOverlap(null)
    try {
      if (row) await mut.update.mutateAsync({ id: row.id, body })
      else
        await mut.create.mutateAsync({
          ...body,
          employee_id: f.employee_id ? Number(f.employee_id) : null,
          department_id: f.department_id ? Number(f.department_id) : null,
          organization_branch_id: branchId || null,
        })
      onSaved()
    } catch (e) {
      // TZ K2 · 1375: the employee's other tasks in the same window — listed,
      // and «Baribir saqlash» resends with `allow_overlap`.
      if (errorCode(e) === 'work_plan_overlap') {
        const tasks = errorParams(e).tasks
        setOverlap(Array.isArray(tasks) ? (tasks as OverlapTask[]) : [])
        return
      }
      const fields = errorParams(e).fields
      const fieldMsg = fields && typeof fields === 'object' && !Array.isArray(fields) ? Object.values(fields as Record<string, unknown>).map(String).join('; ') : ''
      setError(fieldMsg || errorMessage(e, t('common.actionFailed')))
    }
  }

  const saving = mut.create.isPending || mut.update.isPending
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={readOnly ? t('workPlan.viewTitle') : row ? t('workPlan.editTitle') : t('workPlan.createTitle')}
      size="lg"
      footer={
        <div className="flex w-full flex-col gap-2.5">
          {/* Kept in the footer so a save error or the overlap list is never scrolled out of view. */}
          <FormError className="text-xs">{error}</FormError>
          {overlap && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2.5">
              <p className="text-[12.5px] font-semibold text-warning">{t('workPlan.overlapTitle')}</p>
              {overlap.length > 0 ? (
                <ul className="flex flex-col gap-1 text-[12px] text-fg">
                  {overlap.map((o, i) => (
                    <li key={o.id ?? i} className="flex flex-wrap gap-x-2">
                      <span className="font-medium">«{o.title || `#${o.id}`}»</span>
                      <span className="tabular-nums text-fg-muted">{[o.start_date, o.end_date].filter(Boolean).map(dmy).join(' — ')}</span>
                      {o.status && <span className="text-fg-subtle">· {t(`workPlan.status_${o.status}` as never, { defaultValue: o.status })}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-[12px] text-fg-muted">{t('workPlan.overlapNoList')}</span>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOverlap(null)}>{t('workPlan.overlapFix')}</Button>
                <Button size="sm" variant="secondary" loading={saving} onClick={() => save(true)}>{t('workPlan.overlapSaveAnyway')}</Button>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
            {!readOnly && !overlap && <Button loading={saving} onClick={() => save(false)}>{t('common.save')}</Button>}
          </div>
        </div>
      }
    >
      <fieldset disabled={readOnly} className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label={t('workPlan.colTitle')} required wide>
          <Input value={f.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label={t('workPlan.fieldDescription')} wide>
          <Textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        {row ? (
          <Field label={t('workPlan.colFor')} wide>
            <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-fg">{row.employee_name || row.department_name || '—'}</p>
          </Field>
        ) : (
          <>
            {/* The plan belongs to an employee OR a department — picking one clears the other. */}
            <Field label={t('workPlan.colEmployee')}>
              <Combobox
                value={f.employee_id}
                onChange={(v) => setF((p) => ({ ...p, employee_id: v, department_id: v ? '' : p.department_id }))}
                options={empSearch.options}
                onSearchChange={setEmpQuery}
                loading={empSearch.loading}
                hasMore={empSearch.hasMore}
                onLoadMore={empSearch.loadMore}
                placeholder={t('common.choose')}
              />
            </Field>
            <Field label={t('workPlan.orDepartment')}>
              <Combobox
                value={f.department_id}
                onChange={(v) => setF((p) => ({ ...p, department_id: v, employee_id: v ? '' : p.employee_id }))}
                options={departments}
                placeholder={t('common.choose')}
              />
            </Field>
          </>
        )}
        <Field label={t('workPlan.fieldPeriod')}>
          <Combobox value={f.period_type} onChange={(v) => v && set('period_type', v)} options={periods} clearable={false} />
        </Field>
        <Field label={t('workPlan.colPriority')}>
          <Combobox value={f.priority} onChange={(v) => v && set('priority', v as Priority)} options={priorities} clearable={false} />
        </Field>
        <Field label={t('workPlan.fieldStart')} required>
          <DateInput value={f.start_date} onChange={(v) => set('start_date', v)} invalid={isInvalidRange(f.start_date, f.end_date)} />
        </Field>
        <Field label={t('workPlan.fieldEnd')} required>
          <DateInput value={f.end_date} onChange={(v) => set('end_date', v)} min={f.start_date || undefined} invalid={isInvalidRange(f.start_date, f.end_date)} />
        </Field>
        {/* No KPI module here (`/me` kpi_enabled) — nothing to link to; an existing link is sent back unchanged. */}
        {kpiOn && (
          <Field label={t('workPlan.kpiIndicator')} hint={t('workPlan.kpiIndicatorHint')} wide>
            <Combobox value={f.kpi_indicator_id} onChange={(v) => set('kpi_indicator_id', v)} options={indicatorOptions} placeholder={t('workPlan.kpiIndicatorNone')} />
          </Field>
        )}
        <Field label={t('workPlan.colResult')}>
          <Input value={f.planned_result} onChange={(e) => set('planned_result', e.target.value)} placeholder={t('workPlan.resultPlaceholder')} />
        </Field>
        <Field label={t('workPlan.colWeight')}>
          <Input type="number" min={0} max={100} value={f.weight} onChange={(e) => set('weight', e.target.value)} />
        </Field>
        <Field label={t('workPlan.fieldStatus')} wide>
          <Combobox value={f.status} onChange={(v) => v && set('status', v)} options={statuses} clearable={false} />
        </Field>
      </fieldset>
    </Modal>
  )
}

function blank(d: { start?: string; end?: string }): PlanForm {
  return {
    title: '',
    description: '',
    employee_id: '',
    department_id: '',
    period_type: 'month',
    start_date: d.start || dayjs().startOf('month').format('YYYY-MM-DD'),
    end_date: d.end || dayjs().endOf('month').format('YYYY-MM-DD'),
    kpi_indicator_id: '',
    planned_result: '',
    weight: '',
    status: 'planned',
    priority: 'medium',
  }
}
