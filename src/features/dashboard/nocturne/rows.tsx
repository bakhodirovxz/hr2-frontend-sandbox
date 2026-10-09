import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

export type RowTone = 'success' | 'warning' | 'danger' | 'brand' | 'info' | 'neutral'

const PILL: Record<RowTone, string> = {
  success: 'bg-success/[0.12] text-success',
  warning: 'bg-warning/[0.13] text-warning',
  danger: 'bg-danger/[0.13] text-danger',
  brand: 'bg-brand/[0.14] text-brand-strong',
  info: 'bg-info/[0.12] text-info',
  neutral: 'bg-fg/[0.06] text-fg-muted',
}

const TEXT: Record<RowTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  brand: 'text-brand-strong',
  info: 'text-info',
  neutral: 'text-fg-subtle',
}

export function StatusPill({ tone, children }: { tone: RowTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11px] font-semibold',
        PILL[tone],
      )}
    >
      {children}
    </span>
  )
}

export function ToneText({
  tone,
  children,
  className,
}: {
  tone: RowTone
  children: ReactNode
  className?: string
}) {
  return <span className={cn(TEXT[tone], className)}>{children}</span>
}

/**
 * A row in a panel list.
 *
 * `filled` rows carry their own faint plate and stretch to share the panel's
 * height (that is how the designs keep a five-item list from leaving a hole);
 * unfilled rows are a plain log line that only lights up under the pointer.
 */
export function ListRow({
  filled,
  children,
  className,
  onClick,
}: {
  filled?: boolean
  children: ReactNode
  className?: string
  /** Makes the row a button (e.g. a week day that opens the month calendar). */
  onClick?: () => void
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex items-center gap-2.5 rounded-control px-2.5 py-2 text-left',
        filled ? 'flex-1 bg-fg/[0.035]' : 'hover:bg-fg/[0.05]',
        onClick && 'w-full',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

/** Photo (falling back to initials) + name over a quiet second line. */
export function PersonCell({
  name,
  sub,
  photo,
  photoFull,
  size = 34,
  live,
  onPhotoClick,
}: {
  name: string
  sub?: string | null
  photo?: string | null
  photoFull?: string | null
  size?: number
  /** A green pulse on the avatar — this passed the gate in the last minutes. */
  live?: boolean
  /**
   * The PORTRAIT is its own target. v1 opens the pass detail from it while the
   * name opens the tabel, so the row answers two different questions depending
   * on where it is clicked; without this the photo was decoration.
   */
  onPhotoClick?: () => void
}) {
  return (
    <>
      <span
        className={cn('relative shrink-0', onPhotoClick && 'cursor-pointer')}
        role={onPhotoClick ? 'button' : undefined}
        tabIndex={onPhotoClick ? 0 : undefined}
        aria-label={onPhotoClick ? name : undefined}
        onClick={
          onPhotoClick
            ? (e) => {
                // The row itself opens the tabel — the photo must not do both.
                e.stopPropagation()
                onPhotoClick()
              }
            : undefined
        }
        onKeyDown={
          onPhotoClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  e.stopPropagation()
                  onPhotoClick()
                }
              }
            : undefined
        }
      >
        <Avatar src={photo} fallbackSrc={photoFull} name={name} size={size} />
        {live && (
          <span className="absolute bottom-0 right-0 h-2 w-2 animate-pulse rounded-pill bg-success ring-2 ring-surface" />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {/* `title`: the full name on hover wherever the column is too narrow
            for a three-part Uzbek name (1280 px board column). */}
        <span className="truncate text-[13px] font-medium text-fg" title={name}>{name}</span>
        {sub && <span className="truncate text-[11px] text-fg-subtle" title={sub}>{sub}</span>}
      </span>
    </>
  )
}

/** The squared icon tile a non-person row leads with. */
export function IconCell({
  icon: Icon,
  tone,
  size = 34,
}: {
  icon: LucideIcon
  tone: RowTone
  size?: number
}) {
  const lv = useLowVisionScale()
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-inner', PILL[tone])}
      style={{ width: size * lv, height: size * lv }}
    >
      <Icon size={Math.round(size * 0.45)} />
    </span>
  )
}

/** The scroll body every panel list shares. */
export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'scroll-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto px-3 pb-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
