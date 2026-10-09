import { cn } from '@/lib/cn'

/**
 * THE single definition of what a form control looks like.
 *
 * Input, Select, Textarea, DateInput, TimeInput and the Combobox trigger all
 * compose their chrome from here, so height, radius, border, focus ring,
 * disabled and invalid states are changed in ONE place and every field on the
 * site follows. Nothing else in the app may hardcode control chrome — if a
 * screen needs a variation, add it here as an option.
 */

/** Control heights — ROL nomlari; aniq qiymat theme.css dagi GLOBAL SIZING
 *  blokida (`--ctl-h*`) va u `clamp()` bilan ekranga qarab o'sadi. `md`
 *  standart va Button balandligiga teng, ya'ni maydon va tugma bir qatorda
 *  tekis turadi. */
const CONTROL_SIZES = {
  sm: 'h-control-sm', // compact: search boxes inside popovers, inline table edits
  md: 'h-control',
  lg: 'h-control-lg', // login and other single-purpose, large-target forms
} as const
type ControlSize = keyof typeof CONTROL_SIZES

/** @deprecated use CONTROL_SIZES.md */
export const CONTROL_HEIGHT = CONTROL_SIZES.md

/** Surface + border + radius — all from theme.css «FORM CONTROLS» tokens. */
const SURFACE = 'rounded-control border-ctl bg-ctl-bg transition-colors'

/** Typography inside a control. */
const TYPE = 'text-control leading-5 text-fg placeholder:text-fg-subtle'

/** Resting / invalid border, and the focus treatment for each. */
const BORDER_OK = 'border-ctl-line'
const BORDER_BAD = 'border-danger'
const FOCUS_OK = 'focus:border-ctl-focus focus:ring-ctl focus:ring-ctl-focus/20'
const FOCUS_BAD = 'focus:border-danger focus:ring-ctl focus:ring-danger/20'
/** Same, for controls whose focus lives on a child (Input's wrapper). */
const FOCUS_WITHIN_OK = 'focus-within:border-ctl-focus focus-within:ring-ctl focus-within:ring-ctl-focus/20'
const FOCUS_WITHIN_BAD = 'focus-within:border-danger focus-within:ring-ctl focus-within:ring-danger/20'

const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-60'

interface ControlOptions {
  invalid?: boolean
  /** Focus lands on a child element rather than this one (wrapper controls). */
  focusWithin?: boolean
  /** Height-less variant for multi-line controls (Textarea). */
  auto?: boolean
  size?: ControlSize
  className?: string
}

/** Class string for a form control. */
export function control({
  invalid,
  focusWithin,
  auto,
  size = 'md',
  className,
}: ControlOptions = {}): string {
  return cn(
    SURFACE,
    TYPE,
    !auto && CONTROL_SIZES[size],
    invalid ? BORDER_BAD : BORDER_OK,
    focusWithin
      ? invalid
        ? FOCUS_WITHIN_BAD
        : FOCUS_WITHIN_OK
      : invalid
        ? FOCUS_BAD
        : FOCUS_OK,
    DISABLED,
    'outline-none',
    className,
  )
}

/** Horizontal padding presets so icon slots stay aligned across controls. */
export const CONTROL_PAD = {
  /** Plain text control. */
  plain: 'px-ctl-x',
  /** Room on the right for a chevron / calendar button. */
  trailingIcon: 'pl-ctl-x pr-9',
} as const

/**
 * Floating panel that belongs to a control — Combobox list, DateInput calendar,
 * the employee-picker results. Sits on --elevated (one layer above a card) with
 * the overlay shadow, so every dropdown in the app matches.
 */
export const POPOVER_CLS =
  'rounded-popover border border-line bg-elevated shadow-pop'

/**
 * Suzuvchi panel GEOMETRIYASI — YAGONA manba.
 *
 * Joylashtirish hisobi JS da bo'lgani uchun bu sonlar CSS o'zgaruvchisi emas,
 * shu yerda turadi; komponent o'zining `const W = 268` ini YOZMAYDI (ilgari
 * DateInput va Combobox ikki xil son ishlatardi va biri 320px ekranda
 * ekrandan chiqib ketardi).
 */
export const POPOVER = {
  /** Ro'yxat eng tor holatda — lekin ekrandan kengroq bo'lmaydi (pastga qara). */
  minW: 260,
  /** Kalendar paneli. */
  calW: 268,
  calH: 320,
  /** Ekran chetidan qoldiriladigan bo'shliq. */
  edge: 8,
  /** Sarlavha qatoridagi menyular — kengliklari SHU YERDA, komponentda emas. */
  menuW: 268,
  langW: 176,
  userW: 232,
  notifW: 360,
  branchW: 380,
} as const

/**
 * Panelni ekran ichida joylashtirish: pastda joy bo'lmasa MAYDON USTIGA
 * o'tadi, kengligi ekranga siqiladi, cheti hech qachon tashqarida qolmaydi.
 * Telefonda «kalendar yarmi ko'rinmayapti» muammosining yagona yechimi.
 */
export function placePopover(
  anchor: DOMRect,
  width: number,
  height: number,
  /** `start` — maydonning chap chetiga, `end` — o'ng chetiga tekislanadi. */
  align: 'start' | 'end' = 'start',
): { left: number; top: number; width: number } {
  const E = POPOVER.edge
  const w = Math.min(width, window.innerWidth - E * 2)
  const below = anchor.bottom + 6
  const flip = below + height > window.innerHeight && anchor.top > height
  const wanted = align === 'end' ? anchor.right - w : anchor.left
  return {
    left: Math.min(Math.max(E, wanted), window.innerWidth - w - E),
    top: flip ? anchor.top - height - 6 : below,
    width: w,
  }
}

/**
 * Sahifa ichidagi tab-chip (kapsula tugma) — YAGONA ta'rif.
 *
 * Bu naqsh 7 ta sahifada so'zma-so'z takrorlangan edi; endi balandligi
 * `--ctl-h-sm` dan keladi, ya'ni sensorli qurilmada barmoqqa mos o'lchamga
 * o'zi kattalashadi (theme.css dagi `@media (pointer: coarse)`).
 */
export function tabPill(active: boolean, className?: string): string {
  return cn(
    'inline-flex h-control-sm items-center gap-1.5 rounded-pill px-3.5 text-[12.5px] font-semibold transition-colors',
    active
      ? 'bg-brand text-fg-on-brand'
      : 'bg-fg/[0.06] text-fg-muted hover:bg-fg/[0.12] hover:text-fg',
    className,
  )
}

/**
 * Toggle chip in a filter row (document kinds, project filters, support
 * folders). Was defined three times, word for word, in three pages.
 */
export function filterChip(on: boolean, className?: string): string {
  return cn(
    'inline-flex h-btn-sm shrink-0 items-center gap-1.5 rounded-pill border px-3 text-[12.5px] font-medium transition-colors',
    on
      ? 'border-brand/50 bg-brand-soft text-brand-strong'
      : 'border-line bg-surface text-fg-muted hover:border-brand/30 hover:text-fg',
    className,
  )
}

/**
 * Stat tile that doubles as a filter (Ijro, Guests, Medical, Orders, Work
 * plan headers): the number on it is the filter it applies. Was the same
 * 150-character class string copied into five pages.
 */
export function filterTile(on: boolean, className?: string): string {
  return cn(
    'flex items-center gap-3 rounded-card border bg-surface p-3 text-left shadow-sm transition-[border-color,transform]',
    on ? 'border-brand ring-1 ring-brand/40' : 'border-line',
    className,
  )
}

/** Field label — used by <Field> and by anything rendering its own label. */
export const LABEL_CLS = 'mb-1.5 block text-sm font-medium text-fg'
/** Helper text under a control. */
export const HINT_CLS = 'mt-1 text-xs text-fg-subtle'
/** Validation message under a control. */
export const ERROR_CLS = 'mt-1 text-xs text-danger'
