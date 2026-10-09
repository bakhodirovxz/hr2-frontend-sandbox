/**
 * A tab opened BEFORE a deploy still holds the old `index.html`, whose lazy
 * screens point at hashed chunks the new build no longer has
 * (`RouteMap-Dq2Yvm1I.js` → 404, 2026-09-24). The import then rejects with
 * «Failed to fetch dynamically imported module» and the screen is dead until
 * the user reloads by hand.
 *
 * The cure is the reload itself: the fresh `index.html` (served no-store)
 * names the new chunks. It is done ONCE per window of time — if the chunk is
 * missing for another reason (network down, broken deploy), looping reloads
 * would lock the user out, so the second failure falls through to the
 * ordinary error screen.
 */
const KEY = 'stale-chunk-reload-at'
const WINDOW_MS = 30_000

export function isStaleChunkError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(msg)
}

/** Reloads the page unless it already did so moments ago; returns whether it did. */
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0)
    if (Date.now() - last < WINDOW_MS) return false
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* storage blocked — reload anyway; a loop needs a failing reload too */
  }
  window.location.reload()
  return true
}

/** Vite fires this when a lazy chunk (or its CSS) cannot be fetched. */
export function installStaleChunkReload() {
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForNewBuild()) e.preventDefault()
  })
}
