import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http'
import { HOLIDAYS_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from '@/features/employees/useEmployees'

export interface Holiday {
  id: number
  name: string
  date_from: string
  date_to: string
  is_repeatable: boolean
  organization_branch_id?: number | null
  /** 'holiday' = day off; 'workday' = a transferred working day (worked even on a weekend). */
  kind?: 'holiday' | 'workday'
}

/** `GET /holidays` is server-paginated and now accepts `search` (name), so the
 *  search covers every holiday — the old client-side filter only saw the
 *  current page and returned nothing for a holiday sitting on page 2. */
export function useHolidays(page: number, size: number, isRepeatable: string, search = '', kind = '') {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = search.trim()
  const query = useQuery({
    queryKey: ['holidays', { page, size, isRepeatable, branchId, term, kind }],
    queryFn: () =>
      apiGet<Page<Holiday>>(HOLIDAYS_LIST, {
        organization_branch_id: branchId || undefined,
        is_repeatable: isRepeatable === '' ? undefined : isRepeatable === 'yes',
        search: term || undefined,
        kind: kind || undefined,
        page,
        size,
      }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    pages: query.data?.pages ?? 1,
    loading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    fetching: query.isFetching,
  }
}

/** Holidays overlapping a date range — for marking calendar cells. */
export function useHolidayRange(from: string, to: string) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const query = useQuery({
    queryKey: ['holidays-range', { from, to, branchId }],
    queryFn: () =>
      apiGet<Page<Holiday>>(HOLIDAYS_LIST, {
        organization_branch_id: branchId || undefined,
        date_from: from,
        date_to: to,
        page: 1,
        size: 100,
      }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  })
  return query.data?.items ?? []
}

/**
 * The holiday covering `day`, if any.
 *
 * A repeatable holiday (Navro'z, Independence Day) is stored with one concrete
 * year but recurs, so it is compared by month+day only — otherwise it would
 * light up in 2024 and never again.
 */
export function holidayOn(holidays: Holiday[], day: Dayjs): Holiday | undefined {
  const iso = day.format('YYYY-MM-DD')
  return holidays.find((h) => {
    // A transferred working day is not a holiday — it is marked by the tabel itself.
    if (!h.date_from || !h.date_to || h.kind === 'workday') return false
    const from = dayjs(h.date_from)
    const to = dayjs(h.date_to)
    if (h.is_repeatable) {
      const md = (d: Dayjs) => d.month() * 100 + d.date()
      const cell = md(day)
      const a = md(from)
      const b = md(to)
      // A range that wraps the new year (e.g. 30.12–02.01) matches either side.
      return a <= b ? cell >= a && cell <= b : cell >= a || cell <= b
    }
    return iso >= from.format('YYYY-MM-DD') && iso <= to.format('YYYY-MM-DD')
  })
}

export function useHolidayMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['holidays'] }),
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(HOLIDAYS_LIST, body) }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPut(`${HOLIDAYS_LIST}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${HOLIDAYS_LIST}/${id}`) }),
  }
}
