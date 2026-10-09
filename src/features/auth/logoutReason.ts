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

export function takeLogoutReason(): LogoutReason | null {
  try {
    const v = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return v === 'idle' ? v : null
  } catch {
    return null
  }
}
