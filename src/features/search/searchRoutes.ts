import type { User } from '@/types'
import {
  getNavForUser,
  type NavKey,
  type NavModuleOverrides,
} from '@/components/layout/navConfig'

/**
 * Qidiruv natijasini v2 MARSHRUTIGA aylantirish — TZ 4.1.7.
 *
 * ⚠️ NEGA KERAK: `/search` endpointi v1 BILAN BIRGA ishlatiladi va `url`
 * maydonida v1 marshrutlarini qaytaradi (`/bolimlar`, `/lavozimlar`,
 * `/letters/{id}`, `/orders/{id}`). v2 da bunday yo'llar yo'q, ya'ni ular
 * `<Route path="*">` ga tushib BOSH SAHIFAGA qaytarardi — foydalanuvchi uchun
 * "bosdim, ochilmadi" bo'lib ko'rinardi.
 *
 * Backend URL'ini o'zgartirib bo'lmaydi (v1 prodda ishlayapti), shuning uchun
 * moslashtirish SHU YERDA: server bergan `type` va `id` bo'yicha, matnni
 * tahlil qilmasdan. Noma'lum tur uchun server URL'i o'z holicha qoladi.
 */
export function resolveSearchUrl(
  type: string,
  id: number,
  serverUrl?: string | null,
  /** Topilgan yozuvning nomi — ro'yxatli sahifalarda uni darhol filtrlash uchun. */
  title?: string | null,
): string | null {
  const q = title ? `&q=${encodeURIComponent(title)}` : ''
  switch (type) {
    case 'employees':
      return `/employees/${id}`
    // Hujjat ro'yxatlari tanlangan yozuvni `?doc=` bilan ochadi (LettersPage /
    // OrdersPage `filters.doc` ni o'qiydi).
    case 'letters':
      return `/letters?doc=${id}`
    case 'orders':
      return `/orders?doc=${id}`
    // v1 da alohida sahifalar, v2 da bitta «Boshqaruv tuzilma» ekrani.
    // Bo'lim va lavozim uchun ALOHIDA kartochka yo'q — ro'yxat sahifasi bor.
    // Shu sababli nom `q` bilan uzatiladi: foydalanuvchi 400 qatorli ro'yxatga
    // emas, topilgan qatorga tushadi.
    case 'departments':
      return `/tuzilma?tab=departments${q}`
    case 'positions':
      return `/tuzilma?tab=positions${q}`
    case 'support':
      // Murojaatlar ikki tabga bo'lingan; qidiruv butun filial bo'yicha
      // qaytaradi, ya'ni «Navbat» tabi to'g'ri keladi. `?ticket=` shu
      // murojaatning chatini ochadi (SupportPage `wantTicket`) — oldin
      // foydalanuvchi navbat ro'yxatiga tushib, topilgan murojaatni
      // o'zi qidirishi kerak edi. Oddiy xodimda «Navbat» tabi yo'q —
      // sahifa o'zi «Meniki» ga tushadi va o'sha murojaatni ochadi.
      return `/texnik-yordam?tab=queue&ticket=${id}`
    case 'dictionaries': {
      // Backend gives the v1 path `/dictionaries?type=<code>&q=<nom>`; v2's
      // screen is `/malumotnomalar` and reads the same `type` and `q` keys
      // (useListParams). Returned as-is, the v1 path hit `<Route path="*">`
      // and the click landed on the home page.
      const qs = serverUrl && serverUrl.includes('?') ? serverUrl.slice(serverUrl.indexOf('?') + 1) : ''
      const params = new URLSearchParams(qs)
      const keep = new URLSearchParams()
      for (const k of ['type', 'q']) if (params.get(k)) keep.set(k, params.get(k) as string)
      const tail = keep.toString()
      return tail ? `/malumotnomalar?${tail}` : '/malumotnomalar'
    }
    case 'news':
      // v2 da alohida yangiliklar sahifasi yo'q — ular bosh sahifada.
      return '/'
    default:
      return serverUrl || null
  }
}

/** Qidiruv natijalarida sahifalar guruhining kodi (server turi EMAS). */
export const PAGES_TYPE = '__pages'

interface PageHit {
  path: string
  labelKey: NavKey | 'myProfile' | 'settings'
}

/**
 * Sahifa qidiruvi manbasi — TZ 4.1.7 «поисковая строка, по ключевым словам»
 * navigatsiyani ham qamrashi kerak: foydalanuvchi bo'lim NOMINI yozib o'sha
 * bo'limga o'tishi kerak, menyuni ko'z bilan qidirmasdan.
 *
 * ⚠️ MANBA — FOYDALANUVCHINING O'Z MENYUSI (`getNavForUser`), butun marshrut
 * ro'yxati emas. Ikki sabab: (1) ruxsati yo'q sahifaga havola berish "bosdim,
 * 403" degani; (2) menyudan ATAYLAB yashirilgan bo'limlar (Loyihalar,
 * Navbatchilik va h.k. — foydalanuvchi qarori) qidiruv orqali qaytib
 * chiqmasligi kerak.
 *
 * Menyuda yo'q, ammo har doim o'ziniki bo'lgan ikkita sahifa qo'lda
 * qo'shiladi — ular hisob menyusida turadi.
 */
const PERSONAL_PAGES: PageHit[] = [
  { path: '/my-profile', labelKey: 'myProfile' },
  { path: '/sozlamalar', labelKey: 'settings' },
]

export function pagesForUser(
  user: User | null | undefined,
  overrides?: NavModuleOverrides,
): PageHit[] {
  const nav = getNavForUser(user, overrides).map((item) => ({
    path: item.path,
    labelKey: item.labelKey,
  }))
  const seen = new Set(nav.map((p) => p.path))
  return [...nav, ...PERSONAL_PAGES.filter((p) => !seen.has(p.path))]
}
