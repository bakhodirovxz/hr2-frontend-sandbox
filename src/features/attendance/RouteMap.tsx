import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Layers } from 'lucide-react'
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { BASEMAPS, applyBasemap, loadBasemapChoice, saveBasemapChoice } from '@/features/vehicles/basemaps'
import { cn } from '@/lib/cn'

setWorkerUrl(maplibreWorkerUrl)

/**
 * OUR OWN MAP for a place — a turnstile, and optionally the way to it.
 *
 * ⚠️ THIS REPLACES A YANDEX IFRAME. An iframe is only a PICTURE: a route line
 * cannot be drawn over it, our own marker cannot be placed on it, and its
 * labels come back in Cyrillic. v1 made exactly this move and left the reason
 * in a comment; v2 had drifted back to the iframe. The tiles are ours
 * (tileserver-gl on this host, built from an OpenStreetMap Uzbekistan
 * extract), so there is no outside request, no API key and no quota.
 *
 * `geometry` is the GeoJSON LineString OSRM returns (the backend sends it with
 * `include_geometry=true`). Given one, the real road from the branch to the
 * gate is drawn and the frame is fitted to it; without one the place is simply
 * centred.
 */
const TILES_BASE = import.meta.env.VITE_TILES_URL || '/tiles'
const STYLE_URL = `${TILES_BASE}/styles/uzgidro-dark/style.json`

/* tileserver runs with `--public_url`, so its style hands back absolute
   hr.uzgidro.uz addresses for fonts and data. Fold them onto OUR proxy so
   everything is same-origin and no CORS is involved (same as VehicleMap). */
const PUBLIC_TILES_PREFIX = 'https://hr.uzgidro.uz/tiles/'
const toLocalTiles = (url: string) =>
  url.startsWith(PUBLIC_TILES_PREFIX) ? `${TILES_BASE}/${url.slice(PUBLIC_TILES_PREFIX.length)}` : url

const ROUTE_SOURCE = 'hrm-route'
const ROUTE_LINE = 'hrm-route-line'
const ROUTE_GLOW = 'hrm-route-glow'

/** Paint takes literal colours, so the theme tokens are read out of CSS. */
const token = (name: string, alpha = 1) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '255 255 255'
  return alpha === 1 ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`
}

export interface RoutePoint {
  latitude?: number | null
  longitude?: number | null
  name?: string | null
}

export function RouteMap({
  origin,
  destination,
  geometry,
  className,
}: {
  /** Where the person came from — their own branch. Optional. */
  origin?: RoutePoint | null
  /** The gate. Without coordinates the map is not drawn at all. */
  destination?: RoutePoint | null
  geometry?: { type?: string; coordinates?: [number, number][] } | null
  className?: string
}) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const markersRef = useRef<Marker[]>([])
  const [basemap, setBasemap] = useState(loadBasemapChoice)

  const cycleBasemap = () => {
    const i = BASEMAPS.findIndex((b) => b.id === basemap)
    const next = BASEMAPS[(i + 1) % BASEMAPS.length]
    setBasemap(next.id)
    saveBasemapChoice(next.id)
  }
  const current = BASEMAPS.find((b) => b.id === basemap)

  const destLat = destination?.latitude
  const destLng = destination?.longitude
  const hasDest = destLat != null && destLng != null

  // Built once; everything after is an update on the same instance.
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasDest) return
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL,
      center: [destLng as number, destLat as number],
      zoom: 15,
      attributionControl: false,
      transformRequest: (url) => ({ url: toLocalTiles(url) }),
    })
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(
      new AttributionControl({ compact: true, customAttribution: '© OpenStreetMap' }),
      'bottom-left',
    )
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [hasDest, destLat, destLng])

  // Markers, route line and framing.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !hasDest) return

    const draw = () => {
      applyBasemap(map, basemap)

      for (const m of markersRef.current) m.remove()
      markersRef.current = []

      const place = (p: RoutePoint, color: string) => {
        if (p.latitude == null || p.longitude == null) return
        const el = document.createElement('div')
        el.style.cssText = `width:16px;height:16px;border-radius:9999px;background:${color};box-shadow:0 0 0 4px ${color}33,0 1px 4px rgba(0,0,0,.5)`
        const marker = new Marker({ element: el })
          .setLngLat([p.longitude, p.latitude])
          .addTo(map)
        markersRef.current.push(marker)
      }

      const coords = geometry?.coordinates
      const hasRoute = Array.isArray(coords) && coords.length > 1

      // The origin marker is only meaningful when the two places differ; on a
      // same-site pass both dots would sit on top of each other.
      if (hasRoute && origin?.latitude != null) place(origin, token('--chart-2'))
      place(destination as RoutePoint, token('--brand'))

      const src = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: hasRoute ? coords : [] },
      }
      if (src) {
        src.setData(data)
      } else {
        map.addSource(ROUTE_SOURCE, { type: 'geojson', data })
        map.addLayer({
          id: ROUTE_GLOW,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': token('--brand'), 'line-width': 11, 'line-blur': 8, 'line-opacity': 0.35 },
        })
        map.addLayer({
          id: ROUTE_LINE,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': token('--brand'), 'line-width': 3.5 },
        })
      }

      if (hasRoute) {
        const b = new LngLatBounds()
        for (const c of coords as [number, number][]) b.extend(c)
        map.fitBounds(b, { padding: 44, duration: 400 })
      } else {
        map.easeTo({ center: [destLng as number, destLat as number], zoom: 16, duration: 300 })
      }
    }

    if (map.isStyleLoaded()) draw()
    else map.once('load', draw)
  }, [basemap, geometry, origin, destination, hasDest, destLat, destLng])

  if (!hasDest) return null

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* ⚠️ Sized by h-full/w-full, NOT `absolute inset-0`: MapLibre adds
          `.maplibregl-map { position: relative }` from its own (lazily loaded,
          hence later) stylesheet, which cancelled `absolute` — the element
          collapsed to 0px and every pass/day map rendered as a blank panel. */}
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <button
        type="button"
        onClick={cycleBasemap}
        className="absolute right-2 top-2 z-[5] inline-flex items-center gap-1.5 rounded-control border border-line bg-surface/90 px-2.5 py-1.5 text-[11px] font-semibold text-fg shadow-md backdrop-blur transition-colors hover:bg-surface-2"
      >
        <Layers size={13} />
        {current?.label === 'satellite'
          ? t('map.satellite')
          : current?.label === 'sentinel'
            ? t('map.sentinel')
            : t('map.vector')}
      </button>
    </div>
  )
}
