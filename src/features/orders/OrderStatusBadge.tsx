import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { DECREE_TONE, isDecreeOrder, isKnownDecreeStatus, legacyState, type DecreeStatus } from './orderFlow'
import type { OrderAct } from './useOrders'

export function decreeStatusLabel(t: TFunction, status: DecreeStatus): string {
  return t(`orders.st_${status}`)
}

/** The status text for any order (decree stage, or a legacy act's state). */
export function orderStatusText(t: TFunction, o: OrderAct): string {
  if (isDecreeOrder(o) && isKnownDecreeStatus(o.status)) return decreeStatusLabel(t, o.status)
  const s = legacyState(o)
  return s === 'rejected' ? t('orders.st_rejected') : s === 'signed' ? t('orders.legacySigned') : t('orders.legacyNew')
}

/**
 * Status as text, never an icon alone (TZ expertise C19). For a decree sent
 * back for changes, the tooltip names who sent it back.
 */
export function OrderStatusBadge({ order }: { order: OrderAct }) {
  const { t } = useTranslation()
  let tone: 'neutral' | 'warning' | 'danger' | 'success' | 'info' | 'brand' = 'info'
  if (isDecreeOrder(order) && isKnownDecreeStatus(order.status)) tone = DECREE_TONE[order.status]
  else {
    const s = legacyState(order)
    tone = s === 'rejected' ? 'danger' : s === 'signed' ? 'success' : 'info'
  }
  const text = orderStatusText(t, order)
  const by = order.rejected_by?.legal_name
  return (
    <Badge tone={tone} dot title={by && (order.status === 'changes_requested' || order.status === 'rejected') ? `${text}: ${by}` : text}>
      {text}
    </Badge>
  )
}
