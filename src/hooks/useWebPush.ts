import { useEffect } from 'react'
import { apiDelete, apiGet, apiPost } from '@/api/http'
import { useAuthStore } from '@/store/authStore'

/** base64url VAPID key → the Uint8Array `PushManager.subscribe` wants. */
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(normal)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  // Returned as the underlying ArrayBuffer: `applicationServerKey` is typed as
  // BufferSource, and a Uint8Array over a generic ArrayBufferLike does not
  // satisfy it under this TS lib.
  return arr.buffer
}

/**
 * BROWSER PUSH NOTIFICATIONS.
 *
 * The backend has been able to send these for a while (VAPID keys, the
 * `/web-push` endpoints and a worker task); v2 simply never subscribed, so a
 * decree waiting on someone reached them only if they happened to have the tab
 * open. This registers the worker, asks once, and hands the subscription to
 * the server.
 *
 * ⚠️ `pushManager.subscribe()` needs an ACTIVE service worker. `register()`
 * resolves as soon as the worker is registered, which on a first visit means it
 * is still installing — subscribing there fails with "no active Service
 * Worker". `navigator.serviceWorker.ready` is the one that waits for active,
 * and getting this wrong is why v1's push silently did nothing until a reload.
 *
 * Everything here is best-effort: an unsupported browser, a refused permission
 * or a network error must never break the session, so failures are logged and
 * swallowed.
 */
export function useWebPush() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!isAuthenticated || !userId) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    // Only ask when the answer is still open. Asking again after a refusal is
    // both useless (the browser remembers) and hostile.
    if (typeof Notification === 'undefined' || Notification.permission === 'denied') return

    let cancelled = false
    void (async () => {
      try {
        await navigator.serviceWorker.register('/sw.js')
        const permission =
          Notification.permission === 'granted'
            ? 'granted'
            : await Notification.requestPermission()
        if (permission !== 'granted' || cancelled) return

        const registration = await navigator.serviceWorker.ready
        if (cancelled) return

        const { public_key: key } = await apiGet<{ public_key?: string }>(
          'web-push/vapid-public-key',
        )
        if (!key || cancelled) return

        // Reuse an existing subscription rather than creating a second one for
        // the same browser; the server keys on `endpoint`, so re-posting the
        // same endpoint is a harmless refresh.
        const existing = await registration.pushManager.getSubscription()
        const sub =
          existing ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key),
          }))
        if (cancelled) return

        const json = sub.toJSON() as { endpoint?: string; keys?: Record<string, string> }
        await apiPost('web-push/subscriptions', { endpoint: json.endpoint, keys: json.keys })
      } catch (e) {
        // Never fatal — but do log it: a silent catch here is exactly why a
        // failed subscribe used to look like "push is broken" with nothing to
        // debug from.
        console.warn('[web-push] obuna bo‘lmadi:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, userId])
}

/** Turn push off for this browser: unsubscribe locally, then tell the server. */
export async function disableWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.ready
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe()
  try {
    await apiDelete('web-push/subscriptions', { data: { endpoint } })
  } catch {
    /* the browser is already unsubscribed; server cleanup is best-effort */
  }
}
