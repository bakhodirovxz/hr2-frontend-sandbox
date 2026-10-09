import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, History } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/data/Pagination'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterReset } from '@/components/data/FilterReset'
import { FilterToggle } from '@/components/data/FilterToggle'
import { TH, TD, TD_MESSAGE } from '@/components/data/tableStyles'
import { useListParams } from '@/hooks/useListParams'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { isInvalidRange } from '@/lib/dateRange'
import { inTashkent } from '@/lib/format'
import { cn } from '@/lib/cn'
import { formatPeriod } from './useKpi'
import { useKpiAudit, type KpiAuditRow } from './useKpiOps'

const EVENTS = ['created', 'updated', 'status_changed', 'recomputed', 'task_changed', 'deleted'] as const
const STATUSES = ['draft', 'N', 'I', 'D', 'locked'] as const

const STATUS_KEY: Record<string, string> = {
  draft: 'kpi.statusDraft',
  N: 'kpi.statusN',
  I: 'kpi.statusI',
  D: 'kpi.statusD',
  locked: 'kpi.statusLocked',
}

/** Event chips coloured by what happened — a journal of 30 identical grey
 *  pills gave no reason to look twice at a deletion. */
const EVENT_TONE: Record<string, string> = {
  created: 'bg-success-soft text-success',
  updated: 'bg-info/10 text-info',
  status_changed: 'bg-brand/10 text-brand-strong',
  recomputed: 'bg-surface-2 text-fg-muted',
  task_changed: 'bg-warning-soft text-warning',
  deleted: 'bg-danger-soft text-danger',
}

const num = (v?: number | null) => (v == null ? '—' : String(Math.round(Number(v) * 100) / 100))

/**
 * Source `hpm/audit/kpi_audit`: the branch-wide KPI change journal. One row
 * per change (who, when, what, on whose KPI), the figures as they stood after
 * it, and a «details» dialog with the before → after of every field (the
 * source `kpi_audit_details` grid). The per-entry history tab shows the same
 * rows for ONE entry; this is the place to answer «who touched KPIs today».
 */
export function KpiAuditTab() {
  const { t } = useTranslation()
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, activeFilterCount, reset } =
    useListParams(['afrom', 'ato', 'adept', 'aevent', 'ast'])
  const departments = useDepartmentOptions()
  const rangeInvalid = isInvalidRange(filters.afrom, filters.ato)
  const { rows, total, pages, loading, error } = useKpiAudit(
    {
      search,
      from: filters.afrom,
      to: filters.ato,
      departmentId: filters.adept,
      event: filters.aevent,
      status: filters.ast,
      page,
      size,
    },
    { enabled: !rangeInvalid },
  )
  const [detail, setDetail] = useState<KpiAuditRow | null>(null)
  const foldedCount = [filters.afrom, filters.ato, filters.adept, filters.aevent, filters.ast].filter(Boolean).length
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)

  const eventLabel = (e?: string | null) => (e ? (t(`kpi.event_${e}` as never, { defaultValue: e }) as string) : '—')
  const statusLabel = (s?: string | null) => (s ? (t((STATUS_KEY[s] ?? 'kpi.statusDraft') as never) as string) : '—')

  /** «before → after» only when the value changed; a plain value otherwise. */
  const delta = (cur?: number | null, prev?: number | null, hasPrev?: boolean) => {
    if (!hasPrev || prev == null || Number(prev) === Number(cur ?? NaN)) return <span>{num(cur)}</span>
    return (
      <span>
        <span className="text-fg-subtle line-through">{num(prev)}</span>
        <span className="mx-1 text-fg-subtle">→</span>
        <span className="font-semibold">{num(cur)}</span>
      </span>
    )
  }

  return (
    <Card className="flex flex-col">
      {/* Search stays out; dates, department, event and status fold away —
          six controls in one bar wrapped on every laptop. */}
      <div className="flex flex-col gap-2 border-b border-line p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder={t('kpi.sheetsSearch')} className="w-full max-w-xs" />
          <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
          <FilterReset count={activeFilterCount} onReset={reset} />
          <span className="ml-auto text-[12.5px] tabular-nums text-fg-subtle">{t('kpi.auditTotal', { count: total })}</span>
        </div>
        {filtersOpen && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <DateInput value={filters.afrom} onChange={(v) => setFilter('afrom', v)} aria-label={t('kpi.filterFrom')} invalid={rangeInvalid} />
            <DateInput value={filters.ato} onChange={(v) => setFilter('ato', v)} aria-label={t('kpi.filterTo')} invalid={rangeInvalid} />
            <Combobox value={filters.adept} onChange={(v) => setFilter('adept', v)} options={departments} placeholder={t('kpi.filterDepartment')} />
            <Combobox
              value={filters.aevent}
              onChange={(v) => setFilter('aevent', v)}
              options={EVENTS.map((e) => ({ value: e, label: eventLabel(e) }))}
              placeholder={t('kpi.auditAllEvents')}
            />
            <Combobox
              value={filters.ast}
              onChange={(v) => setFilter('ast', v)}
              options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
              placeholder={t('kpi.allStatuses')}
            />
          </div>
        )}
        {rangeInvalid && <p role="alert" className="text-xs text-danger">{t('list.invalidRange')}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left">
          <thead>
            <tr className="border-b border-line">
              <th className={TH}>{t('kpi.auditColTime')} · {t('kpi.auditColUser')}</th>
              <th className={TH}>{t('kpi.auditColEvent')}</th>
              <th className={TH}>{t('kpi.colEmployee')}</th>
              <th className={TH}>{t('kpi.colIndicator')}</th>
              <th className={TH}>{t('kpi.colStatus')}</th>
              <th className={cn(TH, 'text-right')}>{t('kpi.colPlan')}</th>
              <th className={cn(TH, 'text-right')}>{t('kpi.colFact')}</th>
              <th className={cn(TH, 'text-right')}>{t('kpi.colResult')}</th>
              <th className={TH} aria-label={t('kpi.okrColActions')} />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className={TD_MESSAGE}>
                  {t('common.loading')}
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={9} className={TD_MESSAGE}>
                  {t('kpi.historyDenied')}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-0">
                  <EmptyState icon={<History size={20} />} title={t('kpi.auditEmpty')} />
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setDetail(r)}
                  className="cursor-pointer border-b border-line text-sm transition-colors last:border-0 hover:bg-surface-2"
                >
                  {/* When and who in one cell: the name wrapped to three
                      lines in a column of its own and set every row's height. */}
                  <td className={cn(TD, 'max-w-[170px]')}>
                    <p className="whitespace-nowrap tabular-nums text-fg">
                      {r.created_at ? inTashkent(r.created_at).format('DD.MM.YYYY HH:mm') : '—'}
                    </p>
                    <p className="truncate text-[11.5px] text-fg-subtle" title={r.changed_by_name ?? undefined}>{r.changed_by_name ?? '—'}</p>
                  </td>
                  <td className={cn(TD, 'max-w-[220px]')}>
                    <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', EVENT_TONE[r.event ?? ''] ?? 'bg-surface-2 text-fg-muted')}>
                      {eventLabel(r.event)}
                    </span>
                    {r.note && <p className="mt-0.5 truncate text-[11.5px] text-fg-subtle" title={r.note}>{r.note}</p>}
                  </td>
                  <td className={cn(TD, 'max-w-[260px]')}>
                    <div className="flex items-center gap-2">
                      <Avatar src={r.employee?.photo_thumb_path} name={r.employee?.legal_name} size={24} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-fg">{r.employee?.legal_name ?? '—'}</p>
                        {r.department_name && <p className="truncate text-[11px] text-fg-subtle">{r.department_name}</p>}
                      </div>
                    </div>
                  </td>
                  <td className={cn(TD, 'max-w-[260px]')}>
                    <p className="truncate text-fg" title={r.indicator_name ?? undefined}>
                      {r.indicator_name ?? '—'}
                    </p>
                    <p className="text-[11px] text-fg-subtle">{formatPeriod(r.period_start?.slice(0, 7))}</p>
                  </td>
                  <td className={TD}>
                    {r.prev && r.prev.status && r.prev.status !== r.status ? (
                      <span className="text-xs">
                        <span className="text-fg-subtle line-through">{statusLabel(r.prev.status)}</span>
                        <span className="mx-1 text-fg-subtle">→</span>
                        <span className="font-semibold">{statusLabel(r.status)}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-fg-muted">{statusLabel(r.status)}</span>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{delta(r.plan_value, r.prev?.plan_value, !!r.prev)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{delta(r.fact_value, r.prev?.fact_value, !!r.prev)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>
                    {delta(r.result_percent, r.prev?.result_percent, !!r.prev)}
                    {r.result_percent != null && '%'}
                  </td>
                  <td className={cn(TD, 'w-8 text-fg-subtle')} aria-label={t('kpi.auditDetails')}>
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-line p-3">
        <Pagination page={page} pages={pages} size={size} total={total} onPage={setPage} onSize={setSize} />
      </div>

      <AuditDetailModal row={detail} onClose={() => setDetail(null)} />
    </Card>
  )
}

/** Source `kpi_audit_details`: field / before / current for one change. */
function AuditDetailModal({ row, onClose }: { row: KpiAuditRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const statusLabel = (s?: string | null) => (s ? (t((STATUS_KEY[s] ?? 'kpi.statusDraft') as never) as string) : '—')
  const fields: { key: string; label: string; before: string; current: string }[] = row
    ? [
        { key: 'status', label: t('kpi.colStatus'), before: statusLabel(row.prev?.status), current: statusLabel(row.status) },
        { key: 'plan_value', label: t('kpi.colPlan'), before: num(row.prev?.plan_value), current: num(row.plan_value) },
        { key: 'fact_value', label: t('kpi.colFact'), before: num(row.prev?.fact_value), current: num(row.fact_value) },
        { key: 'plan_manual', label: t('kpi.auditPlanManual'), before: num(row.prev?.plan_manual), current: num(row.plan_manual) },
        { key: 'fact_manual', label: t('kpi.auditFactManual'), before: num(row.prev?.fact_manual), current: num(row.fact_manual) },
        { key: 'result_coef', label: t('kpi.auditResultCoef'), before: num(row.prev?.result_coef), current: num(row.result_coef) },
        { key: 'result_percent', label: t('kpi.colResult'), before: num(row.prev?.result_percent), current: num(row.result_percent) },
      ]
    : []
  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={t('kpi.auditDetails')}
      description={
        row
          ? `${row.employee?.legal_name ?? '—'} · ${row.indicator_name ?? '—'} · ${
              row.created_at ? inTashkent(row.created_at).format('DD.MM.YYYY HH:mm') : ''
            } · ${row.changed_by_name ?? '—'}`
          : ''
      }
      size="sm"
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {row && !row.prev && <p className="mb-2 text-xs text-fg-subtle">{t('kpi.auditFirstRow')}</p>}
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line">
            <th className={TH}>{t('kpi.auditField')}</th>
            <th className={cn(TH, 'text-right')}>{t('kpi.auditBefore')}</th>
            <th className={cn(TH, 'text-right')}>{t('kpi.auditCurrent')}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const changed = !!row?.prev && f.before !== f.current
            return (
              <tr key={f.key} className={cn('border-b border-line last:border-0', changed && 'bg-brand-soft/40')}>
                <td className={TD}>{f.label}</td>
                <td className={cn(TD, 'text-right tabular-nums text-fg-muted')}>{row?.prev ? f.before : '—'}</td>
                <td className={cn(TD, 'text-right tabular-nums', changed && 'font-semibold')}>{f.current}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Modal>
  )
}
