import { useCallback, useState } from 'react'

/**
 * Bitta foydalanuvchining bitta jadval bo'yicha tanlovi: qaysi ustunlar
 * ko'rinadi va qanday kenglikda.
 *
 * Bu shaxsiy QULAYLIK — server ma'lumoti emas, TZ ham uni talab qilmaydi,
 * shuning uchun shu brauzerda (localStorage) saqlanadi. Saqlash bloklangan
 * bo'lsa (shaxsiy oyna) jadval standart ko'rinishda ishlayveradi.
 */
export interface TableSettings {
  /** O'chirilgan standart ustunlar. */
  hidden: string[]
  /** Yoqilgan qo'shimcha (`defaultHidden`) ustunlar. */
  shown: string[]
  /** Sarlavha chetini sudrab o'rnatilgan kengliklar (px). */
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
    /* shaxsiy oyna / bloklangan storage — tanlov shu sessiyada qoladi */
  }
}

export function useTableSettings(tableId?: string) {
  const key = tableId ? `table:${tableId}` : null
  const [settings, setSettings] = useState<TableSettings>(() => (key && readLocal(key)) || EMPTY)

  const update = useCallback(
    (fn: (prev: TableSettings) => TableSettings) => {
      if (!key) return
      setSettings((prev) => {
        const next = fn(prev)
        writeLocal(key, next)
        return next
      })
    },
    [key],
  )

  const reset = useCallback(() => {
    if (!key) return
    setSettings(EMPTY)
    writeLocal(key, null)
  }, [key])

  const isCustom = settings.hidden.length > 0 || settings.shown.length > 0 || Object.keys(settings.widths).length > 0

  return { settings, update, reset, isCustom, enabled: !!key }
}
