import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { ORDER_ACTS } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import type { OrderAct } from '@/features/orders/useOrders'

/** An order that explains a calendar day. */
export interface DayDocument {
  kind: 'order' | 'leave'
  id: number
  title: string
  number?: string | null
  from?: string | null
  to?: string | null
  status?: string | null
  /** Route to the record, so the user can open the actual document. */
  href: string
}

interface TripOrder extends OrderAct {
  planned_departure_date?: string | null
  planned_return_date?: string | null
  employee_ids?: number[] | null
}

/**
 * The paperwork behind a day: business trips and HR orders (TZ 4.2.9).
 * hr-backend-sandbox has no leave-request register (`work-leaves`), so only
 * orders are read.
 *
 * The attendance calendar only says *what* a day was ("Xizmat safari"); this
 * says *why* — which order, which number, which dates — so a coloured cell can
 * be traced back to the document that produced it.
 *
 * Fetched per month (not per day) and filtered locally: the same two requests
 * serve every day the user opens.
 */
export function useMonthDocuments(employeeId: number | undefined, from: string, to: string) {
  const orders = useQuery({
    queryKey: ['my-day-orders', employeeId, from, to],
    queryFn: () =>
      apiGet<ListResponse<TripOrder>>(ORDER_ACTS, {
        employee_id: employeeId,
        date_from: from,
        date_to: to,
      }),
    enabled: !!employeeId,
  })

  const orderItems = useMemo(() => toItems(orders.data), [orders.data])

  /** Documents covering one ISO date. */
  const forDate = (date: string | null): DayDocument[] => {
    if (!date) return []
    const out: DayDocument[] = []

    for (const o of orderItems) {
      const start = (o.planned_departure_date ?? o.act_date ?? '').slice(0, 10)
      const end = (o.planned_return_date ?? o.act_date ?? '').slice(0, 10)
      // A single-dated order (a plain HR decree) only covers its own date.
      const covers = start && end ? date >= start && date <= end : start === date
      if (!covers) continue
      out.push({
        kind: 'order',
        id: o.id,
        title: o.category_rel?.name || o.summary || '',
        number: o.act_number,
        from: start || null,
        to: end || null,
        status: o.status,
        href: `/orders?open=${o.id}`,
      })
    }

    return out
  }

  return { forDate, loading: orders.isLoading }
}
