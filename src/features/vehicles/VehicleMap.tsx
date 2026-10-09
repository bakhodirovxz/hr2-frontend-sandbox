import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crosshair, Gauge, Layers, Navigation, RefreshCw, Satellite } from 'lucide-react'
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import type { TFunction } from 'i18next'
import { BASEMAPS, applyBasemap, loadBasemapChoice, saveBasemapChoice, type Basemap } from './basemaps'
import type { PlaceCategory, VehicleGpsStop, VehicleLive, VehicleTrackPoint } from './useVehicles'
import { placeLabel, stopColor } from './places'
import { cn } from '@/lib/cn'
import { formatDateTime } from '@/lib/format'

setWorkerUrl(maplibreWorkerUrl)

/*
 * THE CAR ON A MAP (live GPS + the route it drove).
 *
 * Tiles are ours (tileserver-gl on this host) — no outside request, no API key
 * and no quota; the GPS data itself arrives through our backend, so the
 * provider token NEVER reaches the browser.
 *
 * Live position refreshes on its own (the caller polls); the track is history
 * and only reloads when the date range changes or the user asks.
 *
 * STOPS (2026-09-15): where the car stood, as dots coloured by what is beside
 * them (café, hotel, our own office…). A dot opens a small popup; the caller
 * may also pass `focus` to fly the map to a stop picked from the list.
 */

const TILES_BASE = import.meta.env.VITE_TILES_URL || '/tiles'
const STYLE_URL = `${TILES_BASE}/styles/uzgidro-dark/style.json`

// tileserver runs with `--public_url`, so the style file hands back absolute
// hr.uzgidro.uz addresses for its fonts and data. v2 is served from its own
// host, so those are folded back onto OUR `/tiles/` proxy — that way the tiles
// come from the same origin and no CORS is involved at all.
const PUBLIC_TILES_PREFIX = 'https://hr.uzgidro.uz/tiles/'
const toLocalTiles = (url: string) =>
  url.startsWith(PUBLIC_TILES_PREFIX) ? `${TILES_BASE}/${url.slice(PUBLIC_TILES_PREFIX.length)}` : url

const TRACK_SOURCE = 'hrm-veh-track'
const TRACK_LINE = 'hrm-veh-track-line'
const TRACK_GLOW = 'hrm-veh-track-glow'

/**
 * Map paint takes literal colours, so the theme tokens are read out of CSS
 * rather than repeated as hex here (see `--map-*` in theme.css).
 */
const token = (name: string, alpha = 1) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const triplet = raw || '255 255 255'
  return alpha === 1 ? `rgb(${triplet})` : `rgb(${triplet} / ${alpha})`
}

/** The typed `t()` takes no computed key, so the three grounds are spelled out. */
const basemapLabel = (t: TFunction, id: Basemap['label']) =>
  id === 'satellite' ? t('map.satellite') : id === 'sentinel' ? t('map.sentinel') : t('map.vector')

/** A signal is treated as "live" for up to five minutes. */
const isFresh = (sec?: number | null) => sec != null && sec < 300

interface Props {
  live: VehicleLive | null
  track: VehicleTrackPoint[]
  stops?: VehicleGpsStop[]
  /** A stop to fly to (the list row that was clicked). */
  focus?: { lat: number; lon: number; key: string | number } | null
  trackLoading?: boolean
  onRefresh?: () => void
  className?: string
}

/** "14.09 06:17" from a naive Tashkent ISO string (no re-zoning). */
const stampLabel = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${iso.slice(11, 16)}`

const minutes = (sec: number) => {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)} s ${m % 60} min` : `${m} min`
}

function VehicleMap({ live, track, stops = [], focus, trackLoading, onRefresh, className }: Props) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const stopMarkersRef = useRef<Marker[]>([])
  const centeredRef = useRef(false)
  // FOLLOW mode: the map travels with the car. It switches off the moment the
  // user drags — otherwise the view is yanked away from whatever they were
  // looking at every twenty seconds.
  const followRef = useRef(true)
  const [follow, setFollow] = useState(true)
  const [basemap, setBasemap] = useState(loadBasemapChoice)

  const coords = useMemo(
    () => track.filter((p) => p.lat != null && p.lon != null).map((p) => [p.lon, p.lat] as [number, number]),
    [track],
  )

  // The map is created ONCE.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: [69.2401, 41.2995],
      zoom: 11,
      attributionControl: false,
      transformRequest: (url) => ({ url: toLocalTiles(url) }),
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }), 'bottom-left')
    map.on('dragstart', () => {
      followRef.current = false
      setFollow(false)
    })
    map.on('zoomstart', (e) => {
      // Only a human gesture — a programmatic easeTo must not cancel following.
      if (e.originalEvent) {
        followRef.current = false
        setFollow(false)
      }
    })
    mapRef.current = map
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      markerRef.current?.remove()
      markerRef.current = null
      stopMarkersRef.current.forEach((m) => m.remove())
      stopMarkersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [])

  // Stop dots. DOM markers rather than a symbol layer: a day has a dozen
  // stops, a week under a hundred, and a DOM node gets a native `title`,
  // a click and a popup for free without touching the tile style's glyphs.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    stopMarkersRef.current.forEach((m) => m.remove())
    stopMarkersRef.current = stops
      .filter((s) => s.lat != null && s.lon != null)
      .map((s) => {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = 'hrm-stop-marker'
        el.style.setProperty('--stop', stopColor(s.place_category))
        if (s.is_habitual) el.classList.add('is-habitual')
        const label = s.place_name ? `${placeLabel(t, s.place_kind, s.place_category)} · ${s.place_name}` : t('vehicles.stopUnknownPlace')
        el.title = `${label} — ${minutes(s.duration_s)}`
        el.setAttribute('aria-label', el.title)
        const popup = new Popup({ offset: 10, closeButton: false, maxWidth: '260px', className: 'hrm-stop-popup' }).setHTML(
          `<strong>${escapeHtml(label)}</strong><br>` +
            `${escapeHtml(stampLabel(s.start_at))} → ${escapeHtml(s.end_at.slice(11, 16))} · ${escapeHtml(minutes(s.duration_s))}` +
            (s.is_habitual ? `<br><em>${escapeHtml(t('vehicles.stopHabitual'))}</em>` : ''),
        )
        return new Marker({ element: el }).setLngLat([s.lon, s.lat]).setPopup(popup).addTo(map)
      })
  }, [stops, t])

  // Fly to the stop the user picked from the list.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !focus) return
    followRef.current = false
    setFollow(false)
    map.easeTo({ center: [focus.lon, focus.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 })
    const m = stopMarkersRef.current.find((mk) => {
      const ll = mk.getLngLat()
      return Math.abs(ll.lat - focus.lat) < 1e-6 && Math.abs(ll.lng - focus.lon) < 1e-6
    })
    if (m && !m.getPopup()?.isOpen()) m.togglePopup()
  }, [focus])

  // Marker + route.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const draw = () => {
      applyBasemap(map, basemap)

      // ── The route line ──
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: coords },
      }
      const src = map.getSource(TRACK_SOURCE) as GeoJSONSource | undefined
      if (src) {
        src.setData(data)
      } else if (coords.length) {
        map.addSource(TRACK_SOURCE, { type: 'geojson', data })
        map.addLayer({
          id: TRACK_GLOW,
          type: 'line',
          source: TRACK_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': token('--map-glow'), 'line-width': 9, 'line-opacity': 0.22 },
        })
        map.addLayer({
          id: TRACK_LINE,
          type: 'line',
          source: TRACK_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': token('--map-track'), 'line-width': 2.5 },
        })
      }

      // ── The car marker (rotated to its heading) ──
      if (live?.lat != null && live?.lon != null) {
        const fresh = isFresh(live.age_seconds)
        if (!markerRef.current) {
          const el = document.createElement('div')
          el.className = 'hrm-veh-marker'
          el.innerHTML = `
            <div class="hrm-veh-pulse"></div>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
              <path d="M12 2 L19 21 L12 17 L5 21 Z" fill="${token('--map-live')}"
                    stroke="#031a12" stroke-width="1.2" stroke-linejoin="round"/>
            </svg>`
          markerRef.current = new Marker({ element: el, rotationAlignment: 'map' })
            .setLngLat([live.lon, live.lat])
            .addTo(map)
        } else {
          markerRef.current.setLngLat([live.lon, live.lat])
        }
        markerRef.current.setRotation(live.course || 0)
        const el = markerRef.current.getElement()
        el.querySelector('svg path')?.setAttribute('fill', fresh ? token('--map-live') : token('--map-ink', 0.55))
        el.querySelector('.hrm-veh-pulse')?.classList.toggle('is-stale', !fresh)
      }

      // The question being asked is "where is it NOW", so the frame centres on
      // the CAR, not on the whole day's route. There is a separate button for
      // seeing the route end to end.
      if (live?.lat != null && live?.lon != null && (followRef.current || !centeredRef.current)) {
        map.easeTo({
          center: [live.lon, live.lat],
          zoom: centeredRef.current ? map.getZoom() : 14,
          duration: centeredRef.current ? 700 : 0,
        })
        centeredRef.current = true
      }
    }
    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [live, coords, basemap])

  // A track with no live position is pure history — frame it once so the user
  // is not left staring at an empty country-wide view.
  const historyFitted = useRef('')
  useEffect(() => {
    const map = mapRef.current
    if (!map || coords.length < 2 || live?.lat != null) return
    const key = `${coords.length}:${coords[0][0]}:${coords[coords.length - 1][0]}`
    if (historyFitted.current === key) return
    historyFitted.current = key
    const fit = () => fitTrack()
    if (map.isStyleLoaded()) fit()
    else map.once('load', fit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, live])

  /** Fit the whole route into the frame (following switches off). */
  const fitTrack = () => {
    const map = mapRef.current
    if (!map || coords.length < 2) return
    followRef.current = false
    setFollow(false)
    const b = coords.reduce((acc, c) => acc.extend(c), new LngLatBounds(coords[0], coords[0]))
    map.fitBounds(b, { padding: 56, duration: 600, maxZoom: 15 })
  }

  /** Turn following back on — the view returns to the car. */
  const recenter = () => {
    followRef.current = true
    setFollow(true)
    if (live?.lat != null && live?.lon != null) {
      mapRef.current?.easeTo({ center: [live.lon, live.lat], zoom: 14, duration: 600 })
    }
  }

  const cycleBasemap = () => {
    const next = BASEMAPS[(BASEMAPS.findIndex((b) => b.id === basemap) + 1) % BASEMAPS.length].id
    setBasemap(next)
    saveBasemapChoice(next)
  }

  const fresh = isFresh(live?.age_seconds)
  const moving = (live?.speed || 0) > 3
  const chipCls =
    'flex h-8 items-center gap-1.5 rounded-inner border border-map-ink/10 bg-map-scrim/85 px-2.5 text-[12px] text-map-ink/70 backdrop-blur-[6px] transition-colors hover:text-map-ink'

  return (
    <div className={cn('relative h-[380px] overflow-hidden rounded-card border border-line sm:h-[460px]', className)}>
      {/* ⚠️ The map container needs a REAL height, not `absolute inset-0`:
          MapLibre stamps `.maplibregl-map { position: relative }` onto this very
          node and cancels the absolute positioning, after which the element is
          0px tall and MapLibre silently falls back to its own 300px default —
          leaving a strip of blank card under the map. `h-full` against the
          fixed height above is the version that actually holds. */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Status panel — speed, signal freshness, satellites. */}
      <div className="pointer-events-none absolute left-2.5 top-2.5 flex flex-col gap-1.5 rounded-inner border border-map-ink/10 bg-map-scrim/85 px-3 py-2.5 backdrop-blur-[6px]">
        {live?.lat == null ? (
          <span className="max-w-[220px] text-[12px] text-map-ink/50">{t('vehicles.gpsNoSignal')}</span>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className={cn('h-2 w-2 rounded-full', fresh ? 'bg-map-live' : 'bg-map-ink/30')} />
              <span className="text-[13px] font-semibold text-map-ink/90">
                {moving ? t('vehicles.gpsMoving') : fresh ? t('vehicles.gpsStopped') : t('vehicles.gpsStale')}
              </span>
            </div>
            <div className="flex items-center gap-3.5 text-[12px] text-map-ink/60">
              <span className="flex items-center gap-1.5">
                <Gauge size={12} className="text-map-ink/40" />
                {Math.round(live.speed || 0)} km/h
              </span>
              <span className="flex items-center gap-1.5">
                <Satellite size={12} className="text-map-ink/40" />
                {live.sats ?? '—'}
              </span>
              {live.mileage != null && <span className="tabular-nums">{Math.round(live.mileage).toLocaleString('ru-RU')} km</span>}
            </div>
            <span className="text-[11px] text-map-ink/40">
              {live.age_seconds != null ? t('vehicles.gpsAgo', { min: Math.round(live.age_seconds / 60) }) : '—'}
              {live.at ? ` · ${formatDateTime(live.at)}` : ''}
            </span>
          </>
        )}
      </div>

      <div className="absolute right-2.5 top-2.5 flex flex-col items-end gap-1.5">
        <button type="button" onClick={cycleBasemap} className={chipCls} title={t('vehicles.gpsBasemap')}>
          <Layers size={13} />
          {basemapLabel(t, BASEMAPS.find((b) => b.id === basemap)?.label ?? 'vector')}
        </button>
        <button
          type="button"
          onClick={recenter}
          className={cn(chipCls, follow && 'border-map-live/40 bg-map-live/10 text-map-live hover:text-map-live')}
          title={t('vehicles.gpsFollowHint')}
        >
          <Crosshair size={13} />
          {follow ? t('vehicles.gpsFollowing') : t('vehicles.gpsFollow')}
        </button>
        {coords.length > 1 && (
          <button type="button" onClick={fitTrack} className={chipCls} title={t('vehicles.gpsFitHint')}>
            <Navigation size={13} className="text-map-track" />
            {t('vehicles.gpsRoute')} · {coords.length}
          </button>
        )}
        {onRefresh && (
          <button type="button" onClick={onRefresh} className={chipCls}>
            <RefreshCw size={13} className={trackLoading ? 'animate-spin' : ''} />
            {t('common.refresh')}
          </button>
        )}
      </div>
    </div>
  )
}

const escapeHtml = (v: string) =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export type { PlaceCategory }

export default VehicleMap
