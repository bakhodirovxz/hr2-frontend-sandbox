import { Suspense, lazy, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  Car,
  Fuel,
  Clock,
  MapPin,
  Radio,
  Route,
  Wallet,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Avatar } from '@/components/ui/Avatar'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { formatAppDate } from '@/lib/format'
import { DateInput } from '@/components/ui/DateInput'
import dayjs from 'dayjs'

/* MapLibre plus its worker is the heaviest thing in the app and only the fleet
   operator ever sees it — so the map is a chunk of its own, fetched when a car
   with a tracker is opened. */
import { DeferUntilVisible } from '@/components/DeferUntilVisible'

const VehicleMap = lazy(() => import('@/features/vehicles/VehicleMap'))
import { cn } from '@/lib/cn'
import {
  useFleetAccess,
  useVehicleHistory,
  useVehicleLive,
  useVehicleProfile,
  useVehicleTrack,
  type VehicleGpsDay,
  type VehicleGpsStop,
  type VehicleTrip,
} from '@/features/vehicles/useVehicles'
import { placeLabel, stopColor } from '@/features/vehicles/places'
import { isInvalidRange } from '@/lib/dateRange'

/**
 * MASHINA PROFILI — one car's own page.
 *
 * The fleet list answers "which car is free"; this answers everything else the
 * people who run it ask: what is it, who drives it, where has it been, how much
 * fuel and money it has cost, and whether a GPS tracker is wired to it.
 *
 * Ported from v1's `VehicleProfilePage`. The live map is NOT here: v1 draws it
 * with MapLibre against our own tile server, and v2 carries no map stack at
 * all — pulling one in for a single panel is a decision for its own round, so
 * the tracker is shown as a fact (device id + link to the fleet's GPS setup)
 * rather than faked with a placeholder.
 */

const money = (v?: number | null) =>
  v == null ? '—' : Number(v).toLocaleString('ru-RU')

export function VehicleProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { id } = useParams()
  const vehicleId = id ? Number(id) : null
  const { vehicle, stats, trips, loading, tripsLoading } = useVehicleProfile(vehicleId)
  // Live position is fleet-operator data (the endpoint answers 403 to anyone
  // else), so it is polled only for them, and only when a tracker is actually
  // wired to this car.
  const { access } = useFleetAccess()
  // GPS data is for the fleet operator AND the named transport approver
  // (server gate `can_view_fleet`, 2026-09-15) — not for anyone who may request a car.
  const canSeeLive = !!(access?.can_manage || access?.can_approve) && !!vehicle?.gps_device_id
  const { live, failed: liveFailed } = useVehicleLive(vehicleId, canSeeLive)
  // History range — the day being replayed. Defaults to today, so opening the
  // page answers "where has it been today" without a single click.
  // `?from=&to=` lets the visits report open the exact day it was pointing at.
  const [params] = useSearchParams()
  const [from, setFrom] = useState(() => params.get('from') || dayjs().format('YYYY-MM-DD'))
  const [to, setTo] = useState(() => params.get('to') || params.get('from') || dayjs().format('YYYY-MM-DD'))
  const rangeInvalid = isInvalidRange(from, to)
  const { points, loading: trackLoading, failed: trackFailed, reload: reloadTrack } = useVehicleTrack(
    vehicleId, from, to, canSeeLive && !rangeInvalid,
  )
  // Stops and drives for the same range — the list under the map. Same
  // gate as the track: this is where the driver has been, fleet-only.
  const { days, loading: historyLoading, failed: historyFailed, reload: reloadHistory } = useVehicleHistory(
    vehicleId, from, to, canSeeLive && !rangeInvalid,
  )
  const stops = days.flatMap((d) => d.stops)
  const [focus, setFocus] = useState<{ lat: number; lon: number; key: number } | null>(null)

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </PageContainer>
    )
  }

  if (!vehicle) {
    return (
      <PageContainer>
        <PageHeader title={t('vehicles.profileTitle')} />
        <Card className="p-6"><EmptyState icon={<Car size={22} />} title={t('vehicles.notFound')} /></Card>
      </PageContainer>
    )
  }

  const spec: [string, string | number | null | undefined][] = [
    [t('vehicles.plate'), vehicle.plate_number],
    [t('vehicles.model'), vehicle.model_name],
    [t('vehicles.color'), vehicle.color],
    [t('vehicles.year'), vehicle.year],
    [t('vehicles.seatsLabel'), vehicle.seats],
    [t('vehicles.fuelType'), vehicle.fuel_type_name],
    [t('vehicles.consumption'), vehicle.fuel_consumption ? `${vehicle.fuel_consumption} km/l` : null],
    [
      t('vehicles.fuelPriceLabel'),
      vehicle.fuel_price != null
        ? `${money(vehicle.fuel_price)} ${t('vehicles.perUnit', { unit: vehicle.fuel_unit ?? 'litr' })}`
        : vehicle.fuel_price_pending != null
          ? t('vehicles.notApproved')
          : null,
    ],
    [t('vehicles.leader'), vehicle.leader?.legal_name],
    [t('vehicles.leaderPosition'), vehicle.leader_position],
    [t('vehicles.gpsDevice'), vehicle.gps_device_id],
  ]

  return (
    <PageContainer>
      <PageHeader
        title={`${vehicle.plate_number ?? '—'} · ${vehicle.model_name ?? ''}`.trim()}
        subtitle={[vehicle.fuel_type_name, vehicle.color].filter(Boolean).join(' · ')}
        actions={
          <Button variant="ghost" size="sm" leftIcon={<ArrowLeft size={15} />} onClick={() => navigate('/vehicles')}>
            {t('vehicles.backToFleet')}
          </Button>
        }
      />

      {vehicle.is_active === false && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning">
          {t('vehicles.inRepair')}
        </div>
      )}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Route}
          label={t('vehicles.statTrips', { finalized: stats?.finalized_count ?? 0 })}
          value={stats?.trip_count ?? 0}
        />
        <Stat icon={MapPin} label={t('vehicles.statDistance')} value={stats?.total_distance_km ? `${stats.total_distance_km} km` : '—'} />
        <Stat icon={Fuel} label={t('vehicles.statFuel')} value={stats?.total_fuel_liters ? `${stats.total_fuel_liters} l` : '—'} />
        <Stat icon={Wallet} label={t('vehicles.statCost')} value={money(stats?.total_fuel_cost)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr] xl:items-start">
        <Card className="p-card">
          {vehicle.driver && (
            <div
              className={cn(
                'mb-3 flex items-center gap-2.5 rounded-lg border p-2.5',
                vehicle.driver_health?.blocking ? 'border-danger/40 bg-danger-soft' : 'border-line bg-surface-2/50',
              )}
            >
              <Avatar name={vehicle.driver.legal_name ?? ''} size={38} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-fg">{vehicle.driver.legal_name}</span>
                <span className="block truncate text-[11.5px] text-fg-subtle">
                  {[vehicle.driver_position, vehicle.driver_phone].filter(Boolean).join(' · ') || t('vehicles.driver')}
                </span>
              </span>
              {vehicle.driver_health?.label && (
                <Badge tone={vehicle.driver_health.blocking ? 'danger' : vehicle.driver_health.status === 'limited' ? 'warning' : 'success'}>
                  {vehicle.driver_health.label}
                </Badge>
              )}
            </div>
          )}

          <dl className="divide-y divide-line/60">
            {spec.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-[12px] text-fg-subtle">{label}</dt>
                <dd className="truncate text-right text-[13px] text-fg">{value || '—'}</dd>
              </div>
            ))}
          </dl>

          {/* The tracker is wired to the car HERE — the id is the whole link to
              the provider, so it belongs on the car's own page. */}
          <div className="mt-3 rounded-inner border border-line p-2.5">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-fg">
              <Radio size={13} className={vehicle.gps_device_id ? 'text-success' : 'text-fg-subtle'} />
              {vehicle.gps_device_id ? t('vehicles.gpsLinked') : t('vehicles.gpsMissing')}
            </p>
            {/* The numbers themselves live on the map panel — repeating them
                here would just be the same reading twice on one screen. This
                block only answers "is a tracker attached at all", plus the
                reason the map is missing when it is. */}
            {canSeeLive && liveFailed && (
              <p className="mt-1.5 text-[11.5px] text-warning">{t('vehicles.gpsUnreachable')}</p>
            )}
            {!!vehicle.gps_device_id && !(access?.can_manage || access?.can_approve) && (
              <p className="mt-1.5 text-[11.5px] text-fg-subtle">{t('vehicles.gpsManagerOnly')}</p>
            )}
          </div>
        </Card>

        {canSeeLive && (
          <Card className="mb-4 overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h3 className="text-[14px] font-semibold text-fg">{t('vehicles.gpsLive')}</h3>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <RangeChip active={from === today() && to === today()} onClick={() => { setFrom(today()); setTo(today()) }}>
                  {t('vehicles.gpsToday')}
                </RangeChip>
                <RangeChip
                  active={from === yesterday() && to === yesterday()}
                  onClick={() => { setFrom(yesterday()); setTo(yesterday()) }}
                >
                  {t('vehicles.gpsYesterday')}
                </RangeChip>
                <RangeChip active={from === weekAgo() && to === today()} onClick={() => { setFrom(weekAgo()); setTo(today()) }}>
                  {t('vehicles.gpsWeek')}
                </RangeChip>
                <DateInput value={from} onChange={setFrom} aria-label={t('vehicles.gpsFrom')} className="w-[9.5rem]" invalid={rangeInvalid} />
                <DateInput value={to} onChange={setTo} aria-label={t('vehicles.gpsTo')} className="w-[9.5rem]" invalid={rangeInvalid} />
              </div>
              {rangeInvalid && <p role="alert" className="mt-1 text-xs text-danger">{t('list.invalidRange')}</p>}
            </div>
            <p className="px-4 py-2 text-[11.5px] text-fg-subtle">{t('vehicles.gpsHistoryHint')}</p>
            {/* ⚠️ maplibre IS 1.45 MB (library + worker + CSS) and this page
                measured 2.5 MB cold — the heaviest route in the product after
                the dashboard. `lazy()` did not help: an unconditionally rendered
                lazy element imports immediately. The map card sits below the
                vehicle's details, so it now mounts when scrolled to. */}
            <DeferUntilVisible minHeight={380} className="m-4 mt-0">
            <Suspense fallback={<Skeleton className="m-4 h-[340px]" />}>
              <VehicleMap
                live={live}
                track={points}
                stops={stops}
                focus={focus}
                trackLoading={trackLoading || historyLoading}
                onRefresh={() => { void reloadTrack(); void reloadHistory() }}
                className="m-4 mt-0"
              />
            </Suspense>
            </DeferUntilVisible>
            {trackFailed ? (
              <p className="px-4 pb-3 text-[11.5px] text-warning">{t('vehicles.gpsTrackFailed')}</p>
            ) : !trackLoading && points.length === 0 ? (
              <p className="px-4 pb-3 text-[11.5px] text-fg-subtle">{t('vehicles.gpsNoTrack')}</p>
            ) : null}

            {/* Day by day: how far, how many drives, and every stop with what
                stands beside it. A row click flies the map to that stop. */}
            <div className="border-t border-line">
              <div className="flex flex-wrap items-center gap-2 px-4 py-3">
                <Clock size={15} className="text-brand-strong" />
                <h4 className="text-[13.5px] font-semibold text-fg">{t('vehicles.gpsDayHistory')}</h4>
                <span className="text-[11.5px] text-fg-subtle">{t('vehicles.gpsStopsHint')}</span>
              </div>
              {historyFailed ? (
                <p className="px-4 pb-3 text-[11.5px] text-warning">{t('vehicles.gpsHistoryFailed')}</p>
              ) : historyLoading && days.length === 0 ? (
                <div className="space-y-2 px-4 pb-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : days.every((d) => d.stops.length === 0 && d.trips.length === 0) ? (
                <p className="px-4 pb-3 text-[11.5px] text-fg-subtle">{t('vehicles.gpsNoTrack')}</p>
              ) : (
                <ul className="divide-y divide-line/60">
                  {days.map((d) => (
                    <DayRow key={d.day} day={d} onStop={(s) => setFocus({ lat: s.lat, lon: s.lon, key: s.id })} activeStop={focus?.key ?? null} />
                  ))}
                </ul>
              )}
            </div>
          </Card>
        )}

        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <h3 className="text-[14px] font-semibold text-fg">{t('vehicles.tripHistory')}</h3>
            {stats?.last_trip_date && (
              <span className="ml-auto text-[12px] text-fg-subtle">
                {t('vehicles.lastTrip', { date: formatAppDate(stats.last_trip_date) })}
              </span>
            )}
          </div>

          {tripsLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : trips.length === 0 ? (
            <EmptyState icon={<Route size={20} />} title={t('vehicles.noTrips')} description={t('vehicles.noTripsHint')} />
          ) : (
            <ul className="divide-y divide-line/60">
              {trips.map((trip) => <TripRow key={trip.request_id} trip={trip} />)}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  )
}

const today = () => dayjs().format('YYYY-MM-DD')
const yesterday = () => dayjs().subtract(1, 'day').format('YYYY-MM-DD')
const weekAgo = () => dayjs().subtract(6, 'day').format('YYYY-MM-DD')

function RangeChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-control-sm rounded-pill border px-2.5 text-[12px] font-medium transition-colors',
        active ? 'border-brand bg-brand text-fg-on-brand' : 'border-line text-fg-muted hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Route; label: string; value: string | number }) {
  return (
    <Card className="flex items-center gap-3 p-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-strong">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] text-fg-muted">{label}</span>
        <span className="block truncate text-[16px] font-semibold tabular-nums text-fg">{value}</span>
      </span>
    </Card>
  )
}

const durationLabel = (sec: number) => {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)} s ${m % 60} min` : `${m} min`
}

function DayRow({ day, onStop, activeStop }: { day: VehicleGpsDay; onStop: (s: VehicleGpsStop) => void; activeStop: number | null }) {
  const { t } = useTranslation()
  if (day.stops.length === 0 && day.trips.length === 0) {
    return (
      <li className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="text-[13px] font-medium text-fg">{formatAppDate(day.day)}</span>
        <span className="text-[12px] text-fg-subtle">{day.synced ? t('vehicles.gpsNoMovement') : t('vehicles.gpsNotSynced')}</span>
      </li>
    )
  }
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-fg">{formatAppDate(day.day)}</span>
        {day.distance_km != null && <Badge tone="neutral">{day.distance_km} km</Badge>}
        <span className="text-[12px] text-fg-subtle">
          {t('vehicles.gpsDaySummary', { trips: day.trips.length, stops: day.stops.length })}
        </span>
        {!day.is_final && <span className="text-[11px] text-fg-subtle">· {t('vehicles.gpsDayOpen')}</span>}
      </div>
      {day.stops.length > 0 && (
        <ul className="mt-2 space-y-1">
          {day.stops.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onStop(s)}
                className={cn(
                  'flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-inner px-2 py-1.5 text-left transition-colors hover:bg-surface-2',
                  activeStop === s.id && 'bg-brand-soft',
                )}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stopColor(s.place_category) }} aria-hidden />
                {/* Naive Tashkent strings from the server — sliced, not
                    re-zoned, so they read exactly as the provider logged them. */}
                <span className="text-[12.5px] tabular-nums text-fg">
                  {s.start_at.slice(11, 16)}–{s.end_at.slice(11, 16)}
                </span>
                <span className="text-[12px] tabular-nums text-fg-muted">{durationLabel(s.duration_s)}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg">
                  {s.place_name ? (
                    <>
                      <span className="text-fg-muted">{placeLabel(t, s.place_kind, s.place_category)} · </span>
                      {s.place_name}
                    </>
                  ) : (
                    <span className="text-fg-subtle">{t('vehicles.stopUnknownPlace')}</span>
                  )}
                </span>
                {s.is_habitual && <Badge tone="neutral">{t('vehicles.stopHabitualShort')}</Badge>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function TripRow({ trip }: { trip: VehicleTrip }) {
  const { t } = useTranslation()
  const where = [...trip.destination_names, ...trip.regions].filter(Boolean).join(', ')
  // The actual figures win when the trip was closed with real numbers; the
  // planned ones are what it was booked on.
  const distance = trip.actual_distance_km ?? trip.distance_km
  const isActual = trip.actual_distance_km != null

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-medium text-fg">{trip.letter_number || `#${trip.letter_id}`}</span>
        <span className="text-[12px] tabular-nums text-fg-subtle">
          {trip.start_date ? formatAppDate(trip.start_date) : '—'}
          {trip.end_date ? ` — ${formatAppDate(trip.end_date)}` : ''}
        </span>
        {distance != null && (
          <Badge tone={isActual ? 'success' : 'neutral'}>
            {distance} km{isActual ? ` · ${t('vehicles.actual')}` : ''}
          </Badge>
        )}
      </div>
      {where && <p className="mt-1 text-[12.5px] text-fg-muted">{where}</p>}
      <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-fg-subtle">
        {trip.employee_name && <span>{t('vehicles.traveller')}: {trip.employee_name}</span>}
        {trip.driver_name && <span>{t('vehicles.driver')}: {trip.driver_name}</span>}
        {(trip.actual_fuel_cost ?? trip.fuel_cost) != null && (
          <span>{Number(trip.actual_fuel_cost ?? trip.fuel_cost).toLocaleString('ru-RU')} {t('vehicles.sum')}</span>
        )}
      </p>
    </li>
  )
}
