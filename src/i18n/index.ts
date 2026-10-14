import { useEffect, useState } from 'react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import core from './uz.core'
import { normalizeUzApostrophes, toCyrillic } from './translit'
import { joinApiUrl } from '@/api/apiBase'

/**
 * Interfeys tillari — TZ 4.1.7 («Система должна быть двуязычной: узбекский
 * (латиница/кириллица) и русский языки»):
 *
 *   uz      — o'zbek lotin (ASOS: `uz.ts` lug'ati, YAGONA manba)
 *   uz_cyrl — o'zbek kirill (`translit.ts` orqali AVTOMATIK, lug'atsiz)
 *   ru      — rus (`ru.ts` — o'zbekcha MATN → ruscha matn jadvali)
 *
 * ⚠️ NEGA UCHTA LUG'AT FAYLI YO'Q: `uz.ts` lug'atning yagona manbasi
 * (feedback_v2_i18n_central_dictionary) va `i18next.d.ts` `t()` ni aynan o'sha
 * obyekt shakli bo'yicha tiplaydi. Har til uchun shu shaklni qo'lda takrorlash
 * uchta faylni darhol bir-biridan ajratib yuborardi. Buning o'rniga qolgan
 * ikkala til `uz` DARAXTIDAN HOSIL QILINADI: shakl bir xil, kalitlar
 * yo'qolmaydi, tarjimasi yo'q matn o'zbekcha ko'rinadi.
 *
 * ⚠️ NEGA POST-PROTSESSOR EMAS: i18next avval kalitni yechadi, KEYIN
 * `{{count}}` kabi o'rin egallovchilarini almashtiradi va post-protsessorga
 * ALLAQACHON to'ldirilgan matn yetib boradi. U holda "{{count}} ta tanlandi"
 * lug'atda "5 ta tanlandi" bo'lib qidirilar va hech qachon topilmasdi. Resurs
 * daraxti esa interpolatsiyadan OLDIN turadi — o'rin egallovchi joyida qoladi.
 */

export const LANGS = [
  { code: 'uz', label: "O'zbekcha", short: 'UZ' },
  { code: 'uz_cyrl', label: 'Ўзбекча', short: 'ЎЗ' },
  { code: 'ru', label: 'Русский', short: 'RU' },
] as const

export type Lang = (typeof LANGS)[number]['code']

const LANG_KEY = 'lang'

function readSavedLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved && LANGS.some((l) => l.code === saved)) return saved as Lang
  } catch {
    /* private rejim / bloklangan storage — sukut tilga tushamiz */
  }
  return 'uz'
}

/**
 * Ruscha jadval kaliti bir xil ko'rinishga keltiriladi: tutuq belgisining
 * barcha variantlari, "…" va uch nuqta, uzilmas bo'shliq, ortiqcha bo'shliq va
 * katta-kichik harf farqi olib tashlanadi. Aks holda `uz.ts` da "Ro‘yxat" deb
 * yozilgan matn lug'atdagi "Ro'yxat" bilan uchrashmasdi.
 */
function normalizeKey(s: string): string {
  return s
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * BOTH non-default languages are now built ON DEMAND, and this is a load-time
 * fix, not a tidy-up. Previously `ru.ts` (301 KB of source) was a static import
 * and BOTH derived trees were materialised during module init, so every single
 * visitor — including the majority who read Uzbek Latin and need neither —
 * downloaded the Russian table and paid two full recursive walks over a ~240 KB
 * translation tree before the first paint. Uzbek Latin now costs nothing beyond
 * `uz.ts` itself; the other two languages pay their own cost, once, when chosen.
 *
 * `fallbackLng: 'uz'` is what makes this safe: if a bundle has not arrived yet
 * (or its chunk fails to load) the UI renders Uzbek rather than raw key paths.
 */
type Tree = { [k: string]: string | string[] | Tree }

/**
 * Copies the `uz` tree, passing every text leaf through `fn`.
 *
 * ⚠️ AN ARRAY MUST STAY AN ARRAY. This used to walk with `Object.entries`
 * alone, which turned arrays into plain objects (`['a','b']` → `{0:'a',1:'b'}`).
 * `t('date.weekdays', { returnObjects: true })` then returned an OBJECT in
 * Russian and Cyrillic, and every screen that called `.map()` on it CRASHED —
 * the employee card's "Shaxsiy tabel" and "Navbatchilik" tabs went white
 * exactly this way. Uzbek never showed it: there the `uz.ts` object is used
 * as-is.
 */
function mapTree(node: Tree, fn: (s: string) => string): Tree {
  const out: Tree = {}
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') out[k] = fn(v)
    else if (Array.isArray(v)) out[k] = v.map((item) => (typeof item === 'string' ? fn(item) : item))
    else out[k] = mapTree(v as Tree, fn)
  }
  return out
}

/**
 * The Uzbek tree arrives in TWO parts (2026-09-11). `uz.core.ts` — what the
 * login/register/reset screens and the error toasts need — is inlined below
 * and costs nothing to wait for. `uz.rest.ts` (~200 KB, every module's text)
 * is fetched here, at module init, so it travels in PARALLEL with the boot
 * request; `AppShell` waits for it before drawing any page (`useRestReady`).
 * Before the split the whole dictionary sat in the entry chunk — 37% of it —
 * and every visitor parsed all of it before the login screen could paint.
 *
 * The Cyrillic and Russian trees are DERIVED from the full tree, so building
 * them waits for `rest` too.
 */
const coreTree: Tree = mapTree(core as unknown as Tree, normalizeUzApostrophes)
let uzTree: Tree = coreTree
let restLoaded = false
const restListeners = new Set<() => void>()

let restPromise: Promise<void> | null = null

/**
 * Starts fetching the rest of the dictionary — idempotent. Called from the
 * boot path when a token exists (so it travels alongside the boot request),
 * from `useRestReady` (the shell), and from `ensureLanguage` (Cyrillic/Russian
 * need the whole tree). NOT at module init: measured 2026-09-11, the login
 * screen — which needs none of it — was downloading all 166 KB anyway.
 */
export function loadRest(): Promise<void> {
  if (!restPromise) {
    restPromise = import('./uz.rest')
      .then((m) => {
        const rest = mapTree(m.default as unknown as Tree, normalizeUzApostrophes)
        // Deep merge is not needed: core and rest hold DISJOINT top-level namespaces.
        uzTree = { ...uzTree, ...rest }
        i18n.addResourceBundle('uz', 'translation', rest, true, true)
      })
      .catch(() => {
        /* A failed chunk leaves the core keys only; the shell still renders and
           the hook below unblocks so nothing hangs on it. */
      })
      .finally(() => {
        restLoaded = true
        restListeners.forEach((fn) => fn())
        restListeners.clear()
      })
  }
  return restPromise
}

/** `true` once the rest of the Uzbek dictionary is registered (or has failed). */
export function useRestReady(): boolean {
  const [ready, setReady] = useState(restLoaded)
  useEffect(() => {
    if (restLoaded) return
    void loadRest()
    const fn = () => setReady(true)
    restListeners.add(fn)
    return () => {
      restListeners.delete(fn)
    }
  }, [])
  return ready
}

/** Languages whose resource bundle has already been built and registered. */
const loaded = new Set<Lang>(['uz'])

/* ── Tizim lug'ati: administrator tuzatishlari (TZ 4.2.1, ADM-7) ─────────────
 * `GET /i18n/overrides` (ochiq) → `{ru: {uzMatn: ruMatn}, uz_cyrl: {uzMatn: kirill}}`.
 * Tuzatish avtomatik tarjimadan (ru jadvali / transliteratsiya) USTUN turadi.
 * Avval brauzer keshidan darhol qo'llanadi, keyin serverdan yangilanadi —
 * o'zgargan bo'lsa joriy til qayta quriladi. Kalitlar normallashtirib
 * solishtiriladi (tutuq belgisi, bo'shliq, katta-kichik harf). */
type Overrides = { ru: Record<string, string>; uz_cyrl: Record<string, string> }
const OVERRIDES_KEY = 'i18n_overrides'
let overrides: Overrides = { ru: {}, uz_cyrl: {} }
let overridesNorm = { ru: new Map<string, string>(), uz_cyrl: new Map<string, string>() }

function applyOverrides(next: Overrides): void {
  overrides = { ru: next.ru ?? {}, uz_cyrl: next.uz_cyrl ?? {} }
  overridesNorm = {
    ru: new Map(Object.entries(overrides.ru).map(([k, v]) => [normalizeKey(k), v])),
    uz_cyrl: new Map(Object.entries(overrides.uz_cyrl).map(([k, v]) => [normalizeKey(k), v])),
  }
}

try {
  const cached = localStorage.getItem(OVERRIDES_KEY)
  if (cached) applyOverrides(JSON.parse(cached) as Overrides)
} catch {
  /* bloklangan storage — serverdan keladi */
}

const overrideFor = (lang: 'ru' | 'uz_cyrl', text: string): string | undefined =>
  overrides[lang][text] ?? overridesNorm[lang].get(normalizeKey(text))

/** Tuzatishlarni serverdan qayta o'qish (Tizim lug'ati sahifasi saqlagandan keyin ham). */
export async function reloadOverrides(): Promise<void> {
  try {
    const res = await fetch(joinApiUrl('i18n/overrides'), { credentials: 'include' })
    if (!res.ok) return
    const next = (await res.json()) as Overrides
    const before = JSON.stringify(overrides)
    applyOverrides(next)
    try {
      localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides))
    } catch {
      /* ignore */
    }
    if (JSON.stringify(overrides) !== before) await rebuildDerived()
  } catch {
    /* tarmoq xatosi — kesh yoki avtomatik tarjima qoladi */
  }
}

/** Hosil qilingan tillarni (ru, kirill) yangi tuzatishlar bilan qayta qurish. */
async function rebuildDerived(): Promise<void> {
  const current = i18n.language as Lang
  for (const l of ['ru', 'uz_cyrl'] as const) loaded.delete(l)
  if (current !== 'uz') {
    await ensureLanguage(current)
    await i18n.changeLanguage(current)
  }
}

/** O'zbekcha matn barglarining hammasi — `POST /i18n/keys/sync` uchun. */
export async function allUzTexts(): Promise<string[]> {
  await loadRest()
  const out = new Set<string>()
  const walk = (n: Tree) => {
    for (const v of Object.values(n)) {
      if (typeof v === 'string') out.add(v)
      else if (Array.isArray(v)) v.forEach((x) => typeof x === 'string' && out.add(x))
      else walk(v as Tree)
    }
  }
  walk(uzTree)
  return [...out]
}

/** Avtomatik tarjima (tuzatishsiz) — lug'at sahifasi «avto» ustunini ko'rsatadi. */
export async function autoTranslation(lang: 'ru' | 'uz_cyrl', text: string): Promise<string> {
  if (lang === 'uz_cyrl') return toCyrillic(text)
  const ru = (await import('./ru')).default
  // Normalised index built once: a linear scan per key froze the dictionary page.
  autoRuNorm ??= new Map(Object.entries(ru).map(([k, v]) => [normalizeKey(k), v]))
  return ru[text] ?? autoRuNorm.get(normalizeKey(text)) ?? ''
}

let autoRuNorm: Map<string, string> | null = null

/** Normalised «Uzbek text → Russian» table, set once Russian has been loaded. */
let ruByNorm: Map<string, string> | null = null

/**
 * Russian for a fixed Uzbek text that came from the SERVER (a seeded catalogue
 * row, a system role name, a built-in form name…) — the same `ru.ts` table the
 * interface uses. `undefined` when Russian is not loaded or the text is not in
 * the table (user-entered data).
 */
export function ruLookup(text: string | null | undefined): string | undefined {
  if (!text || !ruByNorm) return undefined
  return overrideFor('ru', text) ?? ruByNorm.get(normalizeKey(text))
}

async function ensureLanguage(lang: Lang): Promise<void> {
  if (loaded.has(lang)) return

  // Both derived languages need the WHOLE tree.
  await loadRest()

  if (lang === 'uz_cyrl') {
    const cyr = (text: string): string => overrideFor('uz_cyrl', text) ?? toCyrillic(text)
    i18n.addResourceBundle('uz_cyrl', 'translation', mapTree(uzTree, cyr), true, true)
  } else if (lang === 'ru') {
    const ru = (await import('./ru')).default
    // Normalised lookup, built here rather than at module scope so the map is
    // only ever constructed by a reader who actually asked for Russian.
    const byNorm = new Map<string, string>()
    for (const [k, v] of Object.entries(ru)) {
      const n = normalizeKey(k)
      if (!byNorm.has(n)) byNorm.set(n, v)
    }
    ruByNorm = byNorm
    const translate = (text: string): string =>
      overrideFor('ru', text) ?? ru[text] ?? byNorm.get(normalizeKey(text)) ?? text
    i18n.addResourceBundle('ru', 'translation', mapTree(uzTree, translate), true, true)
  }

  loaded.add(lang)
}

i18n.use(initReactI18next).init({
  // Only the Uzbek CORE is inlined; `restReady` adds the rest of Uzbek and
  // `ensureLanguage` registers the other languages.
  resources: { uz: { translation: coreTree } },
  lng: readSavedLang(),
  fallbackLng: 'uz',
  supportedLngs: LANGS.map((l) => l.code),
  interpolation: { escapeValue: false }, // React o'zi XSS'dan himoya qiladi
  returnNull: false,
})

/**
 * Awaited by `main.tsx` BEFORE the app mounts. Without this gate a Russian
 * reader would get a visible flash of Uzbek on every cold load while the `ru`
 * chunk was still in flight — the one regression this whole change could
 * plausibly introduce. Uzbek Latin resolves immediately, so it costs nothing.
 */
export const i18nReady: Promise<void> = (async () => {
  const saved = readSavedLang()
  await ensureLanguage(saved)
  // `init` above ran with `lng: saved` while only the `uz` bundle existed, so
  // i18next resolved that language against a store that did not hold it yet.
  // Re-setting it after the bundle is registered forces the resolution to be
  // redone; for `uz` it is a no-op.
  if (saved !== 'uz') await i18n.changeLanguage(saved)
})().catch(() => {
  /* A failed chunk is not fatal: `fallbackLng` keeps the UI in Uzbek. */
})

/** Tilni almashtirish (header'dagi til tanlagich shu funksiyani chaqiradi). */
export function setLanguage(lang: Lang): void {
  // Load-then-switch: changing first would paint one frame of fallback Uzbek.
  void ensureLanguage(lang).then(() => i18n.changeLanguage(lang))
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* ignore */
  }
  // Sana/vaqt formatlash uchun — `Intl` shu atributni o'qimaydi, ammo
  // brauzerning o'z boshqaruvlari (sana tanlagich, imlo) o'qiydi.
  document.documentElement.lang = htmlLang(lang)
}

/** BCP 47 tag for `<html lang>`: screen readers and hyphenation need the script. */
export function htmlLang(lang: Lang): string {
  return lang === 'ru' ? 'ru' : lang === 'uz_cyrl' ? 'uz-Cyrl' : 'uz'
}

document.documentElement.lang = htmlLang(readSavedLang())

// Tuzatishlar fonda yangilanadi — UI kesh (yoki avtomatik tarjima) bilan darhol chiziladi.
void reloadOverrides()

export default i18n
