import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { MapPin, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { apiDelete, apiGet, apiPost } from '@/api/http'
import { errorMessage } from '@/api/errorMessage'
import { formatAppDate } from '@/lib/format'
import type { OrderAct } from '@/features/orders/useOrders'
import { LoadError } from '@/components/data/LoadError'

const URL = 'order-act-actions'

/**
 * KELISH / KETISH QAYDLARI — what HR records against a signed order.
 *
 * ⚠️ SCOPE. v1 draws a four-step trip chronology here (leave home branch →
 * arrive at destination → leave destination → return home), but it is driven by
 * `arrival_organization_branch_id`, a column migration `5e5b027be51e` DROPPED.
 * With no destination branch on the record the second step can never resolve,
 * so only the step that still works is offered: HR of the order's own branch
 * confirms the arrival once, on a signed order that has no action yet. The
 * recorded actions themselves are always listed, whatever wrote them.
 */
interface OrderActAction {
  id: number
  order_act_id?: number | null
  action_date?: string | null
  action_type?: string | null
  organization_branch_id?: number | null
  organization_branch?: { id?: number; name?: string | null } | null
}

export function OrderActionsPanel({
  order,
  onDone,
}: {
  /**
   * The gate is the server's `order.can_manage` — every one of these routes
   * runs `OrderActService.assert_can_edit`, and the flag is that predicate
   * evaluated for THIS user on THIS order. It used to be re-derived here from
   * the role plus the selected branch as a proxy, which hid the button from
   * the creator and from executive HR viewing another branch.
   */
  order: OrderAct
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const [removing, setRemoving] = useState<OrderActAction | null>(null)
  const confirm = useConfirm()

  const q = useQuery({
    queryKey: [URL, order.id],
    queryFn: () => apiGet<OrderActAction[]>(URL, { order_act_id: order.id }),
    retry: false,
  })
  const rows = Array.isArray(q.data) ? q.data : []
  const done = () => {
    void qc.invalidateQueries({ queryKey: [URL, order.id] })
  }

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(URL, body),
    onSuccess: () => {
      done()
      onDone(t('orders.arrivalRecorded'))
    },
    onError: (e) => toast.error(errorMessage(e, t('orders.actionFailed'))),
  })
  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(`${URL}/${id}`),
    onSuccess: () => {
      done()
      onDone(t('orders.actionDone'))
    },
    onError: (e) => toast.error(errorMessage(e, t('orders.actionFailed'))),
  })

  const homeBranchId = order.organization_branch_id ?? null
  const isDecree = order.category_rel?.creator_role === 'hr' || order.category_rel?.creator_role === 'employee'
  const signed = order.status === 'signed' || order.status === 'tasdiqlangan'
  /* The decree flow (agreement → chancellery → leadership → readers) has no
     arrival step at all, and a second arrival on the same order is meaningless. */
  /* The server gate for recording a movement is `assert_can_edit` — the same
     `_assert_can_edit_decree` the order ships as `can_manage`. The old proxy
     (site-master ‖ HR whose SELECTED branch equals the home branch) hid the
     button from the creator and from executive HR on another branch. */
  const canRecord = !!order.can_manage
  /* ⚠️ `rows.length === 0` doubles as "no arrival recorded yet". On a FAILED
   * request the list is empty for a different reason, and the button would
   * then offer to record a second arrival for a trip that already has one.
   * Unknown must not be read as "none", so a failed load withdraws the
   * button and says so instead. */
  const canAddArrival =
    canRecord &&
    signed &&
    !isDecree &&
    !q.isError &&
    rows.length === 0

  // Same reason the panel no longer vanishes on failure: an empty panel is a
  // claim that the trip has no movements.
  if (rows.length === 0 && !canAddArrival && !q.isError) return null

  return (
    <section className="mb-6">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-fg">{t('orders.movements')}</h3>
        {canAddArrival && (
          <Button
            size="sm"
            variant="secondary"
            className="ml-auto"
            loading={create.isPending}
            leftIcon={<MapPin size={14} />}
            onClick={async () => {
              if (!(await confirm({ kind: 'approve', confirmLabel: t('orders.confirmArrival') }))) return
              create.mutate({
                order_act_id: order.id,
                action_date: dayjs().format('YYYY-MM-DD'),
                action_type: 'arrival',
                organization_branch_id: Number(homeBranchId),
              })
            }}
          >
            {t('orders.confirmArrival')}
          </Button>
        )}
      </div>

      {q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-fg-subtle">{t('orders.movementsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                <MapPin size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-fg">
                  {a.action_type === 'departure' ? t('orders.movementDeparture') : t('orders.movementArrival')}
                </span>
                <span className="block truncate text-[11.5px] text-fg-subtle">
                  {a.action_date ? formatAppDate(a.action_date) : '—'}
                  {a.organization_branch?.name ? ` · ${a.organization_branch.name}` : ''}
                </span>
              </span>
              {canRecord && (
                <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(a)}>
                  <Trash2 size={15} className="text-danger" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          const target = removing
          setRemoving(null)
          if (target) remove.mutate(target.id)
        }}
        danger
        loading={remove.isPending}
        title={t('orders.movementDeleteTitle')}
        description={t('orders.movementDeleteConfirm')}
        confirmLabel={t('common.delete')}
      />
    </section>
  )
}
