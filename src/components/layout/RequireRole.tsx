import type { ReactNode } from 'react'
import { NotFound } from './NotFound'

/**
 * Renders the page only for an account that may use it; everyone else gets
 * the SAME 404 as a missing address (user, 2026-09-24). Used by the shell's
 * menu gate (`isPathAllowed`) and by pages with their own role check.
 * `title` is kept for callers; a 404 does not name the page it hides.
 */
export function RequireRole({
  allowed,
  children,
}: {
  allowed: boolean
  title?: string
  children: ReactNode
}) {
  if (allowed) return <>{children}</>
  return <NotFound />
}
