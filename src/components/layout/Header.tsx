import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LogoMark } from './Logo'
import { BranchSelector } from './BranchSelector'
import { NotificationsBell } from './NotificationsBell'
import { UserMenu } from './UserMenu'
import { LiveClock } from './LiveClock'
import { HeaderTools } from './HeaderTools'
import { TourLauncher } from '@/features/tour/TourLauncher'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'

interface HeaderProps {
  onOpenNav: () => void
}

/**
 * The header — NOCTURNE.
 *
 * It carries the way IN to the product (the hamburger, the mark and the
 * keyword search), the SCOPE everything below it is read at (which branch),
 * and what belongs to YOU (the time at the gate, help, how you READ the page —
 * low-vision mode, language, theme — your notifications, your account).
 * The middle of the row is left to the anniversary ribbon, which is a season
 * and not a feature — out of season the row simply breathes.
 *
 * Search, the low-vision mode and the language picker are TZ 4.1.7 items
 * («поисковая строка», «режим для слабовидящих», «двуязычность»); the help
 * button is the section-8 administrator guide, also reachable with F1.
 *
 * The navigation lives behind the hamburger at every width now (see AppShell):
 * the dashboard designs give the whole viewport to the board.
 */
export function Header({ onOpenNav }: HeaderProps) {
  const { t } = useTranslation()
  // Mehmon (TZ 4.2.2) tasdiqlanmaguncha butun tizim unga yopiq: filial
  // tanlagich ham, global qidiruv ham u chaqira olmaydigan endpointlarga
  // boradi (403). Tugmani qoldirish faqat "ishlamaydigan tugma" bo'lardi.
  const isGuest = roles.isGuest(useAuthStore((s) => s.user))

  return (
    <header className="relative z-30 flex h-header shrink-0 items-center gap-ui px-page pt-[env(safe-area-inset-top)]">
      <div className="flex min-w-0 flex-1 items-center gap-ui-sm">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label={t('header.menu')}
          data-tour="nav-toggle"
          title={t('header.menu')}
          className="grid h-icon w-icon shrink-0 place-items-center rounded-inner bg-fg/[0.06] text-fg transition-colors hover:bg-fg/[0.12]"
        >
          <Menu size={18} />
        </button>
        <span className="hidden shrink-0 sm:block">
          <LogoMark size={30} />
        </span>
        {!isGuest && (
          <>
            {/* The wrappers must be shrinkable flex items themselves: a plain
                inline span keeps its content width (min-width:auto), so at
                360–414 px the branch picker could not give way and the tools
                cluster was drawn over it and over the search button
                (measured 2026-09-19). */}
            <span data-tour="branch" className="flex min-w-0 flex-1">
              <BranchSelector />
            </span>
            <span data-tour="search" className="shrink-0">
              <GlobalSearch />
            </span>
          </>
        )}
      </div>

      {/* ⚠️ `shrink-0`: bildirishnoma va profil (ya'ni CHIQISH ham) hech qachon
          siqilmasin — 390px da o'ng guruh ekrandan tashqarida qolib ketgan edi. */}
      <div className="flex shrink-0 items-center gap-ui-sm">
        <LiveClock />
        <span data-tour="tools" className="contents">
          {/* The guided tour is written for the desktop layout; on a phone the
              button only took the room the branch name needed. */}
          {!isGuest && (
            <span className="hidden sm:contents">
              <TourLauncher />
            </span>
          )}
          <HeaderTools showHelp={!isGuest} />
        </span>
        <span data-tour="notifications" className="contents">
          <NotificationsBell />
        </span>
        <UserMenu />
      </div>
    </header>
  )
}
