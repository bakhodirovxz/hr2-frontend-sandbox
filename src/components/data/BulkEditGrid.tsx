import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownToLine, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DateInput } from '@/components/ui/DateInput'
import { TimeInput } from '@/components/ui/TimeInput'
import { Tooltip } from '@/components/ui/Tooltip'
import type { SelectOption } from '@/components/ui/Select'
import { cn } from '@/lib/cn'
import { FIELD_MASKS, maskValue } from '@/lib/fieldMask'

export type GridFieldType = 'text' | 'select' | 'time' | 'date' | 'number' | 'bool'

/**
 * Identity fields keep their shape here too. The grid edits the SAME columns as
 * the employee form, so a value that the form refuses must not be enterable
 * through the spreadsheet — that was the hole: series took digits, the passport
 * number took letters and any length, the PINFL took letters.
 */
function applyMask(key: string, raw: string): string {
  const kind = FIELD_MASKS[key]
  return kind ? maskValue(kind, raw) : raw
}

export interface GridField<T> {
  key: string
  /** Already-translated column label. */
  label: string
  type: GridFieldType
  width: number
  maxLength?: number
  options?: SelectOption[]
  /** Show the ⤓ "apply to every row" button — only for shareable attributes. */
  fillable?: boolean
  /**
   * Select columns send a NUMBER by default (they are almost all foreign keys).
   * Set false for a select whose value is a string — gender and marital status
   * would otherwise arrive as NaN.
   */
  numeric?: boolean
  /** Custom read of the current value (defaults to `row[key]`). */
  get?: (row: T) => string
}

/** Width of the sticky "#" column; the first data column pins right after it. */
const FROZEN_LEFT = 40

interface Props<T extends { id: number }> {
  open: boolean
  rows: T[]
  fields: GridField<T>[]
  title: string
  description?: string
  /** Used in each cell's accessible name, e.g. the person's name. */
  rowLabel: (row: T) => string
  onClose: () => void
  onSave: (patches: Record<number, Record<string, unknown>>) => void
  saving?: boolean
}

function readValue<T extends { id: number }>(row: T, f: GridField<T>): string {
  if (f.get) return f.get(row)
  const raw = (row as unknown as Record<string, unknown>)[f.key]
  if (raw == null) return f.type === 'bool' ? '0' : ''
  // Times arrive as HH:MM:SS; the 24h field works in HH:MM.
  if (f.type === 'time') return String(raw).slice(0, 5)
  // A flag is held as '1'/'0' so it diffs like every other cell — '' would be
  // indistinguishable from "unchecked" and would send null on every save.
  if (f.type === 'bool') return raw ? '1' : '0'
  return String(raw)
}

/**
 * Spreadsheet-style bulk editor shared by every list screen.
 *
 * Each selected record gets its OWN row, so per-record values (passport,
 * JSHSHIR, phone, card number …) stay individual and are visible before being
 * changed — a single-value form would write one value across the whole
 * selection. Shared attributes can still be applied to everyone with the ⤓
 * button in the column header. Only changed cells are sent.
 */
export function BulkEditGrid<T extends { id: number }>({
  open,
  rows,
  fields,
  title,
  description,
  rowLabel,
  onClose,
  onSave,
  saving,
}: Props<T>) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Record<number, Record<string, string>>>({})

  const original = useMemo(() => {
    const out: Record<number, Record<string, string>> = {}
    for (const r of rows) out[r.id] = Object.fromEntries(fields.map((f) => [f.key, readValue(r, f)]))
    return out
  }, [rows, fields])

  useEffect(() => {
    if (open) setDraft(structuredClone(original))
  }, [open, original])

  const setCell = (id: number, key: string, value: string) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))

  const fillDown = (key: string) =>
    setDraft((prev) => {
      const first = rows[0] ? prev[rows[0].id]?.[key] ?? '' : ''
      const next = { ...prev }
      for (const r of rows) next[r.id] = { ...next[r.id], [key]: first }
      return next
    })

  const patches = useMemo(() => {
    const out: Record<number, Record<string, unknown>> = {}
    for (const r of rows) {
      const before = original[r.id] ?? {}
      const after = draft[r.id] ?? {}
      const diff: Record<string, unknown> = {}
      for (const f of fields) {
        if (after[f.key] === undefined || after[f.key] === before[f.key]) continue
        const v = after[f.key]
        if (f.type === 'bool') diff[f.key] = v === '1'
        else if (f.type === 'select' && f.numeric === false) diff[f.key] = v === '' ? null : v
        else if (f.type === 'select' || f.type === 'number') diff[f.key] = v === '' ? null : Number(v)
        else diff[f.key] = v === '' ? null : v
      }
      if (Object.keys(diff).length) out[r.id] = diff
    }
    return out
  }, [rows, fields, original, draft])

  const changedRows = Object.keys(patches).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      bodyFill
      title={title}
      description={description}
      footer={
        <>
          <span className="mr-auto text-xs text-fg-muted" aria-live="polite">
            {changedRows > 0
              ? t('employees.bulkEditChanged', { count: changedRows })
              : t('employees.bulkEditNoChanges')}
          </span>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onSave(patches)} disabled={changedRows === 0} loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {/* Scrolls in BOTH directions itself, so the horizontal scrollbar stays at
          the bottom of the grid instead of below the page fold. */}
      <div className="scroll-thin w-full flex-1 overflow-auto overscroll-contain">
        <table className="border-separate border-spacing-0 text-left text-[13px]">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 border-b border-r border-line bg-surface-2 px-3 py-2 text-[12px] font-semibold text-fg-muted"
              >
                #
              </th>
              {fields.map((f, ci) => (
                <th
                  key={f.key}
                  scope="col"
                  style={{ minWidth: f.width, ...(ci === 0 ? { left: FROZEN_LEFT } : {}) }}
                  className={cn(
                    'top-0 whitespace-nowrap border-b border-line bg-surface-2 px-2 py-2 text-[12px] font-semibold text-fg-muted',
                    ci === 0 ? 'sticky z-30 border-r' : 'sticky z-20',
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {f.label}
                    {f.fillable && rows.length > 1 && (
                      <Tooltip text={t('employees.fillDown')}>
                        <button
                          type="button"
                          onClick={() => fillDown(f.key)}
                          aria-label={`${t('employees.fillDown')}: ${f.label}`}
                          className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface hover:text-brand"
                        >
                          <ArrowDownToLine size={13} />
                        </button>
                      </Tooltip>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-20 border-b border-r border-line bg-surface px-3 py-1 text-xs font-normal tabular-nums text-fg-subtle"
                >
                  {i + 1}
                </th>
                {fields.map((f, ci) => {
                  const value = draft[r.id]?.[f.key] ?? ''
                  const dirty = value !== (original[r.id]?.[f.key] ?? '')
                  const cellCls = cn(
                    'h-9 w-full rounded-none border-0 bg-transparent px-2 text-[13px] text-fg outline-none transition-colors',
                    'focus:bg-brand-soft focus:ring-1 focus:ring-inset focus:ring-brand',
                    dirty && 'bg-warning-soft font-semibold',
                  )
                  const label = `${f.label} — ${rowLabel(r)}`
                  return (
                    <td
                      key={f.key}
                      style={ci === 0 ? { left: FROZEN_LEFT } : undefined}
                      className={cn(
                        'border-b border-line bg-surface p-0',
                        ci === 0 && 'sticky z-10 border-r',
                      )}
                    >
                      {f.type === 'select' ? (
                        <div className="relative">
                          <select
                            value={value}
                            onChange={(e) => setCell(r.id, f.key, e.target.value)}
                            aria-label={label}
                            className={cn(cellCls, 'cursor-pointer appearance-none pr-7')}
                          >
                            <option value="">—</option>
                            {(f.options ?? []).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={13}
                            aria-hidden
                            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle"
                          />
                        </div>
                      ) : f.type === 'bool' ? (
                        /* A flag reads faster as a checkbox than as a yes/no
                           dropdown, and the whole column can be scanned at a
                           glance — which is the point of the grid. */
                        <div className={cn(cellCls, 'flex items-center justify-center')}>
                          <input
                            type="checkbox"
                            checked={value === '1'}
                            onChange={(e) => setCell(r.id, f.key, e.target.checked ? '1' : '0')}
                            aria-label={label}
                            className="size-4 cursor-pointer accent-brand"
                          />
                        </div>
                      ) : f.type === 'time' ? (
                        <TimeInput
                          value={value}
                          onChange={(v) => setCell(r.id, f.key, v)}
                          aria-label={label}
                          className={cellCls}
                        />
                      ) : f.type === 'date' ? (
                        /* ⚠️ WITHOUT this branch the cell fell through to the
                           generic <input type="date"> below — the BROWSER's own
                           picker, in the browser's locale (mm/dd/yyyy on an
                           en-US machine) and in no theme at all. Every other
                           date in the product goes through DateInput; the bulk
                           grid was the last place that did not. */
                        <DateInput
                          value={value}
                          onChange={(v) => setCell(r.id, f.key, v)}
                          aria-label={label}
                          className={cellCls}
                        />
                      ) : (
                        <input
                          value={value}
                          onChange={(e) => setCell(r.id, f.key, applyMask(f.key, e.target.value))}
                          type={f.type === 'text' ? 'text' : f.type}
                          maxLength={f.maxLength}
                          step={f.type === 'number' ? '0.25' : undefined}
                          spellCheck={false}
                          aria-label={label}
                          className={cn(cellCls, f.type === 'number' && 'tabular-nums')}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
