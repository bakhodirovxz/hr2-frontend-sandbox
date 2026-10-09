import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Car, CheckCircle2, Clock, Radio, Route, Wrench } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { useVehicleRequests, useVehicles, type Vehicle } from './useVehicles'

/*
 * Small building blocks of the fleet page that carry its visual identity:
 * the number plate, the "today" availability chip and the overview strip.
 * They live here so the (long) VehiclesPage stays about behaviour.
 */

export const today = () => dayjs().format('YYYY-MM-DD')

/**
 * A number plate drawn as a plate: rigid monospace, a stroke, a blue
 * country stub on the left — read at a glance across the whole page and the
 * same shape everywhere (list, requests, visits, profile). Uzbek plates are
 * "01 A 123 BC" but stored normalised ("01A123BC"); the region code is the
 * first two digits and gets its own group.
 */
export function PlateChip({ plate, size = 'md', className }: { plate?: string | null; size?: 'sm' | 'md'; className?: string }) {
  if (!plate) return <span className="text-fg-subtle">—</span>
  const region = /^\d{2}/.test(plate) ? plate.slice(0, 2) : ''
  // "517KGA" → "517 KGA", "A123BC" → "A 123 BC": letters and digits alternate
  // on a real plate and are read as groups.
  const rest = ((region ? plate.slice(2) : plate).match(/\d+|[A-Za-z]+/g) ?? [plate]).join(' ')
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-stretch overflow-hidden whitespace-nowrap rounded-[5px] border border-fg/25 bg-surface font-mono font-bold uppercase tracking-[0.08em] text-fg shadow-[inset_0_0_0_1px_rgb(var(--surface)/1)]',
        size === 'sm' ? 'h-[22px] text-[11.5px]' : 'h-[26px] text-[13px]',
        className,
      )}
      title={plate}
    >
      <span className={cn('grid place-items-center bg-brand text-fg-on-brand', size === 'sm' ? 'px-1' : 'px-1.5')}>
        <span className="text-[8px] font-semibold leading-none tracking-normal">UZ</span>
      </span>
      {region && <span className={cn('grid place-items-center border-r border-fg/20', size === 'sm' ? 'px-1.5' : 'px-2')}>{region}</span>}
      <span className={cn('grid place-items-center', size === 'sm' ? 'px-1.5' : 'px-2')}>{rest}</span>
    </span>
  )
}

/** What the car is doing TODAY — free, on a trip (for whom), or asked for. */
export function AvailabilityChip({ v }: { v: Vehicle }) {
  const { t } = useTranslation()
  if (v.is_active === false) return <Badge tone="neutral">{t('vehicles.inactive')}</Badge>
  if (v.is_busy) {
    const p = v.busy_periods?.[0]
    const until = p?.end_date ? dayjs(p.end_date).format('DD.MM') : ''
    return (
      <span className="inline-flex min-w-0 flex-col">
        <Badge tone="info">{t('vehicles.availOnTrip')}{until ? ` · ${until}` : ''}</Badge>
        {p?.employee_name && <span className="mt-0.5 truncate text-[11px] text-fg-subtle">{p.employee_name}</span>}
      </span>
    )
  }
  if (v.has_pending) return <Badge tone="warning">{t('vehicles.availRequested')}</Badge>
  return <Badge tone="success">{t('vehicles.availFree')}</Badge>
}

/** A tracker is wired to the car (the live map exists for it). */
export function GpsMark({ v, className }: { v: Vehicle; className?: string }) {
  const { t } = useTranslation()
  if (!v.gps_device_id) return null
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium text-success', className)} title={t('vehicles.gpsLinked')}>
      <Radio size={12} />
      GPS
    </span>
  )
}

export type FleetTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger' | 'brand'

/**
 * The register at a glance — the numbers the fleet quotes ("how many are
 * free right now"), sitting above the tabs like the EDO pages' strips.
 * Derived from ONE fleet query keyed on today's date range (the server
 * computes today's busy/pending per car for that range), plus the two
 * request queues; those queries are shared with the tabs below through the
 * react-query cache, so the strip costs nothing extra once a tab is open.
 */
export function useFleetOverview(enabled: boolean) {
  const d = today()
  const fleet = useVehicles('', false, enabled ? { from: d, to: d } : undefined)
  const pending = useVehicleRequests('pending')
  const awaiting = useVehicleRequests('awaiting_approval')
  return useMemo(() => {
    const rows = fleet.rows
    const active = rows.filter((v) => v.is_active !== false)
    return {
      loading: fleet.loading,
      total: rows.length,
      free: active.filter((v) => !v.is_busy && !v.has_pending).length,
      onTrip: active.filter((v) => v.is_busy).length,
      requested: active.filter((v) => v.has_pending && !v.is_busy).length,
      inactive: rows.length - active.length,
      gps: rows.filter((v) => !!v.gps_device_id).length,
      queue: pending.rows.length + awaiting.rows.length,
    }
  }, [fleet.rows, fleet.loading, pending.rows.length, awaiting.rows.length])
}


const TONE_GRAD: Record<FleetTone, string> = {
  neutral: 'from-[#94A3B8] to-[#64748B]',
  success: 'from-[#34D399] to-[#059669]',
  info: 'from-[#38BDF8] to-[#0284C7]',
  warning: 'from-[#FCD34D] to-[#F59E0B]',
  danger: 'from-[#FB7185] to-[#E11D48]',
  brand: 'from-[#8B5CF6] to-[#6D28D9]',
}

export function FleetOverview({
  canSeeQueue,
  onPick,
}: {
  canSeeQueue: boolean
  onPick: (filter: { tab: string; avail?: string; state?: string; gps?: string; req?: string }) => void
}) {
  const { t } = useTranslation()
  const o = useFleetOverview(true)
  const tiles: { key: string; value: number; tone: FleetTone; icon: typeof Car; pick: Parameters<typeof onPick>[0] }[] = [
    { key: 'total', value: o.total, tone: 'neutral', icon: Car, pick: { tab: 'fleet' } },
    { key: 'free', value: o.free, tone: 'success', icon: CheckCircle2, pick: { tab: 'fleet', avail: 'free' } },
    { key: 'onTrip', value: o.onTrip, tone: 'info', icon: Route, pick: { tab: 'fleet', avail: 'busy' } },
    { key: 'requested', value: o.requested, tone: 'warning', icon: Clock, pick: { tab: 'fleet', avail: 'pending' } },
    { key: 'inactive', value: o.inactive, tone: 'danger', icon: Wrench, pick: { tab: 'fleet', state: 'inactive' } },
    { key: 'gps', value: o.gps, tone: 'brand', icon: Radio, pick: { tab: 'fleet', gps: '1' } },
    ...(canSeeQueue
      ? [{ key: 'queue', value: o.queue, tone: 'warning' as FleetTone, icon: Clock, pick: { tab: 'requests', req: 'pending' } }]
      : []),
  ]
  return (
    // Same stat card as the other registers (redesign 2026-09-24): a gradient
    // icon tile, sentence-case label, the number large — the UPPERCASE chips
    // read as a different product.
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
      {tiles.map(({ key, value, tone, icon: Icon, pick }) => (
        <button
          key={key}
          type="button"
          onClick={() => onPick(pick)}
          className="group flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-left shadow-sm transition-[transform,border-color] hover:-translate-y-0.5 hover:border-brand/40"
        >
          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br text-white', TONE_GRAD[tone])}>
            <Icon size={16} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold text-fg-muted">
              {t(`vehicles.stat_${key}` as never)}
            </span>
            <span className="block text-[20px] font-extrabold leading-tight tabular-nums text-fg">
              {o.loading && o.total === 0 ? '…' : value}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}
