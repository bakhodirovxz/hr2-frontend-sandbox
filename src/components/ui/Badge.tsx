import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'

/* Soft fill + a ring in the same hue: legible at 11px and unmistakably a chip.
 * Pill-shaped — the die-cut version tried in the first PROPUSK rendition read
 * as harsh next to 20px cards. */
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-fg-muted ring-1 ring-inset ring-line',
  brand: 'bg-brand-soft text-brand-strong ring-1 ring-inset ring-brand/25',
  success: 'bg-success-soft text-success ring-1 ring-inset ring-success/25',
  warning: 'bg-warning-soft text-warning ring-1 ring-inset ring-warning/25',
  danger: 'bg-danger-soft text-danger ring-1 ring-inset ring-danger/25',
  info: 'bg-info-soft text-info ring-1 ring-inset ring-info/25',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  dot?: boolean
}

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-[11.5px] font-semibold',
        TONES[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-pill bg-current" />}
      {children}
    </span>
  )
}
