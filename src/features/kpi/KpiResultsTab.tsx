import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { CalendarPlus, CheckCircle2, Copy, Download, PlayCircle, Plus, RotateCcw, Trash2, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { BulkBar } from '@/components/data/BulkBar'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { useServerText } from '@/features/statistics/serverText'
import { useBulkAction } from '@/hooks/useBulkAction'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useRowSelection } from '@/hooks/useRowSelection'
import { errorMessage } from '@/api/errorMessage'
import { isInvalidRange } from '@/lib/dateRange'
import { formatRange, monthTitle } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Employee } from '@/types'
import {
  exportEntries,
  fmtDay,
  isDoneStatus,
  isPenalty,
  monthRange,
  num,
  pct,
  percentTone,
  useEntries,
  useEntry,
  useIndicators,
  useKpiMutations,
  type KpiEntry,
  type StatusAction,
} from './api'
import { KpiStatusMenu } from './KpiStatusMenu'
import { useKpiAccess } from './useKpiAccess'
import { PositionGroupFilter } from './PositionGroupControls'

/** Last twelve months, newest first — the «Davr» filter (v1 `buildMonthOptions`). */
export function useMonthOptions(count = 12) {
  return useMemo(() => {
    const now = dayjs().startOf('month')
    return Array.from({ length: count }, (_, i) => {
      const d = now.subtract(i, 'month')
      return { value: d.format('YYYY-MM'), label: monthTitle(d) }
    })
  }, [count])
}

const ENTRY_STATUSES = ['draft', 'N', 'I', 'D', 'locked'] as const
const STATUS_FILTER_KEY: Record<string, string> = {
  draft: 'kpi.statusDraft',
  N: 'kpi.statusN',
  I: 'kpi.statusI',
  D: 'kpi.statusD',
  locked: 'kpi.statusLocked',
}

export const TONE_TEXT: Record<string, string> = {
  success: 'bg-success-soft text-success',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-surface-2 text-fg-muted',
}

/** «Natija» cell: a coloured %, or for a penalty row the points it takes away (TZ 2162). */
export function ResultCell({ entry }: { entry: Pick<KpiEntry, 'indicator' | 'fact_value' | 'result_percent'> }) {
  if (isPenalty(entry.indicator)) {
    const f = Number(entry.fact_value ?? 0)
    return (
      <span className={cn('inline-block min-w-12 rounded-pill px-2 py-0.5 text-center text-[12px] font-bold tabular-nums', f > 0 ? TONE_TEXT.danger : TONE_TEXT.neutral)}>
        {f > 0 ? `−${f}` : '0'}
      </span>
    )
  }
  return (
    <span className={cn('inline-block min-w-12 rounded-pill px-2 py-0.5 text-center text-[12px] font-bold tabular-nums', TONE_TEXT[percentTone(entry.result_percent)])}>
      {pct(entry.result_percent)}
    </span>
  )
}

/**
 * «Natijalar» — every KPI entry (plan / fact / result / status), server-paged,
 * filtered by name, indicator, month, department, position and status; bulk
 * status moves and an Excel file of exactly what is filtered.
 */
export function KpiResultsTab({ onOpenEntry }: { onOpenEntry: (id: number) => void }) {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const confirm = useConfirm()
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const bulk = useBulkAction(4)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } = useListParams([
    'indicator',
    'month',
    'dept',
    'pos',
    'st',
    'pg',
  ])
  const { indicators } = useIndicators()
  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()
  const months = useMonthOptions()
  const [editing, setEditing] = useState<{ row: KpiEntry | null; copy?: boolean } | null>(null)
  const [exporting, setExporting] = useState(false)

  const query = {
    search,
    indicator_id: filters.indicator,
    department_id: filters.dept,
    job_position_id: filters.pos,
    status: filters.st,
    position_group: filters.pg,
    ...monthRange(filters.month),
  }
  const list = useEntries({ ...query, page, size })
  const selection = useRowSelection(list.rows, { resetKey: JSON.stringify(query) })

  const canAdd = acc.may('kpi_list', 'add')
  const canEdit = acc.may('kpi_list', 'edit')
  const canDelete = acc.may('kpi_list', 'delete')
  const statusAllowed = (a: StatusAction) => acc.may('employee_performance', `kpi_${a}`)

  const setStatus = async (id: number, action: StatusAction) => {
    try {
      await mut.entryStatus.mutateAsync({ id, action })
      toast.ok(t('kpi.statusChanged'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const bulkStatus = async (action: StatusAction) => {
    const ids = selection.selectedIds
    if (!(await confirm({ kind: 'status', count: ids.length }))) return
    const failed = await bulk.run(ids, (id) => mut.entryStatus.mutateAsync({ id, action }))
    selection.clear()
    if (failed.length) toast.info(t('kpi.bulkPartial', { changed: ids.length - failed.length, total: ids.length }))
    else toast.ok(t('kpi.bulkEntriesDone', { count: ids.length }))
  }

  const remove = async (row: KpiEntry) => {
    if (!(await confirm({ kind: 'delete', subject: sx(row.indicator?.name) }))) return
    try {
      await mut.deleteEntry.mutateAsync(row.id)
      toast.ok(t('common.deleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const generate = async () => {
    if (!(await confirm({ kind: 'action', title: t('kpi.generateEntries'), description: t('kpi.generateEntriesHint') }))) return
    try {
      const r = await mut.generateMonthEntries.mutateAsync()
      toast.ok(t('kpi.generatedEntries', { created: r?.created ?? 0, skipped: r?.skipped ?? 0 }))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const columns: Column<KpiEntry>[] = [
    {
      key: 'indicator',
      header: t('kpi.colIndicator'),
      skeleton: 'w-56',
      className: 'max-w-[22rem]',
      cell: (e) => (
        <span className="line-clamp-2 text-[13px] text-fg" title={sx(e.indicator?.name)}>
          {isPenalty(e.indicator) && <span className="mr-1 font-bold text-danger">{t('kpi.penaltyMark')}</span>}
          {sx(e.indicator?.name) || '—'}
        </span>
      ),
    },
    {
      key: 'employee',
      header: t('kpi.colEmployee'),
      skeleton: 'w-40',
      sortValue: (e) => e.employee?.legal_name ?? '',
      cell: (e) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar src={e.employee?.photo_thumb_path} fallbackSrc={e.employee?.photo_path} name={e.employee?.legal_name} size={28} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-fg">{e.employee?.legal_name ?? '—'}</span>
            {e.department_name && <span className="block truncate text-[11.5px] text-fg-subtle">{e.department_name}</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'period',
      header: t('kpi.colPeriod'),
      skeleton: 'w-28',
      className: 'whitespace-nowrap tabular-nums text-fg-muted',
      cell: (e) => formatRange(e.period_start, e.period_end),
    },
    {
      key: 'plan',
      header: t('kpi.colPlan'),
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      skeleton: 'w-10',
      sortValue: (e) => e.plan_value ?? 0,
      cell: (e) => num(e.plan_value),
    },
    {
      key: 'fact',
      header: t('kpi.colFact'),
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      skeleton: 'w-10',
      sortValue: (e) => e.fact_value ?? 0,
      cell: (e) => num(e.fact_value),
    },
    {
      key: 'result',
      header: t('kpi.colResult'),
      headerClassName: 'text-center',
      className: 'text-center',
      skeleton: 'w-12',
      sortValue: (e) => e.result_percent ?? -1,
      cell: (e) => <ResultCell entry={e} />,
    },
    {
      key: 'status',
      header: t('kpi.colStatus'),
      skeleton: 'w-20',
      cell: (e) => (
        <KpiStatusMenu
          status={e.status}
          onAction={acc.manager ? (a) => setStatus(e.id, a) : undefined}
          allowed={statusAllowed}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'whitespace-nowrap text-right',
      cell: (e) => (
        <span className="inline-flex gap-0.5">
          {canEdit && (acc.master || !isDoneStatus(e.status)) && (
            <IconButton size="sm" label={t('kpi.editEntry')} onClick={() => setEditing({ row: e })}>
              <Pencil size={14} />
            </IconButton>
          )}
          {canAdd && (
            <IconButton size="sm" label={t('kpi.copy')} onClick={() => setEditing({ row: e, copy: true })}>
              <Copy size={14} />
            </IconButton>
          )}
          {canDelete && (acc.master || !isDoneStatus(e.status)) && (
            <IconButton size="sm" label={t('common.delete')} onClick={() => remove(e)}>
              <Trash2 size={14} />
            </IconButton>
          )}
        </span>
      ),
    },
  ]

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder={t('kpi.searchEmployee')} className="flex-1 lg:max-w-xs" />
        <Combobox
          value={filters.indicator}
          onChange={(v) => setFilter('indicator', v)}
          options={indicators.map((i) => ({ value: String(i.id), label: sx(i.name) || `#${i.id}` }))}
          placeholder={t('kpi.allIndicators')}
          className="w-full lg:w-64"
        />
        <Combobox
          value={filters.month}
          onChange={(v) => setFilter('month', v)}
          options={months}
          placeholder={t('kpi.allPeriods')}
          className="w-full lg:w-44"
        />
        <Combobox
          value={filters.dept}
          onChange={(v) => setFilter('dept', v)}
          options={departments}
          placeholder={t('kpi.allDepartments')}
          className="w-full lg:w-52"
        />
        <Combobox
          value={filters.pos}
          onChange={(v) => setFilter('pos', v)}
          options={positions}
          placeholder={t('kpi.allPositions')}
          className="w-full lg:w-52"
        />
        <Combobox
          value={filters.st}
          onChange={(v) => setFilter('st', v)}
          options={ENTRY_STATUSES.map((s) => ({ value: s, label: t(STATUS_FILTER_KEY[s] as never) }))}
          placeholder={t('kpi.allStatuses')}
          className="w-full lg:w-44"
        />
        <PositionGroupFilter value={filters.pg} onChange={(v) => setFilter('pg', v)} />
        <FilterReset count={activeFilterCount} onReset={reset} />
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download size={14} />}
            loading={exporting}
            onClick={async () => {
              setExporting(true)
              try {
                await exportEntries(query)
              } catch (e) {
                toast.error(errorMessage(e, t('kpi.exportFailed')))
              } finally {
                setExporting(false)
              }
            }}
          >
            Excel
          </Button>
          {acc.manager && (
            <Button size="sm" variant="secondary" leftIcon={<CalendarPlus size={14} />} loading={mut.generateMonthEntries.isPending} onClick={generate}>
              {t('kpi.generateEntries')}
            </Button>
          )}
          {canAdd && (
            <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setEditing({ row: null })}>
              {t('kpi.newEntry')}
            </Button>
          )}
        </div>
      </div>

      <DataTable
        tableId="kpi-entries"
        rows={list.rows}
        columns={columns}
        loading={list.loading}
        error={list.error}
        onRetry={list.refetch}
        selection={acc.manager ? selection : undefined}
        onRowClick={(e) => onOpenEntry(e.id)}
        emptyTitle={t('kpi.entriesEmpty')}
        filtered={activeFilterCount > 0}
        emptyAction={<FilterReset count={activeFilterCount} onReset={reset} />}
        minWidth={1080}
      />
      <Pagination page={page} size={size} total={list.total} pages={list.pages} onPage={setPage} onSize={setSize} loading={list.fetching} />

      {acc.manager && (
        <BulkBar count={selection.count} onClear={selection.clear} progress={bulk.progress}>
          {(['set_in_progress', 'set_done', 'clear_in_progress'] as const)
            .filter(statusAllowed)
            .map((a) => (
              <Button key={a} size="sm" variant={a === 'set_done' ? 'primary' : 'secondary'} disabled={bulk.progress.running} onClick={() => bulkStatus(a)}
                leftIcon={a === 'set_done' ? <CheckCircle2 size={14} /> : a === 'set_in_progress' ? <PlayCircle size={14} /> : <RotateCcw size={14} />}
              >
                {t(a === 'set_done' ? 'kpi.bulkDone' : a === 'set_in_progress' ? 'kpi.bulkInProgress' : 'kpi.bulkToNew')}
              </Button>
            ))}
        </BulkBar>
      )}

      <EntryModal value={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}

/**
 * Create / copy / edit one entry (v1 `EntryDrawer`). Editing changes plan,
 * fact and note only — the status moves through its own menu (N ↔ I ↔ D).
 */
export function EntryModal({ value, onClose }: { value: { row: KpiEntry | null; copy?: boolean } | null; onClose: () => void }) {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const mut = useKpiMutations()
  const { indicators } = useIndicators({}, !!value && (!value.row || !!value.copy))
  const open = !!value
  const row = value?.row ?? null
  const editing = !!row && !value?.copy
  const [form, setForm] = useState({ indicator_id: '', period_start: '', period_end: '', plan: '0', fact: '0', note: '' })
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setForm({
      indicator_id: row ? String(row.indicator_id ?? row.indicator?.id ?? '') : '',
      period_start: row?.period_start ?? '',
      period_end: row?.period_end ?? '',
      plan: row ? String(row.plan_value ?? 0) : '0',
      fact: row && !value?.copy ? String(row.fact_value ?? 0) : '0',
      note: row?.note ?? '',
    })
    setEmployee(row?.employee ? ({ id: row.employee.id, legal_name: row.employee.legal_name } as Employee) : null)
  }, [open, row, value?.copy])

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))
  const invalidRange = isInvalidRange(form.period_start, form.period_end)

  const submit = async () => {
    const plan = Number(form.plan)
    const fact = Number(form.fact)
    if (!Number.isFinite(plan) || !Number.isFinite(fact)) return setError(t('kpi.numberRequired'))
    try {
      if (editing) {
        await mut.updateEntry.mutateAsync({ id: row!.id, body: { plan_value: plan, fact_value: fact, note: form.note.trim() || null } })
        toast.ok(t('kpi.entrySaved'))
      } else {
        if (!form.indicator_id) return setError(t('kpi.indicatorRequired'))
        if (!employee) return setError(t('kpi.employeeRequired'))
        if (!form.period_start || !form.period_end) return setError(t('kpi.periodRequired'))
        if (invalidRange) return setError(t('list.invalidRange'))
        await mut.createEntry.mutateAsync({
          indicator_id: Number(form.indicator_id),
          employee_id: employee.id,
          period_start: form.period_start,
          period_end: form.period_end,
          plan_value: plan,
          fact_value: fact,
          note: form.note.trim() || null,
        })
        toast.ok(t('kpi.entryCreated'))
      }
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="md"
      title={editing ? t('kpi.editEntry') : t('kpi.newEntry')}
      description={editing ? sx(row?.indicator?.name) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.createEntry.isPending || mut.updateEntry.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {editing ? (
          <div className="rounded-lg border border-line bg-surface-2/50 p-3 text-[13px] sm:col-span-2">
            <p className="font-medium text-fg">{row?.employee?.legal_name ?? '—'}</p>
            <p className="text-fg-muted">{fmtDay(row?.period_start)} — {fmtDay(row?.period_end)}</p>
          </div>
        ) : (
          <>
            <Field label={t('kpi.colIndicator')} required wide>
              <Combobox
                value={form.indicator_id}
                onChange={(v) => set('indicator_id', v)}
                options={indicators.map((i) => ({ value: String(i.id), label: sx(i.name) || `#${i.id}` }))}
                placeholder={t('kpi.pickIndicator')}
                className="w-full"
              />
            </Field>
            <Field label={t('kpi.colEmployee')} required wide>
              <EmployeePicker value={employee} onChange={setEmployee} />
            </Field>
            <Field label={t('kpi.periodStart')} required>
              <DateInput value={form.period_start} onChange={(v) => set('period_start', v)} invalid={invalidRange} aria-label={t('kpi.periodStart')} />
            </Field>
            <Field label={t('kpi.periodEnd')} required>
              <DateInput value={form.period_end} onChange={(v) => set('period_end', v)} min={form.period_start || undefined} invalid={invalidRange} aria-label={t('kpi.periodEnd')} />
            </Field>
          </>
        )}
        <Field label={t('kpi.planLabel')}>
          <Input type="number" inputMode="decimal" value={form.plan} onChange={(e) => set('plan', e.target.value)} />
        </Field>
        <Field label={t('kpi.colFact')}>
          <Input type="number" inputMode="decimal" value={form.fact} onChange={(e) => set('fact', e.target.value)} autoFocus={editing} />
        </Field>
        <Field label={t('kpi.note')} wide>
          <Textarea rows={3} value={form.note} onChange={(e) => set('note', e.target.value)} placeholder={t('kpi.notePlaceholder')} />
        </Field>
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}

/**
 * One entry on its own — the deep link of a notification (`?entry=`). The
 * person, the period, plan / fact / result and the status; a manager can edit
 * it from here and move its status.
 */
export function EntryDetailModal({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const { entry, loading, error } = useEntry(id)
  const [editing, setEditing] = useState(false)

  if (editing && entry) return <EntryModal value={{ row: entry }} onClose={() => setEditing(false)} />

  const ind = entry?.indicator
  return (
    <Modal
      open={id != null}
      onClose={onClose}
      placement="right"
      size="md"
      title={t('kpi.entryTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          {entry && acc.may('kpi_list', 'edit') && (acc.master || !isDoneStatus(entry.status)) && (
            <Button leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              {t('kpi.editEntry')}
            </Button>
          )}
        </>
      }
    >
      {loading ? (
        <p className="py-10 text-center text-sm text-fg-subtle">{t('common.loading')}</p>
      ) : error || !entry ? (
        <p className="py-10 text-center text-sm text-danger">{errorMessage(error, t('kpi.entryNotFound'))}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[14px] font-semibold leading-snug text-fg">
            {isPenalty(ind) && <span className="mr-1 text-danger">{t('kpi.penaltyMark')}</span>}
            {sx(ind?.name)}
          </p>
          <div className="flex items-center gap-3">
            <Avatar src={entry.employee?.photo_thumb_path} fallbackSrc={entry.employee?.photo_path} name={entry.employee?.legal_name} size={40} />
            <div className="min-w-0">
              <p className="truncate font-medium text-fg">{entry.employee?.legal_name ?? '—'}</p>
              <p className="truncate text-[12px] text-fg-subtle">{entry.department_name ?? ''}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <Stat label={t('kpi.colPeriod')} value={`${fmtDay(entry.period_start)} — ${fmtDay(entry.period_end)}`} wide />
            <Stat label={t('kpi.colPlan')} value={num(entry.plan_value)} />
            <Stat label={t('kpi.colFact')} value={num(entry.fact_value)} />
            <Stat label={t('kpi.colResult')} value={<ResultCell entry={entry} />} />
            <Stat
              label={t('kpi.colStatus')}
              value={
                <KpiStatusMenu
                  status={entry.status}
                  onAction={
                    acc.manager
                      ? async (a) => {
                          try {
                            await mut.entryStatus.mutateAsync({ id: entry.id, action: a })
                            toast.ok(t('kpi.statusChanged'))
                          } catch (e) {
                            toast.error(errorMessage(e, t('common.actionFailed')))
                          }
                        }
                      : undefined
                  }
                  allowed={(a) => acc.may('employee_performance', `kpi_${a}`)}
                />
              }
            />
            {ind?.group_name && <Stat label={t('kpi.colGroup')} value={sx(ind.group_name)} wide />}
            {entry.note && <Stat label={t('kpi.note')} value={entry.note} wide />}
          </dl>
        </div>
      )}
    </Modal>
  )
}

function Stat({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface-2/40 px-3 py-2', wide && 'col-span-2')}>
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 text-fg">{value}</dd>
    </div>
  )
}
