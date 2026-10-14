import { useEffect, useState } from 'react'
import { lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { CalendarCheck2, CalendarPlus, CheckCircle2, Copy, Download, Flag, ListPlus, PlayCircle, Plus, Trash2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { BulkBar } from '@/components/data/BulkBar'
import { DataTable, type Column } from '@/components/data/DataTable'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useRowSelection } from '@/hooks/useRowSelection'
import { errorMessage } from '@/api/errorMessage'
import { formatRange } from '@/lib/format'
import { cn } from '@/lib/cn'
import {
  exportPerformances,
  num,
  pct,
  percentTone,
  useIntervals,
  useKpiMutations,
  usePerformances,
  type KpiInterval,
  type KpiPerformance,
  type StatusAction,
} from './api'
import { KpiStatusMenu } from './KpiStatusMenu'
import { PerformanceDrawer } from './PerformanceDrawer'
import { TONE_TEXT } from './KpiResultsTab'
import { useKpiAccess } from './useKpiAccess'
import { PositionGroupFilter } from './PositionGroupControls'

const PERF_STATUSES = ['N', 'I', 'D'] as const

const newestFirst = (a: KpiInterval, b: KpiInterval) => String(b.begin_date).localeCompare(String(a.begin_date))

/**
 * «Baholash varaqalari» — the scorecards of one evaluation period: generate
 * them for everyone (the chosen period or the current month), finalize the
 * period, move statuses one by one or in bulk, open a scorecard's arguments,
 * export the filtered list.
 */
export function KpiScorecardsTab() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } = useListParams([
    'iv',
    'sdept',
    'sst',
    'spg',
  ])
  const { intervals } = useIntervals()
  const departments = useDepartmentOptions()
  const [drawerId, setDrawerId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [copying, setCopying] = useState<KpiPerformance | null>(null)
  const [exporting, setExporting] = useState(false)

  // The newest period is chosen by default — the list shows at once instead of
  // asking for a period first (v1, `employee_performance_list`).
  useEffect(() => {
    if (filters.iv || !intervals.length) return
    const latest = [...intervals].sort(newestFirst)[0]
    if (latest) setFilter('iv', String(latest.id))
  }, [filters.iv, intervals, setFilter])

  const intervalId = filters.iv ? Number(filters.iv) : null
  const query = { interval_id: filters.iv, search, department_id: filters.sdept, status: filters.sst, position_group: filters.spg }
  const list = usePerformances({ ...query, page, size }, !!filters.iv)
  const selection = useRowSelection(list.rows, { resetKey: JSON.stringify(query) })

  const canGenerate = acc.may('employee_performance_list', 'add')
  const canDelete = acc.may('employee_performance_list', 'delete')
  const canCopy = acc.may('employee_performance_list', 'copy')
  const canArgs = acc.may('employee_performance', 'performance_arguments')
  const perfAllowed = (a: StatusAction) => acc.may('employee_performance', `performance_${a}`)
  const bulkAllowed = (a: StatusAction) => acc.may('employee_performance_list', a)

  const run = async <T,>(p: () => Promise<T>, ok: (r: T) => string) => {
    try {
      const r = await p()
      toast.ok(ok(r))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const generate = () =>
    intervalId &&
    run(
      () => mut.generateScorecards.mutateAsync(intervalId),
      (r) => t('kpi.sheetsGenerated', { created: r?.created ?? 0, skipped: r?.skipped ?? 0 }),
    )
  const generateMonth = () =>
    run(() => mut.generateMonthScorecards.mutateAsync(), (r) => t('kpi.sheetsGeneratedMonth', { created: r?.created ?? 0 }))
  const finalize = async () => {
    if (!intervalId) return
    if (!(await confirm({ kind: 'action', title: t('kpi.finalizeTitle'), description: t('kpi.finalizeBody'), confirmLabel: t('kpi.finalize') }))) return
    await run(
      () => mut.finalizeInterval.mutateAsync(intervalId),
      (r) => t('kpi.finalized', { count: r?.finalized_performances ?? 0 }),
    )
  }
  const bulkStatus = async (action: StatusAction) => {
    const ids = selection.selectedIds
    await run(
      () => mut.performancesBulkStatus.mutateAsync({ ids, action }),
      (r) => t('kpi.bulkSheetsDone', { changed: r?.changed ?? 0, total: r?.total ?? ids.length }),
    )
    selection.clear()
  }
  const remove = async (p: KpiPerformance) => {
    if (!(await confirm({ kind: 'delete', subject: p.employee?.legal_name }))) return
    await run(() => mut.deletePerformance.mutateAsync(p.id), () => t('common.deleted'))
  }

  const columns: Column<KpiPerformance>[] = [
    {
      key: 'employee',
      header: t('kpi.colEmployee'),
      skeleton: 'w-40',
      rowLink: true,
      cell: (p) => (
        <span className="flex min-w-0 items-center gap-2">
          <Avatar src={p.employee?.photo_thumb_path} fallbackSrc={p.employee?.photo_path} name={p.employee?.legal_name} size={28} />
          <span className="truncate font-medium text-fg">{p.employee?.legal_name ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'department',
      header: t('kpi.colDepartment'),
      skeleton: 'w-32',
      className: 'text-fg-muted',
      cell: (p) => <span className="line-clamp-2">{lt(p.department_name) || '—'}</span>,
    },
    {
      key: 'period',
      header: t('kpi.colPeriod'),
      skeleton: 'w-28',
      className: 'whitespace-nowrap tabular-nums text-fg-muted',
      cell: (p) => (p.interval?.begin_date ? formatRange(p.interval.begin_date, p.interval.end_date) : p.interval?.name ?? '—'),
    },
    {
      key: 'args',
      header: t('kpi.colArguments'),
      headerClassName: 'text-center',
      className: 'text-center tabular-nums text-fg-muted',
      skeleton: 'w-8',
      cell: (p) => (p.arguments ?? []).length,
    },
    {
      key: 'weights',
      header: t('kpi.colWeightsSum'),
      headerClassName: 'text-right',
      className: 'text-right tabular-nums',
      skeleton: 'w-10',
      cell: (p) => num(p.weights_sum),
    },
    {
      key: 'result',
      header: t('kpi.colResult'),
      headerClassName: 'text-center',
      className: 'text-center',
      skeleton: 'w-12',
      cell: (p) => (
        <span className={cn('inline-block min-w-12 rounded-pill px-2 py-0.5 text-[12px] font-bold tabular-nums', TONE_TEXT[percentTone(p.result_percent)])}>
          {pct(p.result_percent)}
        </span>
      ),
    },
    {
      key: 'live',
      // The official result counts finished arguments only; these two count
      // every argument, so where a scorecard is heading shows before it is done.
      header: <span title={t('kpi.liveResultHint')}>{t('kpi.colLiveResult')}</span>,
      label: t('kpi.colLiveResult'),
      headerClassName: 'text-center',
      className: 'text-center tabular-nums',
      skeleton: 'w-10',
      cell: (p) => (p.live_result_percent != null ? pct(p.live_result_percent) : '—'),
    },
    {
      key: 'liveWeight',
      header: <span title={t('kpi.liveWeightHint')}>{t('kpi.colLiveWeight')}</span>,
      label: t('kpi.colLiveWeight'),
      headerClassName: 'text-right',
      className: 'text-right tabular-nums text-fg-muted',
      skeleton: 'w-10',
      cell: (p) => num(p.live_fact_weight),
    },
    {
      key: 'status',
      header: t('kpi.colStatus'),
      skeleton: 'w-20',
      cell: (p) => (
        <KpiStatusMenu
          status={p.status}
          onAction={
            acc.manager
              ? (a) => run(() => mut.performanceStatus.mutateAsync({ id: p.id, action: a }), () => t('kpi.statusChanged'))
              : undefined
          }
          allowed={perfAllowed}
        />
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'whitespace-nowrap text-right',
      cell: (p) => (
        <span className="inline-flex gap-0.5">
          {canArgs && (
            <IconButton size="sm" label={t('kpi.colArguments')} onClick={() => setDrawerId(p.id)}>
              <ListPlus size={14} />
            </IconButton>
          )}
          {canCopy && (
            <IconButton size="sm" label={t('kpi.copySheet')} onClick={() => setCopying(p)}>
              <Copy size={14} />
            </IconButton>
          )}
          {canDelete && (
            <IconButton size="sm" label={t('common.delete')} onClick={() => remove(p)}>
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
        <Combobox
          value={filters.iv}
          onChange={(v) => setFilter('iv', v)}
          options={[...intervals].sort(newestFirst).map((iv) => ({
            value: String(iv.id),
            label: iv.name || formatRange(iv.begin_date, iv.end_date),
            subLabel: formatRange(iv.begin_date, iv.end_date),
          }))}
          placeholder={t('kpi.pickInterval')}
          clearable={false}
          className="w-full lg:w-64"
        />
        <SearchInput value={search} onChange={setSearch} placeholder={t('kpi.searchEmployee')} className="flex-1 lg:max-w-xs" />
        <Combobox
          value={filters.sdept}
          onChange={(v) => setFilter('sdept', v)}
          options={departments}
          placeholder={t('kpi.allDepartments')}
          className="w-full lg:w-52"
        />
        <Combobox
          value={filters.sst}
          onChange={(v) => setFilter('sst', v)}
          options={PERF_STATUSES.map((s) => ({ value: s, label: t(`kpi.status${s}` as never) }))}
          placeholder={t('kpi.allStatuses')}
          className="w-full lg:w-40"
        />
        <PositionGroupFilter value={filters.spg} onChange={(v) => setFilter('spg', v)} />
        <FilterReset count={activeFilterCount - (filters.iv ? 1 : 0)} onReset={() => { reset(); }} />
        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <Button
            size="sm"
            variant="outline"
            leftIcon={<Download size={14} />}
            loading={exporting}
            disabled={!filters.iv}
            onClick={async () => {
              setExporting(true)
              try {
                await exportPerformances(query)
              } catch (e) {
                toast.error(errorMessage(e, t('kpi.exportFailed')))
              } finally {
                setExporting(false)
              }
            }}
          >
            Excel
          </Button>
          {canGenerate && (
            <Button size="sm" variant="secondary" leftIcon={<CalendarPlus size={14} />} loading={mut.generateMonthScorecards.isPending} onClick={generateMonth}>
              {t('kpi.generateMonthSheets')}
            </Button>
          )}
          {canGenerate && intervalId && (
            <>
              <Button size="sm" variant="secondary" leftIcon={<CalendarCheck2 size={14} />} loading={mut.generateScorecards.isPending} onClick={generate}>
                {t('kpi.generateSheets')}
              </Button>
              <Button size="sm" variant="secondary" leftIcon={<Flag size={14} />} loading={mut.finalizeInterval.isPending} onClick={finalize}>
                {t('kpi.finalize')}
              </Button>
              <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setCreating(true)}>
                {t('kpi.newSheets')}
              </Button>
            </>
          )}
        </div>
      </div>

      <DataTable
        tableId="kpi-performances"
        rows={filters.iv ? list.rows : []}
        columns={columns}
        loading={!!filters.iv && list.loading}
        error={list.error}
        onRetry={list.refetch}
        selection={acc.manager ? selection : undefined}
        rowHref={(p) => `/kpi/performances/${p.id}`}
        emptyTitle={filters.iv ? t('kpi.sheetsEmpty') : t('kpi.pickIntervalHint')}
        filtered={activeFilterCount - (filters.iv ? 1 : 0) > 0}
        emptyAction={<FilterReset count={activeFilterCount - (filters.iv ? 1 : 0)} onReset={reset} />}
        minWidth={1160}
      />
      {filters.iv && (
        <Pagination page={page} size={size} total={list.total} pages={list.pages} onPage={setPage} onSize={setSize} loading={list.fetching} />
      )}

      {acc.manager && (
        <BulkBar count={selection.count} onClear={selection.clear}>
          {bulkAllowed('set_in_progress') && (
            <Button size="sm" variant="secondary" leftIcon={<PlayCircle size={14} />} loading={mut.performancesBulkStatus.isPending} onClick={() => bulkStatus('set_in_progress')}>
              {t('kpi.bulkInProgress')}
            </Button>
          )}
          {bulkAllowed('set_done') && (
            <Button size="sm" leftIcon={<CheckCircle2 size={14} />} loading={mut.performancesBulkStatus.isPending} onClick={() => bulkStatus('set_done')}>
              {t('kpi.bulkDone')}
            </Button>
          )}
          {bulkAllowed('clear_done') && (
            <Button size="sm" variant="secondary" leftIcon={<Undo2 size={14} />} loading={mut.performancesBulkStatus.isPending} onClick={() => bulkStatus('clear_done')}>
              {t('kpi.bulkReturn')}
            </Button>
          )}
        </BulkBar>
      )}

      <PerformanceDrawer id={drawerId} onClose={() => setDrawerId(null)} />
      <SheetsModal
        open={creating}
        intervals={intervals}
        intervalId={intervalId}
        onClose={() => setCreating(false)}
      />
      <SheetsModal
        open={!!copying}
        source={copying}
        intervals={intervals}
        intervalId={intervalId}
        onClose={() => setCopying(null)}
      />
    </Card>
  )
}

/**
 * Open scorecards for chosen people (`performances/bulk`) — or, with
 * `source`, copy a scorecard's arguments to other people and/or another
 * period (`performances/{id}/copy`; fact and result are not copied).
 */
function SheetsModal({
  open,
  source,
  intervals,
  intervalId,
  onClose,
}: {
  open: boolean
  source?: KpiPerformance | null
  intervals: KpiInterval[]
  intervalId: number | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useKpiMutations()
  const [people, setPeople] = useState<PickedPerson[]>([])
  const [iv, setIv] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setPeople([])
    setIv(intervalId ? String(intervalId) : '')
    setError('')
  }, [open, intervalId])

  const submit = async () => {
    const ids = people.map((p) => p.id)
    try {
      if (source) {
        if (!ids.length && (!iv || Number(iv) === source.interval_id)) return setError(t('kpi.copyTargetRequired'))
        const r = await mut.copyPerformance.mutateAsync({
          id: source.id,
          body: { employee_ids: ids.length ? ids : undefined, interval_id: iv ? Number(iv) : undefined },
        })
        toast.ok(t('kpi.sheetsCopied', { created: r?.created ?? 0, skipped: r?.skipped ?? 0 }))
      } else {
        if (!ids.length) return setError(t('kpi.employeeRequired'))
        const r = await mut.createPerformancesBulk.mutateAsync({ employee_ids: ids, interval_id: iv ? Number(iv) : null })
        toast.ok(t('kpi.sheetsGenerated', { created: r?.created ?? 0, skipped: r?.skipped ?? 0 }))
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
      size="md"
      title={source ? t('kpi.copySheet') : t('kpi.newSheets')}
      description={source ? source.employee?.legal_name ?? undefined : t('kpi.newSheetsHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={mut.copyPerformance.isPending || mut.createPerformancesBulk.isPending}>
            {source ? t('kpi.copy') : t('kpi.createSheets')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('kpi.employees')} required={!source}>
          <EmployeeMultiPicker value={people} onChange={setPeople} placeholder={t('kpi.pickEmployees')} />
        </Field>
        <Field label={t('kpi.interval')} hint={source ? t('kpi.copyIntervalHint') : undefined}>
          <Combobox
            value={iv}
            onChange={setIv}
            options={[...intervals].sort(newestFirst).map((x) => ({ value: String(x.id), label: x.name || formatRange(x.begin_date, x.end_date) }))}
            placeholder={t('kpi.currentMonth')}
            className="w-full"
          />
        </Field>
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}
