import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useAsyncClick } from './useAsyncClick'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'danger-ghost'
type Size = 'sm' | 'md' | 'lg' | 'icon'

/**
 * The primary action is the loudest element in the product and it is meant to
 * be: the petrol gradient, a coloured shadow that deepens on hover, and a real
 * lift. The flat single-fill version of this button belonged to the rendition
 * the user rejected.
 */
const VARIANTS: Record<Variant, string> = {
  // The stamp. Solid ink, the loudest thing on the surface, and the only
  // element allowed to carry a full-strength brand fill.
  primary:
    'accent-tile hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg),var(--shadow-brand)] active:translate-y-0 disabled:hover:translate-y-0',
  // The same action, unstamped: ink on an ink wash, inside a machined edge.
  secondary:
    'bg-brand-soft text-brand-strong ring-1 ring-inset ring-brand/20 hover:ring-brand/45 hover:brightness-[0.98]',
  outline:
    'bg-transparent text-fg border border-line-strong hover:border-brand/60 hover:bg-brand-soft/50',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-2 hover:text-fg',
  // The destructive confirm stays solid: it must never look optional.
  danger:
    'bg-danger text-white shadow-md hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0',
  /**
   * The destructive action that is merely PRESENT — one per row, one per card,
   * sitting there all day next to "Edit".
   *
   * ⚠️ It must NOT be the loudest thing on the surface. A grid of permission
   * groups where every card carries a solid red pill reads as a page about
   * deleting things. Solid red is reserved for the CONFIRM, where the user has
   * already chosen and the button has to look final.
   */
  'danger-ghost': 'bg-transparent text-danger hover:bg-danger/[0.10]',
}

/** Pill silhouettes — the shape this product has approved twice. `icon` stays
 *  a rounded square so a toolbar of icon buttons is not a row of circles. */
const SIZES: Record<Size, string> = {
  sm: 'h-btn-sm px-3.5 text-btn-sm gap-1.5 rounded-btn',
  md: 'h-btn px-5 text-btn leading-5 gap-2 rounded-btn',
  lg: 'h-btn-lg px-6 text-btn-lg gap-2 rounded-btn',
  icon: 'h-btn-icon w-btn-icon rounded-inner',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  leftIcon?: ReactNode
  rightIcon?: ReactNode
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    disabled,
    children,
    onClick,
    ...props
  },
  ref,
) {
  // An `onClick` that returns a promise keeps the button disabled (and
  // spinning) until it settles — see `useAsyncClick`.
  const [handleClick, pending] = useAsyncClick(onClick)
  const busy = loading || pending
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      onClick={handleClick}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold',
        'transition-[transform,background-color,color,border-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : leftIcon}
      {children}
      {!busy && rightIcon}
    </button>
  )
})
