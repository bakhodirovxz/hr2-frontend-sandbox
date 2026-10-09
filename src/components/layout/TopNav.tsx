import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/cn'
import { tabPill, POPOVER } from '@/components/ui/control'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { useArrowNav } from '@/hooks/useArrowNav'
import { useAuthStore } from '@/store/authStore'
import { getNavForUser, isGroup, type NavGroup, type NavLeaf, type NavNode } from './navConfig'

/**
 * ASOSIY MENYU — GORIZONTAL (TZ 440–441).
 *
 * 1-qatorda yuqori bandlar; guruh bosilganda uning quyi menyusi 2-qatorda,
 * asosiy menyu ostida ochiladi. Joriy sahifa tegishli guruh o'zi ochiq
 * turadi. Sig'magan bandlar «Yana» ro'yxatiga o'tadi (kenglik har o'lchamda
 * qayta o'lchanadi, yashirin nusxa bo'yicha). Klaviatura: ←/→ 1-qatorda,
 * ↓ — guruhdan quyi menyuga, Esc — quyi menyuni yopish.
 *
 * Telefon kengligida o'rniga yon panel (`Sidebar`) chiqadi — o'sha daraxt.
 */

export function isPathActive(path: string, pathname: string): boolean {
  return path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`)
}

const ITEM_CLS =
  'relative inline-flex h-10 shrink-0 items-center gap-2 rounded-inner px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand'

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
  const { pathname } = useLocation()
  const nav = useMemo(() => getNavForUser(user), [user])

  const activeGroup = nav.find((n): n is NavGroup => isGroup(n) && n.children.some((c) => isPathActive(c.path, pathname)))
  const [openKey, setOpenKey] = useState<string | null>(activeGroup?.key ?? null)
  // Sahifa almashsa — o'sha sahifaning guruhi ochiq turadi (boshqasi yopiladi).
  useEffect(() => {
    setOpenKey(activeGroup?.key ?? null)
  }, [pathname, activeGroup?.key])

  /* ── Sig'magan bandlar «Yana» ga ─────────────────────────────────────── */
  const rowRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLButtonElement>(null)
  const [fit, setFit] = useState(nav.length)
  const [moreOpen, setMoreOpen] = useState(false)

  useLayoutEffect(() => {
    const row = rowRef.current
    const measure = measureRef.current
    if (!row || !measure) return
    const compute = () => {
      const widths = Array.from(measure.children).map((el) => (el as HTMLElement).offsetWidth + 4)
      const total = widths.reduce((a, b) => a + b, 0)
      const avail = row.clientWidth
      if (total <= avail) {
        setFit(widths.length)
        return
      }
      const room = avail - 96 // «Yana» tugmasi uchun joy
      let used = 0
      let n = 0
      for (const w of widths) {
        if (used + w > room) break
        used += w
        n++
      }
      setFit(Math.max(1, n))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(row)
    return () => ro.disconnect()
  }, [nav, t])

  const shown = nav.slice(0, fit)
  const hidden = nav.slice(fit)
  const openGroup = nav.find((n): n is NavGroup => isGroup(n) && n.key === openKey)
  const hiddenActive = hidden.some((n) =>
    isGroup(n) ? n.children.some((c) => isPathActive(c.path, pathname)) : isPathActive(n.path, pathname),
  )

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

  const renderNode = (n: NavNode, measuring = false) => {
    if (isGroup(n)) {
      const Icon = n.icon
      const open = n.key === openKey
      const active = n.children.some((c) => isPathActive(c.path, pathname))
      return (
        <button
          key={n.key}
          type="button"
          tabIndex={measuring ? -1 : undefined}
          data-topnav-item={measuring ? undefined : ''}
          data-group-key={measuring ? undefined : n.key}
          aria-expanded={open}
          aria-controls={measuring ? undefined : 'topnav-submenu'}
          onClick={() => setOpenKey(open ? (activeGroup?.key === n.key ? n.key : null) : n.key)}
          className={cn(
            ITEM_CLS,
            active ? 'accent-tile' : open ? 'bg-fg/[0.08] text-fg' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg',
          )}
        >
          <Icon size={16} strokeWidth={1.9} aria-hidden />
          <span>{t(`nav.${n.labelKey}`)}</span>
          <Badge n={groupBadge(n, badges)} />
          <ChevronDown size={14} aria-hidden className={cn('transition-transform', open && 'rotate-180')} />
        </button>
      )
    }
    const Icon = n.icon
    const active = isPathActive(n.path, pathname)
    if (measuring) {
      return (
        <span key={n.key} className={ITEM_CLS}>
          <Icon size={16} aria-hidden />
          <span>{t(`nav.${n.labelKey}`)}</span>
          <Badge n={badges[n.path]} />
        </span>
      )
    }
    return (
      <Link
        key={n.key}
        to={n.path}
        data-topnav-item=""
        aria-current={active ? 'page' : undefined}
        className={cn(ITEM_CLS, active ? 'accent-tile' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg')}
      >
        <Icon size={16} strokeWidth={1.9} aria-hidden />
        <span>{t(`nav.${n.labelKey}`)}</span>
        <Badge n={badges[n.path]} />
      </Link>
    )
  }

  const leafLink = (c: NavLeaf, onClick?: () => void, data: Record<string, string> = {}) => {
    const Icon = c.icon
    const active = isPathActive(c.path, pathname)
    return (
      <Link
        key={c.key}
        to={c.path}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={tabPill(active, 'shrink-0')}
        {...data}
      >
        <Icon size={14} aria-hidden />
        {t(`nav.${c.labelKey}`)}
        <Badge n={badges[c.path]} />
      </Link>
    )
  }

  return (
    <nav aria-label={t('nav.menu')} className="relative z-20 hidden shrink-0 border-b border-line bg-surface/90 lg:block">
      <div className="relative flex items-center gap-1 px-page py-1.5">
        <div ref={rowRef} onKeyDown={onRowKeyDown} className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {shown.map((n) => renderNode(n))}
        </div>
        {hidden.length > 0 && (
          <>
            <button
              ref={moreRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((v) => !v)}
              className={cn(ITEM_CLS, hiddenActive ? 'accent-tile' : 'text-fg-muted hover:bg-fg/[0.06] hover:text-fg')}
            >
              <MoreHorizontal size={16} aria-hidden />
              {t('nav.more')}
            </button>
            <AnchoredPanel
              anchorRef={moreRef}
              open={moreOpen}
              onClose={() => setMoreOpen(false)}
              width={POPOVER.menuW}
              height={420}
              label={t('nav.more')}
              className="space-y-2 p-2"
            >
              {hidden.map((n) =>
                isGroup(n) ? (
                  <div key={n.key}>
                    <p className="px-2 pb-1 pt-1 text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">
                      {t(`nav.${n.labelKey}`)}
                    </p>
                    <div className="flex flex-col gap-1">{n.children.map((c) => leafLink(c, () => setMoreOpen(false)))}</div>
                  </div>
                ) : (
                  <div key={n.key} className="flex">
                    {leafLink(n, () => setMoreOpen(false))}
                  </div>
                ),
              )}
            </AnchoredPanel>
          </>
        )}
        {/* Kenglikni o'lchash uchun yashirin nusxa — ko'rinmaydi, fokus olmaydi. */}
        <div
          ref={measureRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1 whitespace-nowrap"
        >
          {nav.map((n) => renderNode(n, true))}
        </div>
      </div>

      {openGroup && (
        <div
          id="topnav-submenu"
          ref={subRef}
          onKeyDown={onSubKeyDown}
          className="flex flex-wrap items-center gap-1.5 border-t border-line/70 bg-surface-2/60 px-page py-2"
        >
          {openGroup.children.map((c) => leafLink(c, undefined, { 'data-topnav-sub': '' }))}
        </div>
      )}
    </nav>
  )
}
