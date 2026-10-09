/**
 * Administratorlik qo'llanmasi — TZ 8-bo'lim
 * («Руководство по администрированию должно быть неотъемлемой частью
 * Системы (горячая клавиша F1)»).
 *
 * Qo'llanma TIZIM ICHIDA yashaydi (alohida PDF emas): F1 bosilganda JORIY
 * sahifaga MOS bo'lim ochiladi. Har bo'limning `routes` ro'yxati — qaysi
 * manzillarda shu bo'lim kontekstual bo'lishi. Moslik eng UZUN prefiks
 * bo'yicha tanlanadi, ya'ni `/employees/12` xodimlar bo'limiga tushadi.
 *
 * ⚠️ MATN BU YERDA EMAS — faqat i18n KALITLARI. Barcha statik matn
 * `src/i18n/uz.ts` da (`guide.*`), shu sababli qo'llanma rus va o'zbek
 * kirill tillarida ham o'zi ishlaydi.
 */

export type GuideBlock =
  | { t: 'p' | 'h' | 'warn' | 'note'; k: string }
  | { t: 'list'; items: string[] }

export interface GuideSection {
  id: string
  titleKey: string
  routes: string[]
  blocks: GuideBlock[]
}

/** Bo'lim uchun bloklarni qisqa yozish yordamchilari. */
const p = (k: string): GuideBlock => ({ t: 'p', k })
const h = (k: string): GuideBlock => ({ t: 'h', k })
const warn = (k: string): GuideBlock => ({ t: 'warn', k })
const note = (k: string): GuideBlock => ({ t: 'note', k })
const list = (...items: string[]): GuideBlock => ({ t: 'list', items })

export const ADMIN_GUIDE: GuideSection[] = [
  {
    id: 'kirish',
    titleKey: 'guide.kirish.title',
    routes: ['/'],
    blocks: [
      p('guide.kirish.p1'),
      h('guide.kirish.h1'),
      list(
        'guide.kirish.l1',
        'guide.kirish.l2',
        'guide.kirish.l3',
        'guide.kirish.l4',
        'guide.kirish.l5',
        'guide.kirish.l6',
        'guide.kirish.l7',
      ),
      note('guide.kirish.n1'),
      h('guide.kirish.h2'),
      p('guide.kirish.p2'),
    ],
  },
  {
    id: 'registratsiya',
    titleKey: 'guide.registratsiya.title',
    routes: ['/registratsiyalar', '/royxatdan-otish', '/registratsiya-holati'],
    blocks: [
      p('guide.registratsiya.p1'),
      h('guide.registratsiya.h1'),
      list('guide.registratsiya.l1', 'guide.registratsiya.l2', 'guide.registratsiya.l3'),
      warn('guide.registratsiya.w1'),
    ],
  },
  {
    id: 'foydalanuvchilar',
    titleKey: 'guide.foydalanuvchilar.title',
    routes: ['/foydalanuvchilar'],
    blocks: [
      p('guide.foydalanuvchilar.p1'),
      h('guide.foydalanuvchilar.h1'),
      list(
        'guide.foydalanuvchilar.l1',
        'guide.foydalanuvchilar.l2',
        'guide.foydalanuvchilar.l3',
        'guide.foydalanuvchilar.l4',
      ),
      warn('guide.foydalanuvchilar.w1'),
    ],
  },
  {
    id: 'tuzilma',
    titleKey: 'guide.tuzilma.title',
    routes: ['/tuzilma'],
    blocks: [
      p('guide.tuzilma.p1'),
      h('guide.tuzilma.h1'),
      list('guide.tuzilma.l1', 'guide.tuzilma.l2', 'guide.tuzilma.l3'),
      warn('guide.tuzilma.w1'),
    ],
  },
  {
    id: 'shtat',
    titleKey: 'guide.shtat.title',
    routes: ['/shtat'],
    blocks: [
      p('guide.shtat.p1'),
      list('guide.shtat.l1', 'guide.shtat.l2', 'guide.shtat.l3'),
      h('guide.shtat.h1'),
      p('guide.shtat.p2'),
      note('guide.shtat.n1'),
    ],
  },
  {
    id: 'malumotnomalar',
    titleKey: 'guide.malumotnomalar.title',
    routes: ['/malumotnomalar'],
    blocks: [
      p('guide.malumotnomalar.p1'),
      list('guide.malumotnomalar.l1', 'guide.malumotnomalar.l2', 'guide.malumotnomalar.l3'),
      warn('guide.malumotnomalar.w1'),
    ],
  },
  {
    id: 'xodimlar',
    titleKey: 'guide.xodimlar.title',
    routes: ['/employees', '/tabel'],
    blocks: [
      p('guide.xodimlar.p1'),
      h('guide.xodimlar.h1'),
      list('guide.xodimlar.l1', 'guide.xodimlar.l2', 'guide.xodimlar.l3', 'guide.xodimlar.l4'),
      h('guide.xodimlar.h2'),
      p('guide.xodimlar.p2'),
      warn('guide.xodimlar.w1'),
    ],
  },
  {
    id: 'davomat',
    titleKey: 'guide.davomat.title',
    routes: ['/employee-attendance', '/my-attendance', '/tabel-sozlamalari', '/monitoring'],
    blocks: [
      p('guide.davomat.p1'),
      list('guide.davomat.l1', 'guide.davomat.l2', 'guide.davomat.l3'),
      note('guide.davomat.n1'),
    ],
  },
  {
    id: 'hujjatlar',
    titleKey: 'guide.hujjatlar.title',
    routes: ['/orders', '/order-types', '/letters', '/hujjatlar'],
    blocks: [
      p('guide.hujjatlar.p1'),
      list('guide.hujjatlar.l1', 'guide.hujjatlar.l2', 'guide.hujjatlar.l3'),
      warn('guide.hujjatlar.w1'),
    ],
  },
  {
    id: 'kpi',
    titleKey: 'guide.kpi.title',
    routes: ['/kpi'],
    blocks: [
      p('guide.kpi.p1'),
      list('guide.kpi.l1', 'guide.kpi.l2', 'guide.kpi.l3', 'guide.kpi.l4'),
      note('guide.kpi.n1'),
    ],
  },
  {
    id: 'xizmatlar',
    titleKey: 'guide.xizmatlar.title',
    routes: ['/interaktiv-xizmatlar'],
    blocks: [
      p('guide.xizmatlar.p1'),
      list('guide.xizmatlar.l1', 'guide.xizmatlar.l2'),
      note('guide.xizmatlar.n1'),
    ],
  },
  {
    id: 'hisobot',
    titleKey: 'guide.hisobot.title',
    routes: ['/reports'],
    blocks: [p('guide.hisobot.p1'), list('guide.hisobot.l1', 'guide.hisobot.l2', 'guide.hisobot.l3')],
  },
  {
    id: 'audit',
    titleKey: 'guide.audit.title',
    routes: ['/audit-logs'],
    blocks: [p('guide.audit.p1'), list('guide.audit.l1', 'guide.audit.l2'), note('guide.audit.n1')],
  },
  {
    id: 'zaxira',
    titleKey: 'guide.zaxira.title',
    routes: [],
    blocks: [p('guide.zaxira.p1'), list('guide.zaxira.l1', 'guide.zaxira.l2'), warn('guide.zaxira.w1')],
  },
  {
    id: 'nosozlik',
    titleKey: 'guide.nosozlik.title',
    routes: [],
    blocks: [
      h('guide.nosozlik.h1'),
      p('guide.nosozlik.p1'),
      h('guide.nosozlik.h2'),
      p('guide.nosozlik.p2'),
      h('guide.nosozlik.h3'),
      p('guide.nosozlik.p3'),
      h('guide.nosozlik.h4'),
      p('guide.nosozlik.p4'),
    ],
  },
]

/** Joriy manzilga eng mos bo'lim (eng UZUN prefiks bo'yicha). */
export function guideSectionForPath(pathname: string): GuideSection | null {
  let best: GuideSection | null = null
  let bestLen = -1
  for (const section of ADMIN_GUIDE) {
    for (const route of section.routes) {
      const match = route === '/' ? pathname === '/' : pathname.startsWith(route)
      if (match && route.length > bestLen) {
        best = section
        bestLen = route.length
      }
    }
  }
  return best
}
