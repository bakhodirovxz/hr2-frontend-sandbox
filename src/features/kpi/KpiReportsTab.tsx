import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { BarChart3, Download, Eye, FileSpreadsheet, FileText, Mail, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column } from '@/components/data/DataTable'
import { useConfirm } from '@/components/data/useConfirm'
import { TD, TH } from '@/components/data/tableStyles'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { MultiPicker } from '@/features/reports/MultiPicker'
import { useServerText } from '@/features/statistics/serverText'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { errorMessage } from '@/api/errorMessage'
import { isInvalidRange } from '@/lib/dateRange'
import { cn } from '@/lib/cn'
import {
  downloadReport,
  fmtDay,
  periodBounds,
  useGroupNames,
  useIndicators,
  useKpiMutations,
  useReportData,
  useReports,
  type KpiReport,
  type KpiReportInput,
  type PeriodType,
  type ReportGroupBy,
  type ReportType,
} from './api'
import { PERIOD_KEY } from './KpiIntervals'
import { useMonthOptions } from './KpiResultsTab'
import { useKpiAccess } from './useKpiAccess'
import { apiGet } from '@/api/http'
import { useListParams } from '@/hooks/useListParams'
import { ADMIN_SUPPORT, type TemplateParams } from './extApi'
import { PositionGroupFilter } from './PositionGroupControls'
import { KpiCompareView, ReportTemplatesBar, SendReportModal } from './ReportExtras'
import { numberLocale } from '@/lib/format'

// recharts (~420 KB) loads only when a report is opened.
const ReportBarChart = lazy(() => import('@/features/statistics/ReportBarChart'))

const REPORT_TYPES: ReportType[] = ['individual', 'department', 'summary']
const TYPE_KEY: Record<ReportType, string> = { individual: 'kpi.repIndividual', department: 'kpi.repDepartment', summary: 'kpi.repSummary' }
type PeriodMode = PeriodType | 'custom'
const PERIOD_MODES: PeriodMode[] = ['month', 'quarter', 'year', 'custom']
const MODE_KEY: Record<PeriodMode, string> = { ...PERIOD_KEY, custom: 'kpi.periodCustom' }
const GROUP_BY: { value: ReportGroupBy; key: string }[] = [
  { value: 'employee', key: 'kpi.groupByEmployee' },
  { value: 'department', key: 'kpi.groupByDepartment' },
  { value: 'indicator', key: 'kpi.groupByIndicator' },
  { value: 'group', key: 'kpi.groupByGroup' },
]
const SORTS: { value: string; key: string }[] = [
  { value: '-percent', key: 'kpi.sortPercentDesc' },
  { value: 'percent', key: 'kpi.sortPercentAsc' },
  { value: '-deviation_pct', key: 'kpi.sortDeviationDesc' },
  { value: 'deviation_pct', key: 'kpi.sortDeviationAsc' },
  { value: 'employee', key: 'kpi.sortEmployee' },
]
/** Report column keys → dictionary (the server's labels are Uzbek only). */
const COLUMN_KEY: Record<string, string> = {
  employee: 'kpi.colEmployee',
  department: 'kpi.colDepartment',
  position: 'kpi.colPosition',
  indicator: 'kpi.colIndicatorShort',
  group: 'kpi.colGroup',
  group_key: 'kpi.colGroup',
  key: 'kpi.colGrouping',
  plan: 'kpi.colPlan',
  fact: 'kpi.colFact',
  penalty: 'kpi.penalty',
  net: 'kpi.colNet',
  percent: 'kpi.colPercent',
  deviation_abs: 'kpi.colDeviation',
  deviation_pct: 'kpi.colDeviationPct',
  employees: 'kpi.employees',
  entries: 'kpi.colEntries',
}

/**
 * «Hisobot» (K3): build a KPI report — type, period, people, departments,
 * position, indicators, group, grouping and sorting — keep it in the list,
 * open it on screen (plan / fact / penalty chart + table) or download it as
 * Excel, PDF or Word.
 */
export function KpiReportsTab() {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const confirm = useConfirm()
  const acc = useKpiAccess()
  const mut = useKpiMutations()
  const canRun = acc.can('kpi_report', 'run')
  const { reports, loading, error, refetch } = useReports()
  const { indicators } = useIndicators({}, canRun)
  const groups = useGroupNames(indicators)
  const departments = useDepartmentOptions()
  const positions = useJobPositionOptions()
  const [opened, setOpened] = useState<KpiReport | null>(null)
  const [sending, setSending] = useState<KpiReport | null>(null)
  const monthOptions = useMonthOptions(36)
  // «Hisobotlar» | «Davrlarni solishtirish» (K3 · 1412 «Сравнение периодов»).
  const { filters, setFilter } = useListParams(['rv'])
  const view = filters.rv === 'compare' ? 'compare' : 'reports'

  const [type, setType] = useState<ReportType>('individual')
  const [mode, setMode] = useState<PeriodMode>('month')
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'))
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [title, setTitle] = useState('')
  const [people, setPeople] = useState<PickedPerson[]>([])
  const [deptIds, setDeptIds] = useState<(string | number)[]>([])
  const [posId, setPosId] = useState('')
  const [indIds, setIndIds] = useState<(string | number)[]>([])
  const [group, setGroup] = useState('')
  const [groupBy, setGroupBy] = useState<ReportGroupBy>('')
  const [sort, setSort] = useState('')
  const [pg, setPg] = useState('')
  const [err, setErr] = useState('')

  /** The builder's parameters as a template keeps them (K3 · 1412 «шаблон отчёта»). */
  const currentParams = (): TemplateParams => ({
    title: title.trim() || undefined,
    report_type: type,
    period_type: mode,
    employee_ids: people.length ? people.map((p) => p.id) : undefined,
    division_ids: deptIds.length ? deptIds.map(Number) : undefined,
    job_position_ids: posId ? [Number(posId)] : undefined,
    indicator_ids: indIds.length ? indIds.map(Number) : undefined,
    group_names: group ? [group] : undefined,
    group_by: groupBy || undefined,
    sort: sort || undefined,
    position_group: pg === ADMIN_SUPPORT ? ADMIN_SUPPORT : undefined,
  })
  const applyParams = (p: TemplateParams) => {
    setType(p.report_type && REPORT_TYPES.includes(p.report_type) ? p.report_type : 'individual')
    setMode(p.period_type && PERIOD_MODES.includes(p.period_type as PeriodMode) ? (p.period_type as PeriodMode) : 'month')
    setTitle(p.title ?? '')
    setDeptIds(p.division_ids ?? [])
    setPosId(p.job_position_ids?.[0] ? String(p.job_position_ids[0]) : '')
    setIndIds(p.indicator_ids ?? [])
    setGroup(p.group_names?.[0] ?? '')
    setGroupBy(p.group_by ?? '')
    setSort(p.sort ?? '')
    setPg(p.position_group ?? '')
    const ids = p.employee_ids ?? []
    setPeople(ids.map((id) => ({ id, legal_name: `#${id}` })))
    // A template keeps only ids — the names are looked up for the picker.
    if (ids.length)
      void Promise.all(
        ids.map((id) =>
          apiGet<{ id: number; legal_name?: string | null }>(`employees/${id}`)
            .then((e) => ({ id, legal_name: e.legal_name ?? `#${id}` }))
            .catch(() => ({ id, legal_name: `#${id}` })),
        ),
      ).then(setPeople)
  }

  const bounds = useMemo(() => {
    if (mode === 'custom') return from && to ? { start: from, end: to, label: `${fmtDay(from)} — ${fmtDay(to)}` } : null
    const b = periodBounds(mode, month ? `${month}-01` : null)
    if (!b) return null
    const d = dayjs(b.begin)
    const label =
      mode === 'year'
        ? t('kpi.autoYear', { y: d.year() })
        : mode === 'quarter'
          ? t('kpi.autoQuarter', { y: d.year(), q: Math.floor(d.month() / 3) + 1 })
          : d.format('MM.YYYY')
    return { start: b.begin, end: b.end, label }
  }, [mode, month, from, to, t])

  const create = async () => {
    setErr('')
    if (!bounds) return setErr(mode === 'custom' ? t('kpi.periodRequired') : t('kpi.monthRequired'))
    if (isInvalidRange(bounds.start, bounds.end)) return setErr(t('list.invalidRange'))
    const body: KpiReportInput = {
      title: title.trim() || `${t('kpi.reportTitleDefault')} — ${bounds.label}`,
      period_start: bounds.start,
      period_end: bounds.end,
      report_type: type,
      period_type: mode,
    }
    if (people.length) body.employee_ids = people.map((p) => p.id)
    if (deptIds.length) body.division_ids = deptIds.map(Number)
    if (posId) body.job_position_ids = [Number(posId)]
    if (indIds.length) body.indicator_ids = indIds.map(Number)
    if (group) body.group_names = [group]
    if (groupBy) body.group_by = groupBy
    if (sort) body.sort = sort
    if (pg === ADMIN_SUPPORT) body.position_group = ADMIN_SUPPORT
    try {
      const r = await mut.createReport.mutateAsync(body)
      setTitle('')
      toast.ok(t('kpi.reportCreated'))
      if (r?.id) setOpened(r)
    } catch (e) {
      setErr(errorMessage(e, t('kpi.reportFailed')))
    }
  }

  const download = async (r: KpiReport, format: 'xlsx' | 'pdf' | 'docx') => {
    try {
      await downloadReport(r.id, format)
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.downloadFailed')))
    }
  }

  const columns: Column<KpiReport>[] = [
    {
      key: 'title',
      header: t('kpi.reportTitle'),
      skeleton: 'w-48',
      cell: (r) => <span className={cn('font-medium text-fg', opened?.id === r.id && 'text-brand')}>{r.title || '—'}</span>,
    },
    {
      key: 'type',
      header: t('kpi.reportType'),
      skeleton: 'w-20',
      className: 'whitespace-nowrap text-fg-muted',
      cell: (r) => {
        const ty = r.filters?.report_type
        return (
          <>
            {ty && TYPE_KEY[ty] ? t(TYPE_KEY[ty] as never) : '—'}
            {r.filters?.position_group === ADMIN_SUPPORT && <span className="block text-[11.5px] text-fg-subtle">{t('kpiExt.adminSupport')}</span>}
          </>
        )
      },
    },
    {
      key: 'period',
      header: t('kpi.colPeriod'),
      skeleton: 'w-32',
      className: 'whitespace-nowrap tabular-nums text-fg-muted',
      cell: (r) => {
        const pt = r.filters?.period_type as PeriodMode | undefined
        return (
          <>
            {fmtDay(r.period_start)} — {fmtDay(r.period_end)}
            {pt && MODE_KEY[pt] && <span className="ml-1.5 text-[11.5px] text-fg-subtle">({t(MODE_KEY[pt] as never)})</span>}
          </>
        )
      },
    },
    { key: 'rows', header: t('kpi.colRows'), headerClassName: 'text-right', className: 'text-right tabular-nums', skeleton: 'w-8', cell: (r) => r.row_count ?? '—' },
    {
      key: 'actions',
      header: '',
      className: 'whitespace-nowrap text-right',
      cell: (r) => (
        <span className="inline-flex gap-0.5">
          <IconButton size="sm" label={t('kpi.view')} onClick={() => setOpened(r)}>
            <Eye size={14} />
          </IconButton>
          <IconButton size="sm" label={t('common.download')} onClick={() => download(r, 'xlsx')}>
            <Download size={14} />
          </IconButton>
          {canRun && (
            <IconButton size="sm" label={t('kpiExt.sendAction')} onClick={() => setSending(r)}>
              <Mail size={14} />
            </IconButton>
          )}
          {canRun && (
            <IconButton
              size="sm"
              label={t('common.delete')}
              onClick={async () => {
                if (!(await confirm({ kind: 'delete', subject: r.title }))) return
                try {
                  await mut.deleteReport.mutateAsync(r.id)
                  if (opened?.id === r.id) setOpened(null)
                  toast.ok(t('common.deleted'))
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                }
              }}
            >
              <Trash2 size={14} />
            </IconButton>
          )}
        </span>
      ),
    },
  ]

  const switcher = (
    <div className="scroll-thin overflow-x-auto">
      <Segmented
        size="sm"
        value={view}
        onChange={(v) => setFilter('rv', v === 'compare' ? 'compare' : '')}
        options={[
          { value: 'reports', label: t('kpiExt.viewReports') },
          { value: 'compare', label: t('kpiExt.compareTitle') },
        ]}
      />
    </div>
  )

  if (view === 'compare')
    return (
      <div className="flex flex-col gap-4">
        {switcher}
        <KpiCompareView />
      </div>
    )

  return (
    <div className="flex flex-col gap-4">
      {switcher}
      {canRun && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet size={17} className="text-brand" aria-hidden />
            <h3 className="text-[14px] font-semibold text-fg">{t('kpi.reportBuild')}</h3>
            <span className="text-[12px] text-fg-subtle">{t('kpi.reportFormats')}</span>
          </div>
          <ReportTemplatesBar current={currentParams} onApply={applyParams} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label={t('kpi.reportType')} wide>
              <Segmented value={type} onChange={setType} options={REPORT_TYPES.map((x) => ({ value: x, label: t(TYPE_KEY[x] as never) }))} />
            </Field>
            <Field label={t('kpi.periodType')} wide>
              <Segmented value={mode} onChange={setMode} options={PERIOD_MODES.map((x) => ({ value: x, label: t(MODE_KEY[x] as never) }))} />
            </Field>
            {mode === 'custom' ? (
              <>
                <Field label={t('kpi.periodStart')}>
                  <DateInput value={from} onChange={setFrom} aria-label={t('kpi.periodStart')} invalid={isInvalidRange(from, to)} />
                </Field>
                <Field label={t('kpi.periodEnd')}>
                  <DateInput value={to} onChange={setTo} min={from || undefined} aria-label={t('kpi.periodEnd')} invalid={isInvalidRange(from, to)} />
                </Field>
              </>
            ) : (
              <Field label={mode === 'month' ? t('kpi.month') : t('kpi.monthInPeriod')} hint={bounds ? `${fmtDay(bounds.start)} — ${fmtDay(bounds.end)}` : undefined}>
                <Combobox value={month} onChange={(v) => v && setMonth(v)} options={monthOptions} clearable={false} placeholder={t('kpi.month')} className="w-full" />
              </Field>
            )}
            <Field label={t('kpi.reportTitle')} wide={mode !== 'custom'}>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${t('kpi.reportTitleDefault')} — ${bounds?.label ?? ''}`} />
            </Field>
            <Field label={t('kpi.employees')} wide>
              <EmployeeMultiPicker value={people} onChange={setPeople} placeholder={t('kpi.allEmployees')} />
            </Field>
            <Field label={t('kpi.departments')} wide>
              <MultiPicker value={deptIds} onChange={setDeptIds} options={departments} placeholder={t('kpi.allDepartments')} />
            </Field>
            <Field label={t('kpi.colPosition')}>
              <Combobox value={posId} onChange={setPosId} options={positions} placeholder={t('kpi.allPositions')} className="w-full" />
            </Field>
            <Field label={t('kpi.indicatorGroup')}>
              <Combobox value={group} onChange={setGroup} options={groups.map((g) => ({ value: g, label: sx(g) }))} placeholder={t('kpi.allGroups')} className="w-full" />
            </Field>
            <Field label={t('kpi.indicators')} wide>
              <MultiPicker
                value={indIds}
                onChange={setIndIds}
                options={indicators.filter((i) => !i.is_justification).map((i) => ({ value: i.id, label: sx(i.name) || `#${i.id}` }))}
                placeholder={t('kpi.allIndicators')}
              />
            </Field>
            <Field label={t('kpi.grouping')}>
              <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value as ReportGroupBy)} placeholder={t('kpi.noGrouping')} options={GROUP_BY.map((g) => ({ value: g.value, label: t(g.key as never) }))} />
            </Field>
            <Field label={t('kpi.sorting')}>
              <Select value={sort} onChange={(e) => setSort(e.target.value)} placeholder={t('kpi.defaultSort')} options={SORTS.map((s) => ({ value: s.value, label: t(s.key as never) }))} />
            </Field>
            <Field label={t('kpiExt.staffGroup')}>
              <PositionGroupFilter value={pg} onChange={setPg} className="lg:w-full" />
            </Field>
            <div className="flex items-end">
              <Button leftIcon={<Plus size={15} />} loading={mut.createReport.isPending} onClick={create}>
                {t('kpi.build')}
              </Button>
            </div>
          </div>
          <FormError className="text-xs">{err}</FormError>
        </Card>
      )}

      {opened && (
        <KpiReportView
          key={opened.id}
          report={opened}
          onClose={() => setOpened(null)}
          onDownload={(f) => download(opened, f)}
          onSend={canRun ? () => setSending(opened) : undefined}
        />
      )}

      <Card className="flex flex-col overflow-hidden">
        <div className="border-b border-line p-4">
          <h3 className="text-[14px] font-semibold text-fg">{t('kpi.reportsList')}</h3>
        </div>
        <DataTable
          rows={reports}
          columns={columns}
          loading={loading}
          error={error}
          onRetry={refetch}
          onRowClick={(r) => setOpened(r)}
          emptyTitle={t('kpi.reportsEmpty')}
          minWidth={720}
          skeletonRows={3}
        />
      </Card>
      <SendReportModal report={sending} onClose={() => setSending(null)} />
    </div>
  )
}

/** A stored report on screen: the plan / fact (/ penalty) chart and the table. */
function KpiReportView({
  report,
  onClose,
  onDownload,
  onSend,
}: {
  report: KpiReport
  onClose: () => void
  onDownload: (f: 'xlsx' | 'pdf' | 'docx') => void
  onSend?: () => void
}) {
  const { t } = useTranslation()
  const sx = useServerText()
  const { data, loading, error } = useReportData(report.id)

  const columns = (data?.columns ?? []).map((c) => ({ ...c, label: COLUMN_KEY[c.key] ? t(COLUMN_KEY[c.key] as never) : sx(c.label) }))
  const rows = data?.rows ?? []
  const series = (data?.chart?.series ?? []).map((k) => ({ key: k, label: COLUMN_KEY[k] ? t(COLUMN_KEY[k] as never) : k }))
  const chartRows = (data?.chart?.data ?? []).map((d) => ({ ...d, __x: d.label }))

  const cell = (v: unknown, type: string) => {
    if (v == null || v === '') return '—'
    if (type === 'number' && typeof v === 'number') return v.toLocaleString(numberLocale(), { maximumFractionDigits: 2 })
    return sx(String(v))
  }

  return (
    <Card className="flex flex-col gap-4 border-brand/30 p-4" aria-label={report.title ?? undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <BarChart3 size={17} className="text-brand" aria-hidden />
        <h3 className="text-[14px] font-semibold text-fg">{report.title}</h3>
        <span className="text-[12px] tabular-nums text-fg-subtle">
          {fmtDay(report.period_start)} — {fmtDay(report.period_end)}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" leftIcon={<FileSpreadsheet size={14} />} onClick={() => onDownload('xlsx')}>
            Excel
          </Button>
          <Button size="sm" variant="outline" leftIcon={<FileText size={14} />} onClick={() => onDownload('pdf')}>
            PDF
          </Button>
          <Button size="sm" variant="outline" leftIcon={<FileText size={14} />} onClick={() => onDownload('docx')}>
            Word
          </Button>
          {onSend && (
            <Button size="sm" variant="secondary" leftIcon={<Mail size={14} />} onClick={onSend}>
              {t('kpiExt.sendAction')}
            </Button>
          )}
          <IconButton size="sm" label={t('common.close')} onClick={onClose}>
            <X size={15} />
          </IconButton>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <p className="py-8 text-center text-sm text-danger">{errorMessage(error, t('list.loadFailed'))}</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-fg-subtle">{t('kpi.noData')}</p>
      ) : (
        <>
          {series.length > 0 && (
            <div className="rounded-xl border border-line p-3">
              <p className="mb-1.5 text-[12px] text-fg-muted">{t('kpi.planAndFact')}</p>
              <Suspense fallback={<Skeleton className="h-72 w-full" />}>
                <ReportBarChart rows={chartRows} series={series} height={300} />
              </Suspense>
            </div>
          )}
          <div className="scroll-thin max-h-[460px] overflow-auto rounded-xl border border-line">
            <table className="w-full border-collapse text-left" style={{ minWidth: Math.max(640, columns.length * 110) }}>
              <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgb(var(--border))]">
                <tr>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className={cn(TH, c.type === 'number' && 'text-right')}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className={cn(TD, 'py-2.5', c.type === 'number' ? 'text-right tabular-nums' : 'text-fg', c.key === 'penalty' && Number(r[c.key]) > 0 && 'text-danger')}>
                        {cell(r[c.key], c.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}
