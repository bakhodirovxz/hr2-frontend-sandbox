import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * NOCTURNE — the block vocabulary the two dashboard designs are built from.
 *
 * A PANEL is a card cut out of the night ground: one clear value step lighter,
 * a long soft shadow, and a single directional WASH that says what kind of
 * block it is (violet = the product's own voice, red = something is wrong,
 * green = people, cyan = movement). The wash is the only gradient allowed on a
 * surface here — it is light falling across a corner, not decoration.
 */
export type PanelWash = 'none' | 'violet' | 'danger' | 'success' | 'info'

const WASH: Record<PanelWash, string | undefined> = {
  none: undefined,
  violet: 'linear-gradient(165deg, rgb(var(--brand) / 0.10), transparent 50%)',
  danger: 'linear-gradient(155deg, rgb(var(--danger) / 0.08), transparent 45%)',
  success: 'linear-gradient(180deg, rgb(var(--success) / 0.06), transparent 45%)',
  info: 'linear-gradient(195deg, rgb(var(--info) / 0.08), transparent 50%)',
}

interface PanelProps {
  style?: import('react').CSSProperties
  wash?: PanelWash
  className?: string
  children: ReactNode
  /** Rendered as <section> with this accessible name when given. */
  label?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocus?: () => void
  onBlur?: () => void
}

export function Panel({ wash = 'none', className, children, label, style, ...handlers }: PanelProps) {
  return (
    <section
      aria-label={label}
      {...handlers}
      className={cn(
        'relative flex min-h-0 flex-col overflow-hidden rounded-card bg-surface shadow-md',
        className,
      )}
      style={{ backgroundImage: WASH[wash], ...style }}
    >
      {children}
    </section>
  )
}

/**
 * The small letterspaced label above a title. In this world it is always the
 * violet voice — it is how a block names the department it speaks for.
 */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'text-[12.5px] font-bold text-brand-strong',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Eyebrow + title, the standard head of every panel in these designs. */
export function PanelHeading({
  eyebrow,
  title,
  size = 'lg',
}: {
  eyebrow: ReactNode
  title: ReactNode
  size?: 'lg' | 'sm'
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          'm-0 truncate font-semibold text-fg',
          size === 'lg' ? 'text-[19px]' : 'text-[16px]',
        )}
      >
        {title}
      </h2>
    </div>
  )
}

/** The 30px square control the designs use for every panel-local action. */
export function SquareButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid h-[30px] w-[30px] shrink-0 place-items-center rounded-tag bg-fg/[0.06] transition-colors',
        disabled ? 'cursor-not-allowed text-fg-subtle/50' : 'text-fg hover:bg-fg/[0.12]',
      )}
    >
      {children}
    </button>
  )
}

/** The empty voice inside a panel — never a page-level empty state. */
export function PanelEmpty({ text }: { text: string }) {
  return (
    <div className="grid flex-1 place-items-center px-6 py-10 text-center text-[13px] text-fg-subtle">
      {text}
    </div>
  )
}
