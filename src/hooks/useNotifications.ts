import { useQuery } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '@/api/http'
import { NOTIFICATIONS_LIST, NOTIFICATIONS_READ_ALL } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/api/queryClient'

/**
 * The link ids the server already sends (`NotificationRead`). They were not
 * declared here, so the bell could not tell WHAT a notice was about and every
 * row was a dead end — see `features/notifications/notificationRoutes.ts`.
 */
export interface AppNotification {
  id: number
  notification_type?: string
  description?: string
  /** `{code, params}` — the text in the reader's language (FX-LANG, TZ 4.1.7). */
  message?: { code: string; params?: Record<string, unknown> } | null
  title?: string
  is_read?: boolean
  created_at?: string
  order_act_id?: number | null
  letter_id?: number | null
  news_post_id?: number | null
  workspace_id?: number | null
  card_id?: number | null
  kpi_entry_id?: number | null
  support_ticket_id?: number | null
}

/**
 * The notification LIST — fetched only while the bell panel is open.
 *
 * ⚠️ NO MORE 60-SECOND POLL OF THE FULL LIST. The badge is a server-side count
 * now (`useUnreadNotifications`), so the list has nothing to do until someone
 * opens the panel. The boot aggregate primes this key with the newest twenty,
 * which is what the panel shows first; opening it refreshes for the full list.
 */
export function useNotifications(open = true, onlyUnread = false) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  // Bounded and filtered by the SERVER (2026-09-25): the route's default is
  // «no ceiling», so opening the bell pulled the user's whole history, and
  // the «O'qilmagan» tab only filtered what had been downloaded.
  const query = useQuery({
    queryKey: onlyUnread ? ['notifications', 'unread'] : ['notifications'],
    queryFn: () =>
      apiGet<ListResponse<AppNotification>>(NOTIFICATIONS_LIST, onlyUnread ? { is_read: false, limit: 100 } : { limit: 50 }),
    enabled: isAuthenticated && open,
    staleTime: 30_000,
  })
  const items = toItems(query.data)
  const unread = items.filter((n) => !n.is_read).length
  return { ...query, items, unread }
}

const refresh = () => {
  queryClient.invalidateQueries({ queryKey: ['notifications'] })
  // The menu counters read the same rows from their own endpoint, so they go
  // stale the moment one is read or removed.
  queryClient.invalidateQueries({ queryKey: ['menu-badges'] })
}

export async function markAllNotificationsRead() {
  try {
    await apiPost(NOTIFICATIONS_READ_ALL)
  } finally {
    refresh()
  }
}

/**
 * Marking ONE notification read, which is what opening it should do.
 *
 * v2 only had "read them all", so a person who wanted to keep one unread as a
 * reminder had to leave the whole list unread — and the badge then never went
 * down. The per-item call is what the panel uses on click.
 */
export async function markNotificationRead(id: number) {
  try {
    await apiPost(`${NOTIFICATIONS_LIST}/${id}/read`, {})
  } finally {
    refresh()
  }
}

/** Remove one notification for good. */
export async function deleteNotification(id: number) {
  try {
    await apiDelete(`${NOTIFICATIONS_LIST}/${id}`)
  } finally {
    refresh()
  }
}

/** Clear out everything already read — the "tidy up" action. */
export async function deleteReadNotifications() {
  try {
    await apiDelete('notifications/read')
  } finally {
    refresh()
  }
}
