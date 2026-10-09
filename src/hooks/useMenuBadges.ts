import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'

/** Opt out of the axios interceptor's automatic branch stamp. */
const NO_BRANCH = { organization_branch_id: null }

/**
 * The red counters down the left menu.
 *
 * One request answers for every module at once — `GET /notifications/menu-badges`
 * returns a count per area, already narrowed to what THIS person still has to
 * act on (`core/action_seen`). v2 only ever badged the leave page from a local
 * query, so a letter waiting on your signature or a fleet request needing a car
 * was invisible until you happened to open that page.
 */
const KEY_TO_PATH: Record<string, string> = {
  letters: '/letters',
  orders: '/orders',
  support: '/texnik-yordam',
  projects: '/projects',
  fleet: '/vehicles',
  leaves: '/request-permission',
  documents: '/hujjatlar',
}

/** The raw counter map — one query, shared by the menu and the bell. */
function useMenuBadgeQuery() {
  return useQuery({
    queryKey: ['menu-badges'],
    // The counts are org-wide for the signed-in person, not per selected
    // branch — sending the header branch would hide work in the other ones.
    queryFn: () => apiGet<Record<string, number>>('notifications/menu-badges', NO_BRANCH),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  })
}

/**
 * Unread notifications, from the SAME request as the menu counters.
 *
 * ⚠️ THE BELL USED TO FETCH THE WHOLE NOTIFICATION LIST FOR THIS NUMBER, on
 * every page load and then every 60 s — `filter(!is_read).length` over an
 * unbounded list. Measured across 65 routes × 14 roles it was the single
 * largest API cost in the product (2.9 MB). The server now counts it
 * (`unread_notifications` in menu-badges) and the list is fetched only when
 * the panel is actually opened. An older API without the key reads as 0 here,
 * and the bell falls back to counting the list it fetched.
 */
export function useUnreadNotifications(): number | null {
  const q = useMenuBadgeQuery()
  const n = q.data?.unread_notifications
  return typeof n === 'number' ? n : null
}

export function useMenuBadges(): Record<string, number> {
  const q = useMenuBadgeQuery()

  const out: Record<string, number> = {}
  for (const [key, path] of Object.entries(KEY_TO_PATH)) {
    const n = Number(q.data?.[key] ?? 0)
    if (n > 0) out[path] = n
  }
  return out
}
