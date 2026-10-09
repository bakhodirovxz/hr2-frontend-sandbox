import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/** Row selection for list screens: per-row toggle plus a header "select all on
 *  this page" that reports an indeterminate state when partially selected. */
/**
 * ACROSS PAGES (user, 2026-09-24: «bulk amalga pagination halal bermasligi kerak»).
 * The Set already survives paging. `opts.total` + `opts.loadAllIds` add the
 * Gmail move: once the whole page is ticked, offer «select all N matching the
 * filter», which loads every id through the list endpoint and ticks them all.
 * `opts.resetKey` (the filter/search string) clears the selection when the
 * filter changes — a selection made under another filter is not what the
 * reader sees any more.
 */
export interface RowSelectionOptions {
  total?: number
  loadAllIds?: () => Promise<number[]>
  resetKey?: string
}

export function useRowSelection<T extends { id: number }>(rows: T[], opts: RowSelectionOptions = {}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [selectingAll, setSelectingAll] = useState(false)
  const reset = useRef(opts.resetKey)
  useEffect(() => {
    if (reset.current !== opts.resetKey) {
      reset.current = opts.resetKey
      setSelected(new Set())
    }
  }, [opts.resetKey])

  const pageIds = useMemo(() => rows.map((r) => r.id), [rows])
  const selectedOnPage = useMemo(
    () => pageIds.filter((id) => selected.has(id)).length,
    [pageIds, selected],
  )

  const allOnPageSelected = pageIds.length > 0 && selectedOnPage === pageIds.length
  const someOnPageSelected = selectedOnPage > 0 && !allOnPageSelected

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAllOnPage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev)
      const every = pageIds.length > 0 && pageIds.every((id) => next.has(id))
      for (const id of pageIds) {
        if (every) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }, [pageIds])

  const clear = useCallback(() => setSelected(new Set()), [])

  const { loadAllIds, total } = opts
  const selectAllMatching = useCallback(async () => {
    if (!loadAllIds) return
    setSelectingAll(true)
    try {
      const ids = await loadAllIds()
      setSelected(new Set(ids))
    } finally {
      setSelectingAll(false)
    }
  }, [loadAllIds])

  return {
    selected,
    selectedIds: useMemo(() => Array.from(selected), [selected]),
    count: selected.size,
    isSelected: useCallback((id: number) => selected.has(id), [selected]),
    toggle,
    toggleAllOnPage,
    allOnPageSelected,
    someOnPageSelected,
    clear,
    /** Everything matching the current filter, all pages (needs `loadAllIds`). */
    selectAllMatching: loadAllIds ? selectAllMatching : undefined,
    selectingAll,
    total,
  }
}
