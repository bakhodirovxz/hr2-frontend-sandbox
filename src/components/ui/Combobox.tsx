import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { Check, ChevronDown, Loader2, Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Avatar } from './Avatar'
import { CONTROL_PAD, POPOVER, POPOVER_CLS, control, placePopover } from './control'
import { foldIncludes, searchFold } from '@/lib/searchFold'
import type { SelectOption } from './Select'

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Trigger label when nothing is selected (also the "clear" row label). */
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
  invalid?: boolean
  /**
   * Remote search. When given, typing reports the query instead of filtering
   * `options` locally — the parent refetches and hands back a new list. Needed
   * for lists too large to load at once (every employee in the organisation),
   * where local filtering would only ever search the first page.
   */
  onSearchChange?: (query: string) => void
  /** Spinner in the search row while a remote search is in flight. */
  loading?: boolean
  /** Set when the options query failed, so an empty list is not read as "none exist". */
  error?: unknown
  /**
   * Show the × that empties the selection. Off for fields the form always
   * carries a value for (a priority that defaults to "normal", say) — clearing
   * one produced a request the server answered with a raw 422, since the form
   * had no empty state to validate against.
   */
  clearable?: boolean
  /**
   * Skip the "placeholder" row at the top of the list. A multi-select built on
   * this control (report pickers) has nothing to clear from the list — every
   * pick adds a chip — so that row was a dead option.
   */
  hidePlaceholderOption?: boolean
  /** Set by `Field` so the <label htmlFor> actually names this control. */
  id?: string
  /**
   * Remote lists are paged: `hasMore` says the server holds more rows, and
   * `onLoadMore` fetches the next page when the list is scrolled to its end.
   * Without it a picker showed its first 50 people and nothing more — «you
   * can't find anyone until you type» (Mehmonlar, 2026-09-25).
   */
  hasMore?: boolean
  onLoadMore?: () => void
}

/** Searchable single-select. The dropdown is position:fixed so it is never
 *  clipped by a card's overflow; the list filters as you type. */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  className,
  disabled,
  invalid,
  onSearchChange,
  loading,
  error,
  clearable = true,
  hidePlaceholderOption = false,
  id,
  hasMore = false,
  onLoadMore,
}: ComboboxProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const selected = options.find((o) => o.value === value) ?? null
  const label = selected?.label ?? placeholder ?? t('common.search')

  const filtered = useMemo(() => {
    // Remote mode: the server already applied the query. Filtering again here
    // would drop matches the label doesn't spell out (a phone-number hit, say).
    if (onSearchChange) return options
    const q = searchFold(query.trim())
    if (!q) return options
    // The position counts as searchable text: the list shows it, so a user
    // typing "bosh mutaxassis" expects it to narrow. Folded, so Cyrillic and
    // apostrophe variants find the Latin names.
    return options.filter((o) => foldIncludes(`${o.label} ${o.subLabel ?? ''}`, q))
  }, [options, query, onSearchChange])

  const place = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Kenglik: maydonning o'zi, lekin `POPOVER.minW` dan tor emas — va
    // baribir EKRANGA siqiladi (qoida `control.ts` da, DateInput ham shundan).
    // Balandlik: ro'yxat (`max-h-[min(52vh,340px)]`) + qidiruv qatori.
    const h = Math.min(window.innerHeight * 0.52, 340) + 58
    const panel = placePopover(r, Math.max(r.width, POPOVER.minW), h)
    setRect(panel)
  }, [])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onScroll = () => place()
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', place)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, place])

  /**
   * Focus the search box only once the panel is really on screen.
   *
   * The panel renders on `open && rect`, and `rect` is set a tick later by
   * `place()` — so focusing inside the open-effect ran while the input did not
   * exist yet and silently did nothing. Keyboard users landed on the trigger
   * with an open list they could neither type into nor arrow through.
   */
  useEffect(() => {
    if (open && rect) inputRef.current?.focus()
  }, [open, rect])

  const close = () => {
    setOpen(false)
    setQuery('')
    setHighlight(0)
    // Reset the remote query too, or reopening shows the last search's results.
    onSearchChange?.('')
  }

  const pick = (v: string) => {
    onChange(v)
    close()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      // Swallow it — inside a Modal the same Escape closed the whole form, so
      // dismissing a dropdown threw away everything typed. DateInput already
      // guards this; the two behave the same now.
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[highlight]
      // Keyboard must respect the same block as the mouse.
      if (opt && !opt.disabled) pick(opt.value)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        // Escape must close from the TRIGGER too: the panel's handler lives on
        // the search input, so a list opened by keyboard could not be dismissed.
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault()
            e.stopPropagation()
            close()
          } else if ((e.key === 'ArrowDown' || e.key === 'Enter') && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        className={cn(
          control({ invalid }),
          CONTROL_PAD.plain,
          'flex items-center gap-2',
          // The trigger is a button, so it must paint its own "focused" look
          // while the panel is open — control()'s :focus rules never fire here.
          open && (invalid ? 'border-danger ring-2 ring-danger/20' : 'border-brand ring-2 ring-brand/20'),
          !open && 'hover:bg-surface-2',
          className,
        )}
      >
        {selected && selected.photo !== undefined && (
          <Avatar
            src={selected.photo}
            fallbackSrc={selected.photoFallback}
            name={selected.label}
            size={22}
          />
        )}
        <span className={cn('min-w-0 flex-1 truncate text-left', selected ? 'text-fg' : 'text-fg-subtle')}>
          {label}
          {/* The position rides along on the same line — a second line would
              push the trigger past the shared control height. */}
          {selected?.subLabel && <span className="text-fg-subtle"> · {selected.subLabel}</span>}
        </span>
        {/* ⚠️ THE CHEVRON ALWAYS STAYS. It used to be REPLACED by the clear
            "x" as soon as a value was picked, which made a filled dropdown
            look like a removable tag chip — nothing left said "this opens a
            list", and it read differently from the plain <Select> sitting
            next to it in the same form. The clear button is now an extra,
            quieter control beside the chevron. */}
        {selected && clearable && (
          <span
            role="button"
            aria-label={t('common.clearValue')}
            onClick={(e) => {
              e.stopPropagation()
              onChange('')
            }}
            className="shrink-0 rounded p-0.5 text-fg-subtle/70 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown
          size={15}
          className={cn('shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && rect && (
        <div
          ref={panelRef}
          className={cn(POPOVER_CLS, 'fixed z-[100] animate-scale-in overflow-hidden')}
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            transformOrigin: 'top',
          }}
        >
          <div className="border-b border-line p-2">
            <div className={control({ size: 'sm', focusWithin: true, className: 'flex items-center gap-2 px-2.5' })}>
              {loading ? (
                <Loader2 size={15} className="shrink-0 animate-spin text-fg-subtle" />
              ) : (
                <Search size={15} className="shrink-0 text-fg-subtle" />
              )}
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setHighlight(0)
                  onSearchChange?.(e.target.value)
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder ?? t('common.search')}
                className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
              />
            </div>
          </div>

          <ul
            role="listbox"
            className="scroll-thin max-h-[min(52vh,340px)] overflow-y-auto p-1.5"
            onScroll={(e) => {
              const el = e.currentTarget
              if (hasMore && !loading && onLoadMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 48) onLoadMore()
            }}
          >
            {placeholder && !query && !hidePlaceholderOption && (
              <ComboOption
                option={{ value: '', label: placeholder }}
                active={!value}
                highlighted={false}
                muted
                onClick={() => pick('')}
              />
            )}
            {filtered.length === 0 ? (
              /*
               * ⚠️ "Not found" IS A CLAIM. When the options come from a query
               * that failed, an empty dropdown says "no such person exists" —
               * the pickers that search employees, heads and signers all read
               * that way on a 403 or a timeout. `error` lets the caller tell
               * the two apart; without it the control lies quietly.
               */
              <li className={cn('py-6 text-center text-xs', error ? 'text-danger' : 'text-fg-subtle')}>
                {loading
                  ? t('common.loading')
                  : error
                    ? t('list.loadFailed')
                    : t('common.noResults')}
              </li>
            ) : (
              filtered.map((o, i) => (
                <ComboOption
                  key={o.value}
                  option={o}
                  active={o.value === value}
                  highlighted={i === highlight}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => { if (!o.disabled) pick(o.value) }}
                />
              ))
            )}
            {hasMore && filtered.length > 0 && (
              <li className="py-2 text-center">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onLoadMore?.()}
                  className="rounded-md px-2 py-1 text-[12px] font-medium text-brand-strong hover:bg-brand-soft disabled:text-fg-subtle"
                >
                  {loading ? t('common.loading') : t('common.loadMore')}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </>
  )
}

function ComboOption({
  option,
  active,
  highlighted,
  muted = false,
  onClick,
  onMouseEnter,
}: {
  option: SelectOption
  active: boolean
  highlighted: boolean
  muted?: boolean
  onClick: () => void
  onMouseEnter?: () => void
}) {
  const { label, subLabel, photo, photoFallback } = option
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={active}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        disabled={option.disabled}
        aria-disabled={option.disabled || undefined}
        title={subLabel ? `${label} — ${subLabel}` : label}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
          active ? 'bg-brand-soft font-medium text-brand-strong' : highlighted ? 'bg-surface-2 text-fg' : 'text-fg',
          muted && !active && 'text-fg-muted',
          option.disabled && 'cursor-not-allowed opacity-55',
        )}
      >
        {photo !== undefined && (
          <Avatar src={photo} fallbackSrc={photoFallback} name={label} size={28} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate">{label}</span>
          {subLabel && (
            <span className={cn('block truncate text-[11.5px]', active ? 'text-brand-strong/80' : 'text-fg-subtle')}>
              {subLabel}
            </span>
          )}
        </span>
        {active && <Check size={15} className="shrink-0 text-brand" />}
      </button>
    </li>
  )
}
