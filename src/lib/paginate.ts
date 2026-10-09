interface ClientPage<T> {
  slice: T[]
  total: number
  pages: number
  /** `page` clamped into range — a filter can shrink the list under the current page. */
  page: number
}

/**
 * Client-side pagination for endpoints that return a plain list instead of a
 * page envelope (visitors, order types, …). The list screens still behave
 * identically — filter, search and pagination all work the same way.
 */
export function paginateClient<T>(rows: T[], page: number, size: number): ClientPage<T> {
  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / size))
  const safePage = Math.min(Math.max(1, page), pages)
  return {
    slice: rows.slice((safePage - 1) * size, safePage * size),
    total,
    pages,
    page: safePage,
  }
}
