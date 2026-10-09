import { useCallback, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Loader2, Search, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { POPOVER_CLS, control } from '@/components/ui/control'
import { useClickOutside } from '@/hooks/useClickOutside'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { employeeSubLabel } from './subLabel'
import { useEmployeePickerSearch } from './EmployeePicker'

/** A picked person: enough to draw the chip without asking the server again. */
export interface PickedPerson {
  id: number
  legal_name?: string | null
  photo_thumb_path?: string | null
}

/**
 * SEVERAL EMPLOYEES, ONE FIELD.
 *
 * The chips are the value; the search field opens a dropdown only while it is
 * in use — the list is not parked open under the field (user, 2026-10-06:
 * an always-open list in a form «juda xunuk va noqulay»). Picking keeps the
 * list open, so a brigade is added in one go; a click outside, Escape or
 * «Tayyor» closes it. Same `/employees` search as the single picker.
 */
export function EmployeeMultiPicker({
  value,
  onChange,
  branchId,
  placeholder,
  invalid,
}: {
  value: PickedPerson[]
  onChange: (next: PickedPerson[]) => void
  /** Restrict candidates to this branch (the header's by default). */
  branchId?: number | null
  placeholder?: string
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useClickOutside(boxRef, close, open)

  // `browse`: opening the field shows the first page before anything is typed.
  const { candidates, loading, error, hasMore, loadMore } = useEmployeePickerSearch(q, branchId, open)
  const picked = new Set(value.map((p) => p.id))

  const toggle = (p: PickedPerson) =>
    onChange(picked.has(p.id) ? value.filter((x) => x.id !== p.id) : [...value, p])
  /** From the list: the typed name has done its job — clear it for the next one. */
  const pick = (p: PickedPerson) => {
    toggle(p)
    if (q) setQ('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && open) {
      // Inside a Modal the same Escape would close the whole form.
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
    } else if (e.key === 'ArrowDown' && !open) {
      e.preventDefault()
      setOpen(true)
    } else if (e.key === 'Backspace' && !q && value.length) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <div
        className={cn(
          control({ focusWithin: true, invalid, auto: true }),
          'flex min-h-control flex-wrap items-center gap-1.5 px-2.5 py-1.5',
        )}
        onClick={() => {
          inputRef.current?.focus()
          setOpen(true)
        }}
      >
        {value.map((p) => (
          <span
            key={p.id}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-soft py-0.5 pl-0.5 pr-2 text-[12.5px] font-medium text-brand-strong"
          >
            <Avatar src={p.photo_thumb_path} name={p.legal_name ?? ''} size={20} />
            <span className="truncate">{p.legal_name || `#${p.id}`}</span>
            <button
              type="button"
              aria-label={t('common.clearValue')}
              onClick={(e) => {
                e.stopPropagation()
                toggle(p)
              }}
              className="rounded-full p-0.5 text-brand-strong/70 hover:bg-brand/10 hover:text-brand-strong"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <span className="flex min-w-[10rem] flex-1 items-center gap-1.5">
          {!value.length && <Search size={15} className="shrink-0 text-fg-subtle" />}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
            /* NOT onFocus: a Modal focuses its first field on open, and the
               list then sat open over the form before anyone touched it. */
            onMouseDown={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={value.length ? t('employees.addMore') : (placeholder ?? t('employees.searchPlaceholder'))}
            aria-expanded={open}
            className="h-7 min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
          />
          {loading && open && <Loader2 size={14} className="shrink-0 animate-spin text-fg-subtle" />}
        </span>
      </div>

      {open && (
        <div className={cn(POPOVER_CLS, 'absolute z-30 mt-1 w-full overflow-hidden')}>
          <ul
            role="listbox"
            aria-multiselectable
            className="scroll-thin max-h-60 overflow-y-auto p-1"
            onScroll={(e) => {
              const el = e.currentTarget
              if (hasMore && !loading && el.scrollTop + el.clientHeight >= el.scrollHeight - 40) loadMore()
            }}
          >
            {error != null && candidates.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-danger">{errorMessage(error, t('list.loadFailed'))}</li>
            ) : candidates.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-fg-subtle">
                {loading ? t('common.loading') : t('common.noResults')}
              </li>
            ) : (
              candidates.map((e) => {
                const on = picked.has(e.id)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => pick({ id: e.id, legal_name: e.legal_name, photo_thumb_path: e.photo_thumb_path })}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
                        on ? 'bg-brand-soft' : 'hover:bg-surface-2',
                      )}
                    >
                      <Avatar src={e.photo_thumb_path} name={e.legal_name} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-[13px]', on ? 'font-medium text-brand-strong' : 'text-fg')}>
                          {e.legal_name}
                        </span>
                        {employeeSubLabel(e) && (
                          <span className="block truncate text-[11px] text-fg-subtle">{employeeSubLabel(e)}</span>
                        )}
                      </span>
                      {on && <Check size={15} className="shrink-0 text-brand" />}
                    </button>
                  </li>
                )
              })
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-3 py-1.5 text-[12px]">
            <span className="text-fg-muted">{t('employees.pickedCount', { count: value.length })}</span>
            <button type="button" onClick={close} className="rounded-md px-2 py-1 font-semibold text-brand-strong hover:bg-brand-soft">
              {t('employees.pickDone')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
