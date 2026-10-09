import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'

/**
 * DRIVING DISTANCE between two points the system already knows — a branch and a
 * turnstile location — resolved by our own OSRM instance.
 *
 * `available: false` is the normal answer when the service is switched off or a
 * point has no coordinates. It is NOT an error: the caller simply draws nothing.
 */
export interface RoutePointRead {
  id?: number
  name?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface RouteDistance {
  available: boolean
  distance_km?: number | null
  duration_minutes?: number | null
  origin?: RoutePointRead | null
  destination?: RoutePointRead | null
  /** GeoJSON LineString — only when `includeGeometry` was asked for. */
  geometry?: { type?: string; coordinates?: [number, number][] } | null
}

export function useRouteDistance(params: {
  fromBranchId?: number | null
  toLocationId?: number | null
  enabled?: boolean
  /** Ask for the road line too — needed to DRAW the route, not just state it. */
  includeGeometry?: boolean
}) {
  const { fromBranchId, toLocationId, enabled = true, includeGeometry = false } = params
  const on = enabled && !!fromBranchId && !!toLocationId
  const q = useQuery({
    queryKey: ['routing', 'distance', fromBranchId, toLocationId, includeGeometry],
    queryFn: () =>
      apiGet<RouteDistance>('routing/distance', {
        from_branch_id: fromBranchId,
        to_location_id: toLocationId,
        include_geometry: includeGeometry || undefined,
      }),
    enabled: on,
    // Roads do not move; the answer is good for the whole session.
    staleTime: 60 * 60_000,
    retry: false,
  })
  return { route: q.data ?? null, loading: q.isLoading }
}

/**
 * "X km · 1s 20d", or null when there is nothing worth showing.
 *
 * Under a kilometre the number is meaningless — the gate is at the branch
 * itself — so it is replaced by words, exactly as v1 does.
 */
export function formatRoute(route: RouteDistance | null, sameSiteText: string): string | null {
  if (!route?.available || route.distance_km == null) return null
  if (route.distance_km < 1) return sameSiteText
  const minutes = route.duration_minutes ?? 0
  const time =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}s ${String(minutes % 60).padStart(2, '0')}d`
      : `${minutes} daq`
  return `${route.distance_km} km · ${time}`
}
