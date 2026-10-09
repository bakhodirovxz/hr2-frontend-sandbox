import { useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'

export interface ActionMenuItem {
  key: string
  label: ReactNode
  icon?: ReactNode
  /** Second line — what the action does, when the label alone is not enough. */
  hint?: ReactNode
  onClick: () => void
  danger?: boolean
  loading?: boolean
  disabled?: boolean
  /** Draws a divider ABOVE this item. */
  divider?: boolean
}

/**
 * A header button that opens a short list of related actions.
 *
 * Page toolbars had grown to eight equal buttons (Shtat: import, Excel,
 * columns, PDF, XML, bulk edit, notify, create) — the primary action drowned
 * in them. Related secondary actions now sit behind ONE labelled menu
 * («Yuklab olish», «Boshqa»), the primary action stays a button of its own.
 * Items the caller may not use are simply not passed.
 */
export function ActionMenu({
  label,
  icon,
  items,
  variant = 'outline',
  size = 'sm',
  width = 260,
  className,
}: {
  label: ReactNode
  icon?: ReactNode
  items: ActionMenuItem[]
  variant?: 'outline' | 'secondary' | 'ghost' | 'primary'
  size?: 'sm' | 'md'
  width?: number
  className?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null
  return (
    <>
      <Button
        ref={ref}
        variant={variant}
        size={size}
        leftIcon={icon}
        rightIcon={<ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={className}
      >
        {label}
      </Button>
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={width} label={typeof label === 'string' ? label : undefined} align="end">
        <div className="p-1" role="menu">
          {items.map((it) => (
            <div key={it.key}>
              {it.divider && <div className="my-1 border-t border-line" />}
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled || it.loading}
                onClick={() => {
                  setOpen(false)
                  it.onClick()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50',
                  it.danger ? 'text-danger' : 'text-fg',
                )}
              >
                <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-md', it.danger ? 'bg-danger-soft' : 'bg-surface-2 text-fg-muted')}>
                  {it.loading ? <Spinner size={14} /> : it.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold">{it.label}</span>
                  {it.hint && <span className="block text-[11.5px] leading-snug text-fg-subtle">{it.hint}</span>}
                </span>
              </button>
            </div>
          ))}
        </div>
      </AnchoredPanel>
    </>
  )
}
