import dayjs, { type Dayjs } from 'dayjs'
import utc from 'dayjs/plugin/utc'
import i18n from '@/i18n'

dayjs.extend(utc)

/**
 * The organisation lives in one time zone — Tashkent, UTC+5, no DST — and the
 * API already pins writes to it (`schemas/zoom_meeting.assume_tashkent`).
 * Display was NOT pinned: `dayjs(x).format(...)` renders in the BROWSER's zone,
 * so a meeting booked for 14:30 read as 09:30 on any machine set to UTC. The
 * clock a company runs on cannot depend on a laptop's settings.
 */
const TASHKENT_OFFSET_MIN = 5 * 60

/**
 * Read a moment as Tashkent wall-clock time.
 *
 * Sandbox backend (o'lchangan, 10-09): PostgreSQL `TimeZone = Etc/UTC`,
 * konteynerlar UTC'da; 78 ta `created_at/updated_at` va sessiya vaqtlari
 * ZONASIZ, lekin UTC'da yozilgan. Shuning uchun:
 *  · ofsetli qiymat ("…+05:00" / "…Z") — o'z ofseti bilan o'giriladi;
 *  · ZONASIZ sana+vaqt — UTC deb o'qiladi va Toshkentga o'giriladi
 *    (asosiy mahsulotda bu Toshkent vaqti edi — bu yerda 5 soat orqada
 *    ko'rinardi);
 *  · faqat sana ("YYYY-MM-DD") — o'zgarishsiz.
 * Turniket `happen_time` kabi MAHALLIY zonasiz vaqtlar uchun — `inWallClock`.
 */
const HAS_OFFSET = /(?:[+-]\d{2}:?\d{2}|Z)$/
const HAS_TIME = /\d[T ]\d{2}/

export function inTashkent(input?: Dayjs | string | null) {
  if (!input) return dayjs().utcOffset(TASHKENT_OFFSET_MIN)
  if (typeof input === 'string' && !HAS_OFFSET.test(input)) {
    if (!HAS_TIME.test(input)) return dayjs(input)
    return dayjs(`${input.replace(' ', 'T')}Z`).utcOffset(TASHKENT_OFFSET_MIN)
  }
  return dayjs(input).utcOffset(TASHKENT_OFFSET_MIN)
}

/**
 * Zonasiz qiymat ALLAQACHON Toshkent soati bo'lsa (turniket `happen_time`,
 * vakansiya xabarnomasi `last_sent_at`) — yozilganicha o'qiladi.
 */
export function inWallClock(input?: string | null) {
  if (!input) return dayjs()
  return HAS_OFFSET.test(input) ? dayjs(input).utcOffset(TASHKENT_OFFSET_MIN) : dayjs(input)
}

/**
 * Server UTC'da yozgan ZONASIZ vaqt (`datetime.utcnow()` — sessiyalar,
 * `created_at` server_default'lari sandbox bazasida) — Toshkent vaqtida matn.
 * Ofsetli qiymat esa o'z ofseti bilan o'qiladi. Turniket `happen_time` kabi
 * mahalliy zonasiz vaqtlar uchun EMAS — ular uchun `inTashkent`.
 */
export function inUtc(v?: string | null, withTime = true): string {
  if (!v) return '—'
  const iso = HAS_OFFSET.test(v) ? v : `${v}Z`
  const d = dayjs(iso)
  return d.isValid() ? d.utcOffset(TASHKENT_OFFSET_MIN).format(withTime ? 'DD.MM.YYYY HH:mm' : 'DD.MM.YYYY') : '—'
}

/**
 * Month and weekday names, cached PER LANGUAGE.
 *
 * ⚠️ `i18n.t(key, {returnObjects: true})` WALKS THE RESOURCE TREE AND RETURNS A
 * FRESH ARRAY ON EVERY CALL, and these helpers are called once per TABLE CELL
 * (`ReportsPage`, `MedicalPage`, `CalendarStrip`, the profile's medical tabs,
 * `TripAttendancePanel`, `EmployeeStatsRow`…). A 100-row report therefore built
 * up to two hundred throwaway arrays per render. The names are constant for a
 * language, so they are resolved once and dropped when the language changes.
 */
let namesLang: string | null = null
let monthNames: string[] = []
let weekdayNames: string[] = []

function names(): { months: string[]; weekdays: string[] } {
  if (namesLang !== i18n.language) {
    monthNames = i18n.t('date.months', { returnObjects: true }) as unknown as string[]
    weekdayNames = i18n.t('date.weekdays', { returnObjects: true }) as unknown as string[]
    namesLang = i18n.language
  }
  return { months: monthNames, weekdays: weekdayNames }
}

const ruDayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })

/**
 * «Day + month» in the grammar of the UI language: Uzbek «16-iyul», Russian
 * «16 июля». Russian needs the GENITIVE month after a day, and the dictionary
 * cannot hold it (its keys are the Uzbek words, so «iyul» maps to one Russian
 * form — the nominative «Июль» that month pickers need). `Intl` knows it.
 */
export function dayMonth(input?: Dayjs | string | null): string {
  const d = input ? dayjs(input) : dayjs()
  if (i18n.language?.startsWith('ru')) return ruDayMonth.format(d.toDate())
  const { months } = names()
  return `${d.date()}-${months[d.month()]}`
}

/** e.g. "16-iyul, chorshanba" — month/weekday names come from the i18n
 *  dictionary (date.months / date.weekdays), so they follow the active language. */
export function formatAppDate(input?: Dayjs | string | null): string {
  const d = input ? dayjs(input) : dayjs()
  const { weekdays } = names()
  // The year is added when it is not this year's: «14-mart, juma» on a 2031
  // holiday read as this March (09-25 sweep). This year's dates are unchanged.
  const year = d.year() !== dayjs().year() ? ` ${d.year()}` : ''
  return `${dayMonth(d)}${year}, ${weekdays[d.day()]}`
}

/** Month heading, e.g. "Iyul 2026". dayjs's own `MMMM` is English unless a
 *  locale is loaded, so the name comes from the dictionary like everywhere else. */
export function monthTitle(input?: Dayjs | string | null): string {
  const d = input ? dayjs(input) : dayjs()
  const { months } = names()
  const name = months[d.month()] ?? ''
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${d.year()}`
}

/** Short form, e.g. "16-iyul" (day + month, no weekday). */
export function formatUzShort(input?: Dayjs | string | null): string {
  if (!input) return ''
  return dayMonth(input)
}

/**
 * A datetime control's `YYYY-MM-DDTHH:mm` → an absolute ISO instant.
 *
 * That value is LOCAL wall-clock time. Posted verbatim into a `timestamptz`
 * column the server reads it as UTC, so a visitor's access window lands five
 * hours off — the gate opens (and shuts) at the wrong time.
 */
export function localToIso(local?: string | null): string | null {
  if (!local) return null
  const d = dayjs(local)
  return d.isValid() ? d.toISOString() : null
}

/**
 * Number locale of the UI language. Numbers used to be formatted with a fixed
 * 'ru-RU' everywhere, so Uzbek readers got Russian formatting.
 */
export function numberLocale(): string {
  const lang = i18n.language ?? 'uz'
  if (lang.startsWith('ru')) return 'ru-RU'
  return lang === 'uz_cyrl' ? 'uz-Cyrl-UZ' : 'uz-UZ'
}

/** Compact number, e.g. 1250 → "1 250". */
export function formatNumber(n: number): string {
  return n.toLocaleString(numberLocale())
}

/** Seconds → "m:ss" (or "h:mm:ss"). */
export function formatDuration(seconds?: number | null): string {
  if (!seconds || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`
}

/** "DD.MM.YY HH:mm:ss" — compact timestamp for logs/tables. */
export function formatDateTime(input?: Dayjs | string | null): string {
  if (!input) return '—'
  const d = inTashkent(input)
  return d.isValid() ? d.format('DD.MM.YY HH:mm:ss') : '—'
}

/** A "YYYY-MM"/date-ish string → short month label ("iyul"). Empty on invalid. */
export function monthShort(input?: string | null): string {
  if (!input) return ''
  const d = dayjs(input.length === 7 ? `${input}-01` : input)
  if (!d.isValid()) return String(input)
  const { months } = names()
  return months[d.month()] ?? ''
}

/**
 * A date span in one short line: «06.08 — 07.08.2026» (year once when both ends
 * share it). The long weekday form of each end wrapped every list row in two.
 */
export function formatRange(a?: Dayjs | string | null, b?: Dayjs | string | null): string {
  if (!a && !b) return '—'
  const da = a ? dayjs(a) : null
  const db = b ? dayjs(b) : null
  if (da && db && da.isSame(db, 'day')) return da.format('DD.MM.YYYY')
  if (da && db && da.year() === db.year()) return `${da.format('DD.MM')} — ${db.format('DD.MM.YYYY')}`
  return `${da ? da.format('DD.MM.YYYY') : '…'} — ${db ? db.format('DD.MM.YYYY') : '…'}`
}
