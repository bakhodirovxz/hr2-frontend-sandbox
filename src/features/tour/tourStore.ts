import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * TUR HOLATI.
 *
 * Ko'rilgan turlar BRAUZERDA saqlanadi: taklif bir marta chiqishi kerak, va
 * buning uchun serverga yangi jadval ochish ortiqcha — bu odamning shu
 * qurilmadagi odati, tashkilot ma'lumoti emas.
 */
interface TourState {
  /** Hozir yurayotgan tur id si (null = tur yo'q). */
  active: string | null
  /** Tugatilgan yoki tashlab ketilgan turlar. */
  seen: string[]
  /** Birinchi kirishdagi taklif ko'rsatildimi. */
  welcomed: boolean
  start: (id: string) => void
  stop: () => void
  markSeen: (id: string) => void
  setWelcomed: () => void
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      active: null,
      seen: [],
      welcomed: false,
      start: (id) => set({ active: id }),
      stop: () => set({ active: null }),
      markSeen: (id) =>
        set((s) => (s.seen.includes(id) ? s : { ...s, seen: [...s.seen, id] })),
      setWelcomed: () => set({ welcomed: true }),
    }),
    {
      name: 'hrm-tour',
      // `active` saqlanmaydi: sahifa yangilanganda tur qaytadan boshlanmasin.
      partialize: (s) => ({ seen: s.seen, welcomed: s.welcomed }),
      /**
       * ⚠️ WHATEVER is in localStorage under this key is merged into the store
       * on boot, and `markSeen` calls `seen.includes(...)`. A stored value of
       * another shape — a shape from a future version of this store, or simply
       * a corrupted entry — therefore threw «i.includes is not a function»
       * during render and left the WHOLE APP blank (reproduced 2026-09-22 with
       * `{"state":{"seen":true}}`). A remembered tour is a convenience; it must
       * never be able to take the application down.
       */
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<TourState>
        return {
          ...current,
          seen: Array.isArray(p.seen) ? p.seen.filter((x) => typeof x === 'string') : [],
          welcomed: p.welcomed === true,
        }
      },
    },
  ),
)
