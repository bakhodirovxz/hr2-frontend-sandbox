import { useCallback, useEffect, useRef, useState } from 'react'
import { apiDelete, apiGet, apiPut } from '@/api/http'

/**
 * One user's choices for one table: which columns show and how wide they are.
 *
 * Verifix kept exactly this per user and per grid, and the client's people
 * used it — 54 customised the home-page table, 41 the KPI sheet list, 27 the
 * request list (measured 2026-09-23). Saved on the server (`/ui-settings`) so
 * it follows the user to another computer; a local copy only paints the first
 * frame without a flash of the default layout.
 */
export interface TableSettings {
  /** Default-visible columns the user switched off. */
  hidden: string[]
  /** `defaultHidden` («extra») columns the user switched on. */
  shown: string[]
  /** Column widths in px, from dragging a header edge. */
  widths: Record<string, number>
}

const EMPTY: TableSettings = { hidden: [], shown: [], widths: {} }
const LOCAL_PREFIX = 'table-settings:'

function readLocal(key: string): TableSettings | null {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + key)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<TableSettings>) } : null
  } catch {
    return null
  }
}

function writeLocal(key: string, value: TableSettings | null) {
  try {
    if (value) localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(value))
    else localStorage.removeItem(LOCAL_PREFIX + key)
  } catch {
    /* private window / storage blocked — the server copy still holds */
  }
}

export function useTableSettings(tableId?: string) {
  const key = tableId ? `table:${tableId}` : null
  const [settings, setSettings] = useState<TableSettings>(() => (key && readLocal(key)) || EMPTY)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<TableSettings | null>(null)

  useEffect(() => {
    if (!key) return
    let alive = true
    apiGet<{ value: Partial<TableSettings> | null }>(`ui-settings/${key}`)
      .then((r) => {
        if (!alive || pending.current) return
        const next = r?.value ? { ...EMPTY, ...r.value } : EMPTY
        setSettings(next)
        writeLocal(key, r?.value ? next : null)
      })
      .catch(() => {
        /* offline or not signed in — keep the local copy */
      })
    return () => {
      alive = false
    }
  }, [key])

  const flush = useCallback(() => {
    if (!key || !pending.current) return
    const value = pending.current
    pending.current = null
    apiPut(`ui-settings/${key}`, { value }).catch(() => {
      /* the local copy keeps the choice for this browser */
    })
  }, [key])

  // Save the last change on unmount too (navigating away mid-drag).
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
    flush()
  }, [flush])

  const update = useCallback(
    (fn: (prev: TableSettings) => TableSettings) => {
      if (!key) return
      setSettings((prev) => {
        const next = fn(prev)
        writeLocal(key, next)
        pending.current = next
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(flush, 600)
        return next
      })
    },
    [key, flush],
  )

  const reset = useCallback(() => {
    if (!key) return
    if (timer.current) clearTimeout(timer.current)
    pending.current = null
    setSettings(EMPTY)
    writeLocal(key, null)
    apiDelete(`ui-settings/${key}`).catch(() => {})
  }, [key])

  const isCustom = settings.hidden.length > 0 || settings.shown.length > 0 || Object.keys(settings.widths).length > 0

  return { settings, update, reset, isCustom, enabled: !!key }
}
