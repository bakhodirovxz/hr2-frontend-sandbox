import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDown,
  ArrowUp,
  Columns3,
  Download,
  FileText,
  Minus,
  RefreshCw,
  Save,
  ShieldQuestion,
  X,
} from 'lucide-react'
import i18n from '@/i18n'
import { errorMessage } from '@/api/errorMessage'
import { useDynamicT } from '@/i18n/dynamicKey'
import { useListParams } from '@/hooks/useListParams'
import { isInvalidRange } from '@/lib/dateRange'
import { cn } from '@/lib/cn'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Checkbox } from '@/components/ui/Checkbox'
import { Select } from '@/components/ui/Select'
import { DateInput } from '@/components/ui/DateInput'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { ChartTooltip } from '@/components/data/ChartTooltip'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { FilterReset } from '@/components/data/FilterReset'
import { TD, TH } from '@/components/data/tableStyles'
import {
  ALL_COLUMNS,
  STATUS_KEYS,
  downloadStatisticsExport,
  type ColumnKey,
  type ExportKind,
  type ReportParams,
  type ReportRow,
  type ReportTemplate,
  type StatusKey,
} from './api'
import { renderChartPng } from './chartPng'
import { DeliveryActions, TemplateScheduleButton } from './ReportDelivery'
import { dmy } from './reportUtils'
import { useServerText } from './serverText'
import {
  ALL_BRANCHES,
  useReportTemplates,
  useStatBranch,
  useStatisticsMeta,
  useStatisticsReport,
  useTemplateMutations,
} from './useStatistics'

/**
 * STATISTIK HISOBOT KONSTRUKTORI — TZ 4.2.11 («добавление новых форм отчетов»).
 *
 * `/statistics` sahifasining «Murojaatlar statistikasi» tabi (v1
 * `StatistikHisobotPage` konstruktori). Hisobotni FOYDALANUVCHI yig'adi:
 * davr, manba, murojaat turi, holat va KESIM (kun / hafta / oy / tur / holat /
 * filial / manba) — hammasi tanlanadi, natija esa bitta so'rovdan chiqadi;
 * tanlov SHABLON qilib saqlanadi (kodsiz shablonlar — shu konstruktorniki).
 *
 * ⚠️ JADVAL, IKKALA DIAGRAMMA VA EKSPORT — BITTA javobdan. Ular alohida so'rov
 * qilsa, filtr biriga qo'llanib ikkinchisida eskisi qolib ketardi; TZ aynan
 * shuni taqiqlaydi («фильтрация обновляет как таблицу, так и диаграмму»).
 */

/** CSS tokenini recharts tushunadigan rangga aylantiradi (qattiq rang YO'Q). */
const v = (token: string) => `rgb(var(${token}))`

/**
 * Holat → mavzu tokeni. Bular STATUS ranglari (dataviz: «status palette»),
 * ya'ni ma'nosi bor: kutilmoqda — sariq, bajarilgan — yashil, rad etilgan —
 * qizil. Shuning uchun ular hech qachon «4-qator» sifatida qayta
 * ishlatilmaydi va HAR DOIM nomi bilan birga chiqadi (chip, legenda, jadval
 * sarlavhasi) — rang yolg'iz o'zi ma'no tashimaydi.
 */
const STATUS_TOKEN: Record<StatusKey, string> = {
  accepted: '--brand',
  in_progress: '--warning',
  done: '--success',
  rejected: '--danger',
  // D-D24: arizachining o'zi bekor qilgani — rad etish emas, NEYTRAL.
  cancelled: '--fg-subtle',
}
/** «Jami» — holat emas, shuning uchun status ranglaridan ATAYLAB tashqarida. */
const TOTAL_TOKEN = '--chart-5'
const COLUMN_TOKEN: Record<ColumnKey, string> = {
  label: '--fg-muted',
  total: TOTAL_TOKEN,
  ...STATUS_TOKEN,
}

/**
 * URL kalitlari `c…` bilan boshlanadi.
 *
 * ⚠️ SABAB: sahifaning boshqa tablari ham shu URL da o'z filtrlarini saqlaydi
 * (`cat`/`report` — katalog, `d…` — panel). Bir xil nom qo'yilsa, tab
 * almashtirilganda bir hisobotning filtri ikkinchisiga sizib o'tardi.
 */
const FILTER_KEYS = ['cfrom', 'cto', 'cgroup', 'csrc', 'ctype', 'cstate', 'cbranch', 'csplit'] as const

const isoDate = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return isoDate(d)
}
const monthsAgo = (n: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return isoDate(d)
}

/** Tez tanlanadigan davrlar — har hisobotda sanani qo'lda terish shart emas. */
const PRESETS = [
  { key: 'preset7d', from: () => daysAgo(6) },
  { key: 'preset30d', from: () => daysAgo(29) },
  { key: 'preset3m', from: () => monthsAgo(3) },
  { key: 'preset6m', from: () => monthsAgo(6) },
  { key: 'preset1y', from: () => monthsAgo(12) },
] as const

/** Ro'yxatni URL da bitta satrga yig'ish va qaytarib olish. */
const splitCsv = (raw: string): string[] => (raw ? raw.split(',').filter(Boolean) : [])
const joinCsv = (list: string[]): string | null => (list.length ? list.join(',') : null)

export function StatisticsConstructor() {
  const { t } = useTranslation()
  const tk = useDynamicT()
  const toast = useToast()
  const st = useServerText()

  /**
   * Server yorliqlari FAQAT o'zbekcha keladi. Lug'atda kod bo'yicha kalit
   * bo'lsa — tarjima, bo'lmasa serverning o'z matni ishlatiladi: yangi
   * murojaat turi qo'shilsa ekran baribir to'g'ri chiqadi, shunchaki
   * tarjimasiz.
   */
  const codeLabel = (prefix: string, code: string, fallback: string) => {
    const key = `statistics.${prefix}${code}`
    return i18n.exists(key) ? tk(key) : st(fallback || code)
  }
  const statusLabel = (code: StatusKey) => codeLabel('st_', code, code)
  const columnLabel = (key: ColumnKey, groupLabel: string) =>
    key === 'label' ? groupLabel : codeLabel('col_', key, key)

  const { filters, setFilter, setFilters, activeFilterCount, reset } = useListParams(FILTER_KEYS)

  // Standart davr — oxirgi 6 oy. URL bo'sh bo'lsa shu ishlatiladi va foydalanuvchi
  // sahifani birinchi ochganda ham hisobot to'la chiqadi.
  const defaults = useMemo(() => ({ from: monthsAgo(6), to: isoDate(new Date()) }), [])
  const dateFrom = filters.cfrom || defaults.from
  const dateTo = filters.cto || defaults.to
  const groupBy = filters.cgroup || 'month'
  // TZ 4.2.11 · 2247–2253: «дата обращения» and «тип обращения» together.
  const splitByType = filters.csplit === '1' && groupBy !== 'type'
  const sources = useMemo(() => splitCsv(filters.csrc), [filters.csrc])
  const types = useMemo(() => splitCsv(filters.ctype), [filters.ctype])
  const statuses = useMemo(() => splitCsv(filters.cstate), [filters.cstate])
  // Filial — sukut bo'yicha SHAPKADAGI filial, `branch_id` sifatida (statistika
  // routeri `organization_branch_id` ni o'qimaydi).
  const { branchId, selectValue: branchValue, branches } = useStatBranch(filters.cbranch)
  const rangeInvalid = isInvalidRange(dateFrom, dateTo)

  const [columns, setColumns] = useState<ColumnKey[]>([...ALL_COLUMNS])
  const [sort, setSort] = useState<{ key: ColumnKey; dir: 'asc' | 'desc' } | null>(null)
  const [stacked, setStacked] = useState(false)
  const [hidden, setHidden] = useState<Set<StatusKey>>(new Set())
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [templateShared, setTemplateShared] = useState(false)
  const [toDelete, setToDelete] = useState<ReportTemplate | null>(null)
  const [exporting, setExporting] = useState<ExportKind | null>(null)

  /**
   * ⚠️ BO'SH RO'YXAT `null` GA AYLANTIRILADI. Backend `None` ni «hammasi» deb
   * o'qiydi, bo'sh ro'yxatni esa «hech biri» — ya'ni `[]` yuborilsa hisobot
   * bo'm-bo'sh qaytardi.
   */
  const params: ReportParams = useMemo(
    () => ({
      date_from: dateFrom || null,
      date_to: dateTo || null,
      sources: sources.length ? sources : null,
      types: types.length ? types : null,
      statuses: statuses.length ? statuses : null,
      branch_id: branchId,
      group_by: groupBy,
      ...(splitByType ? { split_by_type: true } : {}),
    }),
    [dateFrom, dateTo, sources, types, statuses, branchId, groupBy, splitByType],
  )

  const meta = useStatisticsMeta()
  const report = useStatisticsReport(params, !rangeInvalid)
  const templatesQ = useReportTemplates()
  // Kodsiz (yoki `requests`) shablonlar — shu konstruktorniki; katalog
  // hisobotlari shablonlari o'z hisoboti ostida chiqadi.
  const templates = useMemo(
    () => (templatesQ.data ?? []).filter((tpl) => !tpl.report_code || tpl.report_code === 'requests'),
    [templatesQ.data],
  )
  const { save, remove } = useTemplateMutations()

  const status = (e: unknown) => (e as { response?: { status?: number } } | null)?.response?.status
  const denied = status(meta.error) === 403 || status(report.error) === 403

  const data = report.data
  const rows = useMemo(() => data?.rows ?? [], [data])
  const totals = data?.totals
  const deltas = data?.deltas ?? {}
  const groupLabel = codeLabel('group_', groupBy, data?.group_label ?? groupBy)

  /** Kesim TUR / HOLAT / MANBA bo'lganda qator kaliti — KODNING o'zi, ya'ni
   *  qator nomini ham tarjima qilsa bo'ladi. Sana kesimlarida nom allaqachon
   *  raqamli (05.2026) va tarjimaga muhtoj emas. */
  const split = !!data?.split_by_type
  const typeOf = (row: ReportRow) => codeLabel('type_', row.type ?? '', row.type_label ?? row.type ?? '')
  /** The period / group part of a row (without the type when split). */
  const groupPart = (row: ReportRow) => {
    if (!split) return rowLabel(row)
    const base = { ...row, type: undefined, key: String(row.key).split('|')[0], label: row.group_label ?? row.label }
    return rowLabel(base)
  }
  const rowLabel = (row: ReportRow): string => {
    if (split && row.type) return `${groupPart(row)} · ${typeOf(row)}`
    if (groupBy === 'type') return codeLabel('type_', row.key, row.label)
    if (groupBy === 'status') return codeLabel('st_', row.key, row.label)
    if (groupBy === 'source') return codeLabel('src_', row.key, row.label)
    return row.label
  }

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      if (sort.key === 'label') return String(a.label).localeCompare(String(b.label)) * dir
      return ((a[sort.key] || 0) - (b[sort.key] || 0)) * dir
    })
  }, [rows, sort])

  const visibleSeries = STATUS_KEYS.filter((k) => !hidden.has(k))

  /** Jamlanma qatori uchun ustun qiymati — «kesim» ustunida son yo'q. */
  const totalFor = (c: ColumnKey) => (c === 'label' ? 0 : (totals?.[c] ?? 0))

  const chartRows = useMemo(
    () =>
      rows.map((r) => ({
        name: rowLabel(r),
        accepted: r.accepted,
        in_progress: r.in_progress,
        done: r.done,
        rejected: r.rejected,
        cancelled: r.cancelled,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, groupBy, i18n.language],
  )

  // TZ 4.2.11 · 2239 «Должны быть использованы столбчатые диаграммы»: the
  // status shares are drawn as a (horizontal) bar chart, not a donut.
  const shares = useMemo(
    () =>
      STATUS_KEYS.map((k) => ({ key: k, name: statusLabel(k), value: totals?.[k] ?? 0 })).filter(
        (d) => d.value > 0,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [totals, i18n.language],
  )

  const toggleIn = (key: 'csrc' | 'ctype' | 'cstate', current: string[], value: string) => {
    const next = current.includes(value) ? current.filter((x) => x !== value) : [...current, value]
    setFilter(key, joinCsv(next) ?? '')
  }

  const applyPreset = (from: string) => setFilters({ cfrom: from, cto: isoDate(new Date()) })

  const toggleSort = (key: ColumnKey) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }))

  const toggleColumn = (key: ColumnKey) =>
    setColumns((current) =>
      current.includes(key)
        ? current.filter((c) => c !== key)
        : // Tartib DOIM `ALL_COLUMNS` bo'yicha — ustun qayta yoqilganda
          // oxiriga tushib qolmasin.
          ALL_COLUMNS.filter((c) => current.includes(c) || c === key),
    )

  const doExport = async (kind: ExportKind) => {
    setExporting(kind)
    try {
      await downloadStatisticsExport(kind, {
        ...params,
        columns,
        // TZ 4.2.11 · 2270: the file keeps the on-screen order.
        ...(sort ? { sort_by: sort.key, sort_dir: sort.dir } : {}),
        title: t('statistics.title'),
        subtitle: `${dmy(dateFrom)} — ${dmy(dateTo)}`,
        // Diagramma FAQAT PDF ga kerak; rasm chizilmasa ham jadval baribir
        // chiqadi, shuning uchun xato yutiladi.
        chart_png_base64:
          kind === 'pdf'
            ? renderChartPng({
                rows,
                keys: visibleSeries,
                label: statusLabel,
                token: (k) => STATUS_TOKEN[k],
                stacked,
              })
            : null,
      })
      toast.ok(t('statistics.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('statistics.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  const saveTemplate = async () => {
    const name = templateName.trim()
    if (!name) {
      toast.error(t('statistics.templateNameRequired'))
      return
    }
    try {
      await save.mutateAsync({ name, params: { ...params, columns }, is_shared: templateShared })
      toast.ok(t('statistics.templateSaved'))
      setSaveOpen(false)
      setTemplateName('')
      setTemplateShared(false)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  /** Shablon — saqlangan filtrlar to'plami. U URL ga yoziladi, ya'ni qo'llangan
   *  hisobotning havolasi ham xuddi shunday ulashiladi. */
  const applyTemplate = (tpl: ReportTemplate) => {
    const p = (tpl.params ?? {}) as Partial<ReportParams & { columns: string[] }>
    setFilters({
      cfrom: p.date_from ?? null,
      cto: p.date_to ?? null,
      cgroup: p.group_by ?? null,
      csrc: joinCsv(p.sources ?? []),
      ctype: joinCsv(p.types ?? []),
      cstate: joinCsv(p.statuses ?? []),
      // Filialsiz saqlangan shablon — barcha filiallar uchun.
      cbranch: p.branch_id ? String(p.branch_id) : ALL_BRANCHES,
      csplit: p.split_by_type ? '1' : null,
    })
    if (p.columns?.length) setColumns(p.columns.filter((c): c is ColumnKey => ALL_COLUMNS.includes(c as ColumnKey)))
    toast.info(t('statistics.templateApplied', { name: tpl.name }))
  }

  const confirmDelete = async () => {
    if (!toDelete) return
    try {
      await remove.mutateAsync(toDelete.id)
      toast.ok(t('statistics.templateDeleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setToDelete(null)
    }
  }

  if (denied) {
    return (
      <Card className="p-10">
        <EmptyState
          icon={<ShieldQuestion size={26} />}
          title={t('common.noAccess')}
          description={t('statistics.noAccessHint')}
        />
      </Card>
    )
  }

  const metaOptions = meta.data
  const loading = report.isFetching

  return (
    <>
      {/* ── Davr presetlari + saqlangan shablonlar ───────────────────────── */}
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <span className="text-[11.5px] font-semibold text-fg-subtle">
          {t('statistics.period')}
        </span>
        {PRESETS.map((p) => {
          const active = dateFrom === p.from()
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={active}
              onClick={() => applyPreset(p.from())}
              className={cn(
                'rounded-pill border px-3 py-1 text-xs font-medium transition-colors',
                active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-fg-subtle hover:text-fg',
              )}
            >
              {t(`statistics.${p.key}` as 'statistics.preset7d')}
            </button>
          )
        })}

        {templates.length > 0 && (
          <>
            <span className="mx-1 h-4 w-px bg-line" />
            <span className="text-[11.5px] font-semibold text-fg-subtle">
              {t('statistics.templates')}
            </span>
            {templates.map((tpl) => (
              <span
                key={tpl.id}
                className="flex items-center gap-1 rounded-pill border border-line py-0.5 pl-3 pr-1 text-xs"
              >
                <button
                  type="button"
                  title={t('statistics.templateApply')}
                  onClick={() => applyTemplate(tpl)}
                  className="font-medium text-fg-muted transition-colors hover:text-fg"
                >
                  {tpl.name}
                </button>
                <TemplateScheduleButton tpl={tpl} />
                {/* O'chirish faqat MUALLIFDA — begona shablonni o'chirishga
                    urinish backendda 403 bilan qaytariladi. */}
                {tpl.is_mine && (
                  <button
                    type="button"
                    aria-label={t('statistics.templateDelete')}
                    onClick={() => setToDelete(tpl)}
                    className="grid h-5 w-5 place-items-center rounded-pill text-fg-subtle transition-colors hover:text-danger"
                  >
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </>
        )}
      </Card>

      {/* ── Filtrlar: jadvalni ham, diagrammani ham bir vaqtda yangilaydi ── */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('statistics.dateFrom')} error={rangeInvalid ? t('list.invalidRange') : undefined}>
            <DateInput value={dateFrom} onChange={(x) => setFilter('cfrom', x)} invalid={rangeInvalid} />
          </Field>
          <Field label={t('statistics.dateTo')}>
            <DateInput value={dateTo} onChange={(x) => setFilter('cto', x)} invalid={rangeInvalid} />
          </Field>
          <Field label={t('statistics.groupBy')}>
            <Select
              value={groupBy}
              onChange={(e) => setFilter('cgroup', e.target.value)}
              options={(metaOptions?.group_by ?? []).map((o) => ({
                value: o.value,
                label: codeLabel('group_', o.value, o.label),
              }))}
            />
          </Field>
          <Field label={t('statistics.branch')}>
            <Select
              value={branchValue}
              onChange={(e) => setFilter('cbranch', e.target.value)}
              options={[
                { value: ALL_BRANCHES, label: t('statistics.allBranches') },
                ...branches.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
          </Field>
        </div>

        {/* Ko'p tanlovli filtrlar — chip. Tanlangani RANG bilan ham, aria-pressed
            bilan ham bildiriladi. */}
        {([
          ['csrc', t('statistics.source'), metaOptions?.sources, sources, 'src_'],
          ['ctype', t('statistics.requestType'), metaOptions?.types, types, 'type_'],
          ['cstate', t('statistics.state'), metaOptions?.statuses, statuses, 'st_'],
        ] as const).map(([key, label, list, selected, prefix]) => (
          <div key={key} className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="w-24 shrink-0 text-xs text-fg-subtle">{label}</span>
            {(list ?? []).map((o) => {
              const active = selected.includes(o.value)
              const token = prefix === 'st_' ? STATUS_TOKEN[o.value as StatusKey] : '--brand'
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleIn(key, selected, o.value)}
                  className="rounded-pill border px-3 py-1 text-xs font-medium transition-colors"
                  style={
                    active
                      ? {
                          borderColor: v(token),
                          backgroundColor: `rgb(var(${token}) / 0.14)`,
                          color: v(token),
                        }
                      : undefined
                  }
                >
                  <span className={cn(!active && 'text-fg-subtle')}>
                    {codeLabel(prefix, o.value, o.label)}
                  </span>
                </button>
              )
            })}
          </div>
        ))}

        <div className="mt-3">
          <Checkbox
            label={t('statistics.splitByType')}
            checked={splitByType}
            disabled={groupBy === 'type'}
            onChange={(e) => setFilter('csplit', e.target.checked ? '1' : '')}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Columns3 size={14} />}
            onClick={() => setColumnsOpen(true)}
          >
            {t('statistics.columns')}
          </Button>
          <Button variant="outline" size="sm" leftIcon={<Save size={14} />} onClick={() => setSaveOpen(true)}>
            {t('statistics.saveTemplate')}
          </Button>
          <FilterReset count={activeFilterCount} onReset={reset} />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : undefined} />}
              loading={loading}
              disabled={rangeInvalid}
              onClick={() => report.refetch()}
            >
              {loading ? t('statistics.building') : t('statistics.build')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download size={14} />}
              loading={exporting === 'excel'}
              disabled={!rows.length}
              onClick={() => doExport('excel')}
            >
              Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FileText size={14} />}
              loading={exporting === 'pdf'}
              disabled={!rows.length}
              onClick={() => doExport('pdf')}
            >
              PDF
            </Button>
            <DeliveryActions
              fallbackName="statistika"
              disabled={!rows.length}
              buildParams={() => ({
                ...params,
                columns,
                ...(sort ? { sort_by: sort.key, sort_dir: sort.dir } : {}),
                title: t('statistics.title'),
                subtitle: `${dmy(dateFrom)} — ${dmy(dateTo)}`,
              })}
            />
          </div>
        </div>
      </Card>

      {/* ── Asosiy ko'rsatkichlar ────────────────────────────────────────── */}
      {report.error && !report.isFetching && (
        <p role="alert" className="mb-3 rounded-inner border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {errorMessage(report.error, t('statistics.loadFailed'))}
        </p>
      )}

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {(['total', ...STATUS_KEYS] as const).map((key) => {
          const token = key === 'total' ? TOTAL_TOKEN : STATUS_TOKEN[key]
          const value = totals?.[key] ?? 0
          const share = totals?.total ? Math.round((value * 100) / totals.total) : 0
          const delta = deltas[key]
          return (
            <Card key={key} className="p-4">
              <p className="truncate text-[11.5px] font-semibold text-fg-subtle">
                {key === 'total' ? t('statistics.col_total') : statusLabel(key)}
              </p>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-2xl font-bold tabular-nums text-fg">
                  {report.isLoading ? '—' : value.toLocaleString()}
                </span>
                {key !== 'total' && <span className="pb-1 text-xs tabular-nums text-fg-subtle">{share}%</span>}
              </div>
              {delta != null && (
                <Delta value={delta} invert={key === 'rejected'} />
              )}
              {key !== 'total' && (
                <div className="mt-2 h-1 overflow-hidden rounded-pill bg-surface-2">
                  <div className="h-full rounded-pill" style={{ width: `${share}%`, backgroundColor: v(token) }} />
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-fg-subtle">
        {data?.previous_totals?.total ? (
          <span>
            {t('statistics.comparedPeriod')}: {dmy(data.previous_totals.date_from)} — {dmy(data.previous_totals.date_to)} ·{' '}
            {t('statistics.comparedTotal')} {data.previous_totals.total.toLocaleString()}
          </span>
        ) : (
          <span>{t('statistics.noPrevious')}</span>
        )}
        <span>
          {t('statistics.doneRate')}: <b className="text-success">{data?.done_rate ?? 0}%</b>
        </span>
      </div>

      {/* ── Diagrammalar ─────────────────────────────────────────────────── */}
      <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader
            title={t('statistics.chartTitle')}
            subtitle={groupLabel}
            action={
              <Segmented
                value={stacked ? 'stacked' : 'grouped'}
                onChange={(x) => setStacked(x === 'stacked')}
                size="sm"
                options={[
                  { value: 'grouped', label: t('statistics.grouped') },
                  { value: 'stacked', label: t('statistics.stacked') },
                ]}
              />
            }
          />
          <div className="p-4">
            {/* Legenda VA qatorlarni yoqib-o'chirish — bitta boshqaruv. Rang
                yolg'iz o'zi ma'no tashimasin uchun har chipda nom bor. */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {STATUS_KEYS.map((k) => {
                const on = !hidden.has(k)
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setHidden((prev) => {
                        const next = new Set(prev)
                        if (next.has(k)) next.delete(k)
                        else next.add(k)
                        return next
                      })
                    }
                    className={cn(
                      'flex items-center gap-1.5 rounded-pill border px-3 py-1 text-xs font-medium transition-colors',
                      on ? 'text-fg' : 'border-line text-fg-subtle',
                    )}
                    style={
                      on
                        ? {
                            borderColor: v(STATUS_TOKEN[k]),
                            backgroundColor: `rgb(var(${STATUS_TOKEN[k]}) / 0.12)`,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="h-2 w-2 rounded-pill"
                      style={{ backgroundColor: on ? v(STATUS_TOKEN[k]) : v('--fg-subtle') }}
                    />
                    {statusLabel(k)}
                  </button>
                )
              })}
            </div>

            {report.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartRows.length === 0 || visibleSeries.length === 0 ? (
              <EmptyState title={t('statistics.noData')} description={t('statistics.noDataHint')} />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartRows} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke={`rgb(var(--fg) / 0.07)`} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: v('--fg-muted'), fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: v('--fg-subtle'), fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={36}
                  />
                  <RTooltip cursor={{ fill: `rgb(var(--fg) / 0.05)` }} content={<ChartTooltip />} />
                  {visibleSeries.map((k) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      name={statusLabel(k)}
                      stackId={stacked ? 'a' : undefined}
                      fill={v(STATUS_TOKEN[k])}
                      radius={stacked ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                      maxBarSize={stacked ? 46 : 26}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('statistics.shareTitle')} />
          <div className="p-4">
            {shares.length === 0 ? (
              <EmptyState title={t('statistics.noData')} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(120, shares.length * 34)}>
                  <BarChart data={shares} layout="vertical" margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                    <XAxis type="number" hide allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fill: v('--fg-muted'), fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RTooltip cursor={{ fill: `rgb(var(--fg) / 0.05)` }} content={<ChartTooltip />} />
                    <Bar dataKey="value" name={t('statistics.col_total')} radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {shares.map((d) => (
                        <Cell key={d.key} fill={v(STATUS_TOKEN[d.key])} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                {/* Bevosita yorliqlar: to'rttadan oshmaydi, shuning uchun har
                    bo'lak nomi va soni ro'yxatda yoziladi. */}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {shares.map((d) => (
                    <li key={d.key} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2 w-2 shrink-0 rounded-pill"
                        style={{ backgroundColor: v(STATUS_TOKEN[d.key]) }}
                      />
                      <span className="flex-1 truncate text-fg-muted">{d.name}</span>
                      <span className="font-semibold tabular-nums text-fg">{d.value.toLocaleString()}</span>
                      <span className="w-9 text-right tabular-nums text-fg-subtle">
                        {totals?.total ? Math.round((d.value * 100) / totals.total) : 0}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ── Jadval ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title={t('statistics.tableTitle')}
          subtitle={t('statistics.rowCount', { count: sortedRows.length })}
        />
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th key={c} className={cn(TH, c === 'label' ? 'text-left' : 'text-right')}>
                    <button
                      type="button"
                      onClick={() => toggleSort(c)}
                      className={cn(
                        'inline-flex items-center gap-1 transition-colors',
                        sort?.key === c ? 'text-brand-strong' : 'hover:text-fg',
                      )}
                    >
                      {columnLabel(c, split ? codeLabel('group_', groupBy, groupBy) : groupLabel)}
                      {sort?.key === c && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                )).flatMap((th, i) =>
                  split && columns[i] === 'label'
                    ? [th, <th key="type" className={cn(TH, 'text-left')}>{t('statistics.requestType')}</th>]
                    : [th],
                )}
                <th className={cn(TH, 'w-32 text-right')}>{t('statistics.share')}</th>
              </tr>
            </thead>
            <tbody>
              {report.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-line">
                    {columns.map((c) => (
                      <td key={c} className={TD}>
                        <Skeleton className="h-4 w-20" />
                      </td>
                    ))}
                    <td className={TD}>
                      <Skeleton className="h-4 w-20" />
                    </td>
                  </tr>
                ))
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + (split ? 2 : 1)} className="px-6 py-12">
                    <EmptyState title={t('statistics.noData')} description={t('statistics.noDataHint')} />
                  </td>
                </tr>
              ) : (
                sortedRows.map((r) => (
                  <tr key={r.key} className="border-b border-line last:border-b-0">
                    {columns.map((c) => (
                      <td
                        key={c}
                        className={cn(TD, c !== 'label' && 'text-right tabular-nums')}
                        style={
                          c !== 'label' && c !== 'total' && r[c]
                            ? { color: v(COLUMN_TOKEN[c]) }
                            : undefined
                        }
                      >
                        {c === 'label' ? groupPart(r) : (r[c] || 0).toLocaleString()}
                      </td>
                    )).flatMap((td, i) =>
                      split && columns[i] === 'label'
                        ? [td, <td key="type" className={TD}>{typeOf(r)}</td>]
                        : [td],
                    )}
                    <td className={TD}>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                          <div
                            className="h-full rounded-pill"
                            style={{ width: `${r.share || 0}%`, backgroundColor: v(TOTAL_TOKEN) }}
                          />
                        </div>
                        <span className="w-9 text-right text-xs tabular-nums text-fg-subtle">
                          {r.share ?? 0}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {sortedRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-line bg-surface-2">
                  {columns.map((c, i) => (
                    <td
                      key={c}
                      className={cn(TD, 'font-semibold text-fg', c !== 'label' && 'text-right tabular-nums')}
                    >
                      {i === 0 ? t('statistics.totalRow') : totalFor(c).toLocaleString()}
                    </td>
                  )).flatMap((td, i) => (split && columns[i] === 'label' ? [td, <td key="type" className={TD} />] : [td]))}
                  <td className={cn(TD, 'text-right text-fg-subtle')}>100%</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* ── Ustunlarni tanlash ───────────────────────────────────────────── */}
      <Modal
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        title={t('statistics.columnsTitle')}
        description={t('statistics.columnsHint')}
        size="sm"
        footer={<Button onClick={() => setColumnsOpen(false)}>{t('statistics.done')}</Button>}
      >
        <div className="flex flex-col gap-2">
          {ALL_COLUMNS.map((c) => {
            const on = columns.includes(c)
            // Kesim ustuni O'CHIRILMAYDI: usiz jadvalda qator qaysi davrga
            // tegishli ekani ko'rinmaydi, eksport esa raqamlar to'plamiga aylanadi.
            const locked = c === 'label'
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                disabled={locked}
                onClick={() => toggleColumn(c)}
                className={cn(
                  'rounded-inner border px-3 py-2 text-left text-sm font-medium transition-colors',
                  on ? 'border-brand bg-brand-soft text-brand-strong' : 'border-line text-fg-muted hover:text-fg',
                  locked && 'cursor-not-allowed opacity-60',
                )}
              >
                {columnLabel(c, groupLabel)}
              </button>
            )
          })}
        </div>
      </Modal>

      {/* ── Shablon saqlash ──────────────────────────────────────────────── */}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={t('statistics.templateTitle')}
        description={t('statistics.templateHint')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)} disabled={save.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveTemplate} loading={save.isPending}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('statistics.templateName')} required>
          <Input
            value={templateName}
            placeholder={t('statistics.templateNamePlaceholder')}
            onChange={(e) => setTemplateName(e.target.value)}
          />
        </Field>
        {/* Ulashilgan shablonni HAMMA ko'radi, lekin faqat MUALLIF o'chira
            oladi — backenddagi qoidaning ko'zgusi. */}
        <div className="mt-3">
          <Segmented
            value={templateShared ? 'shared' : 'private'}
            onChange={(x) => setTemplateShared(x === 'shared')}
            size="sm"
            options={[
              { value: 'private', label: t('statistics.templatePrivate') },
              { value: 'shared', label: t('statistics.templateShared') },
            ]}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={confirmDelete}
        title={t('statistics.templateDeleteTitle')}
        description={t('statistics.templateDeleteText', { name: toDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
      />
    </>
  )
}

/** O'zgarish ko'rsatkichi: strelka + foiz. Rangi YO'NALISHGA qarab — rad
 *  etilganning o'sishi «yomon», qolganlariniki «yaxshi». */
function Delta({ value, invert }: { value: number; invert?: boolean }) {
  const good = invert ? value <= 0 : value >= 0
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUp : ArrowDown
  return (
    <span
      className={cn(
        'mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-semibold',
        value === 0 ? 'text-fg-subtle' : good ? 'text-success' : 'text-danger',
      )}
    >
      <Icon size={11} />
      {Math.abs(value)}%
    </span>
  )
}
