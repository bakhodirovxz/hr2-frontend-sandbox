import { Suspense, lazy } from 'react'
import { CenteredSpinner } from '@/components/ui/Spinner'
import type { RoutePoint } from './RouteMap'

/**
 * The map, fetched only when one is actually drawn.
 *
 * MapLibre plus its worker and the basemap definitions weigh ~1.5 MB built.
 * Imported statically it rode along with the attendance and profile chunks,
 * so every visit paid for it even when nobody opened a day. `React.lazy`
 * moves that to the moment a map is rendered — which is a click, not a page
 * load.
 */
const RouteMap = lazy(() => import('./RouteMap').then((m) => ({ default: m.RouteMap })))

export function LazyRouteMap(props: {
  origin?: RoutePoint | null
  destination?: RoutePoint | null
  geometry?: { type?: string; coordinates?: [number, number][] } | null
  className?: string
}) {
  return (
    <Suspense fallback={<div className={props.className}><CenteredSpinner /></div>}>
      <RouteMap {...props} />
    </Suspense>
  )
}
