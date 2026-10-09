import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { useCurrentUser } from '@/hooks/useAuth'
import { Splash } from '@/components/Splash'
import { useRestReady } from '@/i18n'

/** Loads auth/me once a token exists; blocks the shell until the user is known. */
function AuthBootstrap() {
  const { isLoading } = useCurrentUser()
  const user = useAuthStore((s) => s.user)
  // The rest of the Uzbek dictionary (every module's text) is fetched in
  // parallel with the boot request; nothing behind the login may render
  // before it lands or it would paint raw key paths. Public screens only need
  // the inlined core and are not gated (see i18n/index.ts).
  const restReady = useRestReady()
  if ((!user && isLoading) || !restReady) return <Splash />
  return <Outlet />
}

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <AuthBootstrap />
}
