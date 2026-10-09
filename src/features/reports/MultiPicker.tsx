import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/Spinner'
import { CONTROL_PAD, control } from '@/components/ui/control'
import { foldIncludes, searchFold } from '@/lib/searchFold'
import { cn } from '@/lib/cn'
import type { ReportOption } from './types'

interface Props {
  value: (string | number)[]
  onChange: (next: (string | number)[]) => void
  options: ReportOption[]
  placeholder?: string
  /** Remote search: when given, typing refetches instead of filtering locally. */
  onSearchChange?: (q: string) => void
  loading?: boolean
  disabled?: boolean
  /** Labels of values already chosen that the current option page lacks. */
  selectedLabels?: Record<string, string>
  id?: string
  /** People list: show portraits (initials when there is no photo). */
  showPhotos?: boolean
  /** Paged remote list: more rows exist; fetched when scrolled to the end. */
  hasMore?: boolean
  onLoadMore?: () => void
}

/**
 * Multi-select that STAYS OPEN while you tick people, positions or branches
 * (one pick per open-close cycle was three clicks per employee). Search on
 * top (remote for the employee list), a checkbox row per option with the
 * portrait when the list is people, «Hammasi / Tozalash» for short lists, and
 * chips under the field so what is chosen is visible without opening it.
 */
export function MultiPicker({ value, onChange, options, placeholder, onSearchChange, loading, disabled, selectedLabels, id, showPhotos, hasMore = false, onLoadMore }: Props) {
  const { t } = useTranslation()
  const anchorRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const remote = !!onSearchChange
  const selected = new Set(value.map(String))

  // Everything we have seen (labels + portraits) so chips survive a new search page.
  const seenRef = useRef<Record<string, { label: string; photo?: string | null; fallback?: string | null }>>({})
  for (const o of options) seenRef.current[String(o.value)] = { label: o.label, photo: o.photo, fallback: o.photo_fallback }
  const withPhotos = !!showPhotos
  const labelOf = (v: string | number) => seenRef.current[String(v)]?.label ?? selectedLabels?.[String(v)] ?? String(v)

  const visible = useMemo(() => {
    if (remote || !q.trim()) return options
    const term = searchFold(q.trim())
    return options.filter((o) => foldIncludes(o.label, term) || foldIncludes(o.sub ?? '', term))
  }, [options, q, remote])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30)
    else { setQ(''); onSearchChange?.('') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggle = (v: string | number) => {
    const key = String(v)
    if (selected.has(key)) onChange(value.filter((x) => String(x) !== key))
    else onChange([...value, v])
  }
  const allVisibleOn = visible.length > 0 && visible.every((o) => selected.has(String(o.value)))
  const width = Math.max(320, Math.min(520, anchorRef.current?.getBoundingClientRect().width ?? 360))

  return (
    <div className="space-y-2">
      <button
        ref={anchorRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(control({}), CONTROL_PAD.plain, 'flex w-full items-center justify-between gap-2 text-left')}
      >
        <span className={cn('min-w-0 flex-1 truncate', value.length ? 'text-fg' : 'text-fg-subtle')}>
          {value.length ? t('reports.selectedCount', { count: value.length }) : (placeholder ?? t('reports.pickPlaceholder'))}
        </span>
        <ChevronDown size={16} className={cn('shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')} />
      </button>

      <AnchoredPanel anchorRef={anchorRef} open={open} onClose={() => setOpen(false)} width={width} height={380} align="start" role="listbox" label={placeholder}>
        <div
          className="flex h-full max-h-[380px] flex-col"
          // Escape closes the PANEL only. Left to bubble, a Modal hosting this
          // picker heard the same key and threw the whole form away.
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              anchorRef.current?.focus()
            }
          }}
        >
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <Search size={14} className="shrink-0 text-fg-subtle" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => { setQ(e.target.value); onSearchChange?.(e.target.value) }}
              placeholder={t('common.search')}
              className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
            />
            {loading && <Spinner size={14} />}
            {!remote && visible.length > 0 && (
              <button type="button" className="shrink-0 text-[12px] text-brand-strong hover:underline" onClick={() => onChange(allVisibleOn ? value.filter((v) => !visible.some((o) => String(o.value) === String(v))) : Array.from(new Set([...value, ...visible.map((o) => o.value)])))}>
                {allVisibleOn ? t('reports.unselectAll') : t('reports.selectAll')}
              </button>
            )}
          </div>
          <ul
            className="scroll-thin min-h-0 flex-1 overflow-y-auto p-1.5"
            role="listbox"
            aria-multiselectable
            onScroll={(e) => {
              const el = e.currentTarget
              if (hasMore && !loading && onLoadMore && el.scrollTop + el.clientHeight >= el.scrollHeight - 48) onLoadMore()
            }}
          >
            {visible.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-fg-subtle">{loading ? t('common.loading') : t('reports.noData')}</li>
            ) : (
              visible.map((o) => {
                const on = selected.has(String(o.value))
                return (
                  <li key={String(o.value)}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={on}
                      onClick={() => toggle(o.value)}
                      className={cn('flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2', on && 'bg-brand-soft/60')}
                    >
                      <span className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[6px] ring-1 ring-inset', on ? 'bg-brand text-white ring-brand' : 'bg-surface ring-line')}>
                        {on && <Check size={12} strokeWidth={3} />}
                      </span>
                      {withPhotos && <Avatar src={o.photo ?? null} fallbackSrc={o.photo_fallback ?? null} name={o.label} size={28} />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fg">{o.label}</span>
                        {o.sub && <span className="block truncate text-[11.5px] text-fg-subtle">{o.sub}</span>}
                      </span>
                    </button>
                  </li>
                )
              })
            )}
            {hasMore && visible.length > 0 && (
              <li className="py-2 text-center">
                <button type="button" disabled={loading} onClick={() => onLoadMore?.()} className="rounded-md px-2 py-1 text-[12px] font-medium text-brand-strong hover:bg-brand-soft disabled:text-fg-subtle">
                  {loading ? t('common.loading') : t('common.loadMore')}
                </button>
              </li>
            )}
          </ul>
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-fg-muted">
            <span>{t('reports.selectedCount', { count: value.length })}</span>
            <span className="flex gap-3">
              {value.length > 0 && <button type="button" className="hover:text-fg" onClick={() => onChange([])}>{t('common.clear')}</button>}
              <button type="button" className="font-semibold text-brand-strong" onClick={() => setOpen(false)}>{t('reports.done')}</button>
            </span>
          </div>
        </div>
      </AnchoredPanel>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((v) => {
            const seen = seenRef.current[String(v)]
            return (
              <li key={String(v)} className={cn('inline-flex items-center gap-1.5 rounded-pill bg-brand-soft py-1 pr-1.5 text-[12px] text-brand-strong ring-1 ring-inset ring-brand/20', withPhotos ? 'pl-1' : 'pl-2.5')}>
                {withPhotos && <Avatar src={seen?.photo ?? null} fallbackSrc={seen?.fallback ?? null} name={labelOf(v)} size={20} />}
                <span className="max-w-[220px] truncate">{labelOf(v)}</span>
                <button type="button" className="rounded-full p-0.5 hover:bg-brand/15" aria-label={t('common.delete')} onClick={() => toggle(v)} disabled={disabled}>
                  <X size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
