/**
 * Administratorlik qo'llanmasi — TZ 1745 (F1); bo'limlar TZ sandbox modullari bo'yicha
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
    routes: ["/"],
    blocks: [
      p('guide.kirish.b1'),
      h('guide.kirish.b2'),
      list('guide.kirish.b3_1', 'guide.kirish.b3_2', 'guide.kirish.b3_3', 'guide.kirish.b3_4', 'guide.kirish.b3_5', 'guide.kirish.b3_6', 'guide.kirish.b3_7'),
      note('guide.kirish.b4'),
    ],
  },
  {
    id: 'filiallar',
    titleKey: 'guide.filiallar.title',
    routes: ["/branches", "/departments", "/job-positions", "/structure"],
    blocks: [
      p('guide.filiallar.b1'),
      h('guide.filiallar.b2'),
      list('guide.filiallar.b3_1', 'guide.filiallar.b3_2', 'guide.filiallar.b3_3'),
      warn('guide.filiallar.b4'),
    ],
  },
  {
    id: 'shtat',
    titleKey: 'guide.shtat.title',
    routes: ["/staffing"],
    blocks: [
      p('guide.shtat.b1'),
      list('guide.shtat.b2_1', 'guide.shtat.b2_2', 'guide.shtat.b2_3'),
      h('guide.shtat.b3'),
      p('guide.shtat.b4'),
      p('guide.shtat.b5'),
      note('guide.shtat.b6'),
      p('guide.shtat.b7'),
    ],
  },
  {
    id: 'malumotnomalar',
    titleKey: 'guide.malumotnomalar.title',
    routes: ["/dictionaries"],
    blocks: [
      p('guide.malumotnomalar.b1'),
      list('guide.malumotnomalar.b2_1', 'guide.malumotnomalar.b2_2', 'guide.malumotnomalar.b2_3', 'guide.malumotnomalar.b2_4'),
      warn('guide.malumotnomalar.b3'),
    ],
  },
  {
    id: 'xodimlar',
    titleKey: 'guide.xodimlar.title',
    routes: ["/employees", "/hr-quality"],
    blocks: [
      p('guide.xodimlar.b1'),
      list('guide.xodimlar.b2_1', 'guide.xodimlar.b2_2', 'guide.xodimlar.b2_3'),
      h('guide.xodimlar.b3'),
      p('guide.xodimlar.b4'),
      note('guide.xodimlar.b5'),
      warn('guide.xodimlar.b6'),
    ],
  },
  {
    id: 'davomat',
    titleKey: 'guide.davomat.title',
    routes: ["/employee-attendance", "/my-attendance", "/timesheet-settings", "/holidays"],
    blocks: [
      p('guide.davomat.b1'),
      list('guide.davomat.b2_1', 'guide.davomat.b2_2', 'guide.davomat.b2_3', 'guide.davomat.b2_4', 'guide.davomat.b2_5'),
    ],
  },
  {
    id: 'hujjatlar',
    titleKey: 'guide.hujjatlar.title',
    routes: ["/orders", "/order-types"],
    blocks: [
      p('guide.hujjatlar.b1'),
      list('guide.hujjatlar.b2_1', 'guide.hujjatlar.b2_2', 'guide.hujjatlar.b2_3', 'guide.hujjatlar.b2_4', 'guide.hujjatlar.b2_5', 'guide.hujjatlar.b2_6'),
      note('guide.hujjatlar.b3'),
    ],
  },
  {
    id: 'kpi',
    titleKey: 'guide.kpi.title',
    routes: ["/kpi", "/work-plans", "/trainings", "/audits"],
    blocks: [
      p('guide.kpi.b1'),
      list('guide.kpi.b2_1', 'guide.kpi.b2_2', 'guide.kpi.b2_3', 'guide.kpi.b2_4'),
    ],
  },
  {
    id: 'audit',
    titleKey: 'guide.audit.title',
    routes: ["/audit-logs"],
    blocks: [
      p('guide.audit.b1'),
      list('guide.audit.b2_1', 'guide.audit.b2_2', 'guide.audit.b2_3'),
    ],
  },
  {
    id: 'foydalanuvchilar',
    titleKey: 'guide.foydalanuvchilar.title',
    routes: ["/users", "/roles", "/registrations"],
    blocks: [
      p('guide.foydalanuvchilar.b1'),
      h('guide.foydalanuvchilar.b2'),
      list('guide.foydalanuvchilar.b3_1', 'guide.foydalanuvchilar.b3_2', 'guide.foydalanuvchilar.b3_3', 'guide.foydalanuvchilar.b3_4'),
      h('guide.foydalanuvchilar.b4'),
      p('guide.foydalanuvchilar.b5'),
      warn('guide.foydalanuvchilar.b6'),
      h('guide.foydalanuvchilar.b7'),
      p('guide.foydalanuvchilar.b8'),
    ],
  },
  {
    id: 'zaxira',
    titleKey: 'guide.zaxira.title',
    routes: ["/system/backups"],
    blocks: [
      p('guide.zaxira.b1'),
      list('guide.zaxira.b2_1', 'guide.zaxira.b2_2', 'guide.zaxira.b2_3', 'guide.zaxira.b2_4'),
      warn('guide.zaxira.b3'),
    ],
  },
  {
    id: 'tizim-holati',
    titleKey: 'guide.tizimHolati.title',
    routes: ["/system-health"],
    blocks: [
      p('guide.tizimHolati.b1'),
      h('guide.tizimHolati.b2'),
      list('guide.tizimHolati.b3_1', 'guide.tizimHolati.b3_2'),
      h('guide.tizimHolati.b4'),
      p('guide.tizimHolati.b5'),
    ],
  },
  {
    id: 'statistika',
    titleKey: 'guide.statistika.title',
    routes: ["/statistics"],
    blocks: [
      p('guide.statistika.b1'),
      list('guide.statistika.b2_1', 'guide.statistika.b2_2', 'guide.statistika.b2_3', 'guide.statistika.b2_4', 'guide.statistika.b2_5'),
    ],
  },
  {
    id: 'xizmatlar',
    titleKey: 'guide.xizmatlar.title',
    routes: ["/services", "/vacancies"],
    blocks: [
      p('guide.xizmatlar.b1'),
      list('guide.xizmatlar.b2_1', 'guide.xizmatlar.b2_2', 'guide.xizmatlar.b2_3', 'guide.xizmatlar.b2_4', 'guide.xizmatlar.b2_5'),
    ],
  },
  {
    id: 'tizim-lugati',
    titleKey: 'guide.tizimLugati.title',
    routes: ["/system/dictionary"],
    blocks: [
      p('guide.tizimLugati.b1'),
      list('guide.tizimLugati.b2_1', 'guide.tizimLugati.b2_2', 'guide.tizimLugati.b2_3'),
      note('guide.tizimLugati.b3'),
    ],
  },
  {
    id: 'nosozlik',
    titleKey: 'guide.nosozlik.title',
    routes: [],
    blocks: [
      h('guide.nosozlik.b1'),
      p('guide.nosozlik.b2'),
      h('guide.nosozlik.b3'),
      p('guide.nosozlik.b4'),
      h('guide.nosozlik.b5'),
      p('guide.nosozlik.b6'),
      h('guide.nosozlik.b7'),
      p('guide.nosozlik.b8'),
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
