import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { Combobox, DateInput, Input } from '@/components/ui'
import { cn } from '@/lib/cn'

/** Static classes — Tailwind scans source text, so a computed `col-span-${n}`
 *  is never generated. */
const SPAN: Record<number, string> = {
  2: 'sm:col-span-2',
  3: 'sm:col-span-3',
  4: 'sm:col-span-4',
  5: 'sm:col-span-5',
  6: 'sm:col-span-6',
  7: 'sm:col-span-7',
  8: 'sm:col-span-8',
  11: 'sm:col-span-11',
}

export interface EditorColumn {
  key: string
  label: string
  type?: 'text' | 'number' | 'date' | 'select'
  options?: { value: string; label: string }[]
  placeholder?: string
  /** Grid span out of 12. */
  span?: number
}

export type EditorRow = Record<string, string>

/**
 * A repeating T-2 section, edited in place.
 *
 * The whole list is held by the parent and sent whole on save (the API replaces
 * the section), so this component owns no state: what you see is exactly what
 * will be written. Labels are printed once, above the first row, so a section
 * with six rows does not repeat its header six times.
 */
export function RowsEditor({
  columns,
  rows,
  onChange,
  disabled,
  addLabel,
}: {
  columns: EditorColumn[]
  rows: EditorRow[]
  onChange: (rows: EditorRow[]) => void
  disabled?: boolean
  addLabel?: string
}) {
  const { t } = useTranslation()

  const blank = () => Object.fromEntries(columns.map((c) => [c.key, ''])) as EditorRow
  const update = (idx: number, key: string, value: string) =>
    onChange(rows.map((r, i) => (i === idx ? { ...r, [key]: value } : r)))
  const removeAt = (idx: number) => onChange(rows.filter((_, i) => i !== idx))

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 && <p className="text-[13px] text-fg-subtle">{t('t2.noRows')}</p>}

      {rows.map((row, idx) => (
        <div key={idx} className="grid grid-cols-12 items-end gap-2.5">
          {columns.map((c) => (
            <Fragment key={c.key}>
              <div className={cn('col-span-12 min-w-0', SPAN[c.span ?? 3] ?? SPAN[3])}>
                {idx === 0 && (
                  <span className="mb-1.5 block text-xs text-fg-subtle">{c.label}</span>
                )}
                {c.type === 'select' ? (
                  <Combobox
                    value={row[c.key] ?? ''}
                    onChange={(v) => update(idx, c.key, v)}
                    options={c.options ?? []}
                    placeholder={c.placeholder ?? t('t2.pick')}
                    disabled={disabled}
                  />
                ) : c.type === 'date' ? (
                  <DateInput
                    value={row[c.key] ?? ''}
                    onChange={(v) => update(idx, c.key, v)}
                    disabled={disabled}
                  />
                ) : (
                  <Input
                    type={c.type === 'number' ? 'number' : 'text'}
                    value={row[c.key] ?? ''}
                    onChange={(e) => update(idx, c.key, e.target.value)}
                    placeholder={c.placeholder}
                    disabled={disabled}
                  />
                )}
              </div>
            </Fragment>
          ))}
          {!disabled && (
            <div className="col-span-12 sm:col-span-1">
              {idx === 0 && <span className="mb-1.5 block text-xs">&nbsp;</span>}
              <button
                type="button"
                onClick={() => removeAt(idx)}
                aria-label={t('common.delete')}
                title={t('common.delete')}
                className="grid h-10 w-10 place-items-center rounded-control bg-danger/[0.12] text-danger transition-colors hover:bg-danger/25"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}
        </div>
      ))}

      {!disabled && (
        <button
          type="button"
          onClick={() => onChange([...rows, blank()])}
          className="self-start inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-3.5 py-1.5 text-[13px] text-fg-muted transition-colors hover:border-brand/60 hover:text-fg"
        >
          <Plus size={14} /> {addLabel ?? t('t2.addRow')}
        </button>
      )}
    </div>
  )
}
