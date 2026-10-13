/**
 * Nega sessiya tugaganini kirish sahifasiga yetkazish: chiqishdan oldin
 * yoziladi, kirish sahifasi bir marta o'qib o'chiradi. sessionStorage yopiq
 * bo'lsa (xususiy oyna) — shunchaki sabab ko'rsatilmaydi.
 */
export type LogoutReason = 'idle'

const KEY = 'hrm.logoutReason'

export function setLogoutReason(reason: LogoutReason): void {
  try {
    sessionStorage.setItem(KEY, reason)
  } catch {
    /* storage yopiq */
  }
}

/** Faqat o'qiydi — render paytida (StrictMode ikki marta chaqiradi) xavfsiz. */
export function peekLogoutReason(): LogoutReason | null {
  try {
    return sessionStorage.getItem(KEY) === 'idle' ? 'idle' : null
  } catch {
    return null
  }
}

export function clearLogoutReason(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* storage yopiq */
  }
}
