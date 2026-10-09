import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

/**
 * PROPUSK world: an empty state is a blank slot in the register, so the icon
 * sits in a plain die-cut plate. The glowing brand halo it used to carry is
 * gone with the old world — and so was its token, which left this one
 * `shadow-[var(--glow-brand)]` resolving to nothing at all.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="mb-2 grid h-12 w-12 place-items-center rounded-inner border border-line bg-surface-2 text-fg-subtle">
        {icon ?? <Inbox size={22} />}
      </span>
      <p className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</p>
      {description && <p className="max-w-xs text-xs text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
