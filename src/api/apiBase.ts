/**
 * API base URL. Its own module (2026-10-05) so code the API client itself
 * imports — the audit tracker in `lib/pageTracker` — can build URLs without an
 * import cycle back into `api/client`. `client.ts` re-exports both names.
 */

/** API base without trailing slash. Dev goes through the Vite proxy (/api). */
const rawDomain = import.meta.env.DEV
  ? '/api'
  : import.meta.env.VITE_BASE_URL || `${window.location.protocol}//${window.location.hostname}`

export const domain = rawDomain.replace(/\/+$/, '')

export function joinApiUrl(path: string): string {
  const normalized = String(path || '').replace(/^\/+/, '')
  return normalized ? `${domain}/${normalized}` : domain
}
