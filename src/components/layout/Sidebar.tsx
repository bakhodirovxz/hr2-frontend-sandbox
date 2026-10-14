import { useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { MessageSquare, Phone } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useArrowNav } from '@/hooks/useArrowNav'
import { telHref, useSiteInfo } from '@/features/site/useSiteInfo'
import { flattenNav, getNavForUser, isGroup, pickActivePath, type NavLeaf } from './navConfig'
import { LogoMark } from './Logo'

interface SidebarProps {
  badges?: Record<string, number>
  onNavigate?: () => void
  onFeedback?: () => void
}

/** Modifikatorsiz chap tugma — React Router o'zi boshqaradigan bosish. */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

function NavRow({ item, label, active, badge, onClick }: { item: NavLeaf; label: string; active: boolean; badge?: number; onClick: () => void }) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={(e) => {
        if (isPlainClick(e)) onClick()
      }}
      data-nav-item
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group/row relative flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors duration-150',
        active ? 'accent-tile' : 'text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg',
      )}
    >
      <Icon
        size={18}
        strokeWidth={1.9}
        className={cn('shrink-0', active ? 'text-white' : 'text-sidebar-muted group-hover/row:text-sidebar-active-fg')}
      />
      <span className="flex-1 truncate text-[13.5px]" style={{ fontWeight: active ? 600 : 450 }}>
        {label}
      </span>
      {badge != null && badge > 0 && (
        <span className="tabnum ml-auto grid h-5 min-w-5 place-items-center rounded-pill bg-danger px-1.5 text-[11px] font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

/**
 * Telefon kengligidagi menyu (yon panel). Kompyuterda asosiy menyu —
 * gorizontal `TopNav` (TZ 440–441); bu yerda xuddi o'sha daraxt, guruhlar
 * sarlavha ostida. Pastda — yordam telefoni va «Qayta aloqa» (TZ 439), chunki
 * tor shapkada ularga joy yo'q.
 */
export function Sidebar({ badges = {}, onNavigate, onFeedback }: SidebarProps) {
  const { t } = useTranslation()
  const { pathname, search } = useLocation()
  const user = useAuthStore((s) => s.user)
  const site = useSiteInfo().data
  const nav = useMemo(() => getNavForUser(user), [user])
  const activePath = useMemo(
    () => pickActivePath(flattenNav(nav).map((l) => l.path), pathname, search),
    [nav, pathname, search],
  )
  const navRef = useRef<HTMLElement>(null)
  const onNavKeyDown = useArrowNav(navRef)
  const onLeafClick = useCallback(() => onNavigate?.(), [onNavigate])

  const row = (item: NavLeaf): ReactNode => (
    <NavRow
      key={item.key}
      item={item}
      label={t(`nav.${item.labelKey}`)}
      active={item.path === activePath}
      badge={badges[item.path]}
      onClick={onLeafClick}
    />
  )

  return (
    <div className="sidebar-surface flex h-full flex-col">
      <div className="shrink-0 px-4 pb-4 pt-4">
        <Link to="/" onClick={onLeafClick} aria-label={t('nav.home')} className="inline-flex">
          <LogoMark size={44} />
        </Link>
      </div>

      <nav
        ref={navRef}
        onKeyDown={onNavKeyDown}
        aria-label={t('nav.menu')}
        className="scroll-thin flex-1 space-y-3 overflow-y-auto px-3 pb-4"
      >
        {/* Same order as the top menu (TZ 418-435 module list). */}
        {nav.map((n) =>
          isGroup(n) ? (
            <div key={n.key}>
              <p className="engrave px-3 pb-2 pt-1 text-sidebar-accent/85">{t(`nav.${n.labelKey}`)}</p>
              <div className="space-y-0.5">{n.children.map(row)}</div>
            </div>
          ) : (
            <div key={n.key} className="space-y-0.5">{row(n)}</div>
          ),
        )}
      </nav>

      <div className="sidebar-divider shrink-0 space-y-1 border-t px-3 py-3 text-[13px]">
        {site?.support_phone && (
          <a
            href={telHref(site.support_phone)}
            className="flex items-center gap-3 rounded-[14px] px-3 py-2 text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg"
          >
            <Phone size={16} aria-hidden className="text-sidebar-muted" />
            <span className="min-w-0 flex-1 truncate">{site.support_phone}</span>
          </a>
        )}
        <button
          type="button"
          onClick={onFeedback}
          className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left text-sidebar-fg hover:bg-sidebar-active hover:text-sidebar-active-fg"
        >
          <MessageSquare size={16} aria-hidden className="text-sidebar-muted" />
          {t('site.feedback')}
        </button>
      </div>
    </div>
  )
}
