import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useListParams } from '@/hooks/useListParams'
import { FilterReset } from '@/components/data/FilterReset'
import { isInvalidRange } from '@/lib/dateRange'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Columns3,
  Download,
  FileText,
  Inbox,
  ShieldQuestion,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { errorMessage } from '@/api/errorMessage'
import {
  DASHBOARD_DEPARTMENTS_EMPLOYEE_COUNT,
  DASHBOARD_JOB_POSITION_STATS,
  DASHBOARD_MAIN,
  EMPLOYEES_LIST,
} from '@/api/endpoints'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { DateInput } from '@/components/ui/DateInput'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { EmployeeStatsRow } from '@/features/employees/EmployeeStatsRow'
import { useEmployeeStats } from '@/features/employees/useEmployeeKpi'
import { useBranchStore } from '@/store/branchStore'
import i18n from '@/i18n'
import { apiClient } from '@/api/client'
import { XLSX_MIME, exportTable, type TableFormat } from '@/lib/download'
import { formatAppDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { useRequestStats, type RequestStatRow } from '@/features/reports/useRequestStats'
import { useDynamicT } from '@/i18n/dynamicKey'
import { canManageStructure } from '@/auth/canManage'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { StatisticsConstructor } from '@/features/statistics/StatisticsConstructor'
import { ChartTooltip } from '@/components/data/ChartTooltip'
import { ReportCatalog } from '@/features/reports/ReportCatalog'
import { useReportCatalog } from '@/features/reports/useReportCatalog'

/**
 * STATISTIK HISOBOT — TZ 4.2.11 (Схема №11).
 *
 * TZ beshta narsani nomma-nom talab qiladi va sahifa aynan shu beshtadan
 * yig'ilgan:
 *   1. So'rov bo'yicha generatsiya — davr va mezonlar foydalanuvchi tanlovi;
 *   2. Jadval: murojaat sanasi, turi, soni, ishlov holati + USTUN KO'RINISHI
 *      va istalgan ustun bo'yicha SARALASH;
 *   3. Diagrammalar — jadval ma'lumotidan avtomatik (davr / tur / holat);
 *   4. Filtrlar jadvalni HAM, diagrammani HAM bir vaqtda yangilaydi;
 *   5. Excel va PDF eksporti, joriy filtr va ustun tanlovini SAQLAB.
 *
 * ⚠️ 4-band shuning uchun bitta manbadan chiziladi: jadval va diagramma
 * boshqa-boshqa so'rovdan olinsa, filtr biriga qo'llanib ikkinchisida qolib
 * ketardi — bu aynan TZ taqiqlagan holat.
 *
 * Ikkinchi tab — kadrlar tarkibi ko'rsatkichlari (yosh, millat, bo'lim,
 * lavozim). U TZ dan tashqarida emas: 4.2.11 «добавление новых форм отчетов»
 * ni ham talab qiladi, ya'ni sahifa bir nechta hisobot shaklini ko'taradi.
 *
 * UCHINCHI tab — HISOBOT KONSTRUKTORI (`features/statistics`). Yuqoridagi
 * ikkalasi TAYYOR hisobot: ularning kesimi va ustunlari kodda qat'iy. Uchinchisi
 * esa `/statistics/*` moduliga tayanadi va hisobotni foydalanuvchi o'zi
 * yig'adi — «добавление новых форм отчетов» talabining to'liq bajarilishi.
 * ⚠️ U QO'SHIMCHA, almashtiruv emas: birinchi ikki tab o'z manbasi va o'z
 * savoliga ega bo'lib qoladi.
 */

const v = (name: string) => `rgb(var(${name}))`

type Tab = 'catalog' | 'requests' | 'staff' | 'constructor'
type SortKey = 'date' | 'service' | 'status' | 'count'
type SortDir = 'asc' | 'desc'

const ALL_COLUMNS: { key: SortKey; labelKey: string }[] = [
  { key: 'date', labelKey: 'reports.colDate' },
  { key: 'service', labelKey: 'reports.colType' },
  { key: 'status', labelKey: 'reports.colState' },
  { key: 'count', labelKey: 'reports.colCount' },
]

const REPORT_FILTERS = ['from', 'to', 'type', 'status'] as const

export function ReportsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const user = useAuthStore((st) => st.user)

  /**
   * ⚠️ MUROJAATLAR STATISTIKASI HAMMAGA OCHIQ EMAS.
   * `GET /service-requests/statistics` ni faqat so'rovlarni KO'RIB
   * CHIQADIGAN rol oladi (backend: `ServiceRequestService.can_manage` →
   * `org_structure_scope` — kadr / admin / master-admin). Rahbariyat esa
   * kadrlar tarkibi hisobotini ko'radi. Ilgari sahifa doim «murojaatlar»
   * tabidan boshlanardi va rahbariyat 403 bilan bo'sh diagrammaga tushardi.
   */
  const canRequests = canManageStructure(user)
  /**
   * Konstruktorning darvozasi backenddagi `statistics.py::_require_manager`
   * ning ko'zgusi: admin / master-admin / KADR (`canManageStructure`) va
   * RAHBARIYAT (ministr, o'rinbosar). Rahbariyat bu yerda ataylab bor —
   * TZ R2 «Просмотр статистики» ning ASOSIY aktyori aynan u.
   */
  const canConstructor = canManageStructure(user) || roles.isMinister(user) || roles.isDeputy(user)
  /**
   * HISOBOTLAR KATALOGI — the report engine (tabel, KPI, kadr harakati…).
   * Server-decided: the catalogue lists only what this person may run, so a
   * line manager sees the tabel and nothing else. Default tab when non-empty.
   */
  const catalog = useReportCatalog()
  const hasCatalog = catalog.isLoading || catalog.items.length > 0
  const requested = params.get('tab') as Tab | null
  // Ruxsati bo'lmagan tabga URL orqali ham kirib bo'lmaydi — noto'g'ri `?tab=`
  // ochilgan sahifada bo'sh 403 ekran chiqmasin.
  const allowed = (value: Tab | null): value is Tab =>
    value === 'staff'
    || (value === 'catalog' && hasCatalog)
    || (value === 'requests' && canRequests)
    || (value === 'constructor' && canConstructor)
  const tab: Tab = allowed(requested) ? requested : hasCatalog ? 'catalog' : canRequests ? 'requests' : 'staff'

  const setTab = (value: string) => {
    const p = new URLSearchParams(params)
    p.set('tab', value)
    setParams(p, { replace: true })
  }

  const tabs = [
    ...(hasCatalog ? [{ value: 'catalog', label: t('reports.tabCatalog') }] : []),
    ...(canRequests ? [{ value: 'requests', label: t('reports.tabRequests') }] : []),
    { value: 'staff', label: t('reports.tabStaff') },
    ...(canConstructor ? [{ value: 'constructor', label: t('statistics.tab') }] : []),
  ]

  return (
    <PageContainer>
      <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />

      {tabs.length > 1 && (
        <div className="mb-4">
          <Segmented value={tab} onChange={setTab} options={tabs} />
        </div>
      )}

      {tab === 'catalog' ? (
        <ReportCatalog />
      ) : tab === 'requests' ? (
        <RequestsReport />
      ) : tab === 'constructor' ? (
        <StatisticsConstructor />
      ) : (
        <StaffReport />
      )}
    </PageContainer>
  )
}

// ── 1. Murojaatlar hisoboti (TZ 4.2.11 asosiy shakli) ──────────────────────

function RequestsReport() {
  const { t } = useTranslation()
  const tk = useDynamicT()
  const toast = useToast()

  /**
   * Xizmat turi va holat nomlari — TILGA BOG'LIQ, shuning uchun ular lug'atdan
   * olinadi, backend qaytargan `service_label` / `status_label` dan EMAS.
   * Backend nomlari faqat o'zbekcha keladi; rus tiliga o'tilganda jadval va
   * diagramma ichida o'zbekcha yozuv qolib ketardi (TZ 4.1.7: «Все надписи…
   * должны быть на выбранном пользователем языке»). Noma'lum kod uchun server
   * matni zaxira bo'lib qoladi — ekran hech qachon bo'sh chiqmaydi.
   */
  const serviceLabel = (code: string, fallback: string) => {
    const key = `services.type_${code}`
    return i18n.exists(key) ? tk(key) : fallback
  }
  const statusLabel = (code: string, fallback: string) => {
    const key = `services.status_${code}`
    return i18n.exists(key) ? tk(key) : fallback
  }
  const branchId = useBranchStore((s) => s.selectedBranchId)

  // Filters live in the URL (shareable, survive the back button) instead of
  // component state that vanished on every navigation.
  const { filters, setFilter, activeFilterCount, reset } = useListParams(REPORT_FILTERS)
  const dateFrom = filters.from
  const dateTo = filters.to
  const serviceType = filters.type
  const status = filters.status
  const rangeInvalid = isInvalidRange(dateFrom, dateTo)
  const [groupBy, setGroupBy] = useState<'date' | 'service' | 'status'>('date')
  const [hidden, setHidden] = useState<Set<SortKey>>(new Set())
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'date', dir: 'desc' })
  const [exporting, setExporting] = useState<TableFormat | null>(null)

  const stats = useRequestStats(
    {
      date_from: dateFrom,
      date_to: dateTo,
      service_type: serviceType,
      status,
      organization_branch_id: branchId,
    },
    { enabled: !rangeInvalid },
  )

  const denied = (stats.error as { response?: { status?: number } } | null)?.response?.status === 403
  const rows = useMemo(() => stats.data?.rows ?? [], [stats.data])

  const columns = ALL_COLUMNS.filter((c) => !hidden.has(c.key))

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const value = (r: RequestStatRow): string | number =>
      sort.key === 'date'
        ? r.date
        : sort.key === 'service'
          ? serviceLabel(r.service_type, r.service_label)
          : sort.key === 'status'
            ? statusLabel(r.status, r.status_label)
            : r.count
    return [...rows].sort((a, b) => {
      const av = value(a)
      const bv = value(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [rows, sort])

  const total = rows.reduce((n, r) => n + r.count, 0)
  const byStatus = (codes: string[]) =>
    rows.filter((r) => codes.includes(r.status)).reduce((n, r) => n + r.count, 0)

  const summary = [
    { key: 'total', icon: <Inbox size={18} />, tone: '--brand', label: t('reports.sumTotal'), value: total },
    {
      key: 'open',
      icon: <Clock size={18} />,
      tone: '--warning',
      label: t('reports.sumOpen'),
      value: byStatus(['accepted', 'in_review', 'in_progress', 'ready']),
    },
    {
      key: 'done',
      icon: <CheckCircle2 size={18} />,
      tone: '--success',
      label: t('reports.sumDone'),
      value: byStatus(['issued']),
    },
    {
      key: 'rejected',
      icon: <AlertTriangle size={18} />,
      tone: '--danger',
      label: t('reports.sumRejected'),
      value: byStatus(['rejected', 'cancelled']),
    },
  ]

  /** Diagramma JADVAL ma'lumotidan quriladi — TZ: «Автоматическое построение
   *  диаграмм на основе табличных данных». O'q tanlovi = guruhlash kaliti. */
  const chartData = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of rows) {
      const key =
        groupBy === 'date'
          ? r.date
          : groupBy === 'service'
            ? serviceLabel(r.service_type, r.service_label)
            : statusLabel(r.status, r.status_label)
      map.set(key, (map.get(key) ?? 0) + r.count)
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => (groupBy === 'date' ? a.name.localeCompare(b.name) : b.value - a.value))
  }, [rows, groupBy])

  const filterSummary = [
    dateFrom || dateTo
      ? `${t('reports.period')}: ${dateFrom ? formatAppDate(dateFrom) : '…'} – ${dateTo ? formatAppDate(dateTo) : '…'}`
      : t('reports.allPeriod'),
    serviceType
      ? `${t('reports.type')}: ${serviceLabel(serviceType, stats.data?.service_types.find((s) => s.value === serviceType)?.label ?? serviceType)}`
      : null,
    status
      ? `${t('reports.state')}: ${statusLabel(status, stats.data?.statuses.find((s) => s.value === status)?.label ?? status)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const doExport = async (format: TableFormat) => {
    setExporting(format)
    try {
      await exportTable({
        title: t('reports.requestReportTitle'),
        // Eksport joriy FILTRNI ham saqlaydi — qog'ozdagi jadval qaysi
        // shartda olinganini o'zi aytib turishi kerak.
        subtitle: filterSummary,
        headers: columns.map((c) => t(c.labelKey as 'reports.colDate')),
        rows: sorted.map((r) =>
          columns.map((c) =>
            c.key === 'date'
              ? formatAppDate(r.date)
              : c.key === 'service'
                ? serviceLabel(r.service_type, r.service_label)
                : c.key === 'status'
                  ? statusLabel(r.status, r.status_label)
                  : r.count,
          ),
        ),
        format,
        filename: t('reports.requestReportTitle'),
      })
      toast.ok(t('reports.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('reports.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  if (denied) {
    return (
      <Card className="p-10">
        <EmptyState
          icon={<ShieldQuestion size={26} />}
          title={t('common.noAccess')}
          description={t('reports.noAccessHint')}
        />
      </Card>
    )
  }

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  return (
    <>
      {/* 1 + 4. Filtrlar — jadvalni ham, diagrammani ham bir vaqtda yangilaydi */}
      <Card className="mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t('reports.dateFrom')} error={rangeInvalid ? t('list.invalidRange') : undefined}>
            <DateInput value={dateFrom} onChange={(v) => setFilter('from', v)} invalid={rangeInvalid} />
          </Field>
          <Field label={t('reports.dateTo')}>
            <DateInput value={dateTo} onChange={(v) => setFilter('to', v)} invalid={rangeInvalid} />
          </Field>
          <Field label={t('reports.type')}>
            <Select
              value={serviceType}
              onChange={(e) => setFilter('type', e.target.value)}
              placeholder={t('reports.allTypes')}
              options={(stats.data?.service_types ?? []).map((s) => ({
                value: s.value,
                label: serviceLabel(s.value, s.label),
              }))}
            />
          </Field>
          <Field label={t('reports.state')}>
            <Select
              value={status}
              onChange={(e) => setFilter('status', e.target.value)}
              placeholder={t('reports.allStates')}
              options={(stats.data?.statuses ?? []).map((s) => ({
                value: s.value,
                label: statusLabel(s.value, s.label),
              }))}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <FilterReset count={activeFilterCount} onReset={reset} />
          <span className="text-xs text-fg-subtle">{filterSummary}</span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Download size={14} />}
              loading={exporting === 'xlsx'}
              disabled={!rows.length}
              onClick={() => doExport('xlsx')}
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
          </div>
        </div>
      </Card>

      {/* Yig'ma ko'rsatkichlar */}
      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.key} className="flex items-center gap-3 p-4">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
              style={{ backgroundColor: `rgb(var(${s.tone}) / 0.14)`, color: v(s.tone) }}
            >
              {s.icon}
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums text-fg">
                {stats.isLoading ? '—' : s.value}
              </p>
              <p className="truncate text-xs text-fg-muted">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* 3. Diagramma — o'q tanlanadi */}
      <Card className="mb-4">
        <CardHeader
          title={t('reports.chartTitle')}
          action={
            <Segmented
              value={groupBy}
              onChange={(x) => setGroupBy(x as typeof groupBy)}
              options={[
                { value: 'date', label: t('reports.byPeriod') },
                { value: 'service', label: t('reports.byType') },
                { value: 'status', label: t('reports.byState') },
              ]}
            />
          }
        />
        <div className="min-h-[260px] p-4">
          {stats.isLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : chartData.length === 0 ? (
            <EmptyState title={t('reports.noData')} description={t('reports.noDataHint')} />
          ) : (
            /* A chart is a picture to assistive tech: without a role and a
               name it is announced as nothing at all. The hand-rolled Donut
               already does this; the recharts ones were missed. */
            <div role="img" aria-label={t('reports.chartAria')}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 4 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: v('--fg-muted'), fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                  tickFormatter={(x: string) => (groupBy === 'date' ? formatAppDate(x) : x)}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: v('--fg-subtle'), fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                {/* ⚠️ `contentStyle` FAQAT o'rovchini bo'yaydi — ichkaridagi
                    qator spanlari recharts'ning O'Z QORA rangida qoladi va
                    tungi rejimda o'qib bo'lmasdi. Ustiga u `dataKey` ni
                    ko'rsatib, foydalanuvchiga «value : 7» deb chiqardi.
                    Shuning uchun o'z komponentimiz (dashboard'dagi
                    `ArrivalTooltip` bilan bir xil yechim). */}
                <RTooltip
                  cursor={{ fill: `rgb(var(--fg) / 0.05)` }}
                  content={<ChartTooltip formatLabel={(raw) => (groupBy === 'date' ? formatAppDate(raw) : raw)} valueLabel={t('reports.colCount')} />}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={44}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={v(`--chart-${(i % 6) + 1}`)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>

      {/* 2. Jadval — ustun ko'rinishi + saralash */}
      <Card>
        {/* USTUN KO'RINISHI — TZ 4.2.11 §2 «Настройка видимости столбцов».
            ⚠️ Ochiladigan menyu EMAS, inline chiplar: `Card` da `overflow-hidden`
            bor, ya'ni sarlavha ichiga qo'yilgan absolyut menyu kartochka
            chegarasida KESILIB qolardi va unga umuman bosib bo'lmasdi (jonli
            testda aynan shu yiqildi). To'rtta ustun uchun chiplar baribir
            ravshanroq: nima yoqilgani ko'rinib turadi. */}
        <CardHeader
          title={t('reports.tableTitle')}
          action={
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 flex items-center gap-1 text-xs text-fg-subtle">
                <Columns3 size={13} /> {t('reports.columns')}
              </span>
              {ALL_COLUMNS.map((c) => {
                const on = !hidden.has(c.key)
                // Oxirgi ko'rinib turgan ustunni yashirib bo'lmaydi — bo'sh
                // jadval hech kimga kerak emas.
                const last = on && hidden.size >= ALL_COLUMNS.length - 1
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    disabled={last}
                    onClick={() =>
                      setHidden((prev) => {
                        const next = new Set(prev)
                        if (next.has(c.key)) next.delete(c.key)
                        else next.add(c.key)
                        return next
                      })
                    }
                    className={cn(
                      'rounded-pill border px-2.5 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-brand bg-brand-soft text-brand-strong'
                        : 'border-line text-fg-subtle hover:text-fg',
                      last && 'cursor-not-allowed opacity-60',
                    )}
                  >
                    {t(c.labelKey as 'reports.colDate')}
                  </button>
                )
              })}
            </div>
          }
        />
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line">
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-2.5 text-left">
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        'inline-flex items-center gap-1 text-xs font-semibold transition-colors',
                        sort.key === c.key ? 'text-brand-strong' : 'text-fg-muted hover:text-fg',
                      )}
                    >
                      {t(c.labelKey as 'reports.colDate')}
                      {sort.key === c.key &&
                        (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-line">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-2.5">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-10">
                    <EmptyState title={t('reports.noData')} description={t('reports.noDataHint')} />
                  </td>
                </tr>
              ) : (
                sorted.map((r, i) => (
                  <tr key={`${r.date}-${r.service_type}-${r.status}-${i}`} className="border-b border-line last:border-b-0">
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn('px-4 py-2.5', c.key === 'count' && 'tabular-nums font-medium')}
                      >
                        {c.key === 'date'
                          ? formatAppDate(r.date)
                          : c.key === 'service'
                            ? serviceLabel(r.service_type, r.service_label)
                            : c.key === 'status'
                              ? statusLabel(r.status, r.status_label)
                              : r.count}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
            {sorted.length > 0 && (
              <tfoot>
                <tr className="border-t border-line bg-surface-2">
                  {columns.map((c, i) => (
                    <td key={c.key} className="px-4 py-2.5 text-sm font-semibold text-fg">
                      {c.key === 'count' ? total : i === 0 ? t('reports.totalRow') : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </>
  )
}

// ── 2. Kadrlar tarkibi hisoboti ────────────────────────────────────────────

interface DeptCount {
  department_id: number
  department_name: string
  total_count: number
}
interface PosStat {
  job_position_name: string
  count: number
}

/** Kadrlar hisobotining ustunlari. Eksport «hammasini» emas, ANIQ ro'yxatni
 *  yuboradi — shu sababli pasport raqami hisobotga hech qachon tushmaydi. */
const REPORT_COLUMNS = {
  include_fish: true,
  include_department: true,
  include_job_position: true,
  include_nationlity: true,
  include_birth_date: true,
  include_gender: true,
  include_phone: true,
  include_branch: true,
  include_job_acceptance_date: true,
}

function StaffReport() {
  const { t } = useTranslation()
  const toast = useToast()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const [exporting, setExporting] = useState(false)
  const branchParam = { organization_branch_id: branchId || undefined }
  const stats = useEmployeeStats()

  const main = useQuery({
    queryKey: ['dashboard-main', branchId],
    queryFn: () => apiGet<{ total_employees_count: number }>(DASHBOARD_MAIN, branchParam),
  })
  const deptCount = useQuery({
    queryKey: ['dept-count', branchId],
    queryFn: () => apiGet<DeptCount[]>(DASHBOARD_DEPARTMENTS_EMPLOYEE_COUNT, branchParam),
  })
  const posStats = useQuery({
    queryKey: ['pos-stats', branchId],
    queryFn: () => apiGet<PosStat[]>(DASHBOARD_JOB_POSITION_STATS, branchParam),
  })

  const avgKpi = useMemo(() => {
    const list = stats.kpiTrend
    if (!list.length) return 0
    return Math.round(Number(list[list.length - 1]?.kpi_percentage) || 0)
  }, [stats.kpiTrend])

  const tasksDone = stats.cards?.completed_tasks_count ?? 0
  const tk = stats.tasks

  const summary = [
    { key: 'total', icon: <Users size={18} />, tone: '--brand', label: t('reports.totalEmployees'), value: main.data?.total_employees_count ?? 0 },
    { key: 'kpi', icon: <TrendingUp size={18} />, tone: '--success', label: t('reports.avgKpi'), value: avgKpi, suffix: '%' },
    { key: 'done', icon: <CheckCircle2 size={18} />, tone: '--accent', label: t('reports.tasksDone'), value: tasksDone },
    { key: 'absent', icon: <TrendingDown size={18} />, tone: '--danger', label: t('reports.absentToday'), value: tk?.absent_employee_count ?? 0 },
    { key: 'late', icon: <Clock size={18} />, tone: '--warning', label: t('reports.lateToday'), value: tk?.late_employee_count ?? 0 },
    { key: 'low', icon: <AlertTriangle size={18} />, tone: '--chart-5', label: t('reports.kpiLow'), value: tk?.kpi_below_50_employee_count ?? 0 },
  ]

  const exportExcel = async () => {
    setExporting(true)
    try {
      const res = await apiClient.post(`${EMPLOYEES_LIST}/export-excel`, REPORT_COLUMNS, {
        params: { organization_branch_id: branchId || undefined },
        responseType: 'blob',
        timeout: 300_000,
      })
      const href = URL.createObjectURL(new Blob([res.data as BlobPart], { type: XLSX_MIME }))
      const link = document.createElement('a')
      link.href = href
      link.download = `Hisobot_${new Date().toISOString().slice(0, 10)}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(href)
      toast.ok(t('reports.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('reports.exportFailed')))
    } finally {
      setExporting(false)
    }
  }

  const exportDistribution = async (format: TableFormat) => {
    try {
      await exportTable({
        title: t('reports.byDepartment'),
        subtitle: `${t('reports.totalEmployees')}: ${main.data?.total_employees_count ?? 0}`,
        headers: [t('reports.colDepartment'), t('reports.colCount')],
        rows: (deptCount.data ?? []).map((d) => [d.department_name, d.total_count]),
        format,
        filename: t('reports.byDepartment'),
      })
      toast.ok(t('reports.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('reports.exportFailed')))
    }
  }

  return (
    <>
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <p className="text-sm text-fg-muted">{t('reports.staffHint')}</p>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Download size={14} />}
            loading={exporting}
            onClick={exportExcel}
          >
            {t('reports.exportRoster')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<FileText size={14} />}
            onClick={() => exportDistribution('pdf')}
          >
            PDF
          </Button>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {summary.map((s) => (
          <Card key={s.key} className="flex items-center gap-3 p-4">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
              style={{ backgroundColor: `rgb(var(${s.tone}) / 0.14)`, color: v(s.tone) }}
            >
              {s.icon}
            </span>
            <div className="min-w-0">
              <p className="text-2xl font-bold tabular-nums text-fg">
                {s.value}
                {s.suffix ?? ''}
              </p>
              <p className="truncate text-xs text-fg-muted">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="mb-4">
        <EmployeeStatsRow
          age={stats.age}
          ageLoading={stats.ageLoading}
          nationality={stats.nationality}
          nationalityLoading={stats.nationalityLoading}
          kpiTrend={stats.kpiTrend}
          kpiTrendLoading={stats.kpiTrendLoading}
          cards={stats.cards}
          cardsLoading={stats.cardsLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DistributionCard
          title={t('reports.byDepartment')}
          loading={deptCount.isLoading}
          data={(deptCount.data ?? []).map((d) => ({ name: d.department_name, value: d.total_count }))}
          color="--brand"
        />
        <DistributionCard
          title={t('reports.byPosition')}
          loading={posStats.isLoading}
          data={(posStats.data ?? []).map((p) => ({ name: p.job_position_name, value: p.count }))}
          color="--accent"
        />
      </div>
    </>
  )
}

function DistributionCard({
  title,
  loading,
  data,
  color,
}: {
  title: string
  loading: boolean
  data: { name: string; value: number }[]
  color: string
}) {
  const { t } = useTranslation()
  const top = useMemo(() => [...data].sort((a, b) => b.value - a.value).slice(0, 8), [data])
  return (
    <Card className="flex flex-col">
      <CardHeader title={title} />
      <div className="min-h-[280px] flex-1 p-4">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : top.length === 0 ? (
          <EmptyState title={t('reports.noData')} />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={top} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <XAxis type="number" tick={{ fill: v('--fg-subtle'), fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={130}
                tick={{ fill: v('--fg-muted'), fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16}>
                {top.map((_, i) => (
                  <Cell key={i} fill={v(color)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

/**
 * Diagramma tooltipi — TZ 4.2.11 §3.
 *
 * O'z komponentimiz, `contentStyle` EMAS: oxirgisi faqat tashqi qutini
 * bo'yaydi va ichkaridagi matn recharts'ning sukut QORA rangida qolib,
 * tungi rejimda ko'rinmay qolardi (o'lchov: 1.25:1). Bundan tashqari sukut
 * tooltip `dataKey` ni sarlavha qilib «value : 7» deb yozardi.
 */
