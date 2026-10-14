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
 *
 * ⚠️ The backend has a 1:1 Python port of these rules
 * (`app/core/i18n_server.py::to_cyrillic`) used for exports. Change both together.
 */

// Tutuq belgisining barcha ko'rinishlari (klaviatura, Word, kopi-past).
const APOS = "['‘’ʻʼ`´]"

/**
 * Words that must stay Latin inside Cyrillic text: international acronyms,
 * file formats, key names and product names. Matched as whole tokens. Uzbek
 * abbreviations (STIR, JShShIR, FISH, AJ, KPP, JAMI…) are NOT here on purpose
 * — they are Uzbek words and are written in Cyrillic (СТИР, ЖШШИР, ФИШ…).
 */
const KEEP_TOKENS = new Set([
  'KPI', 'PDF', 'QR', 'JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'SVG', 'DOC', 'DOCX', 'XLS', 'XLSX',
  'CSV', 'JSON', 'XML', 'GPX', 'ZIP', 'TXT', 'MP4', 'MB', 'GB', 'KB', 'TB',
  'API', 'REST', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HTTP', 'HTTPS', 'URL', 'URI', 'SMTP',
  'IMAP', 'DNS', 'SSL', 'TLS', 'VPN', 'IP', 'ID', 'OTP', 'PIN', 'SMS', 'USB', 'CAPTCHA',
  'NVR', 'DVR', 'RFID', 'MAC', 'UTC', 'GMT', 'SHA', 'MD5', 'AES', 'RSA', 'JWT', 'SSO',
  'GPS', 'LMS', 'HR', 'HRM', 'AI', 'PII', 'CRUD', 'UUID', 'OK', 'TAB', 'CHECKPOINT',
  'IMZO', 'E-IMZO', 'ISAPI', 'WORD', 'PC', 'Ctrl', 'Esc', 'Shift', 'Alt', 'Enter',
  'Backspace', 'Tab', 'email', 'e-mail', 'Email', 'E-mail',
])

/**
 * Product names that may carry an Uzbek suffix ("Excelga", "Zoom’da"): the
 * name itself stays Latin, the suffix is transliterated ("Excelга").
 */
const BRANDS = [
  'HikCentral', 'Hikvision', 'OnlyOffice', 'LibreOffice', 'PostgreSQL', 'PowerPoint', 'Excel',
  'Word', 'Zoom', 'OneID', 'MinIO', 'Moodle', 'Redis', 'Telegram', 'Google', 'Android', 'iOS',
  'Wialon', 'Verifix', 'Bearer', 'Face', 'Touch', 'Windows', 'Linux', 'Chrome', 'Firefox',
  'Safari', 'Docker', 'Celery', 'Microsoft', 'Office', 'Gmail', 'Outlook', 'Yandex', 'Swagger',
]
const BRAND_RE = new RegExp(`^(${BRANDS.join('|')})(?=$|[^A-Za-z]|[a-z’'ʼ‘])`)

/** Uzbek abbreviations whose Cyrillic form is not a letter-by-letter copy. */
const ABBR_MAP: Record<string, string> = {
  UGE: 'ЎГЭ', GES: 'ГЭС', IES: 'ИЭС', UzGE: 'ЎзГЭ',
}

/**
 * Russian loanwords whose Cyrillic spelling has ъ/ь that the Latin form drops.
 * Matched case-insensitively at the start of a word; the case of the first
 * letter is preserved.
 */
const STEMS: [RegExp, string][] = [
  [/^obyekt/i, 'объект'],
  [/^subyekt/i, 'субъект'],
  [/^karyer/i, 'карьер'],
  [/^podyezd/i, 'подъезд'],
  [/^inyeksiya/i, 'инъекция'],
]

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
  // "ts" is "ц" only in Russian loanwords (-tsiya, -tsion, -tsent, matritsa,
  // litsenziya…). Everywhere else it is a morpheme boundary: Muddat+siz,
  // ket+sa, Shtat+siz must stay "тс" ("Муддатсиз", not "Муддациз").
  [/([Tt])s(?=iz)/g, '$1\u0000'],
  [/^Ts/g, 'Ц'], [/^TS/g, 'Ц'], [/^ts/g, 'ц'],
  [/ts(?=[ie])/g, 'ц'], [/TS(?=[IE])/g, 'Ц'],
  [/matrits/g, 'матриц'], [/Matrits/g, 'Матриц'],
  [/\u0000/g, 's'],
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
// "e" after a/o/u is "э" in loanwords: koeffitsient → коэффициент,
// gidroenergetika → гидроэнергетика, aeroport → аэропорт.
const VOWEL_E = /([aouAOU])e/g
const VOWEL_UPPER_E = /([AOU])E/g

// Qolgan tutuq belgisi → ayirish belgisi ("ъ").
const REMAINING_APOS = new RegExp(APOS, 'g')

function convertWord(text: string): string {
  let out = text

  // 0) Loanword stems with a hard/soft sign.
  for (const [re, to] of STEMS) {
    out = out.replace(re, (m) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to))
  }

  // 1) So'z boshidagi E/e — birikmalardan OLDIN (Ye/Yo hali tegilmagan).
  out = out.replace(WORD_START_E, (_m, p1: string) => `${p1}Э`)
  out = out.replace(WORD_START_LOWER_E, (_m, p1: string) => `${p1}э`)
  out = out.replace(VOWEL_E, '$1э').replace(VOWEL_UPPER_E, '$1Э')

  // 2) Uzun birikmalar.
  for (const [re, to] of DIGRAPHS) out = out.replace(re, to)

  // 3) Yakka harflar.
  out = out.replace(/[A-Za-z]/g, (ch) => SINGLES[ch] ?? ch)

  // 4) Qolgan tutuq — "ъ".
  out = out.replace(REMAINING_APOS, 'ъ')

  return out
}

/** A token that is clearly not Uzbek: c without h, w, camelCase, or a path. */
function isForeign(word: string): boolean {
  if (/[cC](?![hH])|[wW]/.test(word)) return true
  // camelCase product/identifier names (HikCentral, OneID, doorIndexCode), but
  // NOT Uzbek mixed-case abbreviations (JShShIR, MChJ, YaIT, ShJPHR).
  if (/[a-z]{2,}[A-Z]/.test(word)) return true
  return false
}

const SUFFIX_APOS = new RegExp(`^([A-Za-z0-9]*[A-FH-NP-Z0-9])(${APOS})([a-z]+)$`)

function convertToken(word: string): string {
  if (!/[A-Za-z]/.test(word)) return word
  if (KEEP_TOKENS.has(word)) return word
  if (ABBR_MAP[word]) return ABBR_MAP[word]
  // "E-IMZO" → keep, "QR-kod" → "QR-код", "5-son" → "5-сон": hyphen parts.
  if (word.includes('-')) {
    return word
      .split('-')
      .map((p) => convertToken(p))
      .join('-')
  }
  // Codes like "AA1234567", "E1", "F1" stay as they are.
  if (/\d/.test(word)) return word
  const brand = BRAND_RE.exec(word)
  if (brand) {
    const rest = word.slice(brand[1].length)
    // "Zoom’da" → "Zoom’да": the apostrophe after a Latin name stays.
    const apos = new RegExp(`^${APOS}`).exec(rest)
    return brand[1] + (apos ? apos[0] + convertWord(rest.slice(1)) : convertWord(rest))
  }
  // "API’si", "STIR’i": an acronym followed by a suffix.
  const sfx = SUFFIX_APOS.exec(word)
  if (sfx && sfx[1].length >= 2 && sfx[1] === sfx[1].toUpperCase()) {
    return convertToken(sfx[1]) + sfx[2] + convertWord(sfx[3])
  }
  if (isForeign(word)) return word
  return convertWord(word)
}

// A "word" is a run of letters/digits with in-word apostrophes and hyphens
// (and the trailing apostrophe of a final o‘/g‘: "tog‘").
const WORD_RE = new RegExp(
  `[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])|${APOS}(?=[A-Za-z])|(?<=[OoGg])${APOS})*`,
  'g',
)

function convertChunk(text: string): string {
  // A single key letter after "+" (Ctrl+V) is a key name and stays Latin.
  return text.replace(WORD_RE, (w: string, offset: number) =>
    w.length === 1 && text[offset - 1] === '+' ? w : convertToken(w),
  )
}

/**
 * Matnni kirillga o'giradi. `{{…}}` o'rin egallovchilari, HTML teglari,
 * URL/yo'llar va qisqartmalar/brendlar TEGILMAYDI — aks holda i18next
 * interpolatsiyasi buzilar va "QR" o'qib bo'lmas holga kelardi.
 */
export function toCyrillic(text: string): string {
  if (!text || typeof text !== 'string') return text
  return text
    .split(/(\{\{[^}]*\}\}|<[^>]+>|https?:\/\/\S+|(?<![\p{L}\p{N}])\/[\w\-/{}.:]+|[\w.+-]+@[\w-]+\.[\w.]+)/gu)
    .map((part, i) => (i % 2 === 1 ? part : convertChunk(part)))
    .join('')
}

/* ── Kirill → lotin (qidiruv uchun) ─────────────────────────────────────── */

const CYR_TO_LAT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: "'", ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: "o'", қ: 'q', ғ: "g'", ҳ: 'h',
}

/**
 * Uzbek Cyrillic → Latin. Used by search boxes: the data is stored in Latin,
 * so a reader typing «Андижон» in Cyrillic mode must still find "Andijon".
 * Russian-only letters are mapped to their closest Latin spelling.
 */
export function toLatin(text: string): string {
  if (!text) return text
  let out = ''
  const chars = [...text]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const lower = ch.toLowerCase()
    let lat = CYR_TO_LAT[lower]
    if (lat === undefined) {
      out += ch
      continue
    }
    // "е" at the start of a word is "ye" (ер → yer).
    if (lower === 'е' && (i === 0 || !/\p{L}/u.test(chars[i - 1]))) lat = 'ye'
    if (ch !== lower && lat) lat = lat[0].toUpperCase() + lat.slice(1)
    out += lat
  }
  return out
}

/** True when the text contains Cyrillic letters. */
export function hasCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text)
}

/** Normalises a search query: Cyrillic input is converted to Latin. */
export function searchQuery(text: string): string {
  return hasCyrillic(text) ? toLatin(text) : text
}

/** Script- and apostrophe-insensitive lower-case form used for matching. */
export function foldForSearch(text: string): string {
  return toLatin(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʻʼ`´′]/g, "'")
}

/**
 * Client-side substring match that ignores the script: «Андижон» finds
 * "Andijon" and vice versa. Every in-memory list filter goes through this so
 * a Cyrillic-mode reader is not left with an empty list.
 */
export function textMatches(haystack: string | null | undefined, needle: string): boolean {
  if (!needle) return true
  return foldForSearch(haystack ?? '').includes(foldForSearch(needle.trim()))
}

/**
 * One apostrophe style for displayed Uzbek Latin (TZ 4.1.7 consistency):
 * o‘ / g‘ with U+2018 and the tutuq belgisi with U+2019, as most of `uz.ts`
 * already writes them. Server data and older dictionary lines mixed in the
 * straight `'`, so one screen showed «Bo'lim» next to «Bo‘lim».
 */
export function normalizeUzApostrophes(text: string): string {
  if (!text || typeof text !== 'string' || !/['`ʻʼ‘’]/.test(text)) return text
  return text
    .replace(/([OoGg])['`ʻʼ’‘](?=\p{L})/gu, '$1‘')
    .replace(/(?<=\p{L})['`ʻʼ‘](?=\p{L})/gu, '’')
}
