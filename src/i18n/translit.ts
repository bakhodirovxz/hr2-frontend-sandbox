/**
 * O'zbek LOTIN → KIRILL translitatsiyasi (TZ 4.1.7 / 4.3.3.2).
 *
 * NEGA TRANSLITERATSIYA, LUG'AT EMAS: TZ interfeysni uch ko'rinishda talab
 * qiladi — o'zbek lotin, o'zbek kirill va rus. Lotin↔kirill o'zgarishi
 * QOIDAGA bo'ysunadi (bir xil til, boshqa alifbo), shuning uchun kirill uchun
 * alohida lug'at yuritish `uz.ts` dagi ~2000 satrni IKKI marta qo'lda tarjima
 * qilish degani bo'lardi va ular darhol bir-biridan ajralib ketardi.
 * Rus tili esa haqiqiy tarjima — u lug'atda (`ru.ts`).
 *
 * Qoidalar TARTIBI MUHIM: uzun birikmalar oldin (o'/g'/sh/ch/ya…), aks holda
 * "sh" → "сҳ" bo'lib ketardi.
 */

// Tutuq belgisining barcha ko'rinishlari (klaviatura, Word, kopi-past).
const APOS = "['‘’ʻʼ`´]"

const DIGRAPHS: [RegExp, string][] = [
  [new RegExp(`O${APOS}`, 'g'), 'Ў'],
  [new RegExp(`o${APOS}`, 'g'), 'ў'],
  [new RegExp(`G${APOS}`, 'g'), 'Ғ'],
  [new RegExp(`g${APOS}`, 'g'), 'ғ'],
  [/Sh/g, 'Ш'], [/SH/g, 'Ш'], [/sh/g, 'ш'],
  [/Ch/g, 'Ч'], [/CH/g, 'Ч'], [/ch/g, 'ч'],
  [/Ya/g, 'Я'], [/YA/g, 'Я'], [/ya/g, 'я'],
  [/Yo/g, 'Ё'], [/YO/g, 'Ё'], [/yo/g, 'ё'],
  [/Yu/g, 'Ю'], [/YU/g, 'Ю'], [/yu/g, 'ю'],
  [/Ye/g, 'Е'], [/YE/g, 'Е'], [/ye/g, 'е'],
  [/Ts/g, 'Ц'], [/ts/g, 'ц'],
]

const SINGLES: Record<string, string> = {
  a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и',
  j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р',
  s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
  A: 'А', B: 'Б', C: 'Ц', D: 'Д', E: 'Е', F: 'Ф', G: 'Г', H: 'Ҳ', I: 'И',
  J: 'Ж', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О', P: 'П', Q: 'Қ', R: 'Р',
  S: 'С', T: 'Т', U: 'У', V: 'В', W: 'В', X: 'Х', Y: 'Й', Z: 'З',
}

// So'z boshidagi "e" → "э" ("e'lon" → "эълон"), so'z ichida "е".
const WORD_START_E = /(^|[^\p{L}\p{N}])E/gu
const WORD_START_LOWER_E = /(^|[^\p{L}\p{N}])e/gu

// Qolgan tutuq belgisi → ayirish belgisi ("ъ").
const REMAINING_APOS = new RegExp(APOS, 'g')

function convertChunk(text: string): string {
  let out = text

  // 1) So'z boshidagi E/e — birikmalardan OLDIN (Ye/Yo hali tegilmagan).
  out = out.replace(WORD_START_E, (_m, p1: string) => `${p1}Э`)
  out = out.replace(WORD_START_LOWER_E, (_m, p1: string) => `${p1}э`)

  // 2) Uzun birikmalar.
  for (const [re, to] of DIGRAPHS) out = out.replace(re, to)

  // 3) Yakka harflar.
  out = out.replace(/[A-Za-z]/g, (ch) => SINGLES[ch] ?? ch)

  // 4) Qolgan tutuq — "ъ".
  out = out.replace(REMAINING_APOS, 'ъ')

  return out
}

// Qisqartmalar LOTINCHA qoladi: "QR-kod" → "QR-код" (ҚР EMAS), shuningdek
// KPI, HR, PDF, XML, SMS, ID… Faqat 2–4 belgili TO'LIQ bosh harfli tokenlar —
// uzun bosh harfli matn (masalan bayram sarlavhasi) o'giriladi.
const ABBR = /\b[A-Z][A-Z0-9]{1,3}\b/

/**
 * Matnni kirillga o'giradi. `{{…}}` o'rin egallovchilari, HTML teglari va
 * qisqartmalar TEGILMAYDI — aks holda i18next interpolatsiyasi buzilar va
 * "QR" o'qib bo'lmas holga kelardi.
 */
export function toCyrillic(text: string): string {
  if (!text || typeof text !== 'string') return text
  return text
    .split(/(\{\{[^}]*\}\}|<[^>]+>|\b[A-Z][A-Z0-9]{1,3}\b)/g)
    .map((part) => {
      if (!part) return part
      if (part.startsWith('{{') || part.startsWith('<')) return part
      if (ABBR.test(part) && part === part.toUpperCase()) return part
      return convertChunk(part)
    })
    .join('')
}

