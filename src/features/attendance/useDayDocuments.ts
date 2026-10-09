import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { ORDER_ACTS, WORK_LEAVES } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import type { OrderAct } from '@/features/orders/useOrders'
import type { LeaveRequest } from '@/features/leave/useLeave'

/** An order/leave that explains a calendar day. */
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
 * The paperwork behind a day: business trips, HR orders, approved leave.
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

  const leaves = useQuery({
    queryKey: ['my-day-leaves', employeeId],
    // The endpoint takes no date range; a person has few requests, so the whole
    // list is fetched once and filtered by day here.
    queryFn: () => apiGet<ListResponse<LeaveRequest>>(WORK_LEAVES, { employee_id: employeeId }),
    enabled: !!employeeId,
  })

  const orderItems = useMemo(() => toItems(orders.data), [orders.data])
  const leaveItems = useMemo(() => toItems(leaves.data), [leaves.data])

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

    for (const l of leaveItems) {
      const start = (l.start_date ?? '').slice(0, 10)
      const end = (l.end_date ?? l.start_date ?? '').slice(0, 10)
      if (!start || date < start || date > end) continue
      out.push({
        kind: 'leave',
        id: l.id,
        title: l.description || '',
        from: start,
        to: end,
        status: l.status,
        href: '/request-permission',
      })
    }

    return out
  }

  return { forDate, loading: orders.isLoading || leaves.isLoading }
}
