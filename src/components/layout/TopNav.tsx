import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/cn'
import { tabPill } from '@/components/ui/control'
import { useArrowNav } from '@/hooks/useArrowNav'
import { useAuthStore } from '@/store/authStore'
import { flattenNav, getNavForUser, isGroup, pickActivePath, type NavGroup, type NavLeaf, type NavNode } from './navConfig'

/**
 * ASOSIY MENYU — GORIZONTAL (TZ 440–441).
 *
 * 1-qatorda TZ modullari (TZ 418–435) — har biri birinchi darajali band;
 * guruh bosilganda uning quyi menyusi asosiy menyu OSTIDAGI qatorda ochiladi.
 * Joriy sahifa tegishli guruh o'zi ochiq turadi.
 *
 * Nothing is hidden behind an overflow button: when the row does not fit,
 * the icons are dropped first, and on a still narrower desktop the row wraps
 * onto a second line — every module stays visible in the top menu.
 * Klaviatura: ←/→ 1-qatorda, ↓ — guruhdan quyi menyuga, Esc — yopish.
 *
 * Telefon kengligida o'rniga yon panel (`Sidebar`) chiqadi — o'sha daraxt.
 */

export function isPathActive(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
}

const ITEM_CLS =
  'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-inner px-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

function Badge({ n }: { n?: number }) {
  if (!n) return null
  return (
    <span className="tabnum grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-danger px-1 text-[10.5px] font-semibold text-white">
      {n > 99 ? '99+' : n}
    </span>
  )
}

const groupBadge = (g: NavGroup, badges: Record<string, number>) =>
  g.children.reduce((s, c) => s + (badges[c.path] ?? 0), 0)

export function TopNav({ badges = {} }: { badges?: Record<string, number> }) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { pathname, search } = useLocation()
  const nav = useMemo(() => getNavForUser(user), [user])
  const activePath = useMemo(
    () => pickActivePath(flattenNav(nav).map((l) => l.path), pathname, search),
    [nav, pathname, search],
  )
  const isActive = (path: string) => path === activePath

  const activeGroup = nav.find((n): n is NavGroup => isGroup(n) && n.children.some((c) => isActive(c.path)))
  const [openKey, setOpenKey] = useState<string | null>(activeGroup?.key ?? null)
  // Sahifa almashsa — o'sha sahifaning guruhi ochiq turadi (boshqasi yopiladi).
  useEffect(() => {
    setOpenKey(activeGroup?.key ?? null)
  }, [pathname, activeGroup?.key])

  /* ── Width: drop the icons when the full row does not fit ─────────────── */
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [compact, setCompact] = useState(false)

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const compute = () => setCompact(measure.scrollWidth > row.clientWidth)
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [nav, t])

  const openGroup = nav.find((n): n is NavGroup => isGroup(n) && n.key === openKey)

  /* ── Klaviatura ──────────────────────────────────────────────────────── */
  const navKeys = useArrowNav(rowRef, { selector: '[data-topnav-item]', orientation: 'horizontal', typeahead: false })
  const subRef = useRef<HTMLDivElement>(null)
  const subKeys = useArrowNav(subRef, { selector: '[data-topnav-sub]', orientation: 'horizontal', typeahead: false })
  const focusSubmenu = () =>
    requestAnimationFrame(() => subRef.current?.querySelector<HTMLElement>('[data-topnav-sub]')?.focus())

  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    const key = target.dataset.groupKey
    if (e.key === 'ArrowDown' && key) {
      e.preventDefault()
      setOpenKey(key)
      focusSubmenu()
      return
    }
    navKeys(e)
  }
  const onSubKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' || e.key === 'ArrowUp') {
      e.preventDefault()
      const key = openKey
      setOpenKey(activeGroup?.key ?? null)
      rowRef.current?.querySelector<HTMLElement>(`[data-group-key="${key}"]`)?.focus()
      return
    }
    subKeys(e)
  }

  const renderNode = (n: NavNode, measuring = false, noIcon = compact) => {
    const Icon = n.icon
    if (isGroup(n)) {
      const open = n.key === openKey
      const active = n.children.some((c) => isActive(c.path))
      if (measuring) {
        return (
          <span key={n.key} className={ITEM_CLS}>
            {!noIcon && <Icon size={16} aria-hidden />}
            <span>{t(`nav.${n.labelKey}`)}</span>
            <Badge n={groupBadge(n, badges)} />
            <ChevronDown size={14} aria-hidden />
          </span>
        )
      }
      return (
        <button
          key={n.key}
          type="button"
          data-topnav-item=""
          data-group-key={n.key}
          aria-expanded={open}
          aria-controls="topnav-submenu"
          onClick={() => setOpenKey(open ? (activeGroup?.key === n.key ? n.key : null) : n.key)}
          className={cn(
            ITEM_CLS,
            active ? 'accent-tile' : open ? 'bg-fg/[0.08] text-fg' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg',
          )}
        >
          {!noIcon && <Icon size={16} strokeWidth={1.9} aria-hidden />}
          <span>{t(`nav.${n.labelKey}`)}</span>
          <Badge n={groupBadge(n, badges)} />
          <ChevronDown size={14} aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      )
    }
    // The main page is also the logo's target (TZ 438): an icon is enough
    // here, which leaves the width of the row to the TZ modules.
    const iconOnly = n.key === 'home'
    if (measuring) {
      return (
        <span key={n.key} className={ITEM_CLS}>
          {(!noIcon || iconOnly) && <Icon size={16} aria-hidden />}
          {!iconOnly && <span>{t(`nav.${n.labelKey}`)}</span>}
          <Badge n={badges[n.path]} />
        </span>
      )
    }
    const active = isActive(n.path)
    return (
      <Link
        key={n.key}
        to={n.path}
        data-topnav-item=""
        aria-current={active ? 'page' : undefined}
        aria-label={iconOnly ? t(`nav.${n.labelKey}`) : undefined}
        title={iconOnly ? t(`nav.${n.labelKey}`) : undefined}
        className={cn(ITEM_CLS, active ? 'accent-tile' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg')}
      >
        {(!noIcon || iconOnly) && <Icon size={16} strokeWidth={1.9} aria-hidden />}
        {!iconOnly && <span>{t(`nav.${n.labelKey}`)}</span>}
        <Badge n={badges[n.path]} />
      </Link>
    )
  }

  const leafLink = (c: NavLeaf) => {
    const Icon = c.icon
    const active = isActive(c.path)
    return (
      <Link
        key={c.key}
        to={c.path}
        data-topnav-sub=""
        aria-current={active ? 'page' : undefined}
        className={tabPill(active, 'shrink-0')}
      >
        <Icon size={14} aria-hidden />
        {t(`nav.${c.labelKey}`)}
        <Badge n={badges[c.path]} />
      </Link>
    )
  }

  return (
    <nav aria-label={t('nav.menu')} className="relative z-20 hidden shrink-0 border-b border-line bg-surface/90 lg:block">
      <div className="relative px-page py-1.5">
        <div ref={rowRef} onKeyDown={onRowKeyDown} className="flex min-w-0 flex-wrap items-center gap-0.5">
          {nav.map((n) => renderNode(n))}
        </div>
        {/* Kenglikni o'lchash uchun yashirin nusxa (ikonkalar bilan) — ko'rinmaydi, fokus olmaydi. */}
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 flex w-max items-center gap-0.5 whitespace-nowrap"
        >
          {nav.map((n) => renderNode(n, true, false))}
        </div>
      </div>

      {openGroup && (
        <div
          id="topnav-submenu"
          ref={subRef}
          onKeyDown={onSubKeyDown}
          className="flex flex-wrap items-center gap-1.5 border-t border-line/70 bg-surface-2/60 px-page py-2"
        >
          <span className="mr-1 shrink-0 text-[12.5px] font-semibold text-fg-subtle">{t(`nav.${openGroup.labelKey}`)}:</span>
          {openGroup.children.map((c) => leafLink(c))}
        </div>
      )}
    </nav>
  )
}
