import type { User } from '@/types'
import { isBranchAdmin, isGuest, isSiteMasterAdmin } from '@/auth/permissions'
import { ADMIN_GUIDE, type GuideBlock, type GuideSection } from './adminGuide'

/**
 * Role-aware in-app help (F1). The administrator guide stays in `adminGuide.ts`;
 * ordinary users get the USER guide and guests a short GUEST guide. Text lives
 * in `uz.rest.ts` under `userGuide.*` (Russian in `ru.ts`, FX-DOCS block).
 */
export type GuideMode = 'admin' | 'user' | 'guest'

const p = (k: string): GuideBlock => ({ t: 'p', k })
const h = (k: string): GuideBlock => ({ t: 'h', k })
const note = (k: string): GuideBlock => ({ t: 'note', k })
const list = (...items: string[]): GuideBlock => ({ t: 'list', items })

export const USER_GUIDE: GuideSection[] = [
  {
    id: 'boshlash',
    titleKey: 'userGuide.start.title',
    routes: ["/"],
    blocks: [
      p('userGuide.start.b1'),
      h('userGuide.start.b2'),
      list('userGuide.start.b3_1', 'userGuide.start.b3_2'),
      h('userGuide.start.b4'),
      list('userGuide.start.b5_1', 'userGuide.start.b5_2', 'userGuide.start.b5_3', 'userGuide.start.b5_4', 'userGuide.start.b5_5'),
    ],
  },
  {
    id: 'profil',
    titleKey: 'userGuide.profile.title',
    routes: ["/my-profile"],
    blocks: [
      p('userGuide.profile.b1'),
      list('userGuide.profile.b2_1', 'userGuide.profile.b2_2', 'userGuide.profile.b2_3'),
      note('userGuide.profile.b3'),
    ],
  },
  {
    id: 'davomat',
    titleKey: 'userGuide.attendance.title',
    routes: ["/my-attendance", "/employee-attendance", "/holidays", "/timesheet-settings"],
    blocks: [
      p('userGuide.attendance.b1'),
      list('userGuide.attendance.b2_1', 'userGuide.attendance.b2_2'),
    ],
  },
  {
    id: 'xizmatlar',
    titleKey: 'userGuide.services.title',
    routes: ["/services"],
    blocks: [
      p('userGuide.services.b1'),
      h('userGuide.services.b2'),
      list('userGuide.services.b3_1', 'userGuide.services.b3_2', 'userGuide.services.b3_3', 'userGuide.services.b3_4'),
      note('userGuide.services.b4'),
    ],
  },
  {
    id: 'kpi',
    titleKey: 'userGuide.kpi.title',
    routes: ["/kpi", "/work-plans", "/trainings", "/audits"],
    blocks: [
      p('userGuide.kpi.b1'),
      list('userGuide.kpi.b2_1', 'userGuide.kpi.b2_2', 'userGuide.kpi.b2_3'),
    ],
  },
  {
    id: 'prikazlar',
    titleKey: 'userGuide.orders.title',
    routes: ["/orders"],
    blocks: [
      p('userGuide.orders.b1'),
      note('userGuide.orders.b2'),
    ],
  },
  {
    id: 'vakansiyalar',
    titleKey: 'userGuide.vacancies.title',
    routes: ["/vacancies"],
    blocks: [
      p('userGuide.vacancies.b1'),
      list('userGuide.vacancies.b2_1'),
    ],
  },
  {
    id: 'tuzilma',
    titleKey: 'userGuide.structure.title',
    routes: ["/structure", "/dictionaries", "/departments", "/job-positions", "/staffing", "/organizations", "/contacts", "/sitemap", "/search"],
    blocks: [
      p('userGuide.structure.b1'),
      p('userGuide.structure.b2'),
    ],
  },
  {
    id: 'xodimlar',
    titleKey: 'userGuide.employees.title',
    routes: ["/employees", "/hr-quality"],
    blocks: [
      p('userGuide.employees.b1'),
      list('userGuide.employees.b2_1', 'userGuide.employees.b2_2', 'userGuide.employees.b2_3'),
    ],
  },
  {
    id: 'hisobot',
    titleKey: 'userGuide.reports.title',
    routes: ["/statistics"],
    blocks: [
      p('userGuide.reports.b1'),
    ],
  },
  {
    id: 'nosozlik',
    titleKey: 'userGuide.trouble.title',
    routes: [],
    blocks: [
      list('userGuide.trouble.b1_1', 'userGuide.trouble.b1_2', 'userGuide.trouble.b1_3', 'userGuide.trouble.b1_4'),
    ],
  },
]

export const GUEST_GUIDE: GuideSection[] = [
  {
    id: 'mehmon',
    titleKey: 'userGuide.guestStart.title',
    routes: ["/", "/registration-status"],
    blocks: [
      p('userGuide.guestStart.b1'),
      list('userGuide.guestStart.b2_1', 'userGuide.guestStart.b2_2'),
    ],
  },
  {
    id: 'mehmon-vakansiya',
    titleKey: 'userGuide.guestVac.title',
    routes: ["/vacancies", "/services"],
    blocks: [
      p('userGuide.guestVac.b1'),
      note('userGuide.guestVac.b2'),
    ],
  },
  {
    id: 'mehmon-pomosh',
    titleKey: 'userGuide.guestHelp.title',
    routes: [],
    blocks: [
      list('userGuide.guestHelp.b1_1', 'userGuide.guestHelp.b1_2', 'userGuide.guestHelp.b1_3'),
    ],
  },
]

/** Administrators and HR staff keep the administrator guide; guests and everyone else do not. */
export function guideModeFor(user: User | null | undefined): GuideMode {
  if (isGuest(user)) return 'guest'
  const actor = user?.actor
  if (isSiteMasterAdmin(user) || isBranchAdmin(user) || actor?.hr || actor?.central_hr) return 'admin'
  return 'user'
}

export function guideSections(mode: GuideMode): GuideSection[] {
  return mode === 'admin' ? ADMIN_GUIDE : mode === 'guest' ? GUEST_GUIDE : USER_GUIDE
}

export function guideTitleKey(mode: GuideMode): string {
  return mode === 'admin' ? 'guide.title' : mode === 'guest' ? 'userGuide.guestTitle' : 'userGuide.title'
}
