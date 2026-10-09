import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  count?: number
  icon?: ReactNode
  /** Draw only the icon; `label` becomes the accessible name and tooltip. */
  iconOnly?: boolean
}

interface SegmentedProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: 'sm' | 'md'
  /**
   * `neutral` — the raised white segment on a grey track (filters, modes).
   * `brand` — the filled brand pill, for the row that answers WHOSE records
   * are shown (documents scope, chairman views). One component, two looks,
   * instead of three hand-built tab strips.
   */
  variant?: 'neutral' | 'brand'
  'aria-label'?: string
}

/** Pill tab switcher (attendance categories, etc.). Scrolls horizontally on small screens. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  size = 'md',
  variant = 'neutral',
  'aria-label': ariaLabel,
}: SegmentedProps<T>) {
  const brand = variant === 'brand'
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'scroll-thin flex w-fit min-w-0 max-w-full gap-1 overflow-x-auto bg-surface-2 p-1',
        brand ? 'rounded-pill' : 'rounded-seg',
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            // Which segment is on was signalled by COLOUR alone; a screen
            // reader read every option identically. `aria-selected` makes the
            // state part of the control, not of the palette.
            role="tab"
            aria-selected={active}
            aria-label={opt.iconOnly ? opt.label : undefined}
            title={opt.iconOnly ? opt.label : undefined}
            onClick={() => onChange(opt.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors',
              brand ? 'rounded-pill font-semibold' : 'rounded-seg font-medium',
              size === 'sm' ? 'h-seg-sm px-2.5 text-[12px]' : 'h-seg px-3 text-[13px]',
              active
                ? brand
                  ? 'bg-brand text-fg-on-brand shadow-sm'
                  : 'bg-surface text-fg shadow-sm'
                : 'text-fg-muted hover:text-fg',
            )}
          >
            {opt.icon}
            {!opt.iconOnly && opt.label}
            {opt.count != null && (
              <span
                className={cn(
                  'tabnum rounded-xs px-1.5 text-[11px] font-semibold',
                  active ? 'bg-brand-soft text-brand-strong' : 'bg-line text-fg-muted',
                )}
              >
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
