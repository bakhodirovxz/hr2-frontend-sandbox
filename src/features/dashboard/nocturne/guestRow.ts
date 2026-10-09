import type { TFunction } from 'i18next'
import type { TurnstileEvent } from '@/types/dashboard'

/**
 * How a guest's pass reads on the dashboard (guests card and the live feed's
 * «Mehmonlar» tab).
 *
 * ⚠️ The API names the visitor `legal_name` / `organization_name`
 * (`EventVisitorRead`). Both screens read `full_name` / `organization`, which
 * the server never sends — so every row said «Mehmon» with no face, and the
 * only name on it was the HOST's, which made each guest look like an employee
 * (2026-10-05).
 *
 * Face: the photo taken at registration, else the gate camera's snapshot of
 * this pass. Without either the avatar shows the guest's initials.
 */
export function guestRow(e: TurnstileEvent, t: TFunction) {
  const v = e.visitor
  const host = v?.host_employee_name || e.invitation?.invited_by_employee_name
  return {
    name: v?.legal_name?.trim() || t('dashboard.guestShort'),
    sub:
      [v?.organization_name, host ? t('dashboard.guestHost', { name: host }) : null].filter(Boolean).join(' · ') ||
      null,
    photo: v?.photo_thumb_path || e.photo_thumb_path || v?.photo_path || e.photo_path || null,
    photoFull: v?.photo_path || e.photo_path || null,
  }
}
