import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import dayjs from 'dayjs'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { Select } from '@/components/ui/Select'
import { DataTable, type Column } from '@/components/data/DataTable'
import { Pagination } from '@/components/data/Pagination'
import { FilterReset } from '@/components/data/FilterReset'
import { TD, TH } from '@/components/data/tableStyles'
import { useListParams } from '@/hooks/useListParams'
import { formatAppDate } from '@/lib/format'
import { isInvalidRange } from '@/lib/dateRange'
import { useVehicleVisits, useVehicles, type VehicleVisit } from './useVehicles'
import { PLACE_CATEGORIES, categoryLabel, placeLabel, stopColor } from './places'
import { PlateChip } from './FleetBits'

/*
 * TASHRIFLAR — where the cars stood beside a café, restaurant, hotel or
 * entertainment place, and for how long.
 *
 * Built from stored GPS days (the nightly sync + whatever history someone
 * opened), so it is instant and never calls the provider. Two honesty rules
 * are baked into the copy: a match means "stood NEXT TO", not "went inside",
 * and the driver's own habitual parking spot is hidden unless asked for —
 * on live data every car's morning two-hour stop landed beside the same café.
 *
 * Filters live in the URL (`useListParams`) like every other list.
 */

const FILTER_KEYS = ['from', 'to', 'veh', 'cat', 'min', 'habit'] as const
const MIN_OPTIONS = [5, 10, 20, 30, 60]

const durationLabel = (sec: number) => {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)} s ${m % 60} min` : `${m} min`
}

export function VisitsTab() {
  const { t } = useTranslation()
  const { filters, setFilter, setFilters, page, setPage, size, setSize, activeFilterCount, reset } = useListParams(FILTER_KEYS)
  const from = filters.from || dayjs().subtract(6, 'day').format('YYYY-MM-DD')
  const to = filters.to || dayjs().format('YYYY-MM-DD')
  const rangeInvalid = isInvalidRange(from, to)
  const minMinutes = Number(filters.min) || 10
  const includeHabitual = filters.habit === '1'

  const { rows: cars } = useVehicles('', false)
  const { rows, total, pages, loading, fetching, failed, error } = useVehicleVisits(
    page,
    size,
    { from, to, vehicleId: filters.veh, category: filters.cat, minMinutes, includeHabitual },
    !rangeInvalid,
  )

  const columns = useMemo<Column<VehicleVisit>[]>(
    () => [
      {
        key: 'when',
        rowLink: true,
        header: t('vehicles.visitWhen'),
        headerClassName: TH,
        className: TD,
        cell: (r) => (
          <span className="tabular-nums">
            <span className="text-fg">{formatAppDate(r.day)}</span>
            <span className="ml-2 text-fg-muted">{r.start_at.slice(11, 16)}–{r.end_at.slice(11, 16)}</span>
          </span>
        ),
      },
      {
        key: 'duration',
        header: t('vehicles.visitDuration'),
        headerClassName: TH,
        className: TD,
        cell: (r) => <span className="tabular-nums text-fg">{durationLabel(r.duration_s)}</span>,
      },
      {
        key: 'place',
        header: t('vehicles.visitPlace'),
        headerClassName: TH,
        className: TD,
        cell: (r) => (
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stopColor(r.place_category) }} aria-hidden />
            <span className="min-w-0">
              <span className="block truncate font-medium text-fg">{r.place_name || t('vehicles.stopUnknownPlace')}</span>
              <span className="block text-[11px] text-fg-subtle">
                {placeLabel(t, r.place_kind, r.place_category)}
                {r.place_distance_m != null ? ` · ${r.place_distance_m} m` : ''}
                {r.is_habitual ? ` · ${t('vehicles.stopHabitualShort')}` : ''}
              </span>
            </span>
          </span>
        ),
      },
      {
        key: 'vehicle',
        header: t('vehicles.visitVehicle'),
        headerClassName: TH,
        className: TD,
        cell: (r) => (
          <span className="flex min-w-0 flex-col items-start gap-0.5">
            <PlateChip plate={r.plate_number} size="sm" />
            <span className="block truncate text-[11px] text-fg-subtle">{(r.vehicle_name || '').replace(/ — .*$/, '')}</span>
          </span>
        ),
      },
      {
        key: 'driver',
        header: t('vehicles.driver'),
        headerClassName: TH,
        className: TD,
        cell: (r) => <span className="text-fg">{r.driver_name || '—'}</span>,
      },
      {
        key: 'trip',
        header: t('vehicles.visitTrip'),
        headerClassName: TH,
        className: TD,
        cell: (r) =>
          r.on_trip ? (
            <Badge tone="info">{t('vehicles.visitOnTrip')}</Badge>
          ) : (
            <span className="text-fg-subtle">—</span>
          ),
      },
    ],
    [t],
  )

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <MapPin size={16} className="text-brand-strong" />
        <span className="text-[14px] font-semibold text-fg">{t('vehicles.tabVisits')}</span>
        <span className="text-[11.5px] text-fg-subtle">{t('vehicles.visitsHint')}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2 border-b border-line px-4 py-3">
        <DateInput value={from} onChange={(v) => setFilter('from', v)} aria-label={t('vehicles.gpsFrom')} className="w-[9.5rem]" invalid={rangeInvalid} />
        <DateInput value={to} onChange={(v) => setFilter('to', v)} aria-label={t('vehicles.gpsTo')} className="w-[9.5rem]" invalid={rangeInvalid} />
        <Select
          aria-label={t('vehicles.visitVehicle')}
          value={filters.veh}
          onChange={(e) => setFilter('veh', e.target.value)}
          placeholder={t('vehicles.visitAllVehicles')}
          options={cars.map((c) => ({ value: String(c.id), label: `${c.plate_number ?? ''} — ${c.model_name ?? ''}` }))}
          wrapperClassName="w-[13rem]"
        />
        <Select
          aria-label={t('vehicles.visitPlaceType')}
          value={filters.cat}
          onChange={(e) => setFilter('cat', e.target.value)}
          placeholder={t('vehicles.visitAllTypes')}
          options={PLACE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(t, c) }))}
          wrapperClassName="w-[11rem]"
        />
        <Select
          aria-label={t('vehicles.visitMinDuration')}
          value={String(minMinutes)}
          onChange={(e) => setFilter('min', e.target.value === '10' ? '' : e.target.value)}
          options={MIN_OPTIONS.map((m) => ({ value: String(m), label: t('vehicles.visitMinLabel', { min: m }) }))}
          wrapperClassName="w-[12rem]"
        />
        <label className="flex h-control items-center gap-2 text-[12.5px] text-fg-muted">
          <Checkbox checked={includeHabitual} onChange={(e) => setFilters({ habit: e.target.checked ? '1' : null })} />
          {t('vehicles.visitShowHabitual')}
        </label>
        <FilterReset count={activeFilterCount} onReset={reset} className="ml-auto" />
      </div>
      {rangeInvalid && <p role="alert" className="px-4 pt-2 text-xs text-danger">{t('list.invalidRange')}</p>}

      <DataTable
        tableId="visits"
        rows={rows}
        columns={columns}
        loading={loading}
        error={failed ? error : undefined}
        filtered={activeFilterCount > 0}
        rowHref={(r) => `/vehicles/${r.vehicle_id}?from=${r.day}&to=${r.day}`}
        emptyTitle={t('vehicles.noVisits')}
        emptyDescription={t('vehicles.noVisitsHint')}
        density="compact"
        minWidth={820}
      />
      <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
    </Card>
  )
}
