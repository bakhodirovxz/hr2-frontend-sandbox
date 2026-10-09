import { useCallback, useMemo } from 'react'
import type { useListParams } from './useListParams'

type ListParams = ReturnType<typeof useListParams>

/**
 * Filter count + reset for screens where SOME URL keys are not filters —
 * typically `tab`, which switches the whole view. `useListParams` counts and
 * clears every key it was given, so "Clear filters (1)" would light up just
 * for being on the second tab, and pressing it would throw the user back to
 * the first one. This variant counts and clears only `keys` (plus the search).
 */
export function useFilterReset(lp: ListParams, keys: readonly string[]) {
  const count = useMemo(
    () => keys.filter((k) => lp.filters[k]).length + (lp.search ? 1 : 0),
    [lp.filters, lp.search, keys],
  )
  const reset = useCallback(
    () => lp.setFilters(Object.fromEntries([...keys, 'q'].map((k) => [k, null]))),
    [lp.setFilters, keys],
  )
  return { count, reset }
}
