import { useMemo, type ReactNode, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, RotateCcw, Settings2 } from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { Checkbox } from '@/components/ui/Checkbox'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { errorMessage } from '@/api/errorMessage'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { TD, TD_COMPACT, TH } from './tableStyles'
import { useTableSettings } from './useTableSettings'

export interface Column<T> {
  key: string
  header: ReactNode
  /** Cell renderer. */
  cell: (row: T, index: number) => ReactNode
  className?: string
  headerClassName?: string
  /** Skeleton width while loading. */
  skeleton?: string
  /**
   * Saralanadigan ustun. Qiymatni qaytaring — jadval o'zi tartiblaydi.
   *
   * ⚠️ TZ 4.2.10 «сортировки по возрастанию и убыванию по ЛЮБОМУ столбцу» va
   * 4.2.11 «сортировка по любому столбцу» aynan shuni talab qiladi. Ilgari
   * saralash faqat Hisobotlar sahifasida, o'z qo'lida yozilgan edi — qolgan
   * jadvallar umuman saralanmasdi.
   */
  sortValue?: (row: T) => string | number | null | undefined
  /** Name in the column picker when `header` is not plain text. */
  label?: string
  /**
   * An «extra» column: off until the user switches it on in the column
   * picker (Verifix `extra-columns`). Only meaningful with `tableId`.
   */
  defaultHidden?: boolean
  /** The picker cannot hide it (the first column never can). */
  lockVisible?: boolean
  /**
   * With the table's `rowHref`: this cell is wrapped in a real link, so the
   * right-click menu offers «Open in new tab». Only for a cell with no
   * control of its own (a link inside a link is invalid).
   */
  rowLink?: boolean
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

interface DataTableProps<T extends { id: number }> {
  rows: T[]
  columns: Column<T>[]
  loading?: boolean
  /**
   * The list query's error, passed straight through from `useQuery`.
   *
   * ⚠️ WITHOUT THIS EVERY FAILURE LOOKED LIKE AN EMPTY LIST. A failed query
   * leaves `rows` at `[]`, which fell into the empty state below — so a 403, a
   * 500 or a dropped connection all rendered the same reassuring "nothing here
   * yet" as a genuinely empty register, with nothing to retry and nothing for
   * support to go on. The table now says what went wrong, in the server's own
   * words, and offers the query's `refetch`.
   */
  error?: unknown
  /** Typically the query's own `refetch`. Omit to render the message alone. */
  onRetry?: () => void
  /** Row selection — omit to render a plain table. */
  selection?: {
    isSelected: (id: number) => boolean
    toggle: (id: number) => void
    toggleAllOnPage: () => void
    allOnPageSelected: boolean
    someOnPageSelected: boolean
    /** A row that cannot take the bulk action shows a DISABLED box instead of
     *  one that silently ignores the click (a cancelled phone mark, say). */
    canSelect?: (id: number) => boolean
  }
  onRowClick?: (row: T) => void
  /**
   * The page a row opens. Makes the row behave like a link (2026-09-26):
   * a plain click navigates (or runs `onRowClick` when given), Ctrl/⌘+click
   * and the middle button open it in a new tab, and the `rowLink` column is a
   * real <a> for the right-click menu. Rows used to call navigate() only, so
   * nothing could be opened in a new tab.
   */
  rowHref?: (row: T) => string
  emptyTitle: string
  emptyDescription?: string
  /**
   * True while a search/filter is active. The empty state then says "no
   * results for these filters" instead of the page's own "nothing here yet"
   * copy — the two situations call for different next steps.
   */
  filtered?: boolean
  /** Rendered under the empty-state text (typically a `FilterReset`). */
  emptyAction?: ReactNode
  /**
   * Rows rendered as skeletons while loading. Defaults to the number of rows
   * the table showed last time, and to a full page (25) before that: eight
   * short placeholder rows swapped for 25 real ones pushed the pagination
   * footer ~1 000 px down — CLS 0.64 on /foydalanuvchilar, 0.48 on /shtat
   * (measured 2026-09-18). Pass a number for lists known to be short.
   */
  skeletonRows?: number
  minWidth?: number
  /** Row height. Default `comfortable`; use `compact` for very long lists. */
  density?: 'comfortable' | 'compact'
  /** Joriy saralash va uni o'zgartirish. Berilmasa — saralash o'chiq. */
  sort?: SortState | null
  onSort?: (next: SortState) => void
  /**
   * Stable id of this table (e.g. `employees`). Turns on the user's own
   * layout — column picker, drag-to-resize, saved per user on the server —
   * the Verifix grid feature the client's staff actually used. Omit to keep
   * the fixed layout.
   */
  tableId?: string
  /** Extra classes for one row — e.g. the rows that wait for this user. */
  rowClassName?: (row: T) => string | undefined
}

/** One server page (`useListParams` DEFAULT_PAGE_SIZE) — the first-load skeleton height. */
const DEFAULT_SKELETON_ROWS = 25

/**
 * Shared list table: selection column, loading skeletons, empty state and
 * consistent styling. Every list screen uses this rather than hand-rolling a
 * <table>, so behaviour and a11y stay identical across the app.
 */
export function DataTable<T extends { id: number }>({
  rows,
  columns,
  loading = false,
  error,
  onRetry,
  selection,
  onRowClick: onRowClickProp,
  rowClassName,
  rowHref,
  emptyTitle,
  emptyDescription,
  filtered = false,
  emptyAction,
  skeletonRows,
  minWidth = 900,
  density = 'comfortable',
  sort = null,
  onSort,
  tableId,
}: DataTableProps<T>) {
  const navigate = useNavigate()
  const onRowClick: ((row: T) => void) | undefined =
    onRowClickProp ?? (rowHref ? (row: T) => navigate(rowHref(row)) : undefined)
  const openInNewTab = (row: T) => {
    if (rowHref) window.open(rowHref(row), '_blank', 'noopener')
  }
  const { t } = useTranslation()
  const { settings, update, reset, isCustom, enabled: customizable } = useTableSettings(tableId)
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerAnchor = useRef<HTMLButtonElement | null>(null)
  // Width while a header edge is being dragged (saved on release).
  const [dragWidth, setDragWidth] = useState<{ key: string; w: number } | null>(null)

  // A column without a name (row actions) is structure, not data: never
  // offered in the picker, never hidden.
  const isUnnamed = (c: Column<T>) => !c.label && (c.header == null || c.header === '')
  const isVisible = (c: Column<T>, i: number) => {
    if (!customizable) return !c.defaultHidden
    if (i === 0 || c.lockVisible || isUnnamed(c)) return true
    return c.defaultHidden ? settings.shown.includes(c.key) : !settings.hidden.includes(c.key)
  }
  const visible = customizable ? columns.filter(isVisible) : columns.filter((c) => !c.defaultHidden)
  const widthOf = (key: string) =>
    dragWidth?.key === key ? dragWidth.w : customizable ? settings.widths[key] : undefined
  const colCount = visible.length + (selection ? 1 : 0) + (customizable ? 1 : 0)

  const toggleColumn = (c: Column<T>) =>
    update((prev) => {
      if (c.defaultHidden) {
        const shown = prev.shown.includes(c.key) ? prev.shown.filter((k) => k !== c.key) : [...prev.shown, c.key]
        return { ...prev, shown }
      }
      const hidden = prev.hidden.includes(c.key) ? prev.hidden.filter((k) => k !== c.key) : [...prev.hidden, c.key]
      return { ...prev, hidden }
    })

  const startResize = (e: React.PointerEvent, key: string) => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement
    const startX = e.clientX
    const startW = th.getBoundingClientRect().width
    let last = startW
    const move = (ev: PointerEvent) => {
      last = Math.max(60, Math.min(800, Math.round(startW + ev.clientX - startX)))
      setDragWidth({ key, w: last })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDragWidth(null)
      update((prev) => ({ ...prev, widths: { ...prev.widths, [key]: last } }))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const labelOf = (c: Column<T>) => c.label ?? (typeof c.header === 'string' ? c.header : c.key)

  // Remember how tall the last real page was so the next skeleton reserves the
  // same space (see `skeletonRows`).
  const lastRowCount = useRef<number | null>(null)
  if (!loading && rows.length > 0) lastRowCount.current = rows.length
  const skeletonCount = skeletonRows ?? lastRowCount.current ?? DEFAULT_SKELETON_ROWS

  /** Saralash — SAHIFADAGI qatorlar ustida (server tartibini buzmaydi). */
  /**
   * ⚠️ `columns` IS DELIBERATELY NOT A DEPENDENCY. 24 of the 26 call sites build
   * the column array inline, so its identity changes on EVERY parent render —
   * which meant this memo never hit once and a 100-row `localeCompare` sort
   * re-ran on every keystroke in the page's search box. What the sort actually
   * depends on is the column's `sortValue`, and the only thing that can change
   * which column that is, is `sort.key`. Looking the column up inside the memo
   * therefore reads a fresh `columns` without re-running on its identity.
   */
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const sortedRows = useMemo(() => {
    if (!sort || !onSort) return rows
    const col = columnsRef.current.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = col.sortValue!(a)
      const y = col.sortValue!(b)
      if (x == null && y == null) return 0
      if (x == null) return 1
      if (y == null) return -1
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir
      return String(x).localeCompare(String(y), 'uz') * dir
    })
  }, [rows, sort, onSort])

  // Density comes from ONE place (tableStyles) so a hand-rolled table on some
  // other screen and this one can never drift apart again.
  const cell = density === 'compact' ? TD_COMPACT : TD

  return (
    // Capped at the screen height so the header row is ALWAYS sticky: on a
    // page whose card was not height-bound (most of them) the box grew with
    // its rows, the page scrolled instead, and the header scrolled away with
    // it. Full-height layouts (flex-1 min-h-0) are bounded before the cap.
    <div className="scroll-thin min-h-0 max-h-[calc(100dvh-9rem)] flex-1 overflow-auto">
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgb(var(--border))]">
          <tr className="border-b border-line text-[12px] font-semibold text-fg-muted">
            {selection && (
              <th scope="col" className="w-12 py-4 pl-6 pr-2">
                <Checkbox
                  checked={selection.allOnPageSelected}
                  indeterminate={selection.someOnPageSelected}
                  onChange={selection.toggleAllOnPage}
                  disabled={rows.length === 0}
                  srLabel={t('list.selectAllOnPage')}
                />
              </th>
            )}
            {visible.map((c, i) => {
              const sortable = !!c.sortValue && !!onSort
              const active = sort?.key === c.key
              const w = widthOf(c.key)
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(TH, selection && i === 0 && 'first:pl-0', customizable && 'relative', c.headerClassName)}
                  style={w ? { width: w, minWidth: w, maxWidth: w } : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() =>
                        onSort!({ key: c.key, dir: active && sort!.dir === 'asc' ? 'desc' : 'asc' })
                      }
                      className={cn(
                        // ⚠️ `min-h-icon-xs`: sarlavha tugmasi matn balandligida
                        // (≈17px) edi — barmoq uchun kichik. Token sensorli
                        // qurilmada 28→36px ga o'sadi (theme.css), `th` ning
                        // ichki bo'shlig'i buni yutadi, ya'ni jadval ko'rinishi
                        // o'zgarmaydi.
                        'inline-flex min-h-icon-xs items-center gap-1 transition-colors hover:text-fg',
                        active && 'text-fg',
                      )}
                    >
                      {c.header}
                      {active ? (
                        sort!.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                      ) : (
                        <ArrowUpDown size={12} className="opacity-40" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                  {customizable && (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={t('list.columnsResize')}
                      title={t('list.columnsResize')}
                      onPointerDown={(e) => startResize(e, c.key)}
                      onDoubleClick={() =>
                        update((prev) => {
                          const widths = { ...prev.widths }
                          delete widths[c.key]
                          return { ...prev, widths }
                        })
                      }
                      className="absolute inset-y-2 right-0 w-2 cursor-col-resize touch-none border-r-2 border-transparent hover:border-brand/60"
                    />
                  )}
                </th>
              )
            })}
            {customizable && (
              <th scope="col" className="sticky right-0 w-12 bg-surface py-2 pr-3 text-right">
                <button
                  ref={pickerAnchor}
                  type="button"
                  onClick={() => setPickerOpen((o) => !o)}
                  aria-label={t('list.columnsButton')}
                  title={t('list.columnsButton')}
                  aria-expanded={pickerOpen}
                  className={cn(
                    'inline-grid h-8 w-8 place-items-center rounded-[var(--r-xs)] text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg',
                    isCustom && 'text-brand',
                  )}
                >
                  <Settings2 size={16} />
                </button>
                <AnchoredPanel
                  anchorRef={pickerAnchor}
                  open={pickerOpen}
                  onClose={() => setPickerOpen(false)}
                  width={280}
                  align="end"
                  label={t('list.columnsTitle')}
                  role="dialog"
                >
                  <div className="p-3 text-left normal-case tracking-normal">
                    <p className="mb-2 text-[12px] font-semibold text-fg">{t('list.columnsTitle')}</p>
                    <ul className="max-h-80 space-y-0.5 overflow-auto">
                      {columns.map((c, i) => {
                        if (isUnnamed(c)) return null
                        const locked = i === 0 || !!c.lockVisible
                        return (
                          <li key={c.key}>
                            <label className={cn('flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[13px] font-normal text-fg hover:bg-surface-2', locked && 'cursor-default opacity-60')}>
                              <Checkbox checked={isVisible(c, i)} disabled={locked} onChange={() => toggleColumn(c)} srLabel={labelOf(c)} />
                              <span className="min-w-0 flex-1 truncate">{labelOf(c)}</span>
                              {c.defaultHidden && <span className="text-[10.5px] text-fg-subtle">{t('list.columnExtra')}</span>}
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                    <p className="mt-2 text-[11px] leading-snug text-fg-subtle">{t('list.columnsHint')}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2 w-full"
                      leftIcon={<RotateCcw size={13} />}
                      disabled={!isCustom}
                      onClick={() => {
                        reset()
                        setPickerOpen(false)
                      }}
                    >
                      {t('list.columnsReset')}
                    </Button>
                  </div>
                </AnchoredPanel>
              </th>
            )}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            Array.from({ length: skeletonCount }).map((_, i) => (
              <tr key={i} className="border-b border-line">
                {selection && (
                  <td className="py-4 pl-6 pr-2">
                    <Skeleton className="h-4 w-4 rounded-sm" />
                  </td>
                )}
                {visible.map((c, ci) => (
                  <td key={c.key} className={cn(cell, selection && ci === 0 && 'first:pl-0')}>
                    <Skeleton className={cn(density === 'compact' ? 'h-4' : 'h-[22px]', c.skeleton ?? 'w-28')} />
                  </td>
                ))}
                {customizable && <td />}
              </tr>
            ))
          ) : error ? (
            <tr>
              <td colSpan={colCount}>
                <EmptyState
                  icon={<AlertTriangle size={22} className="text-danger" />}
                  title={t('list.loadFailed')}
                  description={errorMessage(error, t('list.loadFailedHint'))}
                  action={
                    onRetry ? (
                      <Button variant="secondary" onClick={onRetry}>
                        {t('common.retry')}
                      </Button>
                    ) : undefined
                  }
                />
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colCount}>
                <EmptyState
                  title={filtered ? t('list.noResultsFiltered') : emptyTitle}
                  description={filtered ? t('list.noResultsFilteredHint') : emptyDescription}
                  action={emptyAction}
                />
              </td>
            </tr>
          ) : (
            sortedRows.map((row, i) => {
              const isSelected = selection?.isSelected(row.id) ?? false
              return (
                <tr
                  key={row.id}
                  onClick={
                    onRowClick
                      ? (e) => {
                          // A click on a control INSIDE the row (edit/delete
                          // icon, role select, name link, status menu) belongs
                          // to that control. Without this guard the row action
                          // fired as well — a delete icon also opened the edit
                          // dialog behind its confirmation. Text being selected
                          // (copying a name or number) is not a click either.
                          const control = (e.target as HTMLElement).closest(
                            'button, a, input, select, textarea, label, [role=menuitem], [role=listbox], [data-no-row-click]',
                          )
                          if (control && e.currentTarget.contains(control)) return
                          if (window.getSelection()?.toString()) return
                          if (rowHref && (e.ctrlKey || e.metaKey || e.shiftKey)) return openInNewTab(row)
                          onRowClick(row)
                        }
                      : undefined
                  }
                  // Middle button = new tab, like any link. (The mousedown default
                  // is the autoscroll cursor — suppressed on a linked row.)
                  onMouseDown={rowHref ? (e) => { if (e.button === 1) e.preventDefault() } : undefined}
                  onAuxClick={
                    rowHref
                      ? (e) => {
                          if (e.button !== 1) return
                          if ((e.target as HTMLElement).closest('a')) return // the link opens itself
                          openInNewTab(row)
                        }
                      : undefined
                  }
                  // A clickable row must also open from the keyboard: on
                  // /registratsiyalar no cell held a button, so Tab skipped
                  // every row (audit 2026-09-19).
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.target !== e.currentTarget) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRowClick(row)
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    'border-b border-line transition-colors last:border-0',
                    isSelected ? 'bg-brand-soft/60' : 'hover:bg-surface-2/60',
                    onRowClick && 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand',
                    rowClassName?.(row),
                  )}
                >
                  {selection && (
                    <td className="py-4 pl-6 pr-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onChange={() => selection.toggle(row.id)}
                        disabled={selection.canSelect ? !selection.canSelect(row.id) : undefined}
                        srLabel={t('list.selectRow')}
                      />
                    </td>
                  )}
                  {visible.map((c, ci) => {
                    const w = widthOf(c.key)
                    return (
                      <td
                        key={c.key}
                        // `max-w-[28rem]`: in an auto-layout table a `truncate` line
                        // (nowrap) sets the column's MIN width, so one long subtitle
                        // widened «Xodim» to 1000px and pushed the last columns off
                        // the card (Mehmonlar, Tibbiy ko'rik, 2026-09-24). A cap makes
                        // truncation actually happen; a column the user dragged keeps
                        // its own width.
                        className={cn(cell, selection && ci === 0 && 'first:pl-0', w ? 'overflow-hidden' : 'max-w-[28rem]', c.className)}
                        style={w ? { maxWidth: w } : undefined}
                      >
                        {rowHref && c.rowLink ? (
                          <Link to={rowHref(row)} tabIndex={-1} className="block text-inherit no-underline">
                            {c.cell(row, i)}
                          </Link>
                        ) : (
                          c.cell(row, i)
                        )}
                      </td>
                    )
                  })}
                  {customizable && <td />}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
