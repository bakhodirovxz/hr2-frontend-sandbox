import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Briefcase, FileSpreadsheet, FileText, GraduationCap, Minus, RefreshCw, Settings2, Target, TrendingDown, TrendingUp, Users } from 'lucide-react'
import { errorMessage } from '@/api/errorMessage'
import { useToast } from '@/components/ui/Toast'
import { useListParams } from '@/hooks/useListParams'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { FilterReset } from '@/components/data/FilterReset'
import { LoadError } from '@/components/data/LoadError'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { downloadDashboardExport, type DashboardCategory, type DashboardParams, type DashboardWidget } from './api'
import { DashboardSettings, DrillDrawer, type DrillTarget } from './DashboardExtras'
import { dmy, isoDate, reversed } from './reportUtils'
import { useServerText } from './serverText'
import { ALL_BRANCHES, useDashboard, useStatBranch } from './useStatistics'

const ReportBarChart = lazy(() => import('./ReportBarChart'))

/**
 * TZ R2 «Просмотр статистики» — KO'RSATKICHLAR PANELI (v1 `StatsDashboard`).
 *
 * Toifa (kadrlar / vakansiyalar / KPI / o'qish), davr, tashkilot / bo'lim /
 * lavozim filtrlari (TZ R2 1518–1519) va ixtiyoriy solishtirish davri
 * (TZ R2 1528; berilmasa — oldingi teng uzunlikdagi davr). Vidjetlar joriy
 * qiymat, solishtirish qiymati va o'sish/pasayishni ko'rsatadi; ostida
 * kesim diagrammalari. Filtrlar URL da (`d…` kalitlari) — havola ulashiladi.
 */

const CATEGORIES: { value: DashboardCategory; Icon: typeof Users }[] = [
  { value: 'staff', Icon: Users },
  { value: 'vacancies', Icon: Briefcase },
  { value: 'kpi', Icon: Target },
  { value: 'training', Icon: GraduationCap },
]

const FILTER_KEYS = ['dcat', 'dfrom', 'dto', 'dbranch', 'ddept', 'dpos', 'dcmp', 'dcfrom', 'dcto'] as const

const fmt = (v: number | null | undefined) =>
  v == null ? '—' : Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 2 })

export function StatsDashboard() {
  const { t } = useTranslation()
  const st = useServerText()
  const toast = useToast()
  const [drill, setDrill] = useState<DrillTarget | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null)
  const { filters, setFilter, setFilters, activeFilterCount, reset } = useListParams(FILTER_KEYS)
  const now = new Date()
  const category = (CATEGORIES.some((c) => c.value === filters.dcat) ? filters.dcat : 'staff') as DashboardCategory
  const from = filters.dfrom || isoDate(new Date(now.getFullYear(), 0, 1))
  const to = filters.dto || isoDate(now)
  const { branchId, selectValue, branches } = useStatBranch(filters.dbranch)
  const deptOptions = useDepartmentOptions(branchId)
  const posOptions = useJobPositionOptions(branchId)
  const compareOn = filters.dcmp === '1'
  const compareActive = compareOn && !!filters.dcfrom && !!filters.dcto
  const badPeriod = reversed(from, to)
  const badCompare = compareActive && reversed(filters.dcfrom, filters.dcto)

  const params: DashboardParams = {
    category,
    period_from: from,
    period_to: to,
    ...(branchId ? { branch_id: branchId } : {}),
    ...(filters.ddept ? { department_id: Number(filters.ddept) } : {}),
    ...(filters.dpos ? { job_position_id: Number(filters.dpos) } : {}),
    ...(compareActive ? { compare_from: filters.dcfrom, compare_to: filters.dcto } : {}),
  }
  const q = useDashboard(params, !badPeriod && !badCompare)
  const data = q.data
  const allWidgets = (data?.widgets ?? []).filter((w) => w && typeof w === 'object')
  const allCharts = (data?.charts ?? []).filter((c) => c && Array.isArray(c.data))
  // Sozlamada yashirilganlar chizilmaydi (eski javobda `visible` yo'q — hammasi ko'rinadi).
  const widgets = allWidgets.filter((w) => w.visible !== false)
  const charts = allCharts.filter((c) => c.visible !== false)

  const doExport = async (format: 'xlsx' | 'pdf') => {
    setExporting(format)
    try {
      await downloadDashboardExport(params, format)
      toast.ok(t('statistics.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('statistics.exportFailed')))
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toifa + filtrlar ── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label={t('statReports.category')}
            value={category}
            onChange={(v) => setFilter('dcat', v === 'staff' ? '' : v)}
            options={CATEGORIES.map(({ value, Icon }) => ({
              value,
              label: t(`statReports.dash_${value}` as 'statReports.dash_staff'),
              icon: <Icon size={14} />,
            }))}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <FilterReset count={activeFilterCount} onReset={reset} />
            <Button size="sm" variant="outline" leftIcon={<Settings2 size={14} />} disabled={!data} onClick={() => setSettingsOpen(true)}>
              {t('statDash.settings')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<FileSpreadsheet size={14} />}
              loading={exporting === 'xlsx'}
              disabled={!data || (!!exporting && exporting !== 'xlsx')}
              onClick={() => void doExport('xlsx')}
            >
              Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<FileText size={14} />}
              loading={exporting === 'pdf'}
              disabled={!data || (!!exporting && exporting !== 'pdf')}
              onClick={() => void doExport('pdf')}
            >
              PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<RefreshCw size={14} className={q.isFetching ? 'animate-spin' : undefined} />}
              onClick={() => void q.refetch()}
            >
              {t('statReports.refresh')}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label={t('statistics.dateFrom')} error={badPeriod ? t('list.invalidRange') : undefined}>
            <DateInput value={from} onChange={(x) => setFilter('dfrom', x)} invalid={badPeriod} />
          </Field>
          <Field label={t('statistics.dateTo')}>
            <DateInput value={to} onChange={(x) => setFilter('dto', x)} invalid={badPeriod} />
          </Field>
          <Field label={t('statReports.organization')}>
            <Select
              value={selectValue}
              onChange={(e) => setFilters({ dbranch: e.target.value, ddept: null, dpos: null })}
              options={[
                { value: ALL_BRANCHES, label: t('statistics.allBranches') },
                ...branches.map((b) => ({ value: String(b.id), label: b.name })),
              ]}
            />
          </Field>
          <Field label={t('statReports.department')}>
            <Combobox
              value={filters.ddept}
              onChange={(v) => setFilter('ddept', v)}
              options={deptOptions}
              placeholder={t('statReports.allDepartments')}
            />
          </Field>
          <Field label={t('statReports.position')}>
            <Combobox
              value={filters.dpos}
              onChange={(v) => setFilter('dpos', v)}
              options={posOptions}
              placeholder={t('statReports.allPositions')}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Checkbox
            label={t('statReports.compareOther')}
            checked={compareOn}
            onChange={(e) => setFilters({ dcmp: e.target.checked ? '1' : null, dcfrom: null, dcto: null })}
          />
          {compareOn ? (
            <div className="grid w-full max-w-md grid-cols-2 gap-2">
              <Field label={t('statReports.compareFrom')} error={badCompare ? t('list.invalidRange') : undefined}>
                <DateInput value={filters.dcfrom} onChange={(x) => setFilter('dcfrom', x)} invalid={badCompare} />
              </Field>
              <Field label={t('statReports.compareTo')}>
                <DateInput value={filters.dcto} onChange={(x) => setFilter('dcto', x)} invalid={badCompare} />
              </Field>
            </div>
          ) : (
            <span className="text-[12px] text-fg-subtle">{t('statReports.compareDefault')}</span>
          )}
        </div>
      </Card>

      {q.error ? (
        <Card className="p-6">
          <LoadError error={q.error} onRetry={() => void q.refetch()} />
        </Card>
      ) : q.isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : !allWidgets.length && !allCharts.length ? (
        <Card className="p-10">
          <EmptyState title={t('statistics.noData')} description={t('statistics.noDataHint')} />
        </Card>
      ) : (
        <>
          {data?.previous_period && (
            <p className="text-xs text-fg-subtle">
              {t('statReports.periodLine', {
                from: dmy(data.period.from),
                to: dmy(data.period.to),
                pfrom: dmy(data.previous_period.from),
                pto: dmy(data.previous_period.to),
              })}
            </p>
          )}
          <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5', q.isFetching && 'opacity-70')} aria-busy={q.isFetching}>
            {widgets.map((w) => (
              <WidgetCard
                key={w.code}
                w={w}
                label={st(w.label)}
                unit={st(w.unit)}
                custom={data?.comparison === 'custom'}
                onOpen={() => setDrill({ widget: w.code, title: st(w.label) })}
              />
            ))}
          </div>
          {charts.length > 0 && (
            <div className="grid gap-4 xl:grid-cols-2">
              {charts.map((c) => (
                <Card key={c.code} role="region" aria-label={st(c.label)}>
                  <CardHeader title={st(c.label)} />
                  <div className="p-4">
                    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                      <ReportBarChart
                        rows={c.data.map((d) => ({ __x: st(d.label), value: d.value }))}
                        series={[{ key: 'value', label: st(c.label) }]}
                        height={260}
                        onBarClick={(i) => {
                          const item = c.data[i]
                          if (item?.key != null) setDrill({ widget: c.code, key: String(item.key), title: `${st(c.label)} · ${st(item.label)}` })
                        }}
                      />
                    </Suspense>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      {drill && <DrillDrawer target={drill} params={params} onClose={() => setDrill(null)} />}
      {settingsOpen && (
        <DashboardSettings category={category} widgets={allWidgets} charts={allCharts} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}

function WidgetCard({
  w,
  label,
  unit,
  custom,
  onOpen,
}: {
  w: DashboardWidget
  label: string
  unit: string
  custom: boolean
  onOpen: () => void
}) {
  const { t } = useTranslation()
  const trend = w.trend === 'up' || w.trend === 'down' ? w.trend : 'flat'
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendLabel = t(`statReports.trend_${trend}` as 'statReports.trend_up')
  return (
    <Card className="relative flex flex-col gap-1 p-4 transition-colors focus-within:ring-2 focus-within:ring-brand/40 hover:border-brand/40">
      <button
        type="button"
        onClick={onOpen}
        aria-label={t('statDash.openDetails', { name: label })}
        title={t('statDash.openDetails', { name: label })}
        className="absolute inset-0 z-10 rounded-[inherit] focus:outline-none"
      />
      <p className="line-clamp-2 text-[12px] font-medium text-fg-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums leading-tight text-fg">
        {fmt(w.value)}
        {unit && unit !== '%' && <span className="ml-1 text-sm font-medium text-fg-subtle">{unit}</span>}
      </p>
      <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <span
          role="img"
          aria-label={trendLabel}
          title={trendLabel}
          className={cn(
            'inline-flex items-center gap-1 font-semibold',
            trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-fg-subtle',
          )}
        >
          <Icon size={13} aria-hidden="true" />
          {w.delta != null && `${w.delta > 0 ? '+' : ''}${w.delta}%`}
        </span>
        {w.previous != null && (
          <span className="text-fg-subtle">
            {custom ? t('statReports.compareValue') : t('statReports.previousValue')}: {fmt(w.previous)}
          </span>
        )}
      </div>
    </Card>
  )
}
