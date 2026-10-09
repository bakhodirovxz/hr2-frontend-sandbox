import { Plus, X } from 'lucide-react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Combobox } from './Combobox'
import type { SelectOption } from './Select'

/**
 * "+ qo'shish" repeater — the HR pattern for every multi-value field
 * (kelishuvchilar, tanishuvchi bo'limlar, viloyatlar…). One row per value with
 * its own control and an X, plus an add button underneath.
 *
 * Rows are addressed by index, not by value, so a row may sit empty while the
 * user picks — the same as v1's `ordinary_signers: [...prev, '']`.
 */
export function RowList({
  count,
  addLabel,
  onAdd,
  onRemove,
  renderRow,
  locked,
  lockedBadge,
  emptyHint,
  error,
  className,
}: {
  count: number
  addLabel: string
  onAdd: () => void
  onRemove: (index: number) => void
  renderRow: (index: number) => React.ReactNode
  /** Rows that may not be edited or removed (e.g. an agreer who already agreed). */
  locked?: (index: number) => boolean
  lockedBadge?: string
  emptyHint?: string
  error?: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {count === 0 && emptyHint && <p className="text-xs text-fg-subtle">{emptyHint}</p>}

      {Array.from({ length: count }).map((_, i) => {
        const isLocked = locked?.(i) ?? false
        return (
          <div key={i} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{renderRow(i)}</div>
            {isLocked ? (
              <span className="flex h-10 shrink-0 items-center rounded-lg border border-success/25 bg-success-soft px-2.5 text-[11px] font-bold text-success">
                {lockedBadge}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={t('common.delete')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-danger/20 bg-danger-soft text-danger transition-colors hover:bg-danger/15"
              >
                <X size={15} />
              </button>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={onAdd}
        className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12px] font-bold text-fg transition-colors hover:border-brand/40 hover:text-brand"
      >
        <Plus size={14} />
        {addLabel}
      </button>

      <FormError className="text-xs">{error}</FormError>
    </div>
  )
}

/**
 * RowList over a fixed option list (departments, regions, branches…). Values
 * already chosen in other rows are hidden so the same item cannot be added
 * twice — v1 dedups on submit, we prevent it at the source.
 */
export function ComboRows({
  value,
  onChange,
  options,
  addLabel,
  placeholder,
  emptyHint,
  error,
}: {
  value: string[]
  onChange: (next: string[]) => void
  options: SelectOption[]
  addLabel: string
  placeholder?: string
  emptyHint?: string
  error?: string
}) {
  const setAt = (i: number, v: string) => onChange(value.map((x, idx) => (idx === i ? v : x)))

  return (
    <RowList
      count={value.length}
      addLabel={addLabel}
      emptyHint={emptyHint}
      error={error}
      onAdd={() => onChange([...value, ''])}
      onRemove={(i) => onChange(value.filter((_, idx) => idx !== i))}
      renderRow={(i) => (
        <Combobox
          className="w-full"
          value={value[i] ?? ''}
          onChange={(v) => setAt(i, v)}
          placeholder={placeholder}
          options={options.filter((o) => o.value === value[i] || !value.includes(o.value))}
        />
      )}
    />
  )
}
