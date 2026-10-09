import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

const DEFAULT_PAGE_SIZE = 25
export const PAGE_SIZE_OPTIONS = [25, 50, 100]

/**
 * List-screen state (search, page, page size, arbitrary filters) held in the
 * URL — so every list view is bookmarkable, shareable and survives the back
 * button. Every list page in the app must use this instead of local state.
 *
 * Changing a filter or the search resets back to page 1, which is what users
 * expect (otherwise you land on an empty page 7 of a 2-page result).
 */
export function useListParams(filterKeys: readonly string[] = []) {
  const [params, setParams] = useSearchParams()

  const search = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  // Clamped: a hand-edited or old bookmarked `?size=500` reached endpoints
  // that cap `size` at 100 (dashboard/employee-kpi) and the page got a 422
  // instead of a list.
  const size = Math.min(Number(params.get('size')) || DEFAULT_PAGE_SIZE, Math.max(...PAGE_SIZE_OPTIONS))

  const filters = useMemo(() => {
    const out: Record<string, string> = {}
    for (const k of filterKeys) out[k] = params.get(k) ?? ''
    return out
  }, [params, filterKeys])

  const patch = useCallback(
    (next: Record<string, string | number | null>, { resetPage = true } = {}) => {
      setParams(
        (prev) => {
          const sp = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(next)) {
            if (v === null || v === '' || v === undefined) sp.delete(k)
            else sp.set(k, String(v))
          }
          if (resetPage && !('page' in next)) sp.delete('page')
          return sp
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const setSearch = useCallback((v: string) => patch({ q: v }), [patch])
  const setPage = useCallback((v: number) => patch({ page: v <= 1 ? null : v }, { resetPage: false }), [patch])
  const setSize = useCallback((v: number) => patch({ size: v === DEFAULT_PAGE_SIZE ? null : v }), [patch])
  const setFilter = useCallback((key: string, v: string) => patch({ [key]: v }), [patch])
  // Set several params in ONE update. Two separate setFilter calls in the same
  // event handler race (react-router's functional updater reads the committed
  // params, so the second clobbers the first) — use this instead.
  const setFilters = useCallback(
    (next: Record<string, string | null>) => patch(next),
    [patch],
  )

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length + (search ? 1 : 0),
    [filters, search],
  )

  const reset = useCallback(() => {
    patch(Object.fromEntries([...filterKeys, 'q'].map((k) => [k, null])))
  }, [patch, filterKeys])

  return {
    search, setSearch,
    page, setPage,
    size, setSize,
    filters, setFilter, setFilters,
    activeFilterCount, reset,
  }
}
