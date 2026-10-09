import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTooltip } from '@/components/data/ChartTooltip'
import { CHART_TOKENS, tokenColor } from './reportUtils'

/**
 * Ustunli diagramma (TZ R1 «столбчатые диаграммы» + «настройка осей», R2
 * panel diagrammalari). `rows[i].x` — X o'qi yorlig'i, `series` — qiymat
 * ustunlari. Ranglar `--chart-1..6` tokenlaridan.
 *
 * ⚠️ LAZY: recharts (~420 KB) faqat diagramma chiziladigan paytda yuklanadi —
 * shu fayl `React.lazy` orqali ochiladi (v2 dagi boshqa diagrammalar kabi).
 */

export interface BarSeries {
  key: string
  label: string
}

const MAX_BARS = 40

export default function ReportBarChart({
  rows,
  series,
  height = 320,
}: {
  rows: Record<string, unknown>[]
  series: BarSeries[]
  height?: number
}) {
  const { t } = useTranslation()
  const data = useMemo(
    () =>
      rows.slice(0, MAX_BARS).map((r, i) => {
        const o: Record<string, unknown> = { __x: r.__x == null || r.__x === '' || r.__x === '—' ? `#${i + 1}` : String(r.__x) }
        series.forEach((s) => {
          const v = r[s.key]
          o[s.key] = typeof v === 'number' ? v : v == null || v === '' ? null : Number(v)
        })
        return o
      }),
    [rows, series],
  )

  if (!data.length || !series.length) {
    return <p className="grid h-28 place-items-center text-[12.5px] text-fg-subtle">{t('statReports.chartEmpty')}</p>
  }
  // Uzun yorliqlar (lavozim, bo'lim nomlari) tor ekranda bir-biriga minardi —
  // ko'p ustunda yoki uzun nomda yorliq qiya yoziladi.
  const longest = Math.max(...data.map((d) => String(d.__x).length))
  const tilted = data.length > 8 || (data.length > 3 && longest > 10)
  // Butun sonlar (xodimlar, kunlar) — o'qda «0.75 kishi» chiqmasin.
  const integers = data.every((d) => series.every((s) => d[s.key] == null || Number.isInteger(d[s.key])))

  return (
    <div>
      <div style={{ height }} role="img" aria-label={t('statReports.chartAria')}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={tokenColor('--border')} vertical={false} />
            <XAxis
              dataKey="__x"
              tick={{ fill: tokenColor('--fg-subtle'), fontSize: 11 }}
              interval={0}
              angle={tilted ? -30 : 0}
              textAnchor={tilted ? 'end' : 'middle'}
              height={tilted ? 72 : 30}
              tickLine={false}
              tickFormatter={(v: string) => (String(v).length > 18 ? `${String(v).slice(0, 17)}…` : v)}
            />
            <YAxis allowDecimals={!integers} tick={{ fill: tokenColor('--fg-subtle'), fontSize: 11 }} width={48} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgb(var(--fg) / 0.05)' }}
              content={
                <ChartTooltip
                  formatValue={(v) => (typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : v)}
                />
              }
            />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: tokenColor('--fg-muted') }} />}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={tokenColor(CHART_TOKENS[i % CHART_TOKENS.length])}
                radius={[4, 4, 0, 0]}
                maxBarSize={36}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {rows.length > MAX_BARS && (
        <p className="mt-1 text-[11.5px] text-fg-subtle">
          {t('statReports.chartTruncated', { n: MAX_BARS, total: rows.length })}
        </p>
      )}
    </div>
  )
}
