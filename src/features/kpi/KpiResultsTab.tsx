import { useTranslation } from 'react-i18next'
import { FormError } from '@/components/ui/FormError'
import { CalendarPlus, Copy, Download, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useEffect, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { Select } from '@/components/ui/Select'
import { Pagination } from '@/components/data/Pagination'
import { useListParams } from '@/hooks/useListParams'
import { SearchInput } from '@/components/data/SearchInput'
import { DateInput } from '@/components/ui/DateInput'
import { isInvalidRange } from '@/lib/dateRange'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { cn } from '@/lib/cn'
import { formatPeriod, isPenalty } from './useKpi'
import { useIndicators, useKpiEntries, useKpiAdminMutations } from './useKpiAdmin'
import { useKpiOps } from './useKpiOps'
import { useToast } from '@/components/ui/Toast'
import { XLSX_MIME, downloadFile } from '@/lib/download'
import { KPI_EXPORT_ENTRIES } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { TH, TD, TD_MESSAGE } from '@/components/data/tableStyles'
import { Checkbox } from '@/components/ui/Checkbox'
import { BulkBar } from '@/components/data/BulkBar'
import { useConfirm } from '@/components/data/useConfirm'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import type { KpiEntry } from './useKpi'

/** Status tone: finished green, in progress blue, locked neutral. */
const ENTRY_STATUS_TONE: Record<string, string> = {
  D: 'bg-success-soft text-success',
  I: 'bg-info-soft text-info',
  N: 'bg-warning-soft text-warning',
  locked: 'bg-surface-2 text-fg-muted',
}

const ENTRY_STATUS_KEY: Record<string, string> = {
  draft: 'kpi.statusDraft',
  N: 'kpi.statusN',
  I: 'kpi.statusI',
  D: 'kpi.statusD',
  locked: 'kpi.statusLocked',
}
const STATUS_VALUES = ['draft', 'N', 'I', 'D', 'locked']

/** Verifix "Natijalar" — every KPI entry, server-paginated and filterable. */
export function KpiResultsTab({ onOpenEntry }: { onOpenEntry: (id: number) => void }) {
  const { t } = useTranslation()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, reset } =
    useListParams(['indicator', 'dept', 'pos', 'st', 'from', 'to'])

  const { indicators } = useIndicators()
  /**
   * ⚠️ THESE ARE FILTER DROPDOWNS, so they need the WHOLE reference list —
   * they used to read `useStructure('', 1, 25, …)`, i.e. the structure
   * MANAGEMENT screen's paged query, and therefore offered only the FIRST 25
   * departments: in a branch with 376 of them most were unselectable. It also
   * fetched the same rows a second time under a different queryKey than the
   * reference hooks every other form uses (measured on /kpi: `job-positions`
   * requested twice, once with size=25 and once with size=500).
   */
  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()
  const ops = useKpiOps()
  const mut = useKpiAdminMutations()
  const toast = useToast()
  const confirm = useConfirm()
  const [exporting, setExporting] = useState(false)
  const [busy, setBusy] = useState(false)
  /** null = closed; `{row: null}` = create. */
  const [editing, setEditing] = useState<{ row: KpiEntry | null; copy?: boolean } | null>(null)
  const [deleting, setDeleting] = useState<KpiEntry | null>(null)

  const rangeInvalid = isInvalidRange(filters.from, filters.to)
  const { entries, total, pages, loading, loadAll } = useKpiEntries(
    {
      search,
      indicatorId: filters.indicator,
      departmentId: filters.dept,
      jobPositionId: filters.pos,
      status: filters.st,
      from: filters.from,
      to: filters.to,
      page,
      size,
    },
    { enabled: !rangeInvalid },
  )

  const activeFilters =
    !!(filters.indicator || filters.dept || filters.pos || filters.st || filters.from || filters.to) ||
    !!search
  const foldedCount = [filters.indicator, filters.dept, filters.pos, filters.st, filters.from || filters.to].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)

  // Statuses of rows ticked through «select all N» that are not on this page:
  // the per-row status action is derived from the row's CURRENT status.
  const offPageStatus = useRef(new Map<number, string | null | undefined>())
  const selection = useRowSelection(entries as (KpiEntry & { id: number })[], {
    total,
    loadAllIds: () =>
      loadAll().then((rows) => {
        offPageStatus.current = new Map(rows.map((r) => [r.id, r.status]))
        return rows.map((r) => r.id)
      }),
    resetKey: JSON.stringify([search, filters.indicator, filters.dept, filters.pos, filters.st, filters.from, filters.to]),
  })

  const run = async (p: Promise<unknown>, msg: string) => {
    setBusy(true)
    try {
      await p
      mut.invalidate()
      toast.ok(msg)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Ommaviy status — HAR QATOR ALOHIDA. `entries/{id}/status` bir yozuvni
   * oladi (varaqalardagi `bulk-status` dan farqli); shu bois qaysilari
   * o'tmaganini SANAB, jimgina "bajarildi" demaymiz.
   */
  const bulkStatus = async (next: string) => {
    const ids = selection.selectedIds
    if (ids.length === 0) return
    if (!(await confirm({ kind: 'status', count: ids.length }))) return
    setBusy(true)
    let ok = 0
    for (const id of ids) {
      const row = entries.find((e) => e.id === id)
      const current = row ? row.status : offPageStatus.current.get(id)
      try {
        await ops.setEntryStatus.mutateAsync({ id, current, status: next })
        ok += 1
      } catch {
        /* keyingisiga o'tamiz — sabab har qatorda boshqa bo'lishi mumkin */
      }
    }
    mut.invalidate()
    selection.clear()
    setBusy(false)
    if (ok === ids.length) toast.ok(t('kpi.bulkEntriesDone', { count: ok }))
    else toast.info(t('kpi.bulkPartial', { changed: ok, total: ids.length }))
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        {/* Debounced — this used to fire /kpi/entries on every keystroke. */}
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t('kpi.resultsSearch')}
          className="w-64 max-w-full"
        />
        {/* Six narrowing controls fold behind «Filtrlar» (redesign 2026-09-24);
            the badge counts the ones in effect. */}
        <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
        {activeFilters && (
          <Button variant="ghost" size="sm" onClick={reset}>
            {t('kpi.reset')}
          </Button>
        )}

        {/* The monthly run and the export — both were only in v1. */}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" leftIcon={<Plus size={14} />} onClick={() => setEditing({ row: null })}>
            {t('kpi.newEntry')}
          </Button>
          <ActionMenu
            label={t('staff.more')}
            icon={<MoreHorizontal size={14} />}
            width={300}
            items={[
              {
                key: 'gen',
                label: t('kpi.generateEntries'),
                icon: <CalendarPlus size={14} />,
                loading: ops.generateMonthEntries.isPending,
                onClick: async () => {
                  if (!(await confirm({ kind: 'action', confirmLabel: t('kpi.generateEntries') }))) return
                  try {
                    const r = await ops.generateMonthEntries.mutateAsync()
                    toast.ok(t('kpi.generatedCount', { count: r?.created ?? 0 }))
                  } catch (e) {
                    toast.error(errorMessage(e, t('kpi.generateFailed')))
                  }
                },
              },
              {
                key: 'excel',
                label: 'Excel',
                icon: <Download size={14} />,
                loading: exporting,
                onClick: async () => {
                  setExporting(true)
                  try {
                    await downloadFile({
                      url: KPI_EXPORT_ENTRIES,
                      mime: XLSX_MIME,
                      filename: `KPI_natijalar_${dayjs().format('DD.MM.YYYY')}.xlsx`,
                      params: {
                        search: search || undefined,
                        indicator_id: filters.indicator || undefined,
                        department_id: filters.dept || undefined,
                        job_position_id: filters.pos || undefined,
                        status: filters.st || undefined,
                        // The PERIOD travels too: the export takes the list's aliases.
                        from: filters.from || undefined,
                        to: filters.to || undefined,
                      },
                    })
                    toast.ok(t('kpi.exported'))
                  } catch (e) {
                    toast.error(errorMessage(e, t('kpi.exportFailed')))
                  } finally {
                    setExporting(false)
                  }
                },
              },
            ]}
          />
        </div>

        {filtersOpen && (
          <div className="grid w-full grid-cols-1 items-center gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
            <Combobox
              value={filters.indicator}
              onChange={(v) => setFilter('indicator', v)}
              placeholder={t('kpi.filterIndicator')}
              options={indicators.map((i) => ({ value: String(i.id), label: i.name ?? '' }))}
            />
            <Combobox value={filters.dept} onChange={(v) => setFilter('dept', v)} placeholder={t('kpi.filterDepartment')} options={departments} />
            <Combobox value={filters.pos} onChange={(v) => setFilter('pos', v)} placeholder={t('kpi.filterPosition')} options={positions} />
            <Select
              value={filters.st}
              onChange={(e) => setFilter('st', e.target.value)}
              // A placeholder OPTION is not a label — the select needs its own name.
              aria-label={t('kpi.filterStatus')}
              placeholder={t('kpi.filterStatus')}
              options={STATUS_VALUES.map((s) => ({ value: s, label: t(ENTRY_STATUS_KEY[s] as never) }))}
            />
            {/* One flex item, so the pair never splits across rows. */}
            <div className="flex items-center gap-2">
              <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} aria-label={t('kpi.filterFrom')} className="w-36" invalid={rangeInvalid} />
              <span className="text-fg-subtle">—</span>
              <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} aria-label={t('kpi.filterTo')} className="w-36" invalid={rangeInvalid} />
            </div>
            {rangeInvalid && <p role="alert" className="w-full text-xs text-danger">{t('list.invalidRange')}</p>}
          </div>
        )}
      </div>

      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth: 860 }}>
          <thead>
            <tr className="border-b border-line text-[11.5px] font-semibold text-fg-muted">
              <th className={cn(TH, 'w-9')}>
                <Checkbox
                  checked={selection.allOnPageSelected}
                  indeterminate={selection.someOnPageSelected}
                  onChange={selection.toggleAllOnPage}
                  srLabel={t('list.selectAllOnPage')}
                />
              </th>
              <th className={TH}>{t('kpi.colEmployee')}</th>
              <th className={TH}>{t('kpi.colIndicator')}</th>
              <th className={TH}>{t('kpi.colPeriod')}</th>
              <th className={cn(TH, "text-right")}>{t('kpi.colPlan')}</th>
              <th className={cn(TH, "text-right")}>{t('kpi.colFact')}</th>
              <th className={cn(TH, "text-right")}>{t('kpi.colResult')}</th>
              <th className={TH}>{t('kpi.colStatus')}</th>
              <th className={TH} aria-label={t('kpi.okrColActions')} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className={TD_MESSAGE}>
                  …
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={9} className={TD_MESSAGE}>
                  {t('kpi.resultsEmpty')}
                </td>
              </tr>
            ) : (
              entries.map((e) => {
                const penalty = isPenalty(e)
                return (
                  <tr
                    key={e.id}
                    onClick={() => onOpenEntry(e.id)}
                    className="cursor-pointer border-b border-line text-sm transition-colors last:border-0 hover:bg-surface-2"
                  >
                    <td className={TD} onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox
                        checked={selection.isSelected(e.id)}
                        onChange={() => selection.toggle(e.id)}
                        srLabel={e.employee?.legal_name ?? String(e.id)}
                      />
                    </td>
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <Avatar src={e.employee?.photo_thumb_path} name={e.employee?.legal_name} size={28} />
                        <span className="truncate font-medium text-fg">
                          {e.employee?.legal_name ?? '—'}
                        </span>
                      </div>
                    </td>
                    {/* Indicator names run to 200 characters («Xodimning oylik
                        ish-rejasining aniq maqsadli…»): unclamped they made
                        every row 165 px tall on a desktop and 500 px on a
                        phone. Two lines here, the full text on hover. */}
                    <td className={cn(TD, 'max-w-[320px]', penalty ? 'text-danger' : 'text-fg-muted')} title={e.indicator?.name ?? undefined}>
                      <span className="line-clamp-1">
                        {penalty && <span className="mr-1 font-bold">{t('kpi.penalty')} −</span>}
                        {e.indicator?.name ?? '—'}
                      </span>
                    </td>
                    <td className={cn(TD, "text-fg-subtle")}>
                      {formatPeriod(e.period_start?.slice(0, 7))}
                    </td>
                    <td className={cn(TD, "text-right tabular-nums text-fg-muted")}>{e.plan_value ?? 0}</td>
                    <td className={cn(TD, "text-right tabular-nums text-fg-muted")}>{e.fact_value ?? 0}</td>
                    <td
                      className={cn(TD, 'text-right font-semibold tabular-nums', penalty ? 'text-danger' : 'text-fg')}
                    >
                      <span className="flex items-center justify-end gap-2">
                        {!penalty && (
                          <span className="h-1.5 w-14 overflow-hidden rounded-pill bg-fg/[0.07]">
                            <span
                              className={cn('block h-full rounded-pill', (e.result_percent ?? 0) >= 80 ? 'bg-[#22C55E]' : (e.result_percent ?? 0) >= 50 ? 'bg-[#F5A524]' : 'bg-[#E5484D]')}
                              style={{ width: `${Math.max(0, Math.min(100, e.result_percent ?? 0))}%` }}
                            />
                          </span>
                        )}
                        {Math.round(e.result_percent ?? 0)}%
                      </span>
                    </td>
                    <td className={TD}>
                      <span className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', ENTRY_STATUS_TONE[e.status ?? 'draft'] ?? 'bg-surface-2 text-fg-muted')}>
                        {t((ENTRY_STATUS_KEY[e.status ?? 'draft'] ?? 'kpi.statusDraft') as never)}
                      </span>
                    </td>
                    <td className={TD} onClick={(ev) => ev.stopPropagation()}>
                      <span className="flex gap-1">
                        <Button size="icon" variant="ghost" aria-label={t('common.edit')} onClick={() => setEditing({ row: e })}>
                          <Pencil size={14} />
                        </Button>
                        {/* Nusxalash — o'tgan davrning qatorini qayta yozmaslik uchun. */}
                        <Button size="icon" variant="ghost" aria-label={t('kpi.okrCopy')} onClick={() => setEditing({ row: e, copy: true })}>
                          <Copy size={14} />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={t('common.delete')} onClick={() => setDeleting(e)}>
                          <Trash2 size={14} className="text-danger" />
                        </Button>
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-line p-3">
        <span className="text-sm text-fg-muted">{t('kpi.resultsTotal', { count: total })}</span>
        <Pagination page={page} pages={pages} size={size} total={total} onPage={setPage} onSize={setSize} />
      </div>

      <BulkBar
        count={selection.count}
        onClear={selection.clear}
        total={selection.total}
        onSelectAll={selection.selectAllMatching}
        selectingAll={selection.selectingAll}
      >
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulkStatus('I')}>
          {t('kpi.bulkInProgress')}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => bulkStatus('D')}>
          {t('kpi.bulkFinalize')}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => bulkStatus('N')}>
          {t('kpi.bulkToNew')}
        </Button>
      </BulkBar>

      <EntryModal
        state={editing}
        indicators={indicators as { id: number; name?: string | null }[]}
        onClose={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null)
          mut.invalidate()
          toast.ok(msg)
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const row = deleting
          setDeleting(null)
          if (row) await run(mut.removeEntry.mutateAsync(row.id), t('kpi.entryDeleted'))
        }}
        danger
        title={t('kpi.deleteEntryTitle')}
        description={deleting?.indicator?.name ?? ''}
        confirmLabel={t('common.delete')}
      />
    </Card>
  )
}

/**
 * Bitta KPI yozuvi — yaratish, tahrirlash yoki NUSXALASH.
 *
 * ⚠️ Server tahrirda indikator/xodim/davrni O'ZGARTIRMAYDI (`KpiEntryUpdate`
 * ularni umuman olmaydi) — shu bois tahrirda o'sha maydonlar qulflanadi.
 * Nusxalash esa YANGI yozuv: hammasi ochiq, fakt esa noldan boshlanadi.
 */
function EntryModal({
  state,
  indicators,
  onClose,
  onSaved,
}: {
  state: { row: KpiEntry | null; copy?: boolean } | null
  indicators: { id: number; name?: string | null }[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { t } = useTranslation()
  const mut = useKpiAdminMutations()
  const row = state?.row ?? null
  const isEdit = !!row && !state?.copy
  const [form, setForm] = useState({
    indicator_id: '',
    employee_id: '',
    employee_name: '',
    period_start: '',
    period_end: '',
    plan_value: '0',
    fact_value: '0',
    note: '',
  })
  const [empQuery, setEmpQuery] = useState('')
  const { employees } = useEmployeeSearch(null, !isEdit && empQuery.trim().length > 0, empQuery)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!state) return
    setError(null)
    setEmpQuery('')
    const startOfMonth = dayjs().startOf('month')
    setForm({
      indicator_id: row?.indicator_id ? String(row.indicator_id) : '',
      employee_id: row?.employee_id ? String(row.employee_id) : '',
      employee_name: row?.employee?.legal_name ?? '',
      period_start: row?.period_start?.slice(0, 10) ?? startOfMonth.format('YYYY-MM-DD'),
      period_end: row?.period_end?.slice(0, 10) ?? startOfMonth.endOf('month').format('YYYY-MM-DD'),
      plan_value: String(row?.plan_value ?? 0),
      // A copy starts the fact at zero — the point is a fresh period, not a
      // duplicate of last month's result.
      fact_value: state.copy ? '0' : String(row?.fact_value ?? 0),
      note: row?.note ?? '',
    })
  }, [state, row])

  const submit = async () => {
    setError(null)
    if (!form.indicator_id) return setError(t('kpi.entryIndicatorRequired'))
    if (!isEdit && !form.employee_id) return setError(t('kpi.entryEmployeeRequired'))
    try {
      if (isEdit) {
        // Only what changed: a plan/fact the server received is stored as a
        // MANUAL value, so re-sending the displayed «0» on an untouched entry
        // turned a formula-driven plan into a manual 0 (audit 2026-09-21).
        const plan = Number(form.plan_value) || 0
        const fact = Number(form.fact_value) || 0
        await mut.updateEntry.mutateAsync({
          id: row!.id,
          body: {
            ...(plan !== (Number(row!.plan_value) || 0) ? { plan_value: plan } : {}),
            ...(fact !== (Number(row!.fact_value) || 0) ? { fact_value: fact } : {}),
            note: form.note.trim() || null,
          },
        })
      } else {
        await mut.createEntry.mutateAsync({
          indicator_id: Number(form.indicator_id),
          employee_id: Number(form.employee_id),
          period_start: form.period_start,
          period_end: form.period_end,
          plan_value: Number(form.plan_value) || 0,
          fact_value: Number(form.fact_value) || 0,
          note: form.note.trim() || null,
        })
      }
      onSaved(t('kpi.saved'))
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const saving = mut.createEntry.isPending || mut.updateEntry.isPending

  return (
    <Modal
      open={!!state}
      onClose={onClose}
      title={isEdit ? t('kpi.editEntry') : t('kpi.newEntry')}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={saving}>{t('common.save')}</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('kpi.colIndicator')} required wide>
          <Combobox
            value={form.indicator_id}
            onChange={(v) => setForm((f) => ({ ...f, indicator_id: v }))}
            options={indicators.map((i) => ({ value: String(i.id), label: i.name ?? `#${i.id}` }))}
            placeholder={t('t2.pick')}
            disabled={isEdit}
          />
        </Field>
        <Field label={t('kpi.colEmployee')} required wide>
          {isEdit ? (
            <Input value={form.employee_name} disabled />
          ) : (
            <div className="flex flex-col gap-1.5">
              {form.employee_name && (
                <span className="text-[13px] text-fg">{form.employee_name}</span>
              )}
              <Input
                value={empQuery}
                onChange={(e) => setEmpQuery(e.target.value)}
                placeholder={t('common.search')}
              />
              {empQuery.trim() && employees.length > 0 && (
                <div className="max-h-40 overflow-auto rounded-lg border border-line">
                  {employees.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onClick={() => {
                        setForm((f) => ({ ...f, employee_id: String(emp.id), employee_name: emp.legal_name ?? '' }))
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
          )}
        </Field>
        <Field label={t('kpi.periodFrom')}>
          <DateInput
            value={form.period_start}
            onChange={(v) => setForm((f) => ({ ...f, period_start: v }))}
            disabled={isEdit}
          />
        </Field>
        <Field label={t('kpi.periodTo')}>
          <DateInput
            value={form.period_end}
            onChange={(v) => setForm((f) => ({ ...f, period_end: v }))}
            disabled={isEdit}
          />
        </Field>
        <Field label={t('kpi.colPlan')}>
          <Input type="number" value={form.plan_value} onChange={(e) => setForm((f) => ({ ...f, plan_value: e.target.value }))} />
        </Field>
        <Field label={t('kpi.colFact')}>
          <Input type="number" value={form.fact_value} onChange={(e) => setForm((f) => ({ ...f, fact_value: e.target.value }))} />
        </Field>
        <Field label={t('kpi.reviewNote')} wide>
          <Textarea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </Field>
      </div>
      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
