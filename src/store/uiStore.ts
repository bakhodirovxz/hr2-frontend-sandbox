import { create } from 'zustand'

const COLLAPSED_KEY = 'sidebar_collapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

interface UIState {
  /** Desktop: sidebar collapsed to an icon rail. */
  sidebarCollapsed: boolean
  /** Mobile/tablet: off-canvas sidebar drawer open. */
  mobileNavOpen: boolean
  toggleCollapsed: () => void
  setMobileNavOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: readCollapsed(),
  mobileNavOpen: false,
  toggleCollapsed: () =>
    set((s) => {
      const next = !s.sidebarCollapsed
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return { sidebarCollapsed: next }
    }),
  setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
}))
