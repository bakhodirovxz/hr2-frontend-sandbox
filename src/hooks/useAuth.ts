import { useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { publicClient, resetAuthSession, joinApiUrl } from '@/api/client'
import { AUTH_LOGIN, AUTH_LOGOUT, USER_INFO } from '@/api/endpoints'
import { getToken } from '@/api/tokenStorage'
import { useAuthStore } from '@/store/authStore'
import { queryClient } from '@/api/queryClient'
import type { LoginResponse, User } from '@/types'

/** Fetches auth/me while authenticated and mirrors it into the auth store. */
export function useCurrentUser() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setUser = useAuthStore((s) => s.setUser)

  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<User>(USER_INFO),
    enabled: isAuthenticated && !!getToken(),
    staleTime: 5 * 60_000,
  })

  useEffect(() => {
    if (query.data) setUser(query.data)
  }, [query.data, setUser])

  return query
}

interface LoginArgs {
  username: string
  password: string
  /** Solved image challenge — demanded by the server after repeated failures. */
  captchaId?: string
  captchaAnswer?: string
  /** Honeypot: a field no person can see. Sent as-is; a filled one marks a bot. */
  website?: string
}

function deviceMeta() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return {
    'device-name': navigator.userAgent.slice(0, 200),
    'device-type': isMobile ? 'mobile' : 'web',
  }
}

/** OAuth2 password-grant login (form-encoded), then hydrate the session. */
export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession)

  return useMutation({
    mutationFn: async ({ username, password, captchaId, captchaAnswer, website }: LoginArgs) => {
      const body = new URLSearchParams()
      body.append('username', username.trim())
      body.append('password', password)
      body.append('website', website ?? '')
      if (captchaId && captchaAnswer) {
        body.append('captcha_id', captchaId)
        body.append('captcha_answer', captchaAnswer.trim())
      }
      const { data } = await publicClient.post<LoginResponse>(`/${AUTH_LOGIN}`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...deviceMeta() },
      })
      return data
    },
    onSuccess: (data) => {
      resetAuthSession()
      setSession({ access_token: data.access_token, expires_in: data.expires_in, user: data.user ?? null })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}

/** Best-effort server logout + local clear. */
export function useLogout() {
  const clearSession = useAuthStore((s) => s.clearSession)
  return () => {
    const token = getToken()
    try {
      fetch(joinApiUrl(AUTH_LOGOUT), {
        method: 'POST',
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        keepalive: true,
      }).catch(() => {})
    } catch {
      /* ignore */
    }
    clearSession()
    queryClient.clear()
  }
}
