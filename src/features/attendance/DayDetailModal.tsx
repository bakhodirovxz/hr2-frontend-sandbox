import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeftFromLine, ArrowRightToLine, FileText, MapPin, User } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { apiGet } from '@/api/http'
import { toItems, type ListResponse } from '@/types'
import { cn } from '@/lib/cn'
import { LazyRouteMap } from './LazyRouteMap'
import { formatAppDate, inTashkent } from '@/lib/format'
import { CAL_COLOR, CAL_LABEL, type CalStatus } from './attendanceStatus'
import type { DayDocument } from './useDayDocuments'
import {
  dayBreaks,
  eventDirection,
  eventLocation,
  formatMinutes,
  insideMinutes,
  turnstileName,
  type DayEvents,
  type TurnstileEvent,
} from './useDayEvents'

/** Fallback centre when a turnstile has no coordinates on file (Tashkent). */
const FALLBACK_COORDS = { lat: 41.2995, lng: 69.2401 }

/**
 * Coordinates by location id.
 *
 * ⚠️ THE EVENT DOES NOT CARRY THEM. `turnstile.locations[]` is serialized lean
 * — `{id, name, organization_branch_id}` and nothing else — so reading
 * latitude off the event always found `undefined` and the map said "no
 * coordinates set" for every pass, including gates that do have them. Verified
 * live: the event's location id 3 has 41.321558 / 69.256075 in `/locations`,
 * which the nested shape simply omits.
 *
 * The whole list is 58 rows / 33 KB and never changes during a session, so one
 * cached read answers every pass on the day.
 */
interface LocationCoords {
  id: number
  name?: string | null
  address?: string | null
  latitude?: number | null
  longitude?: number | null
}

function useLocationCoords(enabled: boolean) {
  const q = useQuery({
    queryKey: ['locations', 'coords'],
    queryFn: () =>
      apiGet<ListResponse<LocationCoords>>('locations', {
        /* ⚠️ NO BRANCH INJECTION. The request layer stamps the header branch
           onto every call, and the gate someone walked through need not belong
           to it — a guest employee badging at another branch is a supported
           case (`project_cross_branch_events`). Scoped, this list came back
           with 2 rows instead of 58 and never contained the location the event
           pointed at, so the map stayed empty even after the id lookup. */
        _no_branch_inject: true,
      }),
    enabled,
    staleTime: 30 * 60_000,
    retry: false,
  })
  const byId = useMemo(() => {
    const m = new Map<number, LocationCoords>()
    for (const l of toItems(q.data)) if (l?.id != null) m.set(l.id, l)
    return m
  }, [q.data])
  return byId
}

/**
 * What actually happened on one day.
 *
 * The calendar cell can only afford a colour and two timestamps; this answers
 * the follow-up questions: how long was I actually inside, which gates did I
 * pass and where are they, what does the reader's snapshot show, and — when the
 * day was a trip or a leave — which document put it there.
 */
export function DayDetailModal({
  date,
  status,
  day,
  lateMinutes,
  workingStart,
  workingEnd,
  lunchStart,
  lunchEnd,
  isWorkingDay,
  documents,
  onClose,
}: {
  /** ISO date, or null while closed. */
  date: string | null
  status: CalStatus
  day?: DayEvents | null
  lateMinutes?: number
  workingStart?: string
  workingEnd?: string
  /** From the employee card; without it the deduction hits the wrong hour. */
  lunchStart?: string | null
  lunchEnd?: string | null
  isWorkingDay: boolean
  documents: DayDocument[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const events = useMemo(() => day?.all ?? [], [day])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  /* The reader snapshot, full size. It is the proof of who actually walked
     through, and at 40px it proves nothing. */
  const [zoom, setZoom] = useState<string | null>(null)

  // Centre the map on the first pass of the day until the user picks another.
  useEffect(() => {
    setSelectedId(events[0]?.id ?? null)
  }, [events, date])

  const selected = events.find((e) => e.id === selectedId) ?? events[0] ?? null
  // The employee's OWN lunch window — 1200 people here lunch at 12:00, not 13:00.
  const inside = insideMinutes(events, workingEnd, { start: lunchStart, end: lunchEnd })
  const breaks = dayBreaks(events, workingEnd)
  const firstIn = day?.entry?.happen_time ? inTashkent(day.entry.happen_time).format('HH:mm') : '—'
  const lastOut = day?.exit?.happen_time ? inTashkent(day.exit.happen_time).format('HH:mm') : '—'

  return (
    <Modal
      open={!!date}
      onClose={onClose}
      size="lg"
      title={date ? formatAppDate(date) : ''}
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      <div className="space-y-4">
        {/* Status line */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-[var(--r-pill)] px-2.5 py-1 text-[12px] font-semibold"
            style={{
              backgroundColor: `rgb(var(${CAL_COLOR[status]}) / 0.14)`,
              color: `rgb(var(${CAL_COLOR[status]}))`,
            }}
          >
            {t(`attendance.${CAL_LABEL[status]}`)}
          </span>
          <Badge tone={isWorkingDay ? 'neutral' : 'warning'}>
            {isWorkingDay ? t('myAttendance.workingDay') : t('myAttendance.restDay')}
          </Badge>
          {!!lateMinutes && (
            <Badge tone="warning">{t('myAttendance.lateBy', { count: lateMinutes })}</Badge>
          )}
        </div>

        {/* Plan vs fact */}
        <div className="overflow-hidden rounded-[var(--r-md)] border border-line">
          <div className="grid grid-cols-4 bg-surface-2 px-3 py-2 text-[11.5px] font-semibold text-fg-muted">
            <span />
            <span className="text-center">{t('myAttendance.colIn')}</span>
            <span className="text-center">{t('myAttendance.colOut')}</span>
            <span className="text-center">{t('myAttendance.colBreak')}</span>
          </div>
          <div className="grid grid-cols-4 items-center border-t border-line px-3 py-2 text-[13px]">
            <span className="text-fg-muted">{t('myAttendance.rowPlan')}</span>
            <span className="text-center tabular-nums text-fg">{workingStart ?? '09:00'}</span>
            <span className="text-center tabular-nums text-fg">{workingEnd ?? '18:00'}</span>
            <span className="text-center tabular-nums text-fg">13:00–14:00</span>
          </div>
          <div className="grid grid-cols-4 items-center border-t border-line px-3 py-2 text-[13px]">
            <span className="text-fg-muted">{t('myAttendance.rowFact')}</span>
            <span className={cn('text-center font-semibold tabular-nums', lateMinutes ? 'text-warning' : 'text-fg')}>
              {firstIn}
            </span>
            <span className="text-center font-semibold tabular-nums text-fg">{lastOut}</span>
            <span className={cn('text-center text-[12px] tabular-nums', breaks.length ? 'text-warning' : 'text-fg-subtle')}>
              {breaks.length ? breaks.map((b) => `${b.start}–${b.end}`).join(', ') : '—'}
            </span>
          </div>
        </div>

        {/* Day totals */}
        <div className="grid grid-cols-2 gap-3">
          <Metric
            label={t('myAttendance.insideTime')}
            value={events.length ? formatMinutes(inside, t('attendance.hoursUnit'), t('myAttendance.minuteUnit')) : '—'}
            tone="--success"
          />
          <Metric label={t('myAttendance.recordCount')} value={String(events.length)} tone="--brand" />
        </div>

        {/* Documents behind the day */}
        {documents.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold text-fg-subtle">
              {t('myAttendance.documents')}
            </p>
            {documents.map((d) => (
              <Link
                key={`${d.kind}-${d.id}`}
                to={d.href}
                onClick={onClose}
                className="flex items-center gap-3 rounded-[var(--r-sm)] border border-line bg-surface-2/60 px-3 py-2.5 transition-colors hover:border-brand/50"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] bg-brand-soft text-brand">
                  <FileText size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">
                    {d.title || t(d.kind === 'order' ? 'myAttendance.docOrder' : 'myAttendance.docLeave')}
                  </span>
                  <span className="block truncate text-[11.5px] text-fg-muted">
                    {[d.number && `№ ${d.number}`, d.from && d.to && `${d.from} — ${d.to}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}

        {/* Passes + map */}
        {events.length === 0 ? (
          <EmptyState title={t('myAttendance.noEvents')} description={t('myAttendance.noEventsHint')} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_1fr]">
            <ul className="scroll-thin max-h-[280px] divide-y divide-line overflow-y-auto rounded-[var(--r-md)] border border-line">
              {events.map((e) => (
                <PassRow
                  key={e.id}
                  event={e}
                  selected={e.id === selected?.id}
                  onSelect={() => setSelectedId(e.id)}
                  onZoom={setZoom}
                />
              ))}
            </ul>
            <TurnstileMap event={selected} />
          </div>
        )}
      </div>
      {zoom && (
        <div
          role="button"
          tabIndex={0}
          aria-label={t('common.close')}
          onClick={() => setZoom(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') setZoom(null)
          }}
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        >
          <img loading="lazy" decoding="async"
            src={zoom}
            alt=""
            crossOrigin="anonymous"
            className="max-h-full max-w-full rounded-[var(--r-md)] object-contain shadow-lg"
          />
        </div>
      )}
    </Modal>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-line bg-surface-2/60 px-3 py-2.5">
      <p className="text-[11px] text-fg-muted">{label}</p>
      <p className="text-[15px] font-bold tabular-nums" style={{ color: `rgb(var(${tone}))` }}>
        {value}
      </p>
    </div>
  )
}

function PassRow({
  event,
  selected,
  onSelect,
  onZoom,
}: {
  event: TurnstileEvent
  selected: boolean
  onSelect: () => void
  /** Open the reader's snapshot full size. */
  onZoom: (src: string) => void
}) {
  const { t } = useTranslation()
  const isEntry = eventDirection(event) === 'entry'
  const loc = eventLocation(event)
  // `pic_uri` is HikCentral's internal `Vsm://…` locator (every one of the
  // 206k events on TEST) — the browser cannot fetch it, so it rendered a
  // broken image with a zoom button and a CORS error in the console. Only a
  // real URL counts as a photo.
  const isUrl = (v?: string | null) => !!v && /^(https?:)?\//.test(v)
  const photo = [event.photo_thumb_path, event.photo_path, event.pic_uri].find(isUrl) ?? null
  // The zoom opens the FULL snapshot. The 160px copy (since 2026-09-14) is
  // for the 40px square in the row only — zoomed, it opened as a tiny picture
  // while older passes, which have no copy, opened full size.
  const fullPhoto = [event.photo_path, event.pic_uri].find(isUrl) ?? photo

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
          selected ? 'bg-brand-soft' : 'bg-surface hover:bg-surface-2',
        )}
      >
        {/* The reader's snapshot — proof of who actually passed. */}
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[var(--r-sm)] bg-surface-2 ring-1 ring-line',
            photo && 'cursor-zoom-in',
          )}
          role={photo ? 'button' : undefined}
          tabIndex={photo ? 0 : undefined}
          aria-label={photo ? t('myAttendance.openSnapshot') : undefined}
          onClick={
            photo
              ? (e) => {
                  // The row selects the pass for the map; the thumbnail is its
                  // own target and must not do both.
                  e.stopPropagation()
                  onZoom(fullPhoto!)
                }
              : undefined
          }
          onKeyDown={
            photo
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    e.stopPropagation()
                    onZoom(fullPhoto!)
                  }
                }
              : undefined
          }
        >
          {photo ? (
            <img
              src={photo}
              alt=""
              // MinIO is cross-origin; without CORS the response is opaque and
              // Firefox's ORB refuses to render it (same fix as <Avatar>).
              crossOrigin="anonymous"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <User size={15} className="text-fg-subtle" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-semibold tabular-nums text-fg">
              {inTashkent(event.happen_time).format('HH:mm:ss')}
            </span>
            <span
              className="inline-flex items-center gap-1 rounded-[var(--r-pill)] px-1.5 py-0.5 text-[10.5px] font-semibold"
              style={{
                backgroundColor: `rgb(var(${isEntry ? '--success' : '--danger'}) / 0.12)`,
                color: `rgb(var(${isEntry ? '--success' : '--danger'}))`,
              }}
            >
              {isEntry ? <ArrowRightToLine size={11} /> : <ArrowLeftFromLine size={11} />}
              {isEntry ? t('myAttendance.dirIn') : t('myAttendance.dirOut')}
            </span>
          </span>
          <span className="block truncate text-[11.5px] text-fg-muted">
            {[turnstileName(event) || t('myAttendance.turnstile'), loc?.name].filter(Boolean).join(' · ')}
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * Where that pass happened.
 *
 * An embedded Yandex map widget, as in v1 — no map library, no tiles to bundle,
 * and it is the provider already used elsewhere in this product. When the
 * turnstile has no coordinates the widget is pointless, so the address (or a
 * plain "not set") is shown instead of a map of the wrong city.
 */
export function TurnstileMap({ event }: { event: TurnstileEvent | null }) {
  const { t } = useTranslation()
  const loc = eventLocation(event)
  const coords = useLocationCoords(!!event)
  // The nested location knows its id but not where it is; the register does.
  const full = loc?.id != null ? coords.get(loc.id) : undefined
  const latitude = loc?.latitude ?? full?.latitude
  const longitude = loc?.longitude ?? full?.longitude
  const address = loc?.address ?? full?.address
  const hasCoords = latitude != null && longitude != null
  const lat = latitude ?? FALLBACK_COORDS.lat
  const lng = longitude ?? FALLBACK_COORDS.lng

  return (
    <div className="flex flex-col overflow-hidden rounded-[var(--r-md)] border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <MapPin size={14} className="shrink-0 text-brand" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-fg">
          {loc?.name || turnstileName(event) || t('myAttendance.turnstile')}
        </span>
      </div>
      {hasCoords ? (
        /* OUR map, not a Yandex iframe — see RouteMap for why. */
        <LazyRouteMap
          destination={{ latitude: lat, longitude: lng, name: loc?.name }}
          className="h-[228px] w-full"
        />
      ) : (
        <div className="flex h-[228px] flex-col items-center justify-center gap-1 px-4 text-center">
          <MapPin size={22} className="text-fg-subtle" />
          <p className="text-[12px] text-fg-muted">{address || t('myAttendance.noCoords')}</p>
        </div>
      )}
      {(address || loc?.organization_branch?.name) && (
        <div className="border-t border-line px-3 py-2 text-[11.5px] text-fg-muted">
          {[address, loc?.organization_branch?.name].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}
