import { useEffect, useState } from 'react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import core from './uz.core'
import { toCyrillic } from './translit'

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
let uzTree: Tree = core as unknown as Tree
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
        const rest = m.default as unknown as Tree
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

async function ensureLanguage(lang: Lang): Promise<void> {
  if (loaded.has(lang)) return

  // Both derived languages need the WHOLE tree.
  await loadRest()

  if (lang === 'uz_cyrl') {
    i18n.addResourceBundle('uz_cyrl', 'translation', mapTree(uzTree, toCyrillic), true, true)
  } else if (lang === 'ru') {
    const ru = (await import('./ru')).default
    // Normalised lookup, built here rather than at module scope so the map is
    // only ever constructed by a reader who actually asked for Russian.
    const byNorm = new Map<string, string>()
    for (const [k, v] of Object.entries(ru)) {
      const n = normalizeKey(k)
      if (!byNorm.has(n)) byNorm.set(n, v)
    }
    const translate = (text: string): string => ru[text] ?? byNorm.get(normalizeKey(text)) ?? text
    i18n.addResourceBundle('ru', 'translation', mapTree(uzTree, translate), true, true)
  }

  loaded.add(lang)
}

i18n.use(initReactI18next).init({
  // Only the Uzbek CORE is inlined; `restReady` adds the rest of Uzbek and
  // `ensureLanguage` registers the other languages.
  resources: { uz: { translation: core } },
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
  document.documentElement.lang = lang === 'ru' ? 'ru' : 'uz'
}

document.documentElement.lang = readSavedLang() === 'ru' ? 'ru' : 'uz'

export default i18n
