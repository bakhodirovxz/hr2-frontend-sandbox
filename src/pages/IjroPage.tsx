import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Pagination } from '@/components/data/Pagination'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock,
  Gauge,
  Hourglass,
  List as ListIcon,
  Pencil,
  FileSpreadsheet,
  Plus,
  RotateCcw,
  Trash2,
  Users,
} from 'lucide-react'
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
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { BulkBar } from '@/components/data/BulkBar'
import { useListParams } from '@/hooks/useListParams'
import { useFilterReset } from '@/hooks/useFilterReset'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import { useBranchStore } from '@/store/branchStore'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { formatUzShort } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'
import { ImportWizard } from '@/features/import/ImportWizard'
import { useIjroMutations, useIjroSummary, useOverdueTasks, type OverdueTask } from '@/features/ijro/useIjro'
import { filterTile } from '@/components/ui/control'
import { Segmented } from '@/components/ui/Segmented'

/**
 * Ijro intizomi — assignments with a deadline, and whether they were met
 * (redesign 2026-09-24).
 *
 * The page answers two questions before any row is read: HOW is discipline
 * (the five counts and the on-time rate, each count a filter), and WHO is
 * behind (the «by executor» view: every person with their open, late and
 * late-closed tasks as one bar — ClickUp's workload idea applied to a register).
 * Rows speak in days — «3 kun qoldi», «5 kun kechikdi» — because that is the
 * figure a manager chases, and closing a task is one confirmed click on the row.
 */
type IjroStatus = 'done' | 'late_done' | 'late' | 'open'
const statusOf = (t: OverdueTask): IjroStatus => {
  const today = dayjs().format('YYYY-MM-DD')
  // A task finished AFTER its deadline is closed, not still overdue.
  if (t.task_completed) return t.task_completed > (t.deadline_date ?? '') ? 'late_done' : 'done'
  return (t.deadline_date ?? '') < today ? 'late' : 'open'
}
const STATUS_PILL: Record<IjroStatus, string> = {
  open: 'bg-info-soft text-info',
  late: 'bg-danger-soft text-danger',
  late_done: 'bg-warning-soft text-warning',
  done: 'bg-success-soft text-success',
}
// Bars and dots are filled shapes → bright signal hex (the text tokens are
// darkened for contrast and read brown/navy as fills).
const STATUS_BAR: Record<IjroStatus, string> = { open: 'bg-[#3E8BFF]', late: 'bg-[#E5484D]', late_done: 'bg-[#F5A524]', done: 'bg-[#22C55E]' }

/** Days late — to the completion date when closed, to today while open. */
const delayDays = (task: OverdueTask): number => {
  if (!task.deadline_date) return 0
  const end = task.task_completed ? dayjs(task.task_completed) : dayjs()
  return Math.max(0, end.startOf('day').diff(dayjs(task.deadline_date).startOf('day'), 'day'))
}
/** Days left for an OPEN task (0 = due today). */
const daysLeft = (task: OverdueTask) => dayjs(task.deadline_date).startOf('day').diff(dayjs().startOf('day'), 'day')

export function IjroPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const lp = useListParams(['status', 'view', 'emp'])
  const { search, setSearch, filters, setFilter, page, setPage, size, setSize } = lp
  // `view` is how the register is drawn, not a filter — a reset keeps it.
  const { count: activeFilterCount, reset } = useFilterReset(lp, ['status', 'emp'])
  // `/me.is_ijro_manager` IS `can_manage_module` (site admins + HR included).
  const canWrite = !!useAuthStore((s) => s.user)?.is_ijro_manager
  // Search, state and executor are all filtered on the SERVER; the tiles
  // come from `/tasks-overdue/summary`. The list view is paged; the workload
  // view needs every matching row to group them, so it asks without a page.
  const view0 = filters.view === 'people' ? 'people' : 'list'
  const { rows, total, pages, loading, fetching, error, refetch } = useOverdueTasks({
    search,
    status: filters.status || undefined,
    employeeId: filters.emp || undefined,
    ...(view0 === 'list' ? { page, size } : {}),
  })
  const summary = useIjroSummary({ search, employeeId: filters.emp || undefined })
  const mut = useIjroMutations()
  const view = filters.view === 'people' ? 'people' : 'list'

  const [sort, setSort] = useState<SortState | null>(null)
  const [editing, setEditing] = useState<OverdueTask | null>(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<OverdueTask | null>(null)
  const [viewing, setViewing] = useState<OverdueTask | null>(null)

  const counts = useMemo(() => {
    const closed = summary.done + summary.late_done
    return { ...summary, rate: closed ? Math.round((summary.done / closed) * 100) : null }
  }, [summary])

  const run = async (p: Promise<unknown>, msg: string) => {
    try {
      await p
      mut.invalidate()
      toast.ok(msg)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }
  const markDone = async (r: OverdueTask) => {
    if (!(await confirm({ kind: 'status', subject: r.task_index ?? '', confirmLabel: t('ijro.markDone') }))) return
    await run(mut.update.mutateAsync({ id: r.id, body: { task_completed: dayjs().format('YYYY-MM-DD') } }), t('ijro.markedDone'))
  }

  const sel = useRowSelection(canWrite && view === 'list' ? rows : [], { resetKey: `${filters.status}|${filters.emp}|${search}` })
  const bulk = useBulkAction()
  const bulkRun = async (kind: 'status' | 'delete', pick: (r: OverdueTask) => boolean, action: (r: OverdueTask) => Promise<unknown>, label: string, okMsg: string) => {
    const chosen = rows.filter((r) => sel.selected.has(r.id))
    const eligible = chosen.filter(pick)
    if (!eligible.length) return toast.error(t('ijro.bulkNothing'))
    if (!(await confirm({ kind, count: eligible.length, confirmLabel: label }))) return
    const byId = new Map(eligible.map((r) => [r.id, r]))
    const failed = await bulk.run(eligible.map((r) => r.id), (id) => action(byId.get(id)!))
    mut.invalidate()
    const bad = failed.length + chosen.length - eligible.length
    if (bad) toast.error(t('list.bulkPartialFail', { count: bad }))
    else toast.ok(okMsg)
    sel.clear()
  }

  const columns: Column<OverdueTask>[] = [
    { key: 'task_index', header: t('ijro.colIndex'), sortValue: (r) => r.task_index ?? '', cell: (r) => <span className="font-semibold tabular-nums text-fg">{r.task_index || '—'}</span> },
    {
      key: 'employee',
      header: t('ijro.colEmployee'),
      sortValue: (r) => r.employee?.legal_name ?? '',
      cell: (r) => (
        <span className="flex items-center gap-2">
          <Avatar src={r.employee?.photo_thumb_path} fallbackSrc={r.employee?.photo_path} name={r.employee?.legal_name ?? '?'} size={26} />
          <span className="min-w-0 leading-snug text-fg">{r.employee?.legal_name || '—'}</span>
        </span>
      ),
    },
    { key: 'description', header: t('ijro.colTask'), cell: (r) => <span className="line-clamp-2 text-fg-muted">{r.description || '—'}</span> },
    {
      key: 'deadline_date',
      header: t('ijro.colDeadline'),
      sortValue: (r) => r.deadline_date ?? '',
      cell: (r) => (
        <span className="flex flex-col">
          <span className="tabular-nums text-fg">{r.deadline_date ? formatUzShort(r.deadline_date) : '—'}</span>
          <DeadlineHint row={r} />
        </span>
      ),
    },
    { key: 'task_completed', header: t('ijro.colDone'), sortValue: (r) => r.task_completed ?? '', cell: (r) => <span className="tabular-nums">{r.task_completed ? formatUzShort(r.task_completed) : '—'}</span> },
    {
      key: 'status',
      header: t('ijro.colStatus'),
      sortValue: (r) => ['late', 'open', 'late_done', 'done'].indexOf(statusOf(r)),
      cell: (r) => {
        const s = statusOf(r)
        return (
          <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11.5px] font-semibold', STATUS_PILL[s])}>
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_BAR[s])} />
            {t(`ijro.status_${s}` as never)}
          </span>
        )
      },
    },
    ...(canWrite
      ? [{
          key: 'actions',
          header: '',
          cell: (r: OverdueTask) => (
            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {!r.task_completed && (
                <Button size="sm" variant="secondary" leftIcon={<CheckCircle2 size={14} />} onClick={() => markDone(r)}>
                  {t('ijro.markDone')}
                </Button>
              )}
              <IconButton size="sm" label={t('common.edit')} onClick={() => setEditing(r)}><Pencil size={15} /></IconButton>
              <IconButton size="sm" label={t('common.delete')} onClick={() => setDeleting(r)}><Trash2 size={15} /></IconButton>
            </div>
          ),
        } as Column<OverdueTask>]
      : []),
  ]

  const tiles: { key: '' | IjroStatus; label: string; value: number; icon: ReactNode; tone: string }[] = [
    { key: '', label: t('ijro.filterAll'), value: counts.all, icon: <ClipboardList size={18} />, tone: 'from-[#8B5CF6] to-[#6D28D9]' },
    { key: 'open', label: t('ijro.status_open'), value: counts.open, icon: <Hourglass size={18} />, tone: 'from-[#38BDF8] to-[#0284C7]' },
    { key: 'late', label: t('ijro.status_late'), value: counts.late, icon: <AlertTriangle size={18} />, tone: 'from-[#FB7185] to-[#E11D48]' },
    { key: 'late_done', label: t('ijro.status_late_done'), value: counts.late_done, icon: <Clock size={18} />, tone: 'from-[#FCD34D] to-[#F59E0B]' },
    { key: 'done', label: t('ijro.status_done'), value: counts.done, icon: <CheckCircle2 size={18} />, tone: 'from-[#34D399] to-[#059669]' },
  ]

  return (
    <PageContainer>
      <PageHeader
        title={t('ijro.title')}
        subtitle={t('ijro.subtitle')}
        actions={
          canWrite ? (
            <div className="flex flex-wrap gap-2">
              {/* The e-ijro export comes as a spreadsheet — keyed in row by
                  row until now (2026-09-28). */}
              <Button variant="secondary" leftIcon={<FileSpreadsheet size={16} />} onClick={() => setImporting(true)}>
                {t('ijro.import')}
              </Button>
              <Button leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>{t('ijro.create')}</Button>
            </div>
          ) : undefined
        }
      />

      {/* ── the register at a glance: five counts (each a filter) + the rate ── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map((x) => {
          const on = (filters.status || '') === x.key
          return (
            <button
              key={x.key || 'all'}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter('status', x.key)}
              className={filterTile(on, 'hover:-translate-y-0.5')}
            >
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-gradient-to-br text-white', x.tone)}>{x.icon}</span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold leading-tight text-fg-muted">{x.label}</span>
                <span className="block text-[24px] font-extrabold leading-tight tabular-nums text-fg">{x.value}</span>
              </span>
            </button>
          )
        })}
        <div className="col-span-2 flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-sm sm:col-span-1">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-brand-soft text-brand-strong"><Gauge size={18} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] font-semibold leading-tight text-fg-muted">{t('ijro.onTimeRate')}</span>
            <span className="block text-[24px] font-extrabold leading-tight tabular-nums text-fg">{counts.rate == null ? '—' : `${counts.rate}%`}</span>
            {counts.rate != null && (
              <span className="mt-1 block h-1.5 overflow-hidden rounded-pill bg-fg/[0.07]">
                <span className={cn('block h-full rounded-pill', counts.rate >= 80 ? 'bg-success' : counts.rate >= 50 ? 'bg-warning' : 'bg-danger')} style={{ width: `${counts.rate}%` }} />
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-80">
          <SearchInput value={search} onChange={setSearch} placeholder={t('ijro.searchPlaceholder')} />
        </div>
        <Segmented
          variant="brand"
          value={view}
          onChange={(v) => setFilter('view', v === 'list' ? '' : v)}
          options={[
            { value: 'list', icon: <ListIcon size={14} />, label: t('ijro.viewList') },
            { value: 'people', icon: <Users size={14} />, label: t('ijro.viewPeople') },
          ]}
        />
        {filters.emp && (
          <button type="button" onClick={() => setFilter('emp', '')} className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-brand/50 bg-brand-soft px-3 text-[12.5px] font-medium text-brand-strong">
            <Users size={13} /> {rows.find((r) => String(r.employee_id) === filters.emp)?.employee?.legal_name ?? '—'} ×
          </button>
        )}
        <FilterReset count={activeFilterCount} onReset={reset} />
        <span className="ml-auto text-[12px] tabular-nums text-fg-subtle">{t('ijro.shownCount', { count: view0 === 'list' ? total : rows.length })}</span>
      </div>

      {sel.count > 0 && (
        <BulkBar count={sel.count} onClear={sel.clear} progress={bulk.progress}>
          <Button
            size="sm"
            leftIcon={<CheckCircle2 size={14} />}
            onClick={() => bulkRun('status', (r) => !r.task_completed, (r) => mut.update.mutateAsync({ id: r.id, body: { task_completed: dayjs().format('YYYY-MM-DD') } }), t('ijro.markDone'), t('ijro.markedDone'))}
          >
            {t('ijro.markDone')}
          </Button>
          <Button size="sm" variant="ghost" className="text-danger" leftIcon={<Trash2 size={14} />} onClick={() => bulkRun('delete', () => true, (r) => mut.remove.mutateAsync(r.id), t('common.delete'), t('ijro.deleted'))}>
            {t('common.delete')}
          </Button>
        </BulkBar>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : rows.length === 0 ? (
        <Card className="p-8">
          <EmptyState
            icon={<ClipboardList size={22} />}
            title={activeFilterCount > 0 ? t('list.noResultsFiltered') : t('ijro.empty')}
            description={activeFilterCount > 0 ? t('list.noResultsFilteredHint') : t('ijro.emptyHint')}
            action={<FilterReset count={activeFilterCount} onReset={reset} />}
          />
        </Card>
      ) : view === 'people' ? (
        <PeopleView rows={rows} onPick={(id) => setFilters2(setFilter, id)} />
      ) : (
        <Card className="overflow-hidden p-0">
          <DataTable
            tableId="ijro"
            rows={rows}
            columns={columns}
            emptyTitle={t('ijro.empty')}
            loading={loading}
            error={error}
            onRetry={refetch}
            sort={sort}
            onSort={setSort}
            onRowClick={setViewing}
            {...(canWrite ? { selection: sel } : {})}
          />
          <Pagination page={page} pages={pages} total={total} size={size} onPage={setPage} onSize={setSize} loading={fetching} />
        </Card>
      )}

      <TaskView
        task={viewing}
        canWrite={canWrite}
        onClose={() => setViewing(null)}
        onDone={(r) => { setViewing(null); void markDone(r) }}
        onReopen={async (r) => {
          setViewing(null)
          if (await confirm({ kind: 'status', subject: r.task_index ?? '', confirmLabel: t('ijro.reopen') }))
            await run(mut.update.mutateAsync({ id: r.id, body: { task_completed: null } }), t('ijro.reopened'))
        }}
        onEdit={(r) => { setViewing(null); setEditing(r) }}
        onDelete={(r) => { setViewing(null); setDeleting(r) }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const r = deleting
          setDeleting(null)
          if (r) await run(mut.remove.mutateAsync(r.id), t('ijro.deleted'))
        }}
        danger
        title={t('ijro.deleteTitle')}
        description={t('ijro.deleteConfirm')}
        confirmLabel={t('common.delete')}
      />

      <IjroModal
        open={creating || !!editing}
        task={editing}
        loading={mut.create.isPending || mut.update.isPending}
        onClose={() => { setCreating(false); setEditing(null) }}
        onSubmit={async (body) => {
          const e = editing
          if (e && !(await confirm({ kind: 'action', subject: e.task_index ?? '', confirmLabel: t('common.save') }))) return
          setCreating(false)
          setEditing(null)
          await run(e ? mut.update.mutateAsync({ id: e.id, body }) : mut.create.mutateAsync(body), t('common.saved'))
        }}
      />
      {canWrite && (
        <ImportWizard entity="tasks_overdue" open={importing} onClose={() => setImporting(false)} onDone={() => mut.invalidate()} />
      )}
    </PageContainer>
  )
}

/** Picking a person in the workload view narrows the LIST to them. */
function setFilters2(setFilter: (k: string, v: string) => void, id: number) {
  setFilter('emp', String(id))
  setFilter('view', '')
}

function DeadlineHint({ row }: { row: OverdueTask }) {
  const { t } = useTranslation()
  if (!row.deadline_date) return null
  if (row.task_completed) {
    const d = delayDays(row)
    return d > 0 ? <span className="text-[11.5px] font-semibold text-warning">{t('ijro.closedLate', { count: d })}</span> : <span className="text-[11.5px] text-success">{t('ijro.closedOnTime')}</span>
  }
  const left = daysLeft(row)
  if (left < 0) return <span className="text-[11.5px] font-semibold text-danger">{t('ijro.daysLate', { count: -left })}</span>
  if (left === 0) return <span className="text-[11.5px] font-semibold text-warning">{t('ijro.dueToday')}</span>
  return <span className={cn('text-[11.5px]', left <= 3 ? 'font-semibold text-warning' : 'text-fg-subtle')}>{t('ijro.daysLeft', { count: left })}</span>
}

/* ─────────────────────────── by executor ─────────────────────────── */

function PeopleView({ rows, onPick }: { rows: OverdueTask[]; onPick: (employeeId: number) => void }) {
  const { t } = useTranslation()
  const people = useMemo(() => {
    const m = new Map<number, { id: number; name: string; photo?: string | null; photoFull?: string | null; open: number; late: number; late_done: number; done: number; total: number; maxLate: number }>()
    for (const r of rows) {
      if (r.employee_id == null) continue
      const p = m.get(r.employee_id) ?? { id: r.employee_id, name: r.employee?.legal_name ?? '—', photo: r.employee?.photo_thumb_path, photoFull: r.employee?.photo_path, open: 0, late: 0, late_done: 0, done: 0, total: 0, maxLate: 0 }
      p[statusOf(r)]++
      p.total++
      if (statusOf(r) === 'late') p.maxLate = Math.max(p.maxLate, delayDays(r))
      m.set(r.employee_id, p)
    }
    // Those with overdue work first — that is who the manager calls.
    return [...m.values()].sort((a, b) => b.late - a.late || b.late_done - a.late_done || b.total - a.total)
  }, [rows])
  const max = Math.max(1, ...people.map((p) => p.total))

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line bg-surface-2/50 px-4 py-2 text-[11.5px] font-semibold text-fg-subtle sm:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_auto]">
        <span>{t('ijro.colEmployee')}</span>
        <span className="hidden sm:block">{t('ijro.workload')}</span>
        <span className="text-right">{t('ijro.maxLate')}</span>
      </div>
      <ul className="divide-y divide-line/60">
        {people.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onPick(p.id)}
              className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2/60 sm:grid-cols-[minmax(200px,280px)_minmax(0,1fr)_auto]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <Avatar src={p.photo} fallbackSrc={p.photoFull} name={p.name} size={30} />
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-fg">{p.name}</span>
                  <span className="block text-[11.5px] tabular-nums text-fg-subtle">{t('ijro.tasksCount', { count: p.total })}</span>
                </span>
              </span>
              <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <span className="flex h-3 flex-1 overflow-hidden rounded-pill bg-fg/[0.06]" style={{ maxWidth: `${(p.total / max) * 100}%` }}>
                  {(['late', 'late_done', 'open', 'done'] as const).map((k) =>
                    p[k] ? <span key={k} className={cn('h-full', STATUS_BAR[k])} style={{ width: `${(p[k] / p.total) * 100}%` }} title={`${t(`ijro.status_${k}` as never)}: ${p[k]}`} /> : null,
                  )}
                </span>
                <span className="flex shrink-0 gap-2 text-[11.5px] tabular-nums">
                  {p.late > 0 && <span className="font-bold text-danger">{p.late}</span>}
                  {p.late_done > 0 && <span className="font-semibold text-warning">{p.late_done}</span>}
                  {p.open > 0 && <span className="text-info">{p.open}</span>}
                  {p.done > 0 && <span className="text-success">{p.done}</span>}
                </span>
              </span>
              <span className={cn('row-start-1 text-right text-[12.5px] font-bold tabular-nums sm:row-auto', p.maxLate ? 'text-danger' : 'text-fg-subtle')}>
                {p.maxLate ? t('ijro.daysLate', { count: p.maxLate }) : '—'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3 border-t border-line px-4 py-2 text-[11.5px] text-fg-muted">
        {(['late', 'late_done', 'open', 'done'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn('h-2 w-2 rounded-full', STATUS_BAR[k])} />{t(`ijro.status_${k}` as never)}</span>
        ))}
      </div>
    </Card>
  )
}

/* ─────────────────────────────── modals ──────────────────────────────── */

function TaskView({ task, canWrite, onClose, onDone, onReopen, onEdit, onDelete }: {
  task: OverdueTask | null
  canWrite: boolean
  onClose: () => void
  onDone: (r: OverdueTask) => void
  onReopen: (r: OverdueTask) => void
  onEdit: (r: OverdueTask) => void
  onDelete: (r: OverdueTask) => void
}) {
  const { t } = useTranslation()
  if (!task) return null
  const s = statusOf(task)
  return (
    <Modal
      open
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{task.task_index}</span>
          <span className={cn('inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[11.5px] font-semibold', STATUS_PILL[s])}>
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_BAR[s])} />
            {t(`ijro.status_${s}` as never)}
          </span>
        </span>
      }
      footer={
        canWrite ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={15} />} onClick={() => onDelete(task)}>{t('common.delete')}</Button>
            <span className="flex-1" />
            <Button variant="secondary" leftIcon={<Pencil size={15} />} onClick={() => onEdit(task)}>{t('common.edit')}</Button>
            {task.task_completed ? (
              <Button variant="secondary" leftIcon={<RotateCcw size={15} />} onClick={() => onReopen(task)}>{t('ijro.reopen')}</Button>
            ) : (
              <Button leftIcon={<CheckCircle2 size={15} />} onClick={() => onDone(task)}>{t('ijro.markDone')}</Button>
            )}
          </div>
        ) : (
          <Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-fg">{task.description || '—'}</p>
        <dl className="m-0 grid gap-3 rounded-inner bg-surface-2/50 p-3 text-[13px] sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle"><Users size={13} />{t('ijro.colEmployee')}</dt>
            <dd className="m-0 mt-1 flex items-center gap-2 text-fg"><Avatar src={task.employee?.photo_thumb_path} fallbackSrc={task.employee?.photo_path} name={task.employee?.legal_name ?? '?'} size={22} />{task.employee?.legal_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle"><CalendarClock size={13} />{t('ijro.colDeadline')}</dt>
            <dd className="m-0 mt-1 flex flex-col text-fg"><span className="tabular-nums">{task.deadline_date ? formatUzShort(task.deadline_date) : '—'}</span><DeadlineHint row={task} /></dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle"><CheckCircle2 size={13} />{t('ijro.colDone')}</dt>
            <dd className="m-0 mt-1 tabular-nums text-fg">{task.task_completed ? formatUzShort(task.task_completed) : '—'}</dd>
          </div>
        </dl>
      </div>
    </Modal>
  )
}

function IjroModal({ open, task, loading, onClose, onSubmit }: {
  open: boolean
  task: OverdueTask | null
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [index, setIndex] = useState('')
  const [description, setDescription] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [deadline, setDeadline] = useState('')
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  // Server-side search over `/employees/options`: with «Barcha filiallar» the
  // old branch roster did not load at all and the executor could not be chosen.
  const branchId = useBranchStore((st) => st.selectedBranchId)
  const { options, loading: loadingEmps, hasMore, loadMore } = useEmployeeSearch(branchId, open, q)
  // The current executor may be beyond the first page of results — keep them.
  const withCurrent = useMemo(
    () =>
      task?.employee_id && !options.some((o) => o.value === String(task.employee_id))
        ? [{ value: String(task.employee_id), label: task.employee?.legal_name ?? `#${task.employee_id}` }, ...options]
        : options,
    [options, task],
  )

  useEffect(() => {
    if (!open) return
    setIndex(task?.task_index ?? '')
    setDescription(task?.description ?? '')
    setEmployeeId(task?.employee_id ? String(task.employee_id) : '')
    setDeadline(task?.deadline_date ?? '')
    setDone(task?.task_completed ?? '')
    setError('')
    setQ('')
  }, [open, task])

  const submit = () => {
    if (!index.trim()) return setError(t('ijro.indexRequired'))
    if (!employeeId) return setError(t('ijro.employeeRequired'))
    if (!deadline) return setError(t('ijro.deadlineRequired'))
    onSubmit({
      task_index: index.trim(),
      description: description.trim() || null,
      employee_id: Number(employeeId),
      deadline_date: deadline,
      task_completed: done || null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={task ? t('ijro.editTitle') : t('ijro.create')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button loading={loading} onClick={submit}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ijro.colIndex')} required>
          <Input value={index} onChange={(e) => setIndex(e.target.value)} />
        </Field>
        <Field label={t('ijro.colEmployee')} required>
          <Combobox
            value={employeeId}
            onChange={setEmployeeId}
            options={withCurrent}
            loading={loadingEmps}
            onSearchChange={setQ}
            hasMore={hasMore}
            onLoadMore={loadMore}
            placeholder={t('common.choose')}
          />
        </Field>
        <Field label={t('ijro.colDeadline')} required>
          <DateInput value={deadline} onChange={setDeadline} />
        </Field>
        <Field label={t('ijro.colDone')} hint={t('ijro.doneHint')}>
          <DateInput value={done} onChange={setDone} />
        </Field>
        <Field label={t('ijro.colTask')} wide>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
      </div>
    </Modal>
  )
}
