import { queryClient } from './queryClient'
import { apiGet } from './http'
import { ORGANIZATION_BRANCHES, USER_INFO } from './endpoints'
import { getToken } from './tokenStorage'
import { loadRest } from '@/i18n'
import type { ListResponse, OrganizationBranch, User } from '@/types'

/**
 * Qobiqqa kerak bo'lgan so'rovlar React o'rnatilishidan OLDIN, PARALLEL
 * yuboriladi: `auth/me`, filiallar ro'yxati va lug'atning qolgan qismi.
 * Hooklar o'zgarmaydi — bu yerda ular o'qiydigan AYNAN o'sha kalitlar
 * to'ldiriladi (kalit — shartnoma: xato kalit so'rovni ikki marta yuboradi).
 * `site/info` va i18n override'lar o'z hooklarida, tokensiz ham (login
 * sahifasi) o'qiladi.
 */
const BOOT_STALE = 5 * 60_000

/**
 * Oxirgi kirgan hisob mehmonmi (TZ 4.2.2). Filiallar ro'yxati mehmonga yopiq
 * (server 403), lekin tokenda hisob turi yo'q — shuning uchun `auth/me` ni
 * kutmasdan parallel so'rash uchun oldingi sessiyadagi tur eslab qolinadi.
 */
const GUEST_FLAG = 'hrm_last_user_guest'

export function rememberGuest(guest: boolean): void {
  try {
    // '0' = known staff account: the next hard load may prefetch branches.
    localStorage.setItem(GUEST_FLAG, guest ? '1' : '0')
  } catch {
    /* storage yopiq — faqat bitta ortiqcha so'rov */
  }
}

/** true = guest, false = staff, null = unknown (no flag yet). */
function lastUserWasGuest(): boolean | null {
  try {
    const v = localStorage.getItem(GUEST_FLAG)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

/** Qobiq keshlari to'ldirilganda (yoki so'rovlar boshlanganda) hal bo'ladi. */
export let bootReady: Promise<void> = Promise.resolve()

export function primeBootQueries(): void {
  if (!getToken()) return
  // Lug'atning qolgan qismi boot so'rovlari bilan birga ketadi; login
  // sahifasi (tokensiz) uni so'ramaydi.
  void loadRest()
  const me = queryClient.prefetchQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<User>(USER_INFO),
    staleTime: BOOT_STALE,
  })
  // A guest gets 403 on the branch list (console noise on the guest pages):
  // prefetch only for an account known to be staff; when unknown the shell's
  // own query (`useBranches`, enabled for non-guests) fetches it after `me`.
  if (lastUserWasGuest() !== false) {
    bootReady = me.then(() => undefined)
    return
  }
  void queryClient.prefetchQuery({
    queryKey: ['organization-branches', 'slim'],
    queryFn: () => apiGet<ListResponse<OrganizationBranch>>(ORGANIZATION_BRANCHES, { slim: true }),
    staleTime: 10 * 60_000,
  })
  bootReady = me.then(() => undefined)
}
