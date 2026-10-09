import type { ReactNode } from 'react'
import { Check, Clock, X } from 'lucide-react'
import { cn } from '@/lib/cn'

export type FlowState = 'done' | 'current' | 'pending' | 'rejected'

export interface FlowStep {
  key: string
  label: string
  hint?: string
  state: FlowState
  icon?: ReactNode
}

const STATE: Record<FlowState, { fill: string; icon: ReactNode }> = {
  done: { fill: 'bg-success-soft text-success ring-1 ring-inset ring-success/25', icon: <Check size={13} strokeWidth={3} /> },
  current: { fill: 'accent-tile', icon: <Clock size={13} strokeWidth={2.6} /> },
  pending: { fill: 'bg-surface-2 text-fg-subtle ring-1 ring-inset ring-line', icon: null },
  rejected: { fill: 'bg-danger-soft text-danger ring-1 ring-inset ring-danger/25', icon: <X size={13} strokeWidth={3} /> },
}

/**
 * Approval chain as CHEVRONS, not pills.
 *
 * A row of identical rounded chips says "here are four things"; a row of
 * chevrons says "this flows left to right, and this is where it stopped" —
 * the shape carries the meaning, so the user reads the state without reading
 * the labels. The first and last segments are squared off on their outer edge
 * so the strip has a beginning and an end.
 */
export function FlowSteps({ steps, className }: { steps: FlowStep[]; className?: string }) {
  if (steps.length === 0) return null
  return (
    <ol className={cn('flex flex-wrap items-stretch gap-1', className)}>
      {steps.map((s, i) => {
        const shape =
          steps.length === 1
            ? 'rounded-pill px-4'
            : i === 0
              ? 'shape-step shape-step-first rounded-l-pill'
              : i === steps.length - 1
                ? 'shape-step shape-step-last rounded-r-pill'
                : 'shape-step'
        return (
          <li
            key={s.key}
            className={cn(
              'flex min-h-[38px] items-center gap-2 py-1.5 text-[13px] font-medium',
              shape,
              STATE[s.state].fill,
            )}
          >
            {(s.icon ?? STATE[s.state].icon) && (
              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-current/15">
                {s.icon ?? STATE[s.state].icon}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate leading-tight">{s.label}</span>
              {s.hint && <span className="block truncate text-[11px] opacity-75">{s.hint}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
