import type { User } from '@/types'
import { flattenNav, getNavForUser, type NavKey } from '@/components/layout/navConfig'

/** Qidiruv natijalarida sahifalar guruhining kodi (server moduli EMAS). */
export const PAGES_TYPE = '__pages'

/**
 * `GET /search` modullari (backend `services/global_search.py::MODULE_PERMISSION`).
 * Server har natija bilan tayyor `url` beradi — u shu interfeysning marshrutlari
 * (`/employees/1`, `/orders?open=1`, `/departments?open=3` …).
 */
export const SEARCH_MODULES = [
  'employees',
  'orders',
  'departments',
  'job_positions',
  'dictionaries',
  'vacancies',
  'trainings',
  'inspections',
  'services',
] as const
export type SearchModule = (typeof SEARCH_MODULES)[number]

interface PageHit {
  path: string
  labelKey: NavKey
}

/**
 * Sahifa qidiruvi manbasi — foydalanuvchining O'Z menyusi: ruxsati yo'q
 * sahifaga havola chiqmaydi. Menyuda yo'q, lekin har doim o'ziniki bo'lgan
 * profil sahifasi qo'lda qo'shiladi.
 */
export function pagesForUser(user: User | null | undefined): PageHit[] {
  const nav = flattenNav(getNavForUser(user)).map((item) => ({ path: item.path, labelKey: item.labelKey }))
  const seen = new Set(nav.map((p) => p.path))
  const personal: PageHit[] = [{ path: '/my-profile', labelKey: 'myProfile' }]
  return [...nav, ...personal.filter((p) => !seen.has(p.path))]
}
