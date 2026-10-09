import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Check, Copy, Download, Gift, Plus, RotateCcw, Play, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { BulkBar } from '@/components/data/BulkBar'
import { useConfirm } from '@/components/data/useConfirm'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import { useListParams } from '@/hooks/useListParams'
import { SearchInput } from '@/components/data/SearchInput'
import { useRowSelection } from '@/hooks/useRowSelection'
import { usePerformances, performanceParams, useKpiAdminMutations, type KpiPerformance } from './useKpiAdmin'
import { useIntervals } from './useKpiExtras'
import { Combobox } from '@/components/ui/Combobox'
import { MultiPicker } from '@/features/reports/MultiPicker'
import { FilterReset } from '@/components/data/FilterReset'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { useKpiOps } from './useKpiOps'
import { PerformanceDrawer } from './PerformanceDrawer'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { KPI_EXPORT_PERFORMANCES } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'

/** URL keys for the four filters v1 has always sent and v2 never did. */
const SHEET_FILTER_KEYS = ['interval', 'dept', 'status', 'bonus'] as const

const SHEET_STATUS_KEY: Record<string, string> = {
  draft: 'kpi.statusDraft',
  N: 'kpi.statusN',
  I: 'kpi.statusI',
  D: 'kpi.statusD',
  locked: 'kpi.statusLocked',
}

/** Verifix "Baholash varaqalari" — scorecards with executeMany bulk actions. */
export function KpiSheetsTab({ onNotice }: { onNotice: (kind: 'ok' | 'warn', text: string) => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(SHEET_FILTER_KEYS)
  const foldedCount = [filters.interval, filters.dept, filters.status, filters.bonus].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)
  const perfFilters = {
    intervalId: filters.interval,
    departmentId: filters.dept,
    status: filters.status,
    bonusAllowed: filters.bonus,
  }
  const { performances, total, pages, loading, error, refetch, loadAllIds } = usePerformances(search, page, size, perfFilters)
  const { intervals } = useIntervals()
  const departmentOptions = useDepartmentOptions()
  const confirm = useConfirm()
  const selection = useRowSelection(performances as (KpiPerformance & { id: number })[], {
    total,
    loadAllIds,
    resetKey: JSON.stringify([search, filters.interval, filters.dept, filters.status, filters.bonus]),
  })
  const mut = useKpiAdminMutations()
  const ops = useKpiOps()
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [openPerf, setOpenPerf] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<(KpiPerformance & { id: number }) | null>(null)
  const [copying, setCopying] = useState<(KpiPerformance & { id: number }) | null>(null)
  const [creating, setCreating] = useState(false)
  const [newEmployee, setNewEmployee] = useState<{ id: number; name: string } | null>(null)
  const [newInterval, setNewInterval] = useState('')
  const [empQuery, setEmpQuery] = useState('')
  const { employees: empCandidates } = useEmployeeSearch(null, creating && empQuery.trim().length > 0, empQuery)

  const runOne = async (p: Promise<unknown>, msg: string) => {
    try {
      await p
      mut.invalidate()
      onNotice('ok', msg)
    } catch (e) {
      onNotice('warn', errorMessage(e, t('common.actionFailed')))
    }
  }

  /**
   * ⚠️ THE SERVER'S VERBS, NOT OURS.
   *
   * `set_performance_status` accepts only set_in_progress / set_done /
   * clear_done / clear_in_progress and raises `kpi_bad_action` on anything
   * else. `bulk_status` swallows that per row and still answers 200 with
   * `{changed: 0}` — so sending 'in_progress' | 'finalize' | 'return', as this
   * screen used to, changed nothing while reporting success.
   */
  const BULK_ACTION = {
    in_progress: 'set_in_progress',
    finalize: 'set_done',
    return: 'clear_done',
  } as const

  const runBulk = async (kind: keyof typeof BULK_ACTION) => {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    if (!(await confirm({ kind: 'status', count: ids.length }))) return
    setBusy(true)
    try {
      // A row the server refuses is skipped, not fatal — so read the count back
      // rather than assuming every selected row moved.
      const res = await mut.bulkStatus.mutateAsync({ ids, action: BULK_ACTION[kind] })
      mut.invalidate()
      const changed = res?.changed ?? ids.length
      if (changed < ids.length) {
        onNotice('warn', t('kpi.bulkPartial', { changed, total: ids.length }))
      } else {
        onNotice('ok', t('kpi.bulkDone', { count: changed }))
      }
      selection.clear()
    } catch {
      onNotice('warn', t('kpi.bulkFailed'))
    } finally {
      setBusy(false)
    }
  }

  const columns: Column<KpiPerformance & { id: number }>[] = [
    {
      key: 'employee',
      header: t('kpi.colEmployee'),
      skeleton: 'w-44',
      cell: (r) => (
        <div className="flex items-center gap-2">
          <Avatar src={r.employee?.photo_thumb_path} name={r.employee?.legal_name} size={28} />
          <span className="truncate font-medium text-fg">{r.employee?.legal_name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'department',
      header: t('kpi.colDepartment'),
      skeleton: 'w-32',
      cell: (r) => <span className="truncate text-fg-muted">{r.department_name ?? '—'}</span>,
    },
    {
      key: 'interval',
      header: t('kpi.colInterval'),
      skeleton: 'w-32',
      cell: (r) => <span className="whitespace-nowrap text-fg-muted">{r.interval?.name ?? '—'}</span>,
    },
    {
      key: 'result',
      header: t('kpi.colResult'),
      className: 'text-right',
      skeleton: 'w-12',
      cell: (r) => (
        <span className="font-semibold tabular-nums text-fg">{Math.round(r.result_percent ?? 0)}%</span>
      ),
    },
    {
      // Source list: «Результат % (независимо от статуса)» — what the sheet
      // would read if every argument counted now, next to the frozen result.
      key: 'live',
      header: t('kpi.colLiveResult'),
      className: 'text-right',
      skeleton: 'w-12',
      cell: (r) => (
        <span className="tabular-nums text-fg-muted" title={t('kpi.colLiveResultHint')}>
          {r.live_result_percent == null ? '—' : `${Math.round(r.live_result_percent)}%`}
        </span>
      ),
    },
    // «Extra» columns (off by default, switched on in the column picker) —
    // the two the client's KPI admins added to this list in Verifix.
    {
      key: 'weights_sum',
      header: t('kpi.colWeightsSum'),
      defaultHidden: true,
      className: 'text-right tabular-nums text-fg-muted',
      cell: (r) => (r.weights_sum == null ? '—' : Number(r.weights_sum).toFixed(2)),
      sortValue: (r) => r.weights_sum ?? null,
    },
    {
      key: 'live_weight',
      header: t('kpi.colLiveWeight'),
      defaultHidden: true,
      className: 'text-right tabular-nums text-fg-muted',
      cell: (r) => (r.live_fact_weight == null ? '—' : Number(r.live_fact_weight).toFixed(2)),
      sortValue: (r) => r.live_fact_weight ?? null,
    },
    {
      key: 'status',
      header: t('kpi.colStatus'),
      skeleton: 'w-20',
      cell: (r) => (
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg-muted">
          {t((SHEET_STATUS_KEY[r.status ?? 'draft'] ?? 'kpi.statusDraft') as never)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      skeleton: 'w-24',
      cell: (r) => (
        <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {/* Mukofot huquqi — tumbler. `updatePerformance` v2 da UMUMAN yo'q
              edi, ya'ni varaqaning bonusga yaroqliligini o'zgartirib
              bo'lmasdi. */}
          <Button
            size="sm"
            variant={r.bonus_allowed ? 'secondary' : 'ghost'}
            title={t(r.bonus_allowed ? 'kpi.bonusAllowed' : 'kpi.bonusBlocked')}
            onClick={async () => {
              if (!(await confirm({ kind: 'status', subject: r.employee?.legal_name }))) return
              await runOne(
                mut.updatePerformance.mutateAsync({ id: r.id, body: { bonus_allowed: !r.bonus_allowed } }),
                t('kpi.saved'),
              )
            }}
          >
            <Gift size={14} />
          </Button>
          <Button size="icon" variant="ghost" aria-label={t('kpi.okrCopy')} onClick={() => setCopying(r)}>
            <Copy size={14} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('common.delete')}
            onClick={() => setDeleting(r)}
          >
            <Trash2 size={14} className="text-danger" />
          </Button>
        </span>
      ),
    },
  ]

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Debounced — this used to fire /kpi/entries on every keystroke. */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('kpi.sheetsSearch')}
          className="w-64 max-w-full"
        />
        {/* Four narrowing selects fold away: with three action buttons they
            wrapped the toolbar into two rows. The badge counts what is on. */}
        <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
        <FilterReset count={activeFilterCount} onReset={reset} />

        {/* The monthly run and the export — both were only in v1. */}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => { setNewEmployee(null); setEmpQuery(''); setNewInterval(''); setCreating(true) }}>
            {t('kpi.newSheet')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={ops.generateMonthScorecards.isPending}
            leftIcon={<CalendarPlus size={14} />}
            onClick={async () => {
              if (!(await confirm({ kind: 'action', confirmLabel: t('kpi.generateMonthScorecards') }))) return
              try {
                const r = await ops.generateMonthScorecards.mutateAsync()
                onNotice('ok', t('kpi.generatedSheetsCount', { count: r?.created ?? 0 }))
              } catch (e) {
                onNotice('warn', errorMessage(e, t('kpi.generateFailed')))
              }
            }}
          >
            {t('kpi.generateMonthScorecards')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={exporting}
            leftIcon={<Download size={14} />}
            onClick={async () => {
              setExporting(true)
              try {
                await downloadFile({
                  url: KPI_EXPORT_PERFORMANCES,
                  mime: XLSX_MIME,
                  filename: `KPI_varaqalar_${dayjs().format('DD.MM.YYYY')}.xlsx`,
                  // The file follows the TABLE, not just the search box.
                  params: performanceParams(search, perfFilters),
                })
                onNotice('ok', t('kpi.exported'))
              } catch (e) {
                onNotice('warn', errorMessage(e, t('kpi.exportFailed')))
              } finally {
                setExporting(false)
              }
            }}
          >
            Excel
          </Button>
        </div>
      </div>
      {filtersOpen && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Combobox
              value={filters.interval}
              onChange={(v) => setFilter('interval', v)}
              options={intervals.map((iv) => ({ value: String(iv.id), label: iv.name ?? `#${iv.id}` }))}
              placeholder={t('kpi.allIntervals')}
            />
            <Combobox
              value={filters.dept}
              onChange={(v) => setFilter('dept', v)}
              options={departmentOptions}
              placeholder={t('kpi.allDepartments')}
            />
            <Combobox
              value={filters.status}
              onChange={(v) => setFilter('status', v)}
              options={[
                { value: 'N', label: t('kpi.statusN') },
                { value: 'I', label: t('kpi.statusI') },
                { value: 'D', label: t('kpi.statusD') },
              ]}
              placeholder={t('kpi.allStatuses')}
            />
            <Combobox
              value={filters.bonus}
              onChange={(v) => setFilter('bonus', v)}
              options={[
                { value: 'true', label: t('kpi.bonusAllowed') },
                { value: 'false', label: t('kpi.bonusBlocked') },
              ]}
              placeholder={t('kpi.allBonus')}
            />
        </div>
      )}
      </div>

      <DataTable
        tableId="kpi-sheets"
        columns={columns}
        rows={performances as (KpiPerformance & { id: number })[]}
        loading={loading}
          error={error}
          onRetry={refetch}
        selection={selection}
        onRowClick={(r) => setOpenPerf(r.id)}
        emptyTitle={t('kpi.sheetsEmpty')}
        minWidth={720}
      />

      <div className="flex items-center justify-between gap-3 border-t border-line p-3">
        <span className="text-sm text-fg-muted">{t('kpi.sheetsTotal', { count: total })}</span>
        <Pagination page={page} pages={pages} size={size} total={total} onPage={setPage} onSize={setSize} />
      </div>

      <BulkBar
        count={selection.selectedIds.length}
        onClear={selection.clear}
        total={selection.total}
        onSelectAll={selection.selectAllMatching}
        selectingAll={selection.selectingAll}
      >
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => runBulk('in_progress')}>
          <Play size={14} /> {t('kpi.bulkInProgress')}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => runBulk('finalize')}>
          <Check size={14} /> {t('kpi.bulkFinalize')}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => runBulk('return')}>
          <RotateCcw size={14} /> {t('kpi.bulkReturn')}
        </Button>
      </BulkBar>

      <PerformanceDrawer
        performanceId={openPerf}
        onClose={() => setOpenPerf(null)}
        onOpenEntry={(entryId) => {
          setOpenPerf(null)
          navigate(`/kpi?tab=results&entry=${entryId}`)
        }}
      />

      {/* Bitta xodim uchun varaqa — v2 da faqat butun oyni generatsiya qilish
          bor edi, ya'ni oy o'rtasida ishga kirgan xodimga varaqa ochib
          bo'lmasdi. */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={t('kpi.newSheet')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={!newEmployee}
              loading={mut.createPerformance.isPending}
              onClick={async () => {
                if (!newEmployee) return
                setCreating(false)
                await runOne(
                  mut.createPerformance.mutateAsync({
                    employee_id: newEmployee.id,
                    // Bo'sh qoldirilsa server joriy oyni o'zi topadi.
                    interval_id: newInterval ? Number(newInterval) : null,
                  }),
                  t('kpi.saved'),
                )
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field label={t('kpi.colEmployee')} required>
            <div className="flex flex-col gap-1.5">
              {newEmployee && <span className="text-[13px] text-fg">{newEmployee.name}</span>}
              <Input
                value={empQuery}
                onChange={(e) => setEmpQuery(e.target.value)}
                placeholder={t('common.search')}
              />
              {empQuery.trim() && empCandidates.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-line">
                  {empCandidates.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        setNewEmployee({ id: emp.id, name: emp.legal_name ?? '' })
                        setEmpQuery('')
                      }}
                    >
                      <Avatar src={emp.photo_path} name={emp.legal_name ?? '?'} size={24} />
                      <span className="truncate">{emp.legal_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label={t('kpi.colInterval')} hint={t('kpi.sheetIntervalHint')}>
            <Combobox
              value={newInterval}
              onChange={setNewInterval}
              options={intervals.map((iv) => ({ value: String(iv.id), label: iv.name ?? `#${iv.id}` }))}
              placeholder={t('kpi.currentMonth')}
            />
          </Field>
        </div>
      </Modal>

      <CopySheetModal
        row={copying}
        intervals={intervals}
        onClose={() => setCopying(null)}
        loading={mut.copyPerformance.isPending}
        onCopy={async (employeeIds, intervalId) => {
          if (!copying) return
          try {
            const r = await mut.copyPerformance.mutateAsync({
              id: copying.id,
              employee_ids: employeeIds,
              interval_id: intervalId,
            })
            const created = r?.created?.length ?? 0
            const skipped = r?.skipped?.length ?? 0
            onNotice(
              created ? 'ok' : 'warn',
              skipped
                ? t('kpi.sheetCopiedPartial', { created, skipped })
                : t('kpi.sheetCopied', { count: created }),
            )
            setCopying(null)
          } catch (e) {
            onNotice('warn', errorMessage(e, t('kpi.bulkFailed')))
          }
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const row = deleting
          setDeleting(null)
          if (row) await runOne(mut.removePerformance.mutateAsync(row.id), t('kpi.sheetDeleted'))
        }}
        danger
        title={t('kpi.deleteSheetTitle')}
        description={deleting?.employee?.legal_name ?? ''}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}

/**
 * Source `employee_performance_list.copyModal`: the sheet's argument settings
 * (weights, calculation types, gradation) are copied to the chosen employees
 * and/or another interval as NEW sheets. Facts and results never travel. With
 * no employee chosen the copy goes to the same employee (another interval).
 */
function CopySheetModal({
  row,
  intervals,
  onClose,
  onCopy,
  loading,
}: {
  row: (KpiPerformance & { id: number }) | null
  intervals: { id: number; name?: string; begin_date?: string; end_date?: string }[]
  onClose: () => void
  onCopy: (employeeIds: number[], intervalId: number | null) => Promise<void>
  loading: boolean
}) {
  const { t } = useTranslation()
  const [employeeIds, setEmployeeIds] = useState<(string | number)[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [intervalId, setIntervalId] = useState('')
  const [q, setQ] = useState('')
  const { employees, loading: searching, hasMore, loadMore } = useEmployeeSearch(null, !!row, q)
  const open = !!row
  // Reset per opened sheet; the target list is never the previous one's.
  const [seenId, setSeenId] = useState<number | null>(null)
  if (row && row.id !== seenId) {
    setSeenId(row.id)
    setEmployeeIds([])
    setLabels({})
    setIntervalId('')
    setQ('')
  }
  const options = employees
    .filter((e) => e.id !== row?.employee?.id)
    .map((e) => ({
      value: e.id,
      label: e.legal_name ?? `#${e.id}`,
      sub: e.job_position_name ?? e.department_name ?? null,
      photo: e.photo_path ?? null,
    }))
  const sameEmployee = employeeIds.length === 0
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('kpi.copySheetTitle')}
      description={row?.employee?.legal_name ?? ''}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={loading}
            // Same employee + same interval would only hit «already exists».
            disabled={sameEmployee && !intervalId}
            onClick={() => onCopy(employeeIds.map(Number), intervalId ? Number(intervalId) : null)}
          >
            {t('kpi.okrCopy')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t('kpi.copySheetTargets')} hint={t('kpi.copySheetTargetsHint')}>
          <MultiPicker
            value={employeeIds}
            onChange={(next) => {
              setEmployeeIds(next)
              setLabels((prev) => {
                const out = { ...prev }
                for (const v of next) {
                  const o = options.find((x) => String(x.value) === String(v))
                  if (o) out[String(v)] = o.label
                }
                return out
              })
            }}
            options={options}
            onSearchChange={setQ}
            loading={searching}
            hasMore={hasMore}
            onLoadMore={loadMore}
            selectedLabels={labels}
            placeholder={t('common.search')}
            showPhotos
          />
        </Field>
        <Field label={t('kpi.colInterval')} hint={sameEmployee ? t('kpi.copySheetIntervalRequired') : t('kpi.copySheetIntervalHint')}>
          <Combobox
            value={intervalId}
            onChange={setIntervalId}
            options={intervals.map((iv) => ({ value: String(iv.id), label: iv.name ?? `#${iv.id}` }))}
            placeholder={sameEmployee ? t('common.choose') : t('kpi.copySheetSameInterval')}
          />
        </Field>
        <p className="text-xs text-fg-subtle">{t('kpi.copySheetNote')}</p>
      </div>
    </Modal>
  )
}
