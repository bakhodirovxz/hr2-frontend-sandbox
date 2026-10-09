/**
 * Text → a form two spellings of the same word share, for CLIENT-SIDE list
 * filtering. The server search already folds (core/search, translit.py); the
 * pickers that filter a loaded list did a plain `toLowerCase().includes`, so
 * «нийоз» found nobody in a list of Latin names, and «o‘g‘li» (U+2018) missed
 * «o'g'li» (ASCII). Folding: lower case, Uzbek Cyrillic → Latin, every
 * apostrophe-like mark dropped.
 */
const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
}

const APOSTROPHES = /['`‘’ʻʼ´]/g

export function searchFold(text: string): string {
  const lower = text.toLowerCase().replace(APOSTROPHES, '')
  let out = ''
  for (const ch of lower) out += CYR[ch] ?? ch
  return out
}

/** Does `haystack` contain `query`, both folded? `query` may be pre-folded. */
export function foldIncludes(haystack: string, foldedQuery: string): boolean {
  return searchFold(haystack).includes(foldedQuery)
}
