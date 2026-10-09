import { queryClient } from './queryClient'
import { apiGet } from './http'
import { ORGANIZATION_BRANCHES, USER_INFO } from './endpoints'
import { getToken } from './tokenStorage'
import { loadRest } from '@/i18n'
import type { ListResponse, OrganizationBranch, User } from '@/types'

/**
 * One request for everything the shell needs, fired before React mounts.
 *
 * ⚠️ THE BOOT USED TO BE SEVEN REQUESTS, THREE OF THEM SERIAL (measured
 * 2026-09-10, 65 routes × 14 roles). `ProtectedRoute` renders a full-page
 * `<Splash/>` until `auth/me` resolves, so nothing else was even requested
 * until it came back; only then did `AppShell` mount and ask for the branch
 * list, the settings, the menu badges, the WHOLE notification list (for a
 * badge), the birthday greeting and a leave count the badges already carried.
 *
 * `GET auth/me/bootstrap` answers all of it at once. The hooks are untouched:
 * this primes their cache entries under the EXACT keys they read, so they
 * render from cache and never fire. Keys are the contract — a typo here primes
 * an entry nobody reads and doubles the request instead of removing one.
 *
 * ⚠️ FALLBACK KEPT ON PURPOSE. If the aggregate is missing (an older API during
 * a rolling deploy) or fails, the three critical prefetches below run as they
 * did before, and the remaining hooks simply fetch on their own. The shell must
 * never be worse off for having tried the fast path.
 */
interface Bootstrap {
  user: User
  branches: OrganizationBranch[] | ListResponse<OrganizationBranch> | null
  settings: { values: Record<string, unknown>; schema: unknown[] } | null
  badges: Record<string, number> | null
  notifications: unknown[] | null
  birthday: unknown | null
}

const BOOT_STALE = 5 * 60_000

function primeLegacy(): void {
  void queryClient.prefetchQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<User>(USER_INFO),
    staleTime: BOOT_STALE,
  })
  void queryClient.prefetchQuery({
    queryKey: ['organization-branches', 'slim'],
    queryFn: () => apiGet<ListResponse<OrganizationBranch>>(ORGANIZATION_BRANCHES, { slim: true }),
    staleTime: 10 * 60_000,
  })
  void queryClient.prefetchQuery({
    queryKey: ['system-settings'],
    queryFn: () => apiGet<{ values: Record<string, unknown>; schema: unknown[] }>('system-settings'),
    staleTime: 10 * 60_000,
  })
}

/** Resolves when the shell's caches are primed (or the fallback has started). */
export let bootReady: Promise<void> = Promise.resolve()

export function primeBootQueries(): void {
  if (!getToken()) return
  // The rest of the dictionary rides alongside the boot request; the login
  // screen (no token) never asks for it.
  void loadRest()
  bootReady = apiGet<Bootstrap>('auth/me/bootstrap')
    .then((b) => {
      // `user` is the one section that must be there; the handler returns it
      // unguarded, so a malformed payload falls through to the legacy path.
      if (!b || !b.user) throw new Error('bootstrap: no user')
      queryClient.setQueryData(['auth', 'me'], b.user)
      if (b.branches) queryClient.setQueryData(['organization-branches', 'slim'], b.branches)
      if (b.settings) queryClient.setQueryData(['system-settings'], b.settings)
      if (b.badges) queryClient.setQueryData(['menu-badges'], b.badges)
      if (b.notifications) queryClient.setQueryData(['notifications'], b.notifications)
      if (b.birthday) queryClient.setQueryData(['birthday-greeting'], b.birthday)
    })
    .catch(() => {
      primeLegacy()
    })
}
