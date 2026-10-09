import { Suspense, useCallback, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useUIStore } from '@/store/uiStore'
import { useBranches, useBranchInit } from '@/hooks/useBranches'
import { useMenuBadges } from '@/hooks/useMenuBadges'
import { useWebPush } from '@/hooks/useWebPush'
import { BirthdayGreetingModal } from '@/features/employees/BirthdayGreetingModal'
import { PendingActionsPopup } from '@/components/layout/PendingActionsPopup'
import { PasswordGate } from '@/features/auth/PasswordGate'
import { BackgroundDecor } from './BackgroundDecor'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { auditPageTitle, isPathAllowed, type NavModuleOverrides } from './navConfig'
import { initPageTracker, trackPageChange } from '@/lib/pageTracker'
import { useSystemSettings } from '@/features/settings/useSystemSettings'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { RequireRole } from './RequireRole'

export function AppShell() {
  const { t } = useTranslation()
  const mobileOpen = useUIStore((s) => s.mobileNavOpen)
  const setMobileOpen = useUIStore((s) => s.setMobileNavOpen)
  const location = useLocation()

  const { branches } = useBranches()
  useBranchInit(branches)

  /* ⚠️ A HIDDEN PAGE MUST ALSO BE A CLOSED PAGE. The matrix takes an entry out
     of the menu, but the address bar still works and a bookmark still opens —
     so the shell checks the current path against the same rules before it
     renders anything. While the settings are still loading nothing is blocked:
     flashing "no access" on every reload would be worse than a moment of
     openness, and every page behind this has its own server-side gate anyway. */
  const user = useAuthStore((st) => st.user)
  const branchId = useBranchStore((st) => st.selectedBranchId)
  const { values, ready } = useSystemSettings()
  const navOverrides = values['nav.modules'] as NavModuleOverrides | undefined
  const pathAllowed =
    !ready || isPathAllowed(location.pathname, user, navOverrides, branchId)
  const menuBadges = useMenuBadges()
  // Browser push. Lives here because the shell is the one component that is
  // mounted for the whole authenticated session, and the subscription must be
  // attempted once per session rather than once per page.
  useWebPush()
  // The server's own per-module counts. `leaves` is computed there with the
  // exact SQL the old client-side floor used (`useLeaveBadge`), so the extra
  // `work-leaves` request that floor made on EVERY page — plus its two-minute
  // poll — was pure duplication and is gone.
  const badges = menuBadges

  const drawerRef = useRef<HTMLElement>(null)
  const closeMobile = useCallback(() => setMobileOpen(false), [setMobileOpen])
  useEscapeKey(closeMobile, mobileOpen)

  // Close the mobile drawer on navigation.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname, setMobileOpen])

  // Audit journal: one PAGE_VIEW per visited page (sent on leaving it). The
  // shell is mounted for the whole signed-in session, so it is the one place
  // that sees every route change.
  useEffect(() => {
    initPageTracker()
  }, [])
  useEffect(() => {
    trackPageChange(location.pathname, auditPageTitle(location.pathname))
  }, [location.pathname])

  // While the drawer is open it is a modal: move focus into it, keep Tab cycling
  // inside it, and stop the page behind from scrolling.
  useEffect(() => {
    if (!mobileOpen) return
    const panel = drawerRef.current
    if (!panel) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)

    focusables()[0]?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused?.focus?.()
    }
  }, [mobileOpen])

  return (
    <div className="app-bg flex h-full w-full overflow-hidden">
      {/* Lives on the shell, not inside <main>: the scene must stay put while
          the page scrolls, the way a backdrop behaves. Cards are opaque, so it
          only shows through the gaps. */}
      <BackgroundDecor />
      {/* NOCTURNE: the navigation is a DRAWER at every width, not a docked
          rail. The dashboard designs give the whole viewport to the board and
          reach the menu through the hamburger in the header — the sidebar was
          taking a fifth of the screen to repeat what the header already says.
          While closed the drawer stays mounted (so it can animate), so it must
          be `inert`: aria-hidden alone would leave its buttons in the tab order
          and duplicate the nav in the accessibility tree. */}
      <div
        className={cn(
          'fixed inset-0 z-50',
          mobileOpen ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        aria-hidden={!mobileOpen}
        {...(!mobileOpen ? { inert: '' } : {})}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={cn(
            'absolute inset-0 bg-[rgb(8_8_22_/_0.6)] transition-opacity duration-200',
            mobileOpen ? 'opacity-100' : 'opacity-0',
          )}
        />
        <aside
          ref={drawerRef}
          role="dialog"
          aria-modal={mobileOpen}
          aria-label={t('header.menu')}
          className={cn(
            'absolute left-0 top-0 h-full w-[var(--sidebar-w)] max-w-[84vw] overscroll-contain shadow-lg transition-transform duration-200 ease-out',
            'pl-[env(safe-area-inset-left)]',
            mobileOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label={t('common.close')}
            className="absolute right-3 top-4 z-10 grid h-8 w-8 place-items-center rounded-lg text-sidebar-muted hover:bg-sidebar-active hover:text-sidebar-active-fg"
          >
            <X size={18} />
          </button>
          <Sidebar mobile badges={badges} onNavigate={() => setMobileOpen(false)} />
        </aside>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setMobileOpen(true)} />
        <main className="scroll-thin flex-1 overflow-y-auto">
          {/* Keyed on the route: a crashed page clears itself once you navigate,
              and the sidebar/header stay usable meanwhile. */}
          <ErrorBoundary resetKey={location.pathname}>
            <RequireRole allowed={pathAllowed} title={t('nav.hiddenTitle')}>
              {/* ⚠️ THE ONLY SUSPENSE BOUNDARY USED TO BE IN `App.tsx`, ABOVE
                  `<Routes>`. Every one of the 63 lazy pages therefore suspended
                  against THAT boundary, and React replaced the WHOLE tree —
                  sidebar, header and all — with the full-page `<Splash/>` on
                  EVERY navigation. The chunk is small; the flash of a blank
                  branded screen is what made v2 feel slow. With a boundary here
                  the shell stays put and only the content area waits. */}
              <Suspense fallback={<CenteredSpinner />}>
                <Outlet />
              </Suspense>
            </RequireRole>
          </ErrorBoundary>
        </main>
      </div>
      <BirthdayGreetingModal />
      <PendingActionsPopup />
      {/* Mandatory password change (rotation) — blocks the shell until done. */}
      <PasswordGate />
    </div>
  )
}
