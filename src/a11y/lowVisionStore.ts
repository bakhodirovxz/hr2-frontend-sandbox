/**
 * «Kam ko'ruvchilar uchun» rejim — TZ 4.1.4 / 4.1.7
 * («Интерфейс должен иметь режим „для слабовидящих“»).
 *
 * NEGA ZUSTAND EMAS, ODDIY MODUL: rejim REACT DAN OLDIN kerak. Sahifa
 * birinchi marta bo'yalganda allaqachon yoqilgan bo'lishi shart, aks holda
 * foydalanuvchi bir zum o'qib bo'lmaydigan ekranni ko'radi. Shu sababli
 * fayl import bo'lishi bilan `<html>` ga atributlarni yozadi.
 *
 * localStorage: bir QURILMADAGI tanlov. Serverga saqlanmaydi — bu ekran
 * sozlamasi, hisob sozlamasi emas (bir xodim ish stolida va planshetda
 * turlicha ishlatadi).
 */

const KEY = 'hrm_low_vision_v1'

export interface LowVisionScheme {
  id: 'off' | 'black-on-white' | 'white-on-black' | 'blue-on-beige'
  /** i18n kaliti — matn `uz.ts` da, bu yerda EMAS. */
  labelKey: string
  hintKey: string
}

/** Uchta sxema — O'zbekiston davlat saytlaridagi standart to'plam. */
export const LV_SCHEMES: LowVisionScheme[] = [
  { id: 'off', labelKey: 'a11y.schemeOff', hintKey: 'a11y.schemeOffHint' },
  { id: 'black-on-white', labelKey: 'a11y.schemeBlackOnWhite', hintKey: 'a11y.schemeBlackOnWhiteHint' },
  { id: 'white-on-black', labelKey: 'a11y.schemeWhiteOnBlack', hintKey: 'a11y.schemeWhiteOnBlackHint' },
  { id: 'blue-on-beige', labelKey: 'a11y.schemeBlueOnBeige', hintKey: 'a11y.schemeBlueOnBeigeHint' },
]

export const LV_FONT_STEPS = [
  { id: 'normal', label: 'A', scale: 1 },
  { id: 'large', label: 'A+', scale: 1.25 },
  { id: 'xlarge', label: 'A++', scale: 1.5 },
] as const

export type LowVisionFont = (typeof LV_FONT_STEPS)[number]['id']

export interface LowVisionState {
  scheme: LowVisionScheme['id']
  font: LowVisionFont
  /** Harflar orasini kengaytirish. */
  spacing: boolean
  /** Bezak/rasmlarni ko'rsatish. */
  images: boolean
}

const DEFAULTS: LowVisionState = {
  scheme: 'off',
  font: 'normal',
  spacing: false,
  images: true,
}

function read(): LowVisionState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LowVisionState>) }
  } catch {
    // Private rejim / o'chirilgan saqlash — sukut bilan davom etamiz.
    return { ...DEFAULTS }
  }
}

let state: LowVisionState = read()
const listeners = new Set<(s: LowVisionState) => void>()

export function getLowVision(): LowVisionState {
  return state
}

export function isLowVisionOn(s: LowVisionState = state): boolean {
  return s.scheme !== 'off' || s.font !== 'normal' || s.spacing || !s.images
}

/** `<html>` ga atributlarni yozadi — `lowVision.css` shu atributlarga tayanadi. */
function applyLowVision(next: LowVisionState = state): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  if (isLowVisionOn(next)) root.setAttribute('data-lv', '')
  else root.removeAttribute('data-lv')

  root.setAttribute('data-lv-scheme', next.scheme)
  root.setAttribute('data-lv-font', next.font)
  root.toggleAttribute('data-lv-spacing', next.spacing)
  root.toggleAttribute('data-lv-noimages', !next.images)

  const step = LV_FONT_STEPS.find((f) => f.id === next.font) ?? LV_FONT_STEPS[0]
  root.style.setProperty('--lv-scale', String(step.scale))
}

export function setLowVision(patch: Partial<LowVisionState>): void {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // saqlash imkoni bo'lmasa ham rejim shu sessiyada ishlaydi
  }
  applyLowVision(state)
  listeners.forEach((fn) => fn(state))
}

export function resetLowVision(): void {
  setLowVision({ ...DEFAULTS })
}

export function subscribeLowVision(fn: (s: LowVisionState) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// Modul yuklanishi bilan qo'llanadi — React mount'ini KUTMAYDI.
applyLowVision(state)

/** How much the low-vision font step enlarges the page (1 = off). */
export function lowVisionScale(s: LowVisionState = state): number {
  return (LV_FONT_STEPS.find((f) => f.id === s.font) ?? LV_FONT_STEPS[0]).scale
}
