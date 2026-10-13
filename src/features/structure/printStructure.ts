import type { TFunction } from 'i18next'
import { inTashkent } from '@/lib/format'
import { escapeHtml as esc, PRINT_BASE_CSS, printHtml } from '@/lib/printHtml'
import { headNames, type StructureNode } from './StructureViews'

/**
 * TZ S3 1167 «Печать структуры — запускается при нажатии кнопки «Печать».
 * Система формирует печатную форму организационной структуры».
 *
 * Ekranda ko'rsatilgan daraxt (joriy yoki «Sana bo'yicha» holati) bitta A4
 * jadval bo'lib chiqadi: ierarxiya chekinish bilan, kod, rahbar, xodimlar
 * soni va holat (qisqartirilgan bo'lsa — sanasi bilan).
 */
export async function printStructure({
  roots,
  orgName,
  asOf,
  t,
  lang,
}: {
  roots: StructureNode[]
  orgName: string
  /** «Sana bo'yicha» rejimi — shu sanadagi tuzilma. */
  asOf?: string
  t: TFunction
  lang: string
}): Promise<void> {
  const rows: string[] = []
  let total = 0
  const walk = (nodes: StructureNode[], depth: number) => {
    for (const n of nodes) {
      total += 1
      const closed = n.raw.closed_at
      const status = closed
        ? t('structure.print.closed', { date: inTashkent(closed).format('DD.MM.YYYY') })
        : t('structure.print.active')
      const cells = [
        String(rows.length + 1),
        esc(n.code),
        `<span style="padding-left:${depth * 12}pt">${depth ? '— ' : ''}${depth === 0 ? `<b>${esc(n.name)}</b>` : esc(n.name)}</span>`,
        esc(headNames(n).join(', ')),
        n.raw.staff_count != null ? String(n.raw.staff_count) : '',
        esc(status),
      ]
      rows.push(`<tr>${cells.map((c, i) => `<td${i === 4 ? ' class="num"' : ''}>${c}</td>`).join('')}</tr>`)
      walk(n.children, depth + 1)
    }
  }
  walk(roots, 0)

  const head = [
    '№',
    t('structure.print.colCode'),
    t('structure.print.colName'),
    t('structure.print.colHead'),
    t('structure.print.colStaff'),
    t('structure.print.colStatus'),
  ]
  const meta = [
    asOf
      ? t('structure.print.asOfDate', { date: inTashkent(asOf).format('DD.MM.YYYY') })
      : t('structure.print.printedAt', { date: inTashkent().format('DD.MM.YYYY HH:mm') }),
    t('structure.print.total', { count: total }),
  ]
    .map(esc)
    .join(' · ')
  const title = t('structure.print.heading', { name: orgName })

  await printHtml(`<!doctype html><html lang="${esc(lang)}"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${PRINT_BASE_CSS}
  td.num { text-align: right; width: 48pt; }
</style></head><body>
<h1>${esc(title)}</h1>
<p class="meta">${meta}</p>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
</body></html>`)
}
