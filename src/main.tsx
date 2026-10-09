import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { i18nReady } from './i18n'
import { bootReady, primeBootQueries } from './api/bootPrefetch'
import { App } from './App'
import { installStaleChunkReload } from './lib/staleChunk'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found')

/**
 * The shell's three boot requests start HERE, not inside the components — before
 * React mounts, and in parallel with the translation bundle. See
 * `primeBootQueries` for why the previous arrangement cost three serial round
 * trips.
 */
primeBootQueries()
installStaleChunkReload()

/**
 * Mount is gated on the translation bundle so a Russian or Cyrillic reader
 * never sees a frame of Uzbek. For Uzbek Latin — the default and the common
 * case — `i18nReady` is an already-resolved promise, so this costs one
 * microtask, not a round trip.
 */
/**
 * `bootReady` is awaited too: if the shell mounted before the bootstrap answer
 * landed, `useCurrentUser` would find an empty cache and fire its own
 * `auth/me` — the duplicate request the aggregate exists to remove. Logged-out
 * visitors are not delayed (the promise is pre-resolved without a token), and
 * the wait replaces, rather than adds to, the `<Splash/>` that used to block on
 * the same round trip.
 */
void Promise.all([i18nReady, bootReady]).then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
