import { Menu, MessageSquare, Phone } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { LogoMark } from './Logo'
import { BranchSelector } from './BranchSelector'
import { NotificationsBell } from './NotificationsBell'
import { UserMenu } from './UserMenu'
import { LiveClock } from './LiveClock'
import { HeaderTools } from './HeaderTools'
import { GlobalSearch } from '@/features/search/GlobalSearch'
import { telHref, useSiteInfo } from '@/features/site/useSiteInfo'
import { useAuthStore } from '@/store/authStore'
import { isGuest as isGuestUser } from '@/auth/permissions'

interface HeaderProps {
  onOpenNav: () => void
  onFeedback: () => void
}

/**
 * SHAPKA (TZ 436–439, GEN-6): logotip — bosilganda doim bosh sahifaga;
 * texnik yordam telefoni va «Qayta aloqa»; qidiruv qatori (TZ 1840);
 * til UZ / ЎЗ / RU; ko'zi ojizlar rejimi; F1 qo'llanma; bildirishnomalar;
 * foydalanuvchi menyusi; filial tanlagich (bir nechta filialni ko'radiganlar).
 *
 * Asosiy menyu shapka ostida — gorizontal `TopNav`. Telefon kengligida
 * hamburger yon panelni ochadi.
 */
export function Header({ onOpenNav, onFeedback }: HeaderProps) {
  const { t } = useTranslation()
  // Mehmon (TZ 4.2.2): filial tanlagich va global qidiruv u chaqira olmaydigan
  // endpointlarga boradi — ishlamaydigan tugma qoldirilmaydi.
  const isGuest = isGuestUser(useAuthStore((s) => s.user))
  const site = useSiteInfo().data

  return (
    <header className="relative z-30 flex h-header shrink-0 items-center gap-ui px-page pt-[env(safe-area-inset-top)]">
      <div className="flex min-w-0 flex-1 items-center gap-ui-sm">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label={t('header.menu')}
          title={t('header.menu')}
          className="grid h-icon w-icon shrink-0 place-items-center rounded-inner bg-fg/[0.06] text-fg transition-colors hover:bg-fg/[0.12] lg:hidden"
        >
          <Menu size={18} />
        </button>
        <Link to="/" aria-label={t('nav.home')} className="hidden shrink-0 rounded-inner sm:block">
          <LogoMark size={30} />
        </Link>
        {!isGuest && (
          <>
            {/* O'ramlar o'zi siqiladigan flex element bo'lishi shart: 360–414px
                da filial nomi joy bermasa asboblar uning ustiga chizilardi. */}
            <span className="flex min-w-0 flex-1">
              <BranchSelector />
            </span>
            <span className="shrink-0">
              <GlobalSearch />
            </span>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-ui-sm">
        {site?.support_phone && (
          <a
            href={telHref(site.support_phone)}
            title={t('site.supportPhone')}
            className="hidden items-center gap-1.5 rounded-inner px-2 py-1 text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg 2xl:inline-flex"
          >
            <Phone size={14} aria-hidden />
            <span className="tabnum">{site.support_phone}</span>
          </a>
        )}
        <button
          type="button"
          onClick={onFeedback}
          title={t('site.feedback')}
          aria-label={t('site.feedback')}
          className="hidden h-icon items-center gap-1.5 rounded-inner px-2.5 text-[12.5px] font-medium text-fg-muted transition-colors hover:bg-fg/[0.06] hover:text-fg md:inline-flex"
        >
          <MessageSquare size={15} aria-hidden />
          <span className="hidden 2xl:inline">{t('site.feedback')}</span>
        </button>
        <LiveClock />
        <HeaderTools showHelp={!isGuest} />
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  )
}
