import { useMemo, useState } from 'react'
import { useNationalityLabel } from './nationalityLabel'
import { useTranslation } from 'react-i18next'
import { Globe, TrendingUp, Users } from 'lucide-react'
import type { Translation } from '@/i18n/uz'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { monthShort } from '@/lib/format'
import type { AgeStats, ExperienceYear, HeadcountStats, MonthlyKpi, NationalityStat } from './useEmployeeKpi'
import { TrendLine } from '@/components/data/TrendLine'
import { ArcRing } from '@/features/dashboard/nocturne/ArcRing'

type EmpKey = keyof Translation['employees']
const AGE_KEYS = ['ageGroup1', 'ageGroup2', 'ageGroup3', 'ageGroup4', 'ageGroup5'] as const satisfies readonly EmpKey[]
const AGE_BINS = ['18-30', '31-40', '41-50', '51-60', '60+']
const AGE_VARS = ['--chart-1', '--chart-2', '--chart-4', '--chart-3', '--chart-5']
const NAT_VARS = ['--chart-1', '--chart-2', '--chart-4', '--chart-5', '--chart-3', '--chart-6']

const v = (name: string) => `rgb(var(${name}))`

export function EmployeeStatsRow({
  age,
  ageLoading,
  nationality,
  nationalityLoading,
  kpiTrend,
  kpiTrendLoading,
  headcount,
  headcountLoading = false,
  experience = [],
  experienceLoading = false,
}: {
  age?: AgeStats
  ageLoading: boolean
  nationality: NationalityStat[]
  nationalityLoading: boolean
  kpiTrend: MonthlyKpi[]
  kpiTrendLoading: boolean
  /** Optional: the reports screen reuses this row without the roster stats. */
  headcount?: HeadcountStats
  headcountLoading?: boolean
  experience?: ExperienceYear[]
  experienceLoading?: boolean
}) {
  const { t } = useTranslation()

  // Seniority reads better bucketed than as one bar per hire year: forty bars
  // say nothing, four say "this branch is mostly people hired in the last five
  // years". Buckets are counted from the hire YEAR the server returns.
  const buckets = useMemo(() => {
    const now = new Date().getFullYear()
    const acc = [
      { key: 'lt1', label: '< 1', count: 0 },
      { key: 'y1_5', label: '1–5', count: 0 },
      { key: 'y5_10', label: '5–10', count: 0 },
      { key: 'gt10', label: '10+', count: 0 },
    ]
    for (const r of experience) {
      const years = now - r.year
      const i = years < 1 ? 0 : years < 5 ? 1 : years < 10 ? 2 : 3
      acc[i].count += r.count
    }
    return acc
  }, [experience])
  /* Only the bands anybody is in. A branch staffed entirely last year drew
     three empty rails under one bar and looked broken rather than young. */
  const shownBuckets = buckets.filter((b) => b.count > 0)
  const bucketMax = Math.max(1, ...buckets.map((b) => b.count))
  const g = headcount?.gender_stats ?? {}
  const genderTotal = (g.male ?? 0) + (g.female ?? 0) + (g.unknown ?? 0)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Card className="flex flex-col">
        <CardHeader title={t('employees.statAge')} icon={<Users size={16} />} />
        <div className="flex-1 p-4">
          {ageLoading ? <ChartSkeleton /> : <AgeDonut age={age} />}
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t('employees.statNationality')} icon={<Globe size={16} />} />
        <div className="flex-1 p-4">
          {nationalityLoading ? <ChartSkeleton /> : <NationalityDonut items={nationality} />}
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t('employees.statKpiTrend')} icon={<TrendingUp size={16} />} />
        <div className="flex-1 p-4">
          {kpiTrendLoading ? <ChartSkeleton /> : <KpiTrendLine items={kpiTrend} />}
        </div>
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t('employees.statHeadcount')} icon={<Users size={16} />} />
        {headcountLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums text-fg">{headcount?.total_count ?? 0}</p>
            <div className="mt-3 space-y-1.5">
              {([
                ['male', g.male ?? 0],
                ['female', g.female ?? 0],
                ['unknown', g.unknown ?? 0],
              ] as const).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-[12px] text-fg-muted">
                    {t(`employees.gender_${key}` as never)}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
                    <div
                      className="h-full rounded-pill bg-brand"
                      style={{ width: `${genderTotal ? (value / genderTotal) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-fg">{value}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="flex flex-col">
        <CardHeader title={t('employees.statExperience')} icon={<TrendingUp size={16} />} />
        {experienceLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="mt-1 space-y-2">
            {shownBuckets.map((b) => (
              <div key={b.key} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[12px] text-fg-muted">{b.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
                  <div
                    className="h-full rounded-pill bg-brand"
                    style={{ width: `${(b.count / bucketMax) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[12px] tabular-nums text-fg">{b.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function ChartSkeleton() {
  return <Skeleton className="mx-auto h-[130px] w-[130px] rounded-full" />
}

/** Donut with a centre label + legend rows (value + %). */
function DonutWithLegend({
  data,
  centerValue,
  centerLabel,
}: {
  data: { name: string; value: number; varName: string }[]
  centerValue: number | string
  centerLabel: string
}) {
  const { t } = useTranslation()
  const [active, setActive] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  const chartData = total > 0 ? data.filter((d) => d.value > 0) : [{ name: '', value: 1, varName: '--border' }]

  if (total === 0) {
    return <p className="py-8 text-center text-xs italic text-fg-subtle">{t('employees.noData')}</p>
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[124px] w-[124px] shrink-0">
        <div role="img" aria-label={centerLabel} className="h-full w-full">
          <ArcRing
            slices={chartData.map((d) => ({ key: d.name || '_', value: d.value, fill: v(d.varName) }))}
            size={124}
            innerRadius={40}
            outerRadius={58}
            active={active}
            onActive={setActive}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
          {active != null && chartData[active] ? (
            <>
              <span className="text-xl font-bold tabular-nums text-fg">{chartData[active].value}</span>
              <span className="line-clamp-2 text-[10px] leading-tight text-fg-muted">{chartData[active].name}</span>
            </>
          ) : (
            <>
              <span className="text-xl font-bold tabular-nums text-fg">{centerValue}</span>
              <span className="text-[10px] text-fg-muted">{centerLabel}</span>
            </>
          )}
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {data.map((d) => {
          const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : '0'
          return (
            <li key={d.name} className="flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: v(d.varName) }} />
              <span className="min-w-0 flex-1 truncate text-fg-muted">{d.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-fg">{d.value}</span>
              <span className="w-12 shrink-0 text-right text-[11px] tabular-nums text-fg-subtle">
                {pct}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function AgeDonut({ age }: { age?: AgeStats }) {
  const { t } = useTranslation()
  const data = AGE_KEYS.map((key, i) => ({
    name: t(`employees.${key}`),
    value: Number(age?.stats?.[AGE_BINS[i]] ?? 0),
    varName: AGE_VARS[i],
  }))
  return (
    <DonutWithLegend
      data={data}
      centerValue={age?.average_age ?? 0}
      centerLabel={t('employees.avgAge')}
    />
  )
}

function NationalityDonut({ items }: { items: NationalityStat[] }) {
  const { t } = useTranslation()
  // Shared with the board's panel — a five-entry map printed "toj"/"Unknown".
  const natLabel = useNationalityLabel()
  const data = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.count - a.count)
    return sorted.map((n, i) => ({
      name: natLabel(n.nationality),
      value: n.count,
      varName: NAT_VARS[i % NAT_VARS.length],
    }))
  }, [items, natLabel])
  const total = data.reduce((s, d) => s + d.value, 0)
  return <DonutWithLegend data={data} centerValue={total} centerLabel={t('employees.totalLabel')} />
}

function KpiTrendLine({ items }: { items: MonthlyKpi[] }) {
  const { t } = useTranslation()
  const data = useMemo(
    () =>
      [...items]
        .sort((a, b) => String(a.month).localeCompare(String(b.month)))
        .map((m) => ({
          month: monthShort(m.month),
          value: Math.round(Number(m.kpi_percentage) || 0),
        })),
    [items],
  )
  if (!data.length) {
    return <p className="py-8 text-center text-xs italic text-fg-subtle">{t('employees.noData')}</p>
  }
  return (
    <div className="h-[124px] w-full">
      <TrendLine points={data.map((m) => ({ label: m.month, value: m.value }))} valueLabel="KPI" />
    </div>
  )
}

