import i18n from 'i18next'
import axios, {
  type AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'
import { AUTH_REFRESH } from './endpoints'
import { mergeOrganizationBranchId } from './branchParam'
import { clearTokens, getToken, getTokenExpiresAt, setTokens } from './tokenStorage'
import { useAuthStore } from '@/store/authStore'
import { getSelectedBranchId } from '@/store/branchStore'

import { domain, joinApiUrl } from './apiBase'
import { trackClientError, trackSearch } from '@/lib/pageTracker'
import { errorCode } from './errorMessage'
import { setLogoutReason } from '@/features/auth/logoutReason'

export { domain, joinApiUrl }

const REFRESH_LEAD_MS = 60_000

let sessionExpired = false
let isRefreshing = false
let waiters: Array<{ resolve: (t: string | null) => void; reject: (e: unknown) => void }> = []

export function resetAuthSession(): void {
  sessionExpired = false
  isRefreshing = false
  waiters = []
}

function drain(error: unknown, token: string | null): void {
  waiters.forEach((w) => (error ? w.reject(error) : w.resolve(token)))
  waiters = []
}

function forceLogout(): void {
  if (sessionExpired) return
  sessionExpired = true
  isRefreshing = false
  waiters = []
  clearTokens()
  useAuthStore.getState().clearSession()
}

function shouldRefresh(): boolean {
  const expiresAt = getTokenExpiresAt()
  return Boolean(expiresAt && Date.now() >= expiresAt - REFRESH_LEAD_MS)
}

/** POST /auth/refresh with the HttpOnly cookie; single-flight. */
async function refreshWithQueue(): Promise<string | null> {
  if (sessionExpired) {
    const err = new Error('Session expired')
    ;(err as { code?: string }).code = 'SESSION_EXPIRED'
    throw err
  }
  if (isRefreshing) {
    return new Promise<string | null>((resolve, reject) => waiters.push({ resolve, reject }))
  }
  isRefreshing = true
  try {
    const { data } = await axios.post(joinApiUrl(AUTH_REFRESH), null, {
      withCredentials: true,
    })
    setTokens(data)
    drain(null, data.access_token)
    return data.access_token
  } catch (error) {
    drain(error, null)
    forceLogout()
    throw error
  } finally {
    isRefreshing = false
  }
}

/** For non-axios callers (e.g. a WebSocket manager). Returns a valid token or null. */
export async function ensureFreshAccessToken(): Promise<string | null> {
  if (sessionExpired) return null
  if (shouldRefresh()) {
    try {
      return await refreshWithQueue()
    } catch {
      return null
    }
  }
  return getToken()
}

export const apiClient = axios.create({
  baseURL: domain,
  timeout: 30_000,
  withCredentials: true,
  paramsSerializer: { indexes: null },
})

// Request: proactive refresh + auth header + branch injection.
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  if (sessionExpired) {
    const err = new Error('Session expired')
    ;(err as { code?: string }).code = 'SESSION_EXPIRED'
    return Promise.reject(err)
  }

  if (shouldRefresh()) {
    try {
      await refreshWithQueue()
    } catch (error) {
      return Promise.reject(error)
    }
  }

  const token = getToken()
  if (token) config.headers.set('Authorization', `Bearer ${token}`)

  // Interface language for every server-produced text (errors, exports,
  // catalogue labels) — core/i18n_server.LangMiddleware, TZ 4.1.7.
  config.headers.set('X-Lang', i18n.language || 'uz')

  const params = mergeOrganizationBranchId(
    config.url || '',
    (config.params as Record<string, unknown>) || {},
    getSelectedBranchId(),
  )
  if (params._no_branch_inject === true) delete params._no_branch_inject
  config.params = params

  // The scope the user is working in — the audit journal's «Filial» for a
  // multi-branch user (core/audit_middleware `_selected_scope`). v1 sent it on
  // every request; without it every action was filed under the person's FIRST
  // branch whatever branch was selected.
  const branchId = getSelectedBranchId()
  config.headers.set('X-Selected-Branch', branchId ? String(branchId) : 'all')

  // Searches go to the audit journal from here, once, rather than from every
  // page (v1 `request.js` did the same).
  try {
    const term = params.search ?? params.query ?? params.q
    if (term) trackSearch(term, String(config.url || '').split('?')[0])
  } catch {
    /* telemetry never breaks a request */
  }

  return config
})

// Response: retry once after refresh on 401.
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (!original || sessionExpired) return Promise.reject(error)

    // Only what the SERVER could not journal itself: it writes every 4xx/5xx
    // it answers, with the reason, so sending those too would double each row
    // (v1 learned this). A network failure, or a gateway answer (502+: the
    // request never reached the app), is invisible to it.
    try {
      const status = error.response?.status
      if (status && status >= 502) {
        const d = error.response?.data as { detail?: unknown; message?: unknown } | undefined
        const msg = d?.message || d?.detail || error.message
        trackClientError(typeof msg === 'string' ? msg : `HTTP ${status}`, {
          status,
          endpoint: String(original.url || '').split('?')[0],
          source: 'api',
        })
      } else if (!error.response && error.message && error.code !== 'ERR_CANCELED') {
        trackClientError(error.message, { source: 'network' })
      }
    } catch {
      /* telemetry never hides the error */
    }

    // TZ U1: vaqtinchalik parol bilan kirgan hisobga server parolni
    // almashtirish yo'llaridan boshqa hamma joyda 403 `password_change_required`
    // qaytaradi. `auth/me` qayta o'qiladi — qobiqdagi PasswordGate darhol ochiladi.
    if (error.response?.status === 403 && errorCode(error) === 'password_change_required') {
      const { queryClient } = await import('@/api/queryClient')
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
      return Promise.reject(error)
    }

    if (error.response?.status === 401) {
      // TZ U2: server sessiyani harakatsizlik sababli yopgan — kirish sahifasi
      // sababini aytsin (refresh ham rad etiladi va forceLogout ishlaydi).
      if (errorCode(error) === 'session_idle_timeout') setLogoutReason('idle')
      if (original._retry) {
        forceLogout()
        return Promise.reject(error)
      }
      original._retry = true
      try {
        const token = await refreshWithQueue()
        if (token) original.headers.set('Authorization', `Bearer ${token}`)
        return apiClient(original)
      } catch (refreshError) {
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

/** Public instance for login / forgot-password (no auth interceptor). */
export const publicClient = axios.create({
  baseURL: domain,
  timeout: 30_000,
  withCredentials: true,
  paramsSerializer: { indexes: null },
})

// Login / registration errors come from the public instance — same language header.
publicClient.interceptors.request.use((config) => {
  config.headers.set('X-Lang', i18n.language || 'uz')
  return config
})
