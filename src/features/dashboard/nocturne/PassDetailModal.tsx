import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Ban, Building2, Calendar, Clock, ExternalLink, MapPin, Navigation, Smartphone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { LazyRouteMap } from '@/features/attendance/LazyRouteMap'
import {
  eventLocation,
  eventDirection,
  turnstileName,
  type TurnstileEvent as DayEvent,
} from '@/features/attendance/useDayEvents'
import { formatRoute, useRouteDistance } from '@/features/system/useRouting'
import { jobTitle } from '@/features/dashboard/attendance'
import { useBranches } from '@/hooks/useBranches'
import type { AttendanceRow } from '@/types/dashboard'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import * as roles from '@/auth/roles'
import { useAuthStore } from '@/store/authStore'
import { CancelCheckinDialog } from '@/features/mobileCheckins/CancelCheckinDialog'
import { formatDistance, placeLabel, useCancelCheckin } from '@/features/mobileCheckins/useMobileCheckins'

/**
 * BATAFSIL MA'LUMOT — the pass, opened from the portrait.
 *
 * v1 gives the row two targets: the NAME opens the person's tabel, the PHOTO
 * opens this — where that pass happened, when, at which gate, and how far that
 * gate is from the person's own branch. In v2 the photo did nothing at all.
 *
 * The distance is the reading that makes this more than a repeat of the row:
 * for someone who badged in at another branch it answers "where did they come
 * from", and `available: false` (routing off, or no coordinates) simply drops
 * the line rather than showing a zero.
 */
export function PassDetailModal({
  row,
  lateMinutes,
  onClose,
}: {
  row: AttendanceRow | null
  /**
   * Minutes late, when the pass was opened from a latecomers list.
   *
   * ⚠️ WITHOUT THIS, OPENING A "LATE" ROW LOST THE ONE FACT THAT FLAGGED IT.
   * v1's version of this popup printed the lateness; v2's showed the gate, the
   * time and the distance but never how late the person actually was — so the
   * detail view of a late row said less about lateness than the row itself.
   * The board list is the only caller that knows this number (the server
   * computes it there), hence a prop rather than a field on the row.
   */
  lateMinutes?: number
  onClose: () => void
}) {
  const { t } = useTranslation()
  const open = !!row
  const [snapFailed, setSnapFailed] = useState(false)
  useEffect(() => setSnapFailed(false), [row])
  // The gate's location carries only `organization_branch_id`; the name comes
  // from the branch list the header already loads (cached).
  const { branches } = useBranches()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  // Belgini bekor qilish — kadr ishi (server ham shuni talab qiladi).
  const canCancel = roles.isHR(user) || roles.isMasterAdmin(user)
  const cancel = useCancelCheckin()
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  useEffect(() => {
    setCancelling(false)
    setCancelError('')
  }, [row])

  /**
   * The last pass of the day is the one worth showing: "when did they leave".
   *
   * ⚠️ TWO `TurnstileEvent` TYPES describe the same server payload — the board's
   * (`types/dashboard`) and the tabel's (`useDayEvents`), each declaring the
   * fields its own screens read. The helpers below need the second, and the
   * fields they touch (`happen_time`, `direction_type`, `check_in_out_type`,
   * `turnstile`) are present and identically shaped in both, so the cast is
   * safe. Merging the two declarations is a separate job.
   */
  const event = (row?.exit ?? row?.entry ?? null) as DayEvent | null
  /* Telefon belgisi: «turniket» virtual (joysiz) — joy, manzil va masofa
     belgining o'zidan keladi (pastdagi alohida qatorlar), xarita telefon
     turgan nuqtani ko'rsatadi. Gate location rows are for real gates only. */
  const mc = event?.mobile_checkin ?? null
  const loc = mc ? null : eventLocation(event)
  const homeBranchId =
    (typeof row?.employee?.department === 'object' && row?.employee?.department
      ? (row.employee.department as { organization_branch_id?: number }).organization_branch_id
      : undefined) ?? undefined

  /* `includeGeometry` — v1 draws the ACTUAL ROAD from the person's own branch
     to the gate they passed, which is the whole point of showing a map here
     rather than a pin. On a same-site pass there is no line worth drawing
     (OSRM returns a few metres and the frame zooms to nothing), so it is
     dropped and only the gate is centred. */
  const { route } = useRouteDistance({
    fromBranchId: homeBranchId ?? null,
    toLocationId: (loc as { id?: number } | null)?.id ?? null,
    enabled: open,
    includeGeometry: true,
  })
  const distance = formatRoute(route, t('dashboard.board.sameSite'))
  const sameSite = route?.available === true && (route.distance_km ?? 0) < 1

  if (!row) return null
  const isEntry = event ? eventDirection(event) === 'entry' : null
  const snapshot = event?.photo_path || event?.photo_thumb_path || null
  const locBranch = loc as { organization_branch?: { name?: string | null } | null; organization_branch_id?: number | null } | null
  const branchName =
    locBranch?.organization_branch?.name ??
    branches.find((b) => b.id === locBranch?.organization_branch_id)?.name ??
    null

  return (
    <Modal open={open} onClose={onClose} title={t('dashboard.board.passDetail')} size="lg">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-2 rounded-inner border border-line bg-fg/[0.03] p-4">
            {/* The gate's own snapshot when it has one — that is what the pass
                IS; the profile photo only when the camera sent nothing (v1). */}
            {snapshot && !snapFailed ? (
              <a href={snapshot} target="_blank" rel="noopener noreferrer" title={t('dashboard.board.openPhoto')}>
                {/* A snapshot that will not load (expired link, storage down)
                    left an empty white box; it now falls back to the profile. */}
                <img src={snapshot} alt="" onError={() => setSnapFailed(true)} className="h-[180px] w-full max-w-[260px] rounded-inner object-cover" />
              </a>
            ) : (
              <Avatar
                src={row.employee.photo_path}
                fallbackSrc={row.employee.photo_thumb_path}
                name={row.employee.legal_name ?? ''}
                size={116}
              />
            )}
            <p className="text-center text-[14px] font-semibold text-fg">
              {row.employee.legal_name ?? t('common.unknown')}
            </p>
            <p className="text-center text-[12px] text-fg-muted">{jobTitle(row.employee)}</p>
          </div>

          <dl className="overflow-hidden rounded-inner border border-line">
            {lateMinutes != null && lateMinutes > 0 && (
              <Row icon={<Clock size={13} />} label={t('dashboard.gate.late')}>
                <Badge tone="danger">{t('dashboard.board.lateBy', { count: lateMinutes })}</Badge>
              </Row>
            )}
            {isEntry != null && (
              <Row icon={<Clock size={13} />} label={t('dashboard.colStatus')}>
                <Badge tone={isEntry ? 'success' : 'danger'}>
                  {isEntry ? t('dashboard.passIn') : t('dashboard.passOut')}
                </Badge>
              </Row>
            )}
            <Row icon={<Calendar size={13} />} label={t('vehicles.colDate')}>
              {event?.happen_time ? dayjs(event.happen_time).format('DD.MM.YYYY') : '—'}
            </Row>
            <Row icon={<Clock size={13} />} label={t('dashboard.board.passTime')}>
              {event?.happen_time ? dayjs(event.happen_time).format('HH:mm:ss') : '—'}
            </Row>
            <Row icon={<Building2 size={13} />} label={t('dashboard.colGate')}>
              {turnstileName(event) || row.turnstile || '—'}
            </Row>
            {branchName && (
              <Row icon={<Building2 size={13} />} label={t('dashboard.board.passBranch')}>
                {branchName}
              </Row>
            )}
            {loc?.address && (
              <Row icon={<MapPin size={13} />} label={t('turnstiles.fieldLocations')}>
                {loc.address}
              </Row>
            )}
            {distance && (
              <Row icon={<Navigation size={13} />} label={t('turnstiles.distanceFromBranch')}>
                {distance}
              </Row>
            )}
            {mc && (
              <>
                <Row icon={<Smartphone size={13} />} label={t('mobileCheckins.source')}>
                  {t('mobileCheckins.viaPhone')}
                </Row>
                <Row icon={<Building2 size={13} />} label={t('mobileCheckins.colNearest')}>
                  {placeLabel(mc) || t('mobileCheckins.distanceUnknown')}
                </Row>
                <Row icon={<Navigation size={13} />} label={t('mobileCheckins.colDistance')}>
                  {mc.distance_m == null ? (
                    <span className="font-normal text-fg-subtle">{t('mobileCheckins.distanceUnknown')}</span>
                  ) : (
                    <Badge tone={mc.is_far ? 'danger' : 'success'}>
                      {mc.is_far
                        ? t('mobileCheckins.far', { distance: formatDistance(mc.distance_m) })
                        : formatDistance(mc.distance_m)}
                    </Badge>
                  )}
                </Row>
                <Row icon={<MapPin size={13} />} label={t('mobileCheckins.colLocation')}>
                  <a href={mc.map_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 tabular-nums text-brand-strong hover:underline">
                    {mc.latitude.toFixed(5)}, {mc.longitude.toFixed(5)}
                    <ExternalLink size={11} className="opacity-60" />
                  </a>
                  {mc.accuracy_m != null && (
                    <span className="ml-1 font-normal text-fg-subtle">±{Math.round(mc.accuracy_m)} m</span>
                  )}
                </Row>
              </>
            )}
          </dl>

          {mc && mc.status === 'active' && canCancel && (
            <Button variant="danger-ghost" size="sm" className="w-full" leftIcon={<Ban size={14} />} onClick={() => setCancelling(true)}>
              {t('mobileCheckins.cancel')}
            </Button>
          )}
        </div>

        <div className="flex flex-col overflow-hidden rounded-inner border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-fg/[0.04] px-3 py-2">
            <MapPin size={14} className="shrink-0 text-brand" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">
              {mc ? t('mobileCheckins.phoneLocation') : loc?.name || turnstileName(event) || t('dashboard.colGate')}
            </span>
          </div>
          <LazyRouteMap
            origin={route?.origin}
            // ⚠️ A same-site answer from the router comes back with a destination
            // WITHOUT coordinates; `??` kept that empty object and the map never
            // drew (blank panel). Fall back to the gate's own coordinates.
            destination={
              mc
                ? { latitude: mc.latitude, longitude: mc.longitude, name: t('mobileCheckins.phoneLocation') }
                : route?.destination?.latitude != null && route?.destination?.longitude != null
                ? route.destination
                : {
                    latitude: (loc as { latitude?: number } | null)?.latitude,
                    longitude: (loc as { longitude?: number } | null)?.longitude,
                    name: loc?.name,
                  }
            }
            geometry={sameSite ? null : route?.geometry}
            // Fills the column next to the details (it stopped at 300px and
            // left a white block below); 300px when stacked on a phone.
            className="h-[300px] w-full lg:h-auto lg:min-h-[300px] lg:flex-1"
          />
        </div>
      </div>

      <CancelCheckinDialog
        open={cancelling}
        loading={cancel.isPending}
        error={cancelError}
        onClose={() => setCancelling(false)}
        onSubmit={async (reason) => {
          if (!mc) return
          setCancelError('')
          try {
            await cancel.mutateAsync({ id: mc.id, reason })
            toast.ok(t('mobileCheckins.cancelled'))
            setCancelling(false)
            onClose()
          } catch (e) {
            setCancelError(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />
    </Modal>
  )
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
      <dt className="flex items-center gap-1.5 text-[12px] text-fg-muted">
        {icon} {label}
      </dt>
      <dd className="ml-auto text-right text-[12.5px] font-semibold text-fg">{children}</dd>
    </div>
  )
}
