import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Segmented } from '@/components/ui/Segmented'
import { Pagination } from '@/components/data/Pagination'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import dayjs from 'dayjs'
import { inTashkent, numberLocale } from '@/lib/format'
import { CELL_STYLE, SWATCH, reportLabel } from './reportStyles'
import type { CellJson, DrillRef, ReportTableJson, RowJson, SheetJson } from './types'

interface Props {
  table: ReportTableJson
  onDrill?: (ref: DrillRef, label: string) => void
  /** Cap on the scroll area height (sticky header/columns need a scroller). */
  maxHeight?: string
}

function fmtCell(c: CellJson): string {
  const v = c.v
  if (v == null || v === '') return ''
  switch (c.f) {
    case 'date':
      return typeof v === 'string' ? dayjs(v).format('DD.MM.YYYY') : String(v)
    case 'num':
      return typeof v === 'number' ? v.toLocaleString(numberLocale(), { maximumFractionDigits: 2 }) : String(v)
    case 'pct':
      return typeof v === 'number' ? `${v.toLocaleString(numberLocale(), { maximumFractionDigits: 2 })}%` : String(v)
    case 'hhmm':
      // Server already renders clock-style "H.MM"; minutes arrive as a number.
      return typeof v === 'number' ? `${Math.floor(v / 60)}.${String(v % 60).padStart(2, '0')}` : String(v)
    default:
      return String(v)
  }
}

function align(c: CellJson): string {
  if (c.a === 'right') return 'text-right'
  if (c.a === 'left') return 'text-left'
  if (c.a === 'center' || ['int', 'num', 'hhmm', 'pct', 'date', 'time'].includes(c.f ?? '')) return 'text-center'
  return 'text-left'
}

/**
 * Renders one engine sheet: multi-row header with spans, section rows, styled
 * body cells with drill-down, footer totals, a colour legend. The header is
 * sticky; the first `freeze_cols` columns are sticky too, offset by measured
 * width so a wide tabel keeps names in view while days scroll.
 */
/** Dense cells: a tabel has 40+ columns, the app's 32px column gap would triple its width. */
const TH_DENSE = 'px-2 py-2 text-[11.5px] font-semibold text-fg-muted'
const TD_DENSE = 'px-2 py-1.5 text-[12.5px] leading-snug'

/**
 * Header cells are laid out on a grid so a cell in a later header row lands
 * in the right column even when cells above it span several rows — the same
 * bookkeeping the server does when it writes the xlsx.
 */
function layoutHeader(rows: CellJson[][]): { cell: CellJson; col: number }[][] {
  const occupied = new Set<string>()
  return rows.map((cells, ri) => {
    let col = 0
    return cells.map((c) => {
      while (occupied.has(`${ri}:${col}`)) col++
      const start = col
      for (let r = ri; r < ri + (c.rs ?? 1); r++) for (let cc = col; cc < col + (c.cs ?? 1); cc++) occupied.add(`${r}:${cc}`)
      col += c.cs ?? 1
      return { cell: c, col: start }
    })
  })
}

/**
 * Renders one engine sheet: multi-row header with spans, section rows, styled
 * body cells with drill-down, footer totals, a colour legend. The header is
 * sticky; the first `freeze_cols` columns are sticky too, offset by their
 * MEASURED widths so a wide tabel keeps names in view while days scroll.
 */
/**
 * Rows shown per page on screen. A whole-organisation tabel is 2 200 rows ×
 * 46 columns — 100 000 cells — and the browser takes seconds to lay that out;
 * the file exports always carry every row. A page that starts inside a
 * division repeats that division's section row so the context is not lost.
 */
const PAGE_SIZE = 100

function pageRows(rows: RowJson[], page: number, size: number): RowJson[] {
  const body = rows.filter((r) => r.kind !== 'section')
  if (body.length <= size) return rows
  const start = (page - 1) * size
  const end = start + size
  const out: RowJson[] = []
  let seen = 0
  let lastSection: RowJson | null = null
  for (const r of rows) {
    if (r.kind === 'section') { lastSection = r; if (seen >= start && seen < end) out.push(r); continue }
    if (seen >= start && seen < end) {
      if (out.length === 0 && lastSection) out.push(lastSection)
      out.push(r)
    }
    seen += 1
    if (seen >= end) break
  }
  return out
}

function SheetView({ sheet, onDrill, maxHeight }: { sheet: SheetJson; onDrill?: Props['onDrill']; maxHeight?: string }) {
  const { t } = useTranslation()
  const tableRef = useRef<HTMLTableElement>(null)
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZE)
  useEffect(() => { setPage(1) }, [sheet])
  const bodyCount = useMemo(() => sheet.rows.filter((r) => r.kind !== 'section').length, [sheet.rows])
  // Paper gets every row: lift the page size for the duration of the print.
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const on = () => setPrinting(true)
    const off = () => setPrinting(false)
    window.addEventListener('beforeprint', on)
    window.addEventListener('afterprint', off)
    return () => { window.removeEventListener('beforeprint', on); window.removeEventListener('afterprint', off) }
  }, [])
  const pages = Math.max(1, Math.ceil(bodyCount / size))
  const shownRows = useMemo(() => (printing ? sheet.rows : pageRows(sheet.rows, Math.min(page, pages), size)), [sheet.rows, page, pages, size, printing])
  const [offsets, setOffsets] = useState<number[]>([])
  // Frozen columns only make sense when they leave room for the rest: on a
  // phone the five fixed tabel columns would cover the whole viewport and
  // the days could never be reached.
  const [freezeCols, setFreezeCols] = useState(sheet.freeze_cols)
  const headerGrid = useMemo(() => layoutHeader(sheet.header), [sheet.header])
  const colWidths = useMemo(
    () => Array.from({ length: sheet.ncols }, (_, i) => Math.max(36, Math.round((sheet.widths[i] ?? 12) * 7.2 + 16))),
    [sheet.ncols, sheet.widths],
  )
  const totalWidth = useMemo(() => colWidths.reduce((a, b) => a + b, 0), [colWidths])

  useLayoutEffect(() => {
    const table = tableRef.current
    if (!table || !sheet.freeze_cols) { setFreezeCols(0); return }
    const measure = () => {
      const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>('thead tr:first-child th'))
      const wrapW = table.parentElement?.clientWidth ?? 0
      const out: number[] = []
      let acc = 0
      let n = 0
      for (let i = 0; i < sheet.freeze_cols; i++) {
        const w = ths[i]?.getBoundingClientRect().width ?? 0
        // keep freezing while the frozen block stays under half the viewport
        if (wrapW && acc + w > wrapW * 0.5) break
        out.push(acc)
        acc += w
        n += 1
      }
      setOffsets(out)
      setFreezeCols(n)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(table)
    return () => ro.disconnect()
  }, [sheet])

  // Leaf column label per column index (for the drill breadcrumb: "Ayollar · 23").
  const leafLabels = useMemo(() => {
    const out: string[] = Array.from({ length: sheet.ncols }, () => '')
    headerGrid.forEach((cells) => {
      cells.forEach(({ cell, col }) => {
        const label = reportLabel(cell.k, cell.v)
        for (let c = col; c < col + (cell.cs ?? 1); c++) out[c] = label
      })
    })
    return out
  }, [headerGrid, sheet.ncols])
  const stickyStyle = (idx: number) => (idx < freezeCols ? { left: offsets[idx] ?? 0 } : undefined)
  const stickyCls = (idx: number) => (idx < freezeCols ? 'sticky z-[2]' : '')

  // A numeric drill cell reads as "<column> · <value>"; a name cell is the name itself.
  const crumb = (idx: number, text: string): string => {
    const head = leafLabels[idx]
    return /^[\d.,\s%+-]*$/.test(text) && head ? `${head} · ${text}` : text
  }

  const bodyRow = (r: RowJson, ri: number, footer = false) => {
    if (r.kind === 'section') {
      return (
        <tr key={`s${ri}`}>
          <td colSpan={sheet.ncols} className={cn(TD_DENSE, 'border-t border-line/70', CELL_STYLE.section)}>
            {/* sticky INNER element: a cell spanning the full width cannot itself stick */}
            <span className="sticky left-2 inline-block">{String(r.c[0]?.v ?? '')}</span>
          </td>
        </tr>
      )
    }
    let col = 0
    const rowTone = footer ? CELL_STYLE.footer : r.s ? CELL_STYLE[r.s] : ''
    return (
      <tr key={`${footer ? 'f' : 'r'}${ri}`} className={cn('border-t border-line/70', rowTone)}>
        {r.c.map((c, ci) => {
          const idx = col
          col += c.cs ?? 1
          const drillable = !!c.p && !!onDrill
          const text = c.k && (footer || c.v === '' || c.v == null) ? reportLabel(c.k, c.v) : fmtCell(c)
          const tone = c.s ? CELL_STYLE[c.s] : rowTone || 'bg-surface'
          return (
            <td
              key={ci}
              colSpan={c.cs}
              rowSpan={c.rs}
              title={c.t ?? (text.length > 12 ? text : undefined)}
              style={stickyStyle(idx)}
              onClick={drillable ? () => onDrill!(c.p!, crumb(idx, text)) : undefined}
              onKeyDown={drillable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDrill!(c.p!, crumb(idx, text)) } } : undefined}
              role={drillable ? 'button' : undefined}
              tabIndex={drillable ? 0 : undefined}
              className={cn(
                TD_DENSE, 'truncate border-t border-line/70 align-middle',
                align(c), tone, stickyCls(idx),
                drillable && 'cursor-pointer underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
              )}
            >
              {text}
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div>
      <div className="report-scroll scroll-thin overflow-auto rounded-inner border border-line" style={{ maxHeight: maxHeight ?? '70vh' }}>
        <table ref={tableRef} className="border-separate border-spacing-0 text-[13px]" style={{ tableLayout: 'fixed', width: totalWidth }}>
          {/* Server-declared widths (characters, like the xlsx) → fixed layout; auto layout
              let one long department name stretch a column to 700px. */}
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead className="sticky top-0 z-[4]">
            {headerGrid.map((cells, ri) => (
              <tr key={ri}>
                {cells.map(({ cell: c, col: idx }, ci) => (
                  <th
                    key={ci}
                    colSpan={c.cs}
                    rowSpan={c.rs}
                    title={c.t}
                    style={stickyStyle(idx)}
                    className={cn(
                      TH_DENSE, 'border-b border-line bg-surface-2 text-center align-middle',
                      c.s === 'header_danger' && 'text-danger',
                      idx < freezeCols && 'sticky z-[5]',
                    )}
                  >
                    {reportLabel(c.k, c.v)}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {sheet.rows.length === 0 ? (
              <tr>
                <td colSpan={sheet.ncols} className="px-6 py-10 text-center text-sm text-fg-subtle">
                  {t('reports.noData')}
                </td>
              </tr>
            ) : (
              shownRows.map((r, ri) => bodyRow(r, ri))
            )}
          </tbody>
          {sheet.footer.length > 0 && (
            <tfoot className="sticky bottom-0 z-[4]">
              {sheet.footer.map((r, ri) => bodyRow(r, ri, true))}
            </tfoot>
          )}
        </table>
      </div>
      {bodyCount > size && (
        <div className="mt-2">
          <Pagination page={Math.min(page, pages)} size={size} total={bodyCount} pages={pages} onPage={setPage} onSize={(sz) => { setSize(sz); setPage(1) }} />
        </div>
      )}
      {sheet.legend.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-fg-muted">
          {sheet.legend.map((l) => (
            <li key={l.k} className="flex items-center gap-2">
              <span className={cn('inline-block h-3.5 w-3.5 rounded-[4px] ring-1 ring-inset', SWATCH[l.s] ?? 'bg-surface-2 ring-line')} />
              {reportLabel(l.k, l.v)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ReportTableView({ table, onDrill, maxHeight }: Props) {
  const { t } = useTranslation()
  // Multi-sheet reports (e.g. the attendance analysis) switch sheets with tabs
  // instead of stacking four tables — one thing on screen at a time.
  const [sheetIdx, setSheetIdx] = useState(0)
  useEffect(() => { setSheetIdx(0) }, [table])
  const sheets = table.sheets
  const shown = sheets.length > 1 ? [sheets[Math.min(sheetIdx, sheets.length - 1)]] : sheets
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-fg">{reportLabel(table.title_key, table.title)}</h2>
        {table.info.length > 0 && (
          <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-fg-muted">
            {table.info.map((i, idx) => (
              <Fragment key={`${i.k}${idx}`}>
                <div className="flex gap-1.5">
                  <dt className="text-fg-subtle">{reportLabel(i.k, i.k)}:</dt>
                  <dd className="text-fg">{i.v}</dd>
                </div>
              </Fragment>
            ))}
          </dl>
        )}
      </div>
      {sheets.length > 1 && (
        <Segmented
          value={String(sheetIdx)}
          onChange={(v) => setSheetIdx(Number(v))}
          options={sheets.map((s, i) => ({ value: String(i), label: reportLabel(s.name_key, s.name), count: s.rows.filter((r) => r.kind === 'body').length }))}
          size="sm"
        />
      )}
      {shown.map((s) => (
        <div key={s.name}>
          <SheetView sheet={s} onDrill={onDrill} maxHeight={maxHeight} />
        </div>
      ))}
      {(table.signature || table.qr_png_b64) && (
        <div className="flex flex-wrap items-start gap-6 rounded-inner border border-line bg-surface-2 p-4">
          {table.signature && (
            <div className="text-[13px]">
              <p className="text-[11.5px] font-semibold text-fg-subtle">{table.signature.label || t('reports.h.signed_by')}</p>
              <p className="mt-1 font-semibold text-fg">{table.signature.name}</p>
              {table.signature.position && <p className="text-fg-muted">{table.signature.position}</p>}
              {table.signature.at && <p className="tabnum text-fg-subtle">{inTashkent(table.signature.at).format('DD.MM.YYYY HH:mm')}</p>}
            </div>
          )}
          {table.qr_png_b64 && (
            <img src={`data:image/png;base64,${table.qr_png_b64}`} alt="QR" className="h-28 w-28 rounded-[6px] bg-white p-1 ring-1 ring-line" />
          )}
        </div>
      )}
      <p className="text-[11px] text-fg-subtle">
        {t('reports.h.generated_at')}: {inTashkent(table.generated_at).format('DD.MM.YYYY HH:mm')} · {t('reports.rowCount', { count: table.body_rows })}
      </p>
    </div>
  )
}
