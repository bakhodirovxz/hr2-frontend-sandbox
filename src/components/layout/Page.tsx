import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Consistent page padding + max width.
 *
 * The cap is 1920px, not 1600: on a normal 1920 screen the old value threw
 * away ~250px of usable width, which is exactly what made the data tables feel
 * squeezed.
 *
 * ⚠️ 2026-08-28 — the vertical padding came down from 36px to 20px. The design
 * screens breathe at `14px 20px 20px`; 36px above the first card plus a 40px
 * title was pushing the first row of every list below the fold on a laptop.
 * Horizontal padding stays a touch wider than the design because this shell
 * has no docked sidebar to give the content a left edge.
 */
export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('mx-auto w-full max-w-[1920px] px-page py-page-y', className)} {...props} />
  )
}

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}

/**
 * Page heading.
 *
 * ⚠️ 2026-08-28 — THE TITLE STOPPED SHOUTING. It used to be 40px extrabold in
 * the hero gradient, which cost every screen ~110px of vertical space before a
 * single row of data and was not the language the product was actually drawn
 * in: the design screens (Claude Design afd32a12) carry NO page title at all —
 * they open straight onto the work, and each block names itself with a 12px
 * semibold line. The compromise kept here is a 22px ink title with the
 * subtitle ON THE SAME LINE, so a list page starts ~70px higher and the
 * heading reads as a label rather than a poster.
 *
 * The gradient is gone with it: display type in this world is INK and WEIGHT.
 */
export function PageHeader({ title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('relative mb-4', className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-fg">
            {title}
          </h1>
          {subtitle && <p className="text-[13px] text-fg-subtle">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
