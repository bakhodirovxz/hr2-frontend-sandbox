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
}

/**
 * TZ U1 / 4.2.3: 2FA yoqilgan hisobga `POST /auth/login` token o'rniga
 * chaqiriq qaytaradi — kod hisobdagi elektron pochtaga yuboriladi
 * (5 daqiqa, 5 urinish), keyin `POST /auth/login/2fa`.
 */
export interface TwoFactorChallenge {
  two_factor_required: true
  challenge_id: string
  expires_in?: number
  sent_to?: string | null
}

export type LoginResult = LoginResponse | TwoFactorChallenge

export const isTwoFactor = (r: LoginResult): r is TwoFactorChallenge =>
  (r as TwoFactorChallenge).two_factor_required === true

function deviceMeta() {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  return {
    'device-name': navigator.userAgent.slice(0, 200),
    'device-type': isMobile ? 'mobile' : 'web',
  }
}

/** Token olingandan keyin sessiyani o'rnatish (parol, 2FA va QR yo'li). */
export function useFinishLogin() {
  const setSession = useAuthStore((s) => s.setSession)
  return (data: LoginResponse) => {
    resetAuthSession()
    setSession({ access_token: data.access_token, expires_in: data.expires_in, user: data.user ?? null })
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
  }
}

/** OAuth2 password-grant (form-encoded). 2FA chaqirig'ida sessiya o'rnatilmaydi. */
export function useLogin() {
  const finish = useFinishLogin()
  return useMutation({
    mutationFn: async ({ username, password }: LoginArgs) => {
      const body = new URLSearchParams()
      body.append('username', username.trim())
      body.append('password', password)
      const { data } = await publicClient.post<LoginResult>(`/${AUTH_LOGIN}`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...deviceMeta() },
      })
      return data
    },
    onSuccess: (data) => {
      if (!isTwoFactor(data)) finish(data)
    },
  })
}

/** 2FA kodini tasdiqlash. */
export function useLogin2fa() {
  const finish = useFinishLogin()
  return useMutation({
    mutationFn: async ({ challengeId, code }: { challengeId: string; code: string }) => {
      const { data } = await publicClient.post<LoginResponse>('/auth/login/2fa', {
        challenge_id: challengeId,
        code,
      })
      return data
    },
    onSuccess: finish,
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
