import { inTashkent } from '@/lib/format'
import type { TFunction } from 'i18next'
import { fetchAllPages } from '@/api/fetchAll'
import { DICTIONARY_ENTRIES } from '@/api/endpoints'
import { escapeHtml as esc, PRINT_BASE_CSS, printHtml } from '@/lib/printHtml'
import { localizedName, type DictionaryEntry, type DictionaryType } from './useDictionaries'


/**
 * TZ D2 1583 «Печать справочника — запускается при нажатии кнопки «Печать».
 * Система формирует печатную форму справочника».
 *
 * The print form: every entry matching the filters on screen (not only the
 * visible page) as one A4 table — number, code, both names, parent, status —
 * under the dictionary's name and the date, handed to the browser's print
 * dialog from a hidden frame (no pop-up window to be blocked).
 */
export async function printDictionary({
  type,
  filters,
  t,
  lang,
}: {
  type: DictionaryType
  filters: { search?: string; parentId?: string; status?: string }
  t: TFunction
  lang: string
}): Promise<void> {
  const rows = await fetchAllPages<DictionaryEntry>(DICTIONARY_ENTRIES(type.code), {
    search: filters.search || undefined,
    parent_id: filters.parentId || undefined,
    is_active: filters.status ? filters.status === 'active' : undefined,
  })
  const hierarchical = !!type.parent_type_code || rows.some((r) => r.parent_name)
  const title = localizedName(type, lang)
  const head = [
    '№',
    t('dictionaries.colCode'),
    t('orgRef.nameUz'),
    t('orgRef.nameRu'),
    ...(hierarchical ? [t('dictionaries.colParent')] : []),
    t('dictionaries.colStatus'),
  ]
  const body = rows
    .map((r, i) =>
      [
        i + 1,
        r.code,
        r.name,
        r.name_ru ?? '',
        ...(hierarchical ? [r.parent_name ?? ''] : []),
        r.is_active ? t('dictionaries.active') : t('dictionaries.inactive'),
      ]
        .map((c) => `<td>${esc(c)}</td>`)
        .join(''),
    )
    .map((tr) => `<tr>${tr}</tr>`)
    .join('')
  const meta = [
    t('hrExt.print.asOf', { date: inTashkent().format('DD.MM.YYYY HH:mm') }),
    t('hrExt.print.total', { count: rows.length }),
    filters.search ? t('hrExt.print.search', { q: filters.search }) : '',
  ]
    .filter(Boolean)
    .map(esc)
    .join(' · ')

  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${PRINT_BASE_CSS}</style></head><body>
<h1>${esc(t('hrExt.print.heading', { name: title }))}</h1>
<p class="meta">${meta}</p>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
</body></html>`

  await printHtml(html)
}
