import type { NavKey } from '@/components/layout/navConfig'

/**
 * QO'LLANMA-TURLAR — v2 uchun YANGI yozilgan.
 *
 * v1 da ~4500 qatorlik qadamlar bor, lekin ular v1 ning DOM va marshrutlariga
 * yozilgan: har bir selektorni qayta bog'lash ularni noldan yozishdan
 * qimmatroq. Shu bois bu yerda kamroq, lekin ISHLAYDIGAN turlar bor.
 *
 * Har bir qadam:
 *   `el`   — CSS selektor (odatda `[data-tour="…"]`). Bo'lmasa markazdagi
 *            modal qadam bo'ladi (kirish/xulosa uchun).
 *   `nav`  — qadam ochilishidan oldin o'tiladigan marshrut.
 *   `side` — popover tomoni.
 *
 * ⚠️ Matnlar i18n KALITI, tayyor satr emas.
 */
export interface TourStep {
  el?: string
  nav?: string
  titleKey: string
  textKey: string
  side?: 'top' | 'bottom' | 'left' | 'right'
}

export interface TourDef {
  id: string
  titleKey: string
  descKey: string
  /** Menyuda shu modul yo'q bo'lsa tur ham taklif qilinmaydi. */
  needsNav?: NavKey
  steps: TourStep[]
}

export const TOURS: TourDef[] = [
  {
    id: 'intro',
    titleKey: 'tour.introTitle',
    descKey: 'tour.introDesc',
    steps: [
      { titleKey: 'tour.introTitle', textKey: 'tour.introWelcome' },
      { el: '[data-tour="nav-toggle"]', titleKey: 'tour.menuTitle', textKey: 'tour.menuText', side: 'bottom' },
      { el: '[data-tour="branch"]', titleKey: 'tour.branchTitle', textKey: 'tour.branchText', side: 'bottom' },
      { el: '[data-tour="search"]', titleKey: 'tour.searchTitle', textKey: 'tour.searchText', side: 'bottom' },
      { el: '[data-tour="notifications"]', titleKey: 'tour.notifTitle', textKey: 'tour.notifText', side: 'bottom' },
      { el: '[data-tour="tools"]', titleKey: 'tour.toolsTitle', textKey: 'tour.toolsText', side: 'bottom' },
    ],
  },
  {
    id: 'dashboard',
    titleKey: 'tour.dashTitle',
    descKey: 'tour.dashDesc',
    steps: [
      { nav: '/', titleKey: 'tour.dashTitle', textKey: 'tour.dashIntro' },
      { el: '[data-tour="feed"]', titleKey: 'tour.feedTitle', textKey: 'tour.feedText', side: 'right' },
      { el: '[data-tour="feed-tabs"]', titleKey: 'tour.feedTabsTitle', textKey: 'tour.feedTabsText', side: 'bottom' },
    ],
  },
  {
    id: 'letters',
    titleKey: 'tour.lettersTitle',
    descKey: 'tour.lettersDesc',
    needsNav: 'letters',
    steps: [
      { nav: '/letters', titleKey: 'tour.lettersTitle', textKey: 'tour.lettersIntro' },
      { el: '[data-tour="letters-scopes"]', titleKey: 'tour.scopesTitle', textKey: 'tour.scopesText', side: 'bottom' },
      { el: '[data-tour="letters-create"]', titleKey: 'tour.createTitle', textKey: 'tour.lettersCreateText', side: 'left' },
    ],
  },
  {
    id: 'orders',
    titleKey: 'tour.ordersTitle',
    descKey: 'tour.ordersDesc',
    needsNav: 'orders',
    steps: [
      { nav: '/orders', titleKey: 'tour.ordersTitle', textKey: 'tour.ordersIntro' },
      { el: '[data-tour="orders-create"]', titleKey: 'tour.createTitle', textKey: 'tour.ordersCreateText', side: 'left' },
    ],
  },
  {
    id: 'attendance',
    titleKey: 'tour.attTitle',
    descKey: 'tour.attDesc',
    needsNav: 'attendance',
    steps: [
      { nav: '/employee-attendance', titleKey: 'tour.attTitle', textKey: 'tour.attIntro' },
      { el: '[data-tour="att-filters"]', titleKey: 'tour.filtersTitle', textKey: 'tour.attFiltersText', side: 'bottom' },
      { el: '[data-tour="att-export"]', titleKey: 'tour.exportTitle', textKey: 'tour.attExportText', side: 'left' },
    ],
  },
]
