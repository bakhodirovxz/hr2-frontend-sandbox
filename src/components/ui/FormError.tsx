import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The validation line of a form.
 *
 * Every form used to render `{error && <p className="text-sm text-danger">…}`
 * as the LAST child of the scrollable modal body. On a form taller than the
 * viewport (the trip letter, the employee card, a KPI entry) the message
 * landed below the fold: «Saqlash» appeared to do nothing, and nothing said
 * why (audit 2026-09-21). This scrolls itself into view whenever the text
 * changes and is announced to screen readers.
 */
export function FormError({ children, className }: { children?: ReactNode; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (children) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [children])
  if (!children) return null
  return (
    <p ref={ref} role="alert" className={cn('text-sm text-danger', className)}>
      {children}
    </p>
  )
}
