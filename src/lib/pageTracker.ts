/**
 * AUDIT TELEMETRY — page visits, searches and browser errors (2026-10-05).
 *
 * Port of v1 `src/shared/utils/pageTracker.js`. v2 had no such module, so from
 * the day users moved over (2026-09-29) the journal stopped receiving SEARCH
 * (33 137 rows in the two weeks before, 0 after) and PAGE_VIEW (12 635 → the
 * 4 still coming from old v1 tabs). The backend endpoints never changed:
 *
 *   POST /audit-logs/page-view      — one row per visit, on LEAVING the page,
 *                                     with the visible seconds and the clicks
 *   POST /audit-logs/client-events  — searches and errors, batched
 *
 * The payloads are byte-for-byte v1's. The token travels in `Authorization`,
 * or in the body for a beacon (sendBeacon cannot set headers; the backend
 * accepts both). `X-Selected-Branch` is sent too — the journal's «Filial»
 * column for a multi-branch user comes from it.
 *
 * Telemetry must never break the app: every entry point swallows its errors.
 */
import { joinApiUrl } from '@/api/apiBase'
import { getToken } from '@/api/tokenStorage'
import { getSelectedBranchId } from '@/store/branchStore'

const MIN_SECONDS = 2 // quick redirect hops do not reach the journal
const MAX_CLICKS = 30 // per visit
const SEARCH_REPEAT_MS = 60_000

/** Readable name of the clicked element (text, aria-label, title or name). */
function clickLabel(el: Element): string | null {
  const raw =
    el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('name') || ''
  const text = String(raw).replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 60) : null
}

interface Visit {
  path: string
  title: string | null
  visibleMs: number
  lastVisibleAt: number | null
  clicks: { label: string; at: number }[]
  startedAt: number
}

let current: Visit | null = null
/** Kept for a bfcache return, when the shell does not re-render. */
let lastTitle: string | null = null

function visibleSeconds(): number {
  if (!current) return 0
  let ms = current.visibleMs
  if (current.lastVisibleAt != null) ms += Date.now() - current.lastVisibleAt
  return Math.round(ms / 1000)
}

function scopeHeader(): string {
  const id = getSelectedBranchId()
  return id ? String(id) : 'all'
}

function send(endpoint: 'page-view' | 'client-events', body: Record<string, unknown>, useBeacon: boolean) {
  const token = getToken()
  if (!token) return
  const url = joinApiUrl(`audit-logs/${endpoint}`)
  if (useBeacon && typeof navigator.sendBeacon === 'function') {
    // text/plain on purpose: an application/json blob in a cross-origin
    // beacon needs a CORS preflight and is dropped.
    try {
      if (navigator.sendBeacon(url, new Blob([JSON.stringify({ ...body, token })], { type: 'text/plain' }))) return
    } catch {
      /* falls through to fetch */
    }
  }
  fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Selected-Branch': scopeHeader(),
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}

function finalize(useBeacon: boolean) {
  if (!current) return
  const seconds = visibleSeconds()
  const { path, title, clicks } = current
  current = null
  if (seconds < MIN_SECONDS) return
  if (!getToken()) return // login screens are not tracked
  send('page-view', { path, title, duration_seconds: seconds, clicks }, useBeacon)
}

/**
 * Called on every route change (AppShell). `title` is the page's name for the
 * journal — see `auditPageTitle` in navConfig.
 */
export function trackPageChange(pathname: string, title: string | null = null): void {
  try {
    if (current && current.path === pathname) return
    finalize(false)
    lastTitle = title
    current = {
      path: pathname,
      title,
      visibleMs: 0,
      lastVisibleAt: document.visibilityState === 'visible' ? Date.now() : null,
      clicks: [],
      startedAt: Date.now(),
    }
  } catch {
    /* telemetry never breaks navigation */
  }
}

/* ── Search / error events (queued, flushed in small batches) ─────────────── */

type ClientEvent = Record<string, unknown> & { type: 'search' | 'error' }

let pending: (ClientEvent & { page: string })[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function queueEvent(ev: ClientEvent) {
  if (!getToken()) return
  pending.push({ ...ev, page: current?.path || window.location.pathname })
  if (pending.length >= 10) return flushEvents()
  if (!flushTimer) flushTimer = setTimeout(() => flushEvents(), 5000)
}

function flushEvents(useBeacon = false) {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!pending.length) return
  const events = pending.slice(0, 20)
  pending = []
  send('client-events', { events }, useBeacon)
}

/**
 * Endpoints whose searches the SERVER already journals (with the term), so a
 * client row would only duplicate them. The phone book is logged by the audit
 * middleware as SEARCH/VIEW — see `_PHONE_DIRECTORY_PATH` in the backend.
 */
const SERVER_LOGGED_SEARCH = /(^|\/)phone-directory\/?$/

let lastSearch: { key: string; at: number } | null = null

/**
 * Who/what was searched. Called from the API client for every request that
 * carries `search` / `query` / `q`, so no page needs its own code.
 *
 * Unlike v1 the same term on the same endpoint is sent once a minute at most:
 * react-query re-requests a list on focus, on page change and after every
 * mutation, and each of those carried the search term again.
 */
export function trackSearch(query: unknown, where: string): void {
  try {
    const q = String(query ?? '').trim()
    if (q.length < 2) return // a single typed letter is not a search
    if (SERVER_LOGGED_SEARCH.test(where)) return
    const key = `${where}\u0000${q.toLowerCase()}`
    const now = Date.now()
    if (lastSearch && lastSearch.key === key && now - lastSearch.at < SEARCH_REPEAT_MS) return
    lastSearch = { key, at: now }
    queueEvent({ type: 'search', query: q.slice(0, 200), scope: where })
  } catch {
    /* ignore */
  }
}

/** A front-end error (JS exception, render crash, or a failure the server never saw). */
export function trackClientError(message: unknown, extra: Record<string, unknown> = {}): void {
  try {
    const msg = String(message ?? '').trim()
    if (!msg) return
    queueEvent({ type: 'error', message: msg.slice(0, 500), ...extra })
  } catch {
    /* ignore */
  }
}

let listenersBound = false

/** Once per page load: visibility / click / error / unload listeners. */
export function initPageTracker(): void {
  if (listenersBound) return
  listenersBound = true

  document.addEventListener('visibilitychange', () => {
    if (!current) return
    if (document.visibilityState === 'hidden') {
      if (current.lastVisibleAt != null) {
        current.visibleMs += Date.now() - current.lastVisibleAt
        current.lastVisibleAt = null
      }
    } else if (current.lastVisibleAt == null) {
      current.lastVisibleAt = Date.now()
    }
  })

  // Clicked buttons/links go INTO the visit's row, not one row per click.
  document.addEventListener(
    'click',
    (e) => {
      try {
        if (!current || current.clicks.length >= MAX_CLICKS) return
        const target = e.target as Element | null
        const el = target?.closest?.('button, a, [role="button"], [role="tab"], [role="menuitem"]')
        if (!el) return
        const label = clickLabel(el)
        if (!label) return
        const at = Math.round((Date.now() - current.startedAt) / 1000)
        const last = current.clicks[current.clicks.length - 1]
        if (last && last.label === label && at - (last.at ?? 0) < 2) return // double click
        current.clicks.push({ label, at })
      } catch {
        /* ignore */
      }
    },
    true,
  )

  // Uncaught JS errors — what a user means by «saytda xatolik chiqdi».
  window.addEventListener('error', (e) => {
    if (!e?.message) return
    trackClientError(e.message, {
      source: `${e.filename || ''}${e.lineno ? `:${e.lineno}` : ''}`.slice(0, 200) || 'window',
    })
  })
  window.addEventListener('unhandledrejection', (e) => {
    const r = e?.reason as { message?: string; code?: string; isAxiosError?: boolean } | undefined
    // A rejected API call is already journalled by the server (or, for a
    // network failure, by the API client) — do not log it twice.
    if (r?.isAxiosError || r?.code === 'SESSION_EXPIRED' || r?.code === 'ERR_CANCELED') return
    trackClientError(r?.message || String(r || 'unhandledrejection'), { source: 'promise' })
  })

  // Tab closed / left the site: the last page goes by beacon (a plain fetch
  // can be cut off during unload).
  window.addEventListener('pagehide', () => {
    flushEvents(true)
    finalize(true)
  })

  // Back from bfcache: pagehide cleared the visit, start a new one.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && !current) trackPageChange(window.location.pathname, lastTitle)
  })
}
