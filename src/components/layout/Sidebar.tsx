import { useCallback, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { PanelLeftClose } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useArrowNav } from '@/hooks/useArrowNav'
import { useUIStore } from '@/store/uiStore'
import {
  getNavForUser,
  groupNav,
  type NavItem,
  type NavModuleOverrides,
  type NavSection,
} from './navConfig'
import { useSystemSettings } from '@/features/settings/useSystemSettings'
import { LogoMark } from './Logo'

interface SidebarProps {
  /** Icon-only rail (desktop). Ignored in the mobile drawer. */
  collapsed?: boolean
  /** Rendered as the mobile drawer (always expanded, closes on navigate). */
  mobile?: boolean
  badges?: Record<string, number>
  onNavigate?: () => void
}

interface RowProps {
  item: NavItem
  label: string
  active: boolean
  collapsed: boolean
  badge?: number
  onClick: () => void
}

/** A plain left click with no modifier — the one React Router handles in
 *  place. Ctrl/⌘/Shift/middle-click and «Open in new tab» are the browser's. */
export function isPlainClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

const SECTION_KEY: Record<NavSection, string> = {
  main: 'nav.secMain',
  documents: 'nav.secDocuments',
  stats: 'nav.secPeople',
  admin: 'nav.secAdmin',
}

/**
 * One navigation slot on the petrol field.
 *
 * A real link (2026-09-26): it was a <button> calling navigate(), so a
 * middle click, Ctrl+click or the right-click menu could not open a page in a
 * new tab — the browser did not know it was a link.
 *
 * The current route is a LIT PILL — the accent gradient with its coloured
 * glow, the vocabulary this product uses everywhere for "this is the active
 * one". The flat paper tab tried in the first rendition disappeared into the
 * chrome and took the sense of place with it.
 */
function NavRow({ item, label, active, collapsed, badge, onClick }: RowProps) {
  const Icon = item.icon
  return (
    <Link
      to={item.path}
      onClick={(e) => {
        if (isPlainClick(e)) onClick()
      }}
      data-nav-item
      title={collapsed ? label : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        'group/row relative flex w-full items-center rounded-[14px] text-left',
        'transition-[background-color,color,box-shadow,transform] duration-150',
        collapsed ? 'h-11 justify-center px-0' : 'gap-3 px-3 py-2.5',
        active
          ? 'accent-tile'
          : 'text-sidebar-fg hover:translate-x-0.5 hover:bg-sidebar-active hover:text-sidebar-active-fg',
      )}
    >
      <Icon
        size={18}
        strokeWidth={1.9}
        className={cn(
          'shrink-0 transition-colors',
          active ? 'text-white' : 'text-sidebar-muted group-hover/row:text-sidebar-active-fg',
        )}
      />
      {!collapsed && (
        <span className="flex-1 truncate text-[13.5px]" style={{ fontWeight: active ? 600 : 450 }}>
          {label}
        </span>
      )}
      {!collapsed && badge != null && badge > 0 && (
        <span className="tabnum ml-auto grid h-5 min-w-5 place-items-center rounded-pill bg-danger px-1.5 text-[11px] font-semibold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {collapsed && badge != null && badge > 0 && (
        <span className="absolute right-2 top-2 h-2 w-2 rounded-pill bg-danger ring-2 ring-sidebar" />
      )}
    </Link>
  )
}

export function Sidebar({ collapsed = false, mobile = false, badges = {}, onNavigate }: SidebarProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const toggleCollapsed = useUIStore((s) => s.toggleCollapsed)

  const isCollapsed = mobile ? false : collapsed
  // Menyu tarkibi bosh administrator sozlamasidan keladi (`nav.modules`).
  // So'rov yuklanmaguncha yoki yiqilsa — katalogdagi standart auditoriya.
  const { values } = useSystemSettings()
  const overrides = values['nav.modules'] as NavModuleOverrides | undefined
  const branchId = useBranchStore((st) => st.selectedBranchId)
  const nav = useMemo(() => getNavForUser(user, overrides, branchId), [user, overrides, branchId])
  const groups = useMemo(() => groupNav(nav), [nav])
  const navRef = useRef<HTMLElement>(null)
  const onNavKeyDown = useArrowNav(navRef)

  // The <Link> itself navigates; a plain click only closes the mobile drawer.
  const onLeafClick = useCallback(() => onNavigate?.(), [onNavigate])

  return (
    <div className="sidebar-surface flex h-full flex-col">
      {/* Brand block — circular mark, product name, tagline (EDO layout). */}
      <div
        className={cn(
          'shrink-0',
          isCollapsed ? 'flex flex-col items-center gap-2 px-0 pb-3 pt-3' : 'px-4 pb-4 pt-4',
        )}
      >
        {isCollapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={t('header.expandMenu')}
            title={t('header.expandMenu')}
            className="grid h-10 w-10 place-items-center rounded-control transition-colors hover:bg-sidebar-active"
          >
            <LogoMark size={26} />
          </button>
        ) : (
          // ⚠️ THE LOGO SPEAKS FOR ITSELF. The mark used to sit beside the
          // product name and a tagline; the official lockup already carries
          // the company name, so the words repeated it and stole the width
          // the artwork needed. The mark is now shown alone and larger.
          <div className="relative flex items-center gap-2.5">
            <LogoMark size={44} />
            <div className="min-w-0 flex-1" />
            {!mobile && (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={t('header.collapseMenu')}
                title={t('header.collapseMenu')}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-sidebar-muted transition-colors hover:bg-sidebar-active hover:text-sidebar-active-fg"
              >
                <PanelLeftClose size={17} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* No global create CTA here: creating a document belongs on the page
          that owns it, not in the navigation. */}

      {/* Nav */}
      <nav
        ref={navRef}
        onKeyDown={onNavKeyDown}
        aria-label={t('header.menu')}
        className="scroll-thin flex-1 overflow-y-auto px-3 pb-4"
      >
        {groups.map((group) => (
          <div key={group.section} className="mb-3 last:mb-0">
            {!isCollapsed ? (
              <p className="engrave px-3 pb-2 pt-1 text-sidebar-accent/85">
                {t(SECTION_KEY[group.section] as never)}
              </p>
            ) : (
              // Collapsed rail: a hairline stands in for the heading.
              <div className="mx-3 mb-2 mt-1 h-px bg-sidebar-border first:hidden" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavRow
                  key={item.path}
                  item={item}
                  label={t(`nav.${item.labelKey}`)}
                  collapsed={isCollapsed}
                  active={location.pathname === item.path}
                  badge={badges[item.path]}
                  onClick={onLeafClick}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
    </div>
  )
}
