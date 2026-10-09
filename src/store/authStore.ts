import { create } from 'zustand'
import type { User } from '@/types'
import { clearTokens, getToken, setTokens } from '@/api/tokenStorage'

interface AuthState {
  isAuthenticated: boolean
  user: User | null
  /** Store a fresh session (called by the login flow). */
  setSession: (args: {
    access_token: string
    expires_in?: number
    user?: User | null
  }) => void
  setUser: (user: User | null) => void
  /** Clear local session state. Does NOT call the server (see useLogout). */
  clearSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: !!getToken(),
  user: null,
  setSession: ({ access_token, expires_in, user }) => {
    setTokens({ access_token, expires_in })
    set({ isAuthenticated: true, user: user ?? null })
  },
  setUser: (user) => set({ user }),
  clearSession: () => {
    clearTokens()
    try {
      localStorage.removeItem('selected_branch_id')
      sessionStorage.removeItem('branch_initialized')
    } catch {
      /* ignore */
    }
    set({ isAuthenticated: false, user: null })
  },
}))
