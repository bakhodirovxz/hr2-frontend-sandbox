import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, BookmarkPlus, BookOpen, Columns3, FileSpreadsheet, FileText, FileType2, Play, Table2, X } from 'lucide-react'
import { errorMessage } from '@/api/errorMessage'
import { useListParams } from '@/hooks/useListParams'
import { cn } from '@/lib/cn'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { tabPill, filterChip } from '@/components/ui/control'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { DataTable, type Column, type SortState } from '@/components/data/DataTable'
import { useConfirm } from '@/components/data/useConfirm'
import { useBranchStore } from '@/store/branchStore'
import { downloadStatisticsExport, type CatalogColumn, type CatalogReport, type ExportKind, type ReportTemplate } from './api'
import { buildBody, initialValues, missingRequired, normalizeParams, ParamsForm, type ParamValues } from './ParamsForm'
import { compareValues, formatCell, isNumericColumn, normalizeChart, normalizeColumns, reversed, type Row } from './reportUtils'
import { useServerText } from './serverText'
import { useCatalogReport, useReportTemplates, useTemplateMutations } from './useStatistics'

const ReportBarChart = lazy(() => import('./ReportBarChart'))

/**
 * TZ R1 «Формирование отчётов» — HISOBOTLAR KATALOGI (v1 `ReportCatalog`).
 *
 * Katalog kategoriyalar bo'yicha (`GET statistics/meta` → `report_catalog`),
 * tanlangan hisobot uchun parametrlar formasi, natija — jadval (ustunlarni
 * yashirish, istalgan ustun bo'yicha saralash, `group_label` bo'yicha
 * guruhlash + oraliq jami) va ustunli diagramma (o'qlarni tanlash), shablonlar
 * (`statistics/templates?report_code=`) va eksport Excel / PDF / Word
 * («Shaxsiy ma'lumotlarsiz» bilan, TZ 2352–2353).
 */

const CATEGORY_ORDER = ['staff', 'establishment', 'orders', 'leave', 'requests']

const EXPORTS: { kind: ExportKind; label: string; Icon: typeof FileText }[] = [
  { kind: 'excel', label: 'Excel', Icon: FileSpreadsheet },
  { kind: 'pdf', label: 'PDF', Icon: FileText },
  { kind: 'docx', label: 'Word', Icon: FileType2 },
]

/** Jadval qatori: haqiqiy qator yoki guruh sarlavhasi (oraliq jami bilan). */
interface DisplayRow {
  id: number
  pos: number
  group: string | null
  header: boolean
  data: Row
}

export function ReportCatalog({ catalog }: { catalog: CatalogReport[] }) {
  const { t } = useTranslation()
  const st = useServerText()
  const toast = useToast()
  const confirm = useConfirm()
  const headerBranch = useBranchStore((s) => s.selectedBranchId)
  const { filters, setFilter, setFilters } = useListParams(['cat', 'report'])
  const yesNo: [string, string] = [t('statReports.yes'), t('statReports.no')]

  const reports = useMemo(() => catalog.filter((r) => r && r.code), [catalog])
  const groups = useMemo(() => {
    const by = new Map<string, CatalogReport[]>()
    reports.forEach((r) => {
      const k = r.category || 'other'
      by.set(k, [...(by.get(k) ?? []), r])
    })
    const keys = [...CATEGORY_ORDER.filter((k) => by.has(k)), ...[...by.keys()].filter((k) => !CATEGORY_ORDER.includes(k))]
    return keys.map((k) => ({ key: k, items: by.get(k)! }))
  }, [reports])
  const categoryLabel = (k: string, fallback?: string) =>
    CATEGORY_ORDER.includes(k) ? t(`statReports.cat_${k}` as 'statReports.cat_staff') : st(fallback || k)

  const selected = reports.find((r) => r.code === filters.report) ?? null
  const current = groups.find((g) => g.key === (filters.cat || selected?.category)) ?? groups[0]
  const descriptors = useMemo(() => normalizeParams(selected?.params), [selected])

  const [values, setValues] = useState<ParamValues>({})
  const [missing, setMissing] = useState<string[]>([])
  const [localError, setLocalError] = useState('')
  const [body, setBody] = useState<Record<string, unknown> | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)
  const [visible, setVisible] = useState<string[] | null>(null)
  const [xKey, setXKey] = useState('')
  const [seriesKeys, setSeriesKeys] = useState<string[]>([])
  const [anonymize, setAnonymize] = useState(false)
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [colsOpen, setColsOpen] = useState(false)
  const colsAnchor = useRef<HTMLButtonElement | null>(null)
  const [tplOpen, setTplOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  const [tplShared, setTplShared] = useState(false)
  const [tplError, setTplError] = useState('')

  // Hisobot almashsa — parametrlar va natija qaytadan.
  useEffect(() => {
    setValues(initialValues(descriptors))
    setMissing([])
    setLocalError('')
    setBody(null)
    setSort(null)
  }, [descriptors])

  const report = useCatalogReport(body)
  const templates = useReportTemplates(selected?.code, !!selected)
  const { save, remove } = useTemplateMutations()

  const result = report.data
  const rawRows = useMemo<Row[]>(() => (Array.isArray(result?.rows) ? result.rows : []), [result])
  const columns = useMemo<CatalogColumn[]>(
    () => normalizeColumns(result?.columns, rawRows).map((c) => ({ ...c, label: st(c.label) })),
    [result, rawRows, st],
  )
  const chartInfo = useMemo(() => normalizeChart(result?.chart, columns, rawRows), [result, columns, rawRows])

  // Yangi natija — ustunlar ko'rinishi va diagramma o'qlari serverdagi sukutga.
  useEffect(() => {
    setVisible(null)
    setXKey(chartInfo.x)
    setSeriesKeys(chartInfo.series)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  const visibleKeys = visible ?? columns.map((c) => c.key)
  const numeric = useMemo(() => new Set(columns.filter((c) => isNumericColumn(c, rawRows)).map((c) => c.key)), [columns, rawRows])
  const grouped = visibleKeys.includes('group_label') && rawRows.some((r) => r.group_label != null)
  const tableCols = columns.filter((c) => visibleKeys.includes(c.key) && !(grouped && c.key === 'group_label'))

  /**
   * Ko'rsatiladigan qatorlar TARTIBI shu yerda quriladi: guruhlash bo'lsa —
   * guruh sarlavhasi (oraliq jami) va uning ichida saralangan qatorlar
   * (TZ R1 1489). `DataTable` ning o'z saralashi esa `pos` bo'yicha — ya'ni
   * bu tartibni o'zgartirmaydi (pastdagi `sortValue` ga qarang).
   */
  const displayRows = useMemo<DisplayRow[]>(() => {
    const sorted = sort ? [...rawRows].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.dir)) : rawRows
    const out: DisplayRow[] = []
    const push = (data: Row, group: string | null, header = false) =>
      out.push({ id: out.length, pos: out.length, group, header, data })
    if (!grouped) {
      sorted.forEach((r) => push(r, null))
      return out
    }
    const order: string[] = []
    rawRows.forEach((r) => {
      const g = String(r.group_label ?? '—')
      if (!order.includes(g)) order.push(g)
    })
    for (const g of order) {
      const list = sorted.filter((r) => String(r.group_label ?? '—') === g)
      const totals: Row = {}
      columns.forEach((c) => {
        if (numeric.has(c.key) && !String(c.label).includes('%')) {
          totals[c.key] = Math.round(list.reduce((a, r) => a + (Number(r[c.key]) || 0), 0) * 100) / 100
        }
      })
      push(totals, g, true)
      list.forEach((r) => push(r, g))
    }
    return out
  }, [rawRows, sort, grouped, columns, numeric])

  const sortValue = (r: DisplayRow) => (sort?.dir === 'desc' ? -r.pos : r.pos)
  const tableColumns: Column<DisplayRow>[] = tableCols.map((c, ci) => {
    const isNum = numeric.has(c.key)
    return {
      key: c.key,
      header: c.label,
      label: c.label,
      sortValue,
      headerClassName: isNum ? 'text-right' : undefined,
      className: isNum ? 'text-right tabular-nums' : undefined,
      cell: (r) => {
        if (r.header) {
          if (ci === 0) return <span className="font-semibold text-fg">{st(r.group)}</span>
          return c.key in r.data ? <span className="font-semibold text-brand-strong">{formatCell(r.data[c.key], c, yesNo)}</span> : ''
        }
        const text = formatCell(r.data[c.key], c, yesNo)
        const shown = typeof r.data[c.key] === 'string' ? st(text) : text
        return <span className={cn(ci === 0 && r.group != null && 'pl-4', isNum ? 'text-fg' : 'text-fg-muted')}>{shown}</span>
      },
    }
  })

  const run = (override?: ParamValues) => {
    if (!selected) return
    const vals = override ?? values
    const miss = missingRequired(descriptors, vals)
    setMissing(miss)
    if (miss.length) return
    if (descriptors.some((d) => d.type === 'date_range' && reversed(vals[d.fromKey!], vals[d.toKey!]))) {
      setLocalError(t('statReports.invalidPeriod'))
      return
    }
    setLocalError('')
    const next = { report_code: selected.code, ...buildBody(descriptors, vals, headerBranch) }
    // Bir xil parametr bilan qayta bosish — serverdan qayta hisoblash.
    if (JSON.stringify(next) === JSON.stringify(body)) void report.refetch()
    else setBody(next)
  }

  const applyTemplate = (tpl: ReportTemplate) => {
    const p: Record<string, unknown> = { ...(tpl.params ?? {}) }
    delete p.report_code
    if (p.department_id != null && p.department_ids == null) {
      p.department_ids = [p.department_id]
      delete p.department_id
    }
    const next: ParamValues = { ...initialValues(descriptors) }
    for (const d of descriptors) {
      if (d.type === 'date_range') {
        if (p[d.fromKey!]) next[d.fromKey!] = String(p[d.fromKey!])
        if (p[d.toKey!]) next[d.toKey!] = String(p[d.toKey!])
      } else if (d.name in p) {
        const v = p[d.name]
        next[d.name] = Array.isArray(v) ? v.map(String) : d.type === 'boolean' ? !!v : String(v ?? '')
      } else if (d.type === 'branch') {
        // Shablon filialsiz saqlangan — barcha filiallar uchun.
        next[d.name] = 'all'
      }
    }
    setValues(next)
    run(next)
    toast.info(t('statistics.templateApplied', { name: tpl.name }))
  }

  const removeTemplate = async (tpl: ReportTemplate) => {
    const ok = await confirm({ kind: 'delete', title: t('statistics.templateDeleteTitle'), subject: tpl.name })
    if (!ok) return
    try {
      await remove.mutateAsync(tpl.id)
      toast.ok(t('statistics.templateDeleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const submitTemplate = async () => {
    if (!selected) return
    const name = tplName.trim()
    if (!name) {
      setTplError(t('statistics.templateNameRequired'))
      return
    }
    try {
      await save.mutateAsync({
        name,
        report_code: selected.code,
        params: { report_code: selected.code, ...buildBody(descriptors, values, headerBranch) },
        is_shared: tplShared,
      })
      toast.ok(t('statistics.templateSaved'))
      setTplOpen(false)
    } catch (e) {
      setTplError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const doExport = async (kind: ExportKind) => {
    if (!selected || !body) return
    setExporting(kind)
    try {
      await downloadStatisticsExport(
        kind,
        {
          ...body,
          columns: visibleKeys,
          title: selected.label,
          ...(sort ? { sort_by: sort.key, sort_dir: sort.dir } : {}),
          ...(anonymize ? { anonymize: true } : {}),
        },
        selected.code,
      )
      toast.ok(t('statistics.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('statistics.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  if (!reports.length) {
    return (
      <Card className="p-10">
        <EmptyState icon={<BookOpen size={26} />} title={t('statReports.catalogEmpty')} description={t('statReports.catalogEmptyHint')} />
      </Card>
    )
  }

  const chartRows = rawRows.map((r) => {
    const x = st(formatCell(r[xKey], null, yesNo))
    return { ...r, __x: grouped && xKey !== 'group_label' && r.group_label != null ? `${st(String(r.group_label))} · ${x}` : x }
  })
  const chartSeries = seriesKeys
    .map((k) => columns.find((c) => c.key === k))
    .filter((c): c is CatalogColumn => !!c)
    .map((c) => ({ key: c.key, label: c.label }))
  const error = localError || (report.error ? errorMessage(report.error, t('statistics.loadFailed')) : '')

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ── Katalog: kategoriya → hisobotlar ── */}
      <Card className="self-start p-3" aria-label={t('statReports.tab_catalog')} role="navigation">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('statReports.category')}>
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              role="tab"
              aria-selected={current?.key === g.key}
              onClick={() => setFilter('cat', g.key)}
              className={tabPill(current?.key === g.key)}
            >
              {categoryLabel(g.key, g.items[0]?.category_label)}
              <span className="opacity-60">{g.items.length}</span>
            </button>
          ))}
        </div>
        <ul className="mt-3 flex flex-col gap-0.5">
          {(current?.items ?? []).map((r) => {
            const on = selected?.code === r.code
            return (
              <li key={r.code}>
                <button
                  type="button"
                  aria-current={on ? 'true' : undefined}
                  onClick={() => setFilters({ cat: r.category, report: r.code })}
                  className={cn(
                    'w-full rounded-inner px-2.5 py-2 text-left text-[13px] transition-colors',
                    on ? 'bg-brand-soft font-medium text-brand-strong' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {st(r.label || r.code)}
                </button>
              </li>
            )
          })}
        </ul>
      </Card>

      <div className="flex min-w-0 flex-col gap-4">
        {!selected ? (
          <Card className="p-10">
            <EmptyState icon={<BookOpen size={26} />} title={t('statReports.pickReport')} />
          </Card>
        ) : (
          <>
            {/* ── Parametrlar ── */}
            <Card aria-label={t('statReports.params')} role="region">
              <CardHeader
                title={st(selected.label)}
                subtitle={categoryLabel(selected.category, selected.category_label)}
              />
              <div className="p-4">
                {(templates.data ?? []).length > 0 && (
                  <div className="mb-4 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-[11.5px] font-semibold text-fg-subtle">{t('statistics.templates')}</span>
                    {(templates.data ?? []).map((tpl) => (
                      <span key={tpl.id} className="flex items-center gap-1 rounded-pill border border-line py-0.5 pl-3 pr-1 text-xs">
                        <button
                          type="button"
                          title={t('statistics.templateApply')}
                          onClick={() => applyTemplate(tpl)}
                          className="font-medium text-fg-muted transition-colors hover:text-fg"
                        >
                          {tpl.name}
                        </button>
                        {tpl.is_mine ? (
                          <button
                            type="button"
                            aria-label={t('statistics.templateDelete')}
                            onClick={() => void removeTemplate(tpl)}
                            className="grid h-5 w-5 place-items-center rounded-pill text-fg-subtle transition-colors hover:text-danger"
                          >
                            <X size={11} />
                          </button>
                        ) : (
                          <span className="w-1" />
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <ParamsForm descriptors={descriptors} values={values} onChange={setValues} errors={missing} />

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button size="sm" leftIcon={<Play size={14} />} loading={report.isFetching} onClick={() => run()}>
                    {report.isFetching ? t('statistics.building') : t('statistics.build')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    leftIcon={<BookmarkPlus size={14} />}
                    onClick={() => {
                      setTplName(st(selected.label))
                      setTplShared(false)
                      setTplError('')
                      setTplOpen(true)
                    }}
                  >
                    {t('statistics.saveTemplate')}
                  </Button>
                  {result && (
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <Checkbox
                        label={t('statReports.anonymize')}
                        checked={anonymize}
                        onChange={(e) => setAnonymize(e.target.checked)}
                      />
                      {EXPORTS.map((x) => (
                        <Button
                          key={x.kind}
                          size="sm"
                          variant="outline"
                          leftIcon={<x.Icon size={14} />}
                          loading={exporting === x.kind}
                          disabled={!!exporting && exporting !== x.kind}
                          onClick={() => void doExport(x.kind)}
                        >
                          {x.label}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
                {error && (
                  <p role="alert" className="mt-3 rounded-inner border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
                    {error}
                  </p>
                )}
              </div>
            </Card>

            {report.isLoading && body && (
              <Card className="p-4">
                <Skeleton className="h-64 w-full" />
              </Card>
            )}

            {result && !report.error && (rawRows.length === 0 ? (
              <Card className="p-10">
                <EmptyState title={t('statistics.noData')} description={t('statistics.noDataHint')} />
              </Card>
            ) : (
              <>
                {/* ── Diagramma + o'qlar ── */}
                <Card role="region" aria-label={t('statReports.chart')}>
                  <CardHeader icon={<BarChart3 />} title={t('statReports.chart')} />
                  <div className="p-4">
                    <div className="mb-3 flex flex-wrap items-end gap-4">
                      <Field label={t('statReports.xAxis')} className="w-56">
                        <Select
                          value={xKey}
                          onChange={(e) => setXKey(e.target.value)}
                          options={columns.map((c) => ({ value: c.key, label: c.label }))}
                        />
                      </Field>
                      <div className="min-w-0 flex-1">
                        <p className="mb-1.5 text-sm font-medium text-fg">{t('statReports.yAxis')}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {columns
                            .filter((c) => chartInfo.numericKeys.includes(c.key))
                            .map((c) => {
                              const on = seriesKeys.includes(c.key)
                              return (
                                <button
                                  key={c.key}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() =>
                                    setSeriesKeys((s) =>
                                      on ? s.filter((k) => k !== c.key) : columns.map((x) => x.key).filter((k) => k === c.key || s.includes(k)),
                                    )
                                  }
                                  className={filterChip(on)}
                                >
                                  {c.label}
                                </button>
                              )
                            })}
                        </div>
                      </div>
                    </div>
                    <Suspense fallback={<Skeleton className="h-80 w-full" />}>
                      <ReportBarChart rows={chartRows} series={chartSeries} height={320} />
                    </Suspense>
                  </div>
                </Card>

                {/* ── Jadval ── */}
                <Card role="region" aria-label={t('statReports.table')} className="flex flex-col">
                  <CardHeader
                    icon={<Table2 />}
                    title={t('statReports.table')}
                    subtitle={t('statistics.rowCount', { count: rawRows.length })}
                    action={
                      <>
                        <Button
                          ref={colsAnchor}
                          size="sm"
                          variant="outline"
                          leftIcon={<Columns3 size={14} />}
                          aria-expanded={colsOpen}
                          onClick={() => setColsOpen((o) => !o)}
                        >
                          {t('statistics.columns')} ({visibleKeys.length}/{columns.length})
                        </Button>
                        <AnchoredPanel
                          anchorRef={colsAnchor}
                          open={colsOpen}
                          onClose={() => setColsOpen(false)}
                          width={260}
                          align="end"
                          role="dialog"
                          label={t('statistics.columnsTitle')}
                        >
                          <div className="p-3">
                            <p className="mb-2 text-[12px] font-semibold text-fg">{t('statistics.columnsTitle')}</p>
                            <ul className="max-h-80 space-y-1 overflow-auto">
                              {columns.map((c) => (
                                <li key={c.key}>
                                  <Checkbox
                                    label={c.label}
                                    checked={visibleKeys.includes(c.key)}
                                    onChange={(e) =>
                                      setVisible(() => {
                                        const cur = visibleKeys
                                        const next = e.target.checked ? [...cur, c.key] : cur.filter((k) => k !== c.key)
                                        // Asl tartib saqlanadi; kamida bitta ustun ko'rinsin.
                                        return next.length ? columns.map((x) => x.key).filter((k) => next.includes(k)) : cur
                                      })
                                    }
                                  />
                                </li>
                              ))}
                            </ul>
                            <p className="mt-2 text-[11px] leading-snug text-fg-subtle">{t('statistics.columnsHint')}</p>
                          </div>
                        </AnchoredPanel>
                      </>
                    }
                  />
                  <DataTable
                    rows={displayRows}
                    columns={tableColumns}
                    sort={sort}
                    onSort={setSort}
                    emptyTitle={t('statistics.noData')}
                    density="compact"
                    minWidth={Math.max(560, tableCols.length * 140)}
                  />
                </Card>
              </>
            ))}
          </>
        )}
      </div>

      <Modal
        open={tplOpen}
        onClose={() => setTplOpen(false)}
        title={t('statistics.templateTitle')}
        description={t('statistics.templateHint')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTplOpen(false)} disabled={save.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void submitTemplate()} loading={save.isPending}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submitTemplate()
          }}
        >
          <Field label={t('statistics.templateName')} required error={tplError || undefined}>
            <Input
              value={tplName}
              maxLength={255}
              autoFocus
              placeholder={t('statistics.templateNamePlaceholder')}
              invalid={!!tplError}
              onChange={(e) => {
                setTplName(e.target.value)
                setTplError('')
              }}
            />
          </Field>
          <div className="mt-3">
            <Checkbox label={t('statistics.templateShared')} checked={tplShared} onChange={(e) => setTplShared(e.target.checked)} />
          </div>
        </form>
      </Modal>
    </div>
  )
}
