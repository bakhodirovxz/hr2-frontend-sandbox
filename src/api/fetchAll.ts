import { apiGet } from './http'
import { toItems, type ListResponse } from '@/types'

/** The server's own ceiling (`core/pagination.MAX_SIZE`). Asking for more is
 *  answered with 422, so a reference list has to be walked page by page. */
const MAX_PAGE_SIZE = 500

/** Never walk further than this — a runaway list must not turn into 40 requests. */
const MAX_PAGES = 12

/**
 * Every row of a reference list, however many pages that takes.
 *
 * ⚠️ A dropdown CANNOT just ask for a huge page. The big branches hold ~913 job
 * positions, and the two ways of getting them wrong both bite: a small cap
 * silently drops half the options, and `size=1000` is now rejected outright
 * with 422 (the server caps a page at 500), which empties the dropdown
 * completely. So: take the first page, look at `total`, and fetch the rest.
 */
export async function fetchAllPages<T>(
  url: string,
  params: Record<string, unknown> = {},
  size = MAX_PAGE_SIZE,
  /** Some lists cap `size` lower (employee-kpi: 100) — then more pages are needed. */
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const first = await apiGet<ListResponse<T>>(url, { ...params, page: 1, size })
  const items = toItems(first)
  const total = (first as { total?: number } | undefined)?.total

  // A bare array (no envelope) is already everything the endpoint has.
  if (total == null || items.length >= total) return items

  const pages = Math.min(Math.ceil(total / size), maxPages)
  if (pages <= 1) return items

  // Six at a time: «select all» over the whole organisation can mean dozens of
  // pages of an expensive aggregate (employee-kpi), and firing them at once
  // piled them onto the API together.
  const rest: ListResponse<T>[] = []
  const pageNos = Array.from({ length: pages - 1 }, (_, i) => i + 2)
  for (let i = 0; i < pageNos.length; i += 6) {
    const batch = await Promise.all(
      pageNos.slice(i, i + 6).map((p) => apiGet<ListResponse<T>>(url, { ...params, page: p, size })),
    )
    rest.push(...batch)
  }
  return [...items, ...rest.flatMap((r) => toItems<T>(r))]
}
