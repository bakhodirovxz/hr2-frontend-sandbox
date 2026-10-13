import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import { fetchAllPages } from '@/api/fetchAll'
import { DICTIONARY_ENTRIES } from '@/api/endpoints'
import { localizedName, type DictionaryEntry, type DictionaryType } from './useDictionaries'

const esc = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

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
    t('hrExt.print.asOf', { date: dayjs().format('DD.MM.YYYY HH:mm') }),
    t('hrExt.print.total', { count: rows.length }),
    filters.search ? t('hrExt.print.search', { q: filters.search }) : '',
  ]
    .filter(Boolean)
    .map(esc)
    .join(' · ')

  const html = `<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  body { font-family: 'Times New Roman', serif; color: #000; font-size: 11pt; }
  h1 { font-size: 14pt; text-align: center; margin: 0 0 4pt; }
  p.meta { text-align: center; font-size: 9.5pt; margin: 0 0 10pt; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 0.6pt solid #000; padding: 3pt 5pt; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: bold; }
  td:first-child, th:first-child { width: 28pt; text-align: right; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
</style></head><body>
<h1>${esc(t('hrExt.print.heading', { name: title }))}</h1>
<p class="meta">${meta}</p>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>
</body></html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  frame.style.right = '0'
  frame.style.bottom = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) {
    frame.remove()
    throw new Error('print frame unavailable')
  }
  doc.open()
  doc.write(html)
  doc.close()
  await new Promise((r) => setTimeout(r, 150))
  win.focus()
  win.print()
  // The dialog is modal in most browsers; remove the frame a bit later either way.
  setTimeout(() => frame.remove(), 60_000)
}
