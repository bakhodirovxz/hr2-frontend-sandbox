import type { Map as MapLibreMap } from 'maplibre-gl'

/**
 * Map ground: our own vector tiles, or satellite imagery.
 *
 * OpenStreetMap holds no imagery (vector data only), so the hybrid modes pull
 * pictures from an outside source. Three modes, and the choice is remembered
 * in the browser:
 *
 *   vector — OUR tiles (tileserver-gl on this host). No outside request, no
 *            API key, no quota. The default.
 *   esri   — Esri World Imagery. Sharp enough to see buildings.
 *            ⚠️ The imagery belongs to Esri/Maxar: it may be SHOWN live with
 *            the attribution, but mirroring it onto our own server would
 *            breach the licence — which is why that was never done.
 *   s2     — Sentinel-2 cloudless 2025 (EOX), CC-BY-4.0. 10 m/pixel (a plant
 *            site or a reservoir reads; individual buildings do not), but the
 *            licence is clean and it can be mirrored freely. The fallback for
 *            when Esri is unreachable.
 *
 * Switching is cheap: the layers are added once and only their visibility
 * changes.
 */

const STORAGE_KEY = 'hrm_basemap'

export interface Basemap {
  id: string
  /** i18n key under `map.` — the typed `t()` refuses a computed key. */
  label: 'vector' | 'satellite' | 'sentinel'
  sourceId?: string
  maxzoom?: number
  tiles?: string[]
  attribution?: string
}

// The WMTS path order is {z}/{y}/{x} — x and y are SWAPPED versus the usual
// {z}/{x}/{y}. Both sources below follow it.
export const BASEMAPS: Basemap[] = [
  { id: 'vector', label: 'vector' },
  {
    id: 'esri',
    label: 'satellite',
    sourceId: 'sat-esri',
    // 17 is MEASURED, not arbitrary: across 84 of our branch and site
    // coordinates every one has imagery at z17, while at z18 twenty-six of
    // them (31%) come back as Esri's grey "Map data not yet available" tile.
    // The source ends here, so MapLibre stretches the z17 tile beyond it — a
    // slightly soft picture instead of an error. DO NOT RAISE: back at 18 the
    // mountain hydro plants break again.
    maxzoom: 17,
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution:
      'Imagery &copy; <a href="https://www.esri.com" target="_blank" rel="noreferrer">Esri</a>, Maxar, Earthstar Geographics',
  },
  {
    id: 's2',
    label: 'sentinel',
    sourceId: 'sat-s2',
    // The year sits in the URL: EOX publishes a new composite yearly (2016..2025
    // all verified working). Updating = changing the year on this line. Past
    // z15 EOX returns stretched imagery anyway, which MapLibre does for free —
    // no point spending extra outside requests on it.
    maxzoom: 15,
    tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'],
    attribution:
      'Sentinel-2 cloudless 2025 by <a href="https://s2maps.eu" target="_blank" rel="noreferrer">EOX</a> (CC-BY-4.0)',
  },
]

// Vector layers that make no sense on top of imagery — hidden in satellite
// mode. Roads, borders and labels STAY: that is the point of a hybrid.
const VECTOR_FILL_LAYERS = ['landcover', 'park', 'water', 'waterway', 'building']

export function loadBasemapChoice(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return BASEMAPS.some((b) => b.id === saved) ? (saved as string) : 'vector'
  } catch {
    return 'vector'
  }
}

export function saveBasemapChoice(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* localStorage can be shut in a private window — nothing important is lost */
  }
}

/** Applies the chosen ground (adding its layer once, then toggling visibility). */
export function applyBasemap(map: MapLibreMap, basemapId: string) {
  if (!map || !map.isStyleLoaded()) return

  const setVisible = (id: string, visible: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
  }

  for (const bm of BASEMAPS) {
    if (!bm.sourceId) continue
    const active = bm.id === basemapId

    if (active && !map.getSource(bm.sourceId)) {
      map.addSource(bm.sourceId, {
        type: 'raster',
        tiles: bm.tiles,
        tileSize: 256,
        maxzoom: bm.maxzoom,
        // Attribution is REQUIRED by both sources; MapLibre shows it in the
        // AttributionControl automatically.
        attribution: bm.attribution,
      })
      // Above the background layer and below everything else, so roads and
      // labels stay legible over the imagery.
      const firstAboveBackground = map.getStyle().layers.find((l) => l.id !== 'background')
      map.addLayer({ id: bm.sourceId, type: 'raster', source: bm.sourceId }, firstAboveBackground?.id)
    }
    setVisible(bm.sourceId, active)
  }

  const imageryOn = basemapId !== 'vector'
  VECTOR_FILL_LAYERS.forEach((id) => setVisible(id, !imageryOn))
}
