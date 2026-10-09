/*
 * public/sw.js — web-push service worker for v2 (classic worker, no build step).
 *
 * Served from the site root so its scope covers the whole SPA. Two jobs:
 *   1. `push`              — draw an OS notification from the JSON payload.
 *   2. `notificationclick` — focus an open tab (or open one) at the right route.
 *
 * ⚠️ A service worker can only open a URL — it cannot hand React Router any
 * state the way the in-app bell does. So the deep link travels as a QUERY
 * PARAM, and it uses v2's own convention: the document screens select a record
 * with `?doc=<id>` (see LettersPage / OrdersPage), NOT v1's `?openLetterId=`.
 * Getting that wrong lands the user on the right page with nothing selected.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (e) {
    payload = {}
  }
  event.waitUntil(
    self.registration.showNotification(payload.title || 'UzGidro HR', {
      body: payload.body || '',
      data: payload.data || {},
      // The only brand asset in public/ that is big enough for a notification.
      icon: '/logo.svg',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = routeForData(event.notification.data || {})
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const client of wins) {
        if ('focus' in client) {
          // Move the existing tab to the deep link rather than leaving the user
          // on a stale route, then focus it.
          if (typeof client.navigate === 'function') {
            return client.navigate(url).then((c) => (c || client).focus())
          }
          return client.focus()
        }
      }
      return clients.openWindow(url)
    }),
  )
})

/** Map the backend's push `data` payload to a v2 route. */
function routeForData(data) {
  // The push payload names the event `type`; the in-app feed model calls the
  // same thing `notification_type`. Accept either.
  var ntype = data.notification_type || data.type || ''

  if (data.order_act_id) return '/orders?doc=' + encodeURIComponent(data.order_act_id)
  if (data.letter_id) return '/letters?doc=' + encodeURIComponent(data.letter_id)
  if (ntype.indexOf('letter') === 0 || ntype.indexOf('business_trip') === 0) return '/letters'
  if (data.workspace_id) return '/projects?workspace=' + encodeURIComponent(data.workspace_id)
  if (data.kpi_entry_id || ntype.indexOf('kpi_') === 0) return '/kpi'
  if (data.support_ticket_id) return '/texnik-yordam?ticket=' + encodeURIComponent(data.support_ticket_id)
  if (ntype.indexOf('support_ticket') === 0) return '/texnik-yordam'
  if (data.news_post_id) return '/yangiliklar'
  if (data.work_leave_id) return '/request-permission'
  return '/'
}
