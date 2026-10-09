import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Which shape role this surface plays — see the scale in theme.css. */
type CardShape = 'card' | 'panel' | 'inner' | 'feature' | 'feature-alt' | 'feature-b' | 'cut'

const SHAPES: Record<CardShape, string> = {
  /** Standard content surface. */
  card: 'rounded-card',
  /** Page-level container — one step up the scale. */
  panel: 'rounded-panel',
  /** Nested inside another surface. */
  inner: 'rounded-inner',
  /** Lead surface with one corner machined square, anchoring it to the grid. */
  feature: 'shape-feature',
  'feature-alt': 'shape-feature-alt',
  'feature-b': 'shape-feature-b',
  /** Folded page corner — a registered document. */
  cut: 'shape-cut',
}

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  shape?: CardShape
  /** For surfaces that are themselves links or buttons. */
  interactive?: boolean
}

/**
 * Surface container used across the app.
 *
 * PROPUSK world, rich rendition: a card is a real object on the desk — a
 * vertical sheen so it is never dead flat, a lit top edge, and a shadow with
 * enough depth to lift it off the ground. The flat hairline version of this
 * card was the single biggest reason the first rendition read as "boring".
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, shape = 'card', interactive, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'surface-gradient relative overflow-hidden border border-line shadow-md',
        SHAPES[shape],
        interactive &&
          'cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg',
        className,
      )}
      {...props}
    />
  )
})

interface CardHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  icon?: ReactNode
  /** @deprecated kept so existing call sites compile; the tile is gone. */
  iconShape?: 'tile' | 'blob'
  action?: ReactNode
}

/**
 * Section head.
 *
 * The gradient icon tile that used to sit here is gone on purpose: an icon
 * square above every heading is the single most recognizable tell of a
 * generated dashboard, and it made every section on a page look like every
 * other one. What names a section in this world is an ENGRAVED PLACARD — small
 * letterspaced caps cut into the plate — with the icon riding inline at label
 * size when a caller passes one.
 */
export function CardHeader({
  title,
  subtitle,
  icon,
  action,
  className,
  children,
  ...props
}: CardHeaderProps) {
  return (
    <div
      className={cn('flex items-center gap-2.5 border-b border-line px-card py-3', className)}
      {...props}
    >
      {icon && <span className="shrink-0 text-fg-subtle [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {(title || subtitle) && (
        <div className="min-w-0 flex-1">
          {title && <h3 className="engrave truncate text-fg">{title}</h3>}
          {subtitle && <p className="mt-1 truncate text-xs text-fg-muted">{subtitle}</p>}
        </div>
      )}
      {children}
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  )
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-card', className)} {...props} />
}
