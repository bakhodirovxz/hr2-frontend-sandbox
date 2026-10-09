import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { useAsyncClick } from './useAsyncClick'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md'
  active?: boolean
  badge?: boolean
  children: ReactNode
}

/** Square, accessible icon-only button (header actions, toolbars). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { label, size = 'md', active = false, badge = false, className, children, onClick, disabled, ...props },
    ref,
  ) {
    const [handleClick, pending] = useAsyncClick(onClick)
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled || pending}
        onClick={handleClick}
        className={cn(
          'relative inline-grid place-items-center rounded-lg border border-transparent text-fg-muted transition-colors',
          'hover:bg-surface-2 hover:text-fg',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          active && 'bg-brand-soft text-brand',
          size === 'sm' ? 'h-control-sm w-control-sm' : 'h-icon w-icon',
          className,
        )}
        {...props}
      >
        {children}
        {badge && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-surface" />
        )}
      </button>
    )
  },
)
