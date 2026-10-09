import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { useEscapeKey } from '@/hooks/useEscapeKey'
import { useUIStore } from '@/store/uiStore'
import { Navigate } from 'react-router-dom'
import { useBranches, useBranchInit } from '@/hooks/useBranches'
import { useMenuBadges } from '@/hooks/useMenuBadges'
import { PasswordGate } from '@/features/auth/PasswordGate'
import { BackgroundDecor } from './BackgroundDecor'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { TopNav } from './TopNav'
import { Footer } from './Footer'
import { FeedbackModal } from './FeedbackModal'
import { auditPageTitle, pathVerdict } from './navConfig'
import { initPageTracker, trackPageChange } from '@/lib/pageTracker'
import { useAuthStore } from '@/store/authStore'
import { RequireRole } from './RequireRole'

export function AppShell() {
  const { t } = useTranslation()
  const mobileOpen = useUIStore((s) => s.mobileNavOpen)
  const setMobileOpen = useUIStore((s) => s.setMobileNavOpen)
  const location = useLocation()

  const { branches } = useBranches()
  useBranchInit(branches)

  /* Yashirilgan sahifa YOPIQ sahifa ham bo'lishi kerak: manzil satri va
     xatcho'p baribir ishlaydi, shuning uchun qobiq joriy yo'lni menyu bilan
     BIR XIL qoidalar bo'yicha tekshiradi (navConfig). Mehmon ochiq yo'llardan
     tashqarida bo'lsa — vakansiyalarga (TZ 4.2.2). */
  const user = useAuthStore((st) => st.user)
  const verdict = pathVerdict(location.pathname, user)
  const badges = useMenuBadges()
  const [feedbackOpen, setFeedbackOpen] = useState(false)

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
      {/* Telefon kengligidagi menyu — yon panel (kompyuterda gorizontal
          TopNav, TZ 440–441). Yopiq paytda ham o'rnatilgan turadi (animatsiya
          uchun), shuning uchun `inert`: aks holda tugmalari Tab tartibida
          qolib, menyu yordamchi texnologiyalarga ikki marta ko'rinardi. */}
      <div
        className={cn(
          'fixed inset-0 z-50 lg:hidden',
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
          <Sidebar
            badges={badges}
            onNavigate={() => setMobileOpen(false)}
            onFeedback={() => {
              setMobileOpen(false)
              setFeedbackOpen(true)
            }}
          />
        </aside>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenNav={() => setMobileOpen(true)} onFeedback={() => setFeedbackOpen(true)} />
        <TopNav badges={badges} />
        <main className="scroll-thin flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1">
          {/* Keyed on the route: a crashed page clears itself once you navigate,
              and the sidebar/header stay usable meanwhile. */}
          <ErrorBoundary resetKey={location.pathname}>
            {verdict === 'guest-redirect' && <Navigate to="/vacancies" replace />}
            <RequireRole allowed={verdict === 'ok'}>
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
          </div>
          <Footer />
        </main>
      </div>
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {/* TZ U1: vaqtinchalik parol almashtirilmaguncha qobiq yopiq. */}
      <PasswordGate />
    </div>
  )
}
