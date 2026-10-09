/* Access-token persistence. The refresh token is NOT stored here — the backend
 * returns it as an HttpOnly cookie (unreadable by JS) and it is sent
 * automatically on /auth/refresh (withCredentials). */

const TOKEN_KEY = 'token'
const EXPIRES_KEY = 'token_expires_at'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setTokens({
  access_token,
  expires_in,
}: {
  access_token?: string
  expires_in?: number
}): void {
  try {
    if (access_token) localStorage.setItem(TOKEN_KEY, access_token)
    if (expires_in) {
      localStorage.setItem(EXPIRES_KEY, String(Date.now() + Number(expires_in) * 1000))
    }
  } catch {
    /* ignore */
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EXPIRES_KEY)
  } catch {
    /* ignore */
  }
}

export function getTokenExpiresAt(): number {
  try {
    return Number(localStorage.getItem(EXPIRES_KEY) || 0)
  } catch {
    return 0
  }
}
