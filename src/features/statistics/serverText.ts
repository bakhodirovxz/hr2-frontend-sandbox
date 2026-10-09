import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toCyrillic } from '@/i18n/translit'

/**
 * SERVER YORLIQLARINI JORIY TILGA O'GIRISH (TZ 2370, TZ 4.1.7).
 *
 * Statistika javobidagi matnlar — hisobot nomlari, ustun sarlavhalari,
 * vidjet/diagramma nomlari, «Erkak», «Ta'til» kabi qator yorliqlari — server
 * tomonidan FAQAT o'zbek lotinida beriladi va kod bo'yicha kalitga
 * bog'lanmagan (katalog kengayadi, yangi hisobot qo'shilsa front o'zgarmaydi).
 * v1 bularni `tt(label)` bilan — o'zbekcha matnning o'zini kalit qilib —
 * o'girardi; bu yerda ham xuddi shu: kirillda transliteratsiya, ruschada
 * `i18n/ru.ts` jadvali (o'sha jadval interfeysniki bilan bitta). Jadvalda yo'q
 * matn (bo'lim, xodim nomi — foydalanuvchi ma'lumoti) o'zgarishsiz qoladi.
 */

/** `i18n/index.ts` dagi normallashtirish bilan bir xil (tutuq, «…», bo'shliq, registr). */
const norm = (s: string) =>
  s
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

let ruTable: Map<string, string> | null = null
let ruLoading: Promise<void> | null = null

function loadRu(): Promise<void> {
  if (!ruLoading) {
    // Rus tili tanlanganda bu modul allaqachon yuklangan (`ensureLanguage`) —
    // import keshdan darhol qaytadi.
    ruLoading = import('@/i18n/ru').then((m) => {
      const map = new Map<string, string>()
      for (const [k, v] of Object.entries(m.default)) {
        const n = norm(k)
        if (!map.has(n)) map.set(n, v)
      }
      ruTable = map
    })
  }
  return ruLoading
}

export function useServerText(): (text: string | null | undefined) => string {
  const { i18n } = useTranslation()
  const lang = i18n.language
  const [ready, setReady] = useState(!!ruTable)
  useEffect(() => {
    if (lang !== 'ru' || ruTable) return
    let alive = true
    void loadRu().then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [lang])
  return useCallback(
    (text) => {
      const s = text == null ? '' : String(text)
      if (!s || lang === 'uz') return s
      if (lang === 'uz_cyrl') return toCyrillic(s)
      return (ready && ruTable?.get(norm(s))) || s
    },
    [lang, ready],
  )
}
