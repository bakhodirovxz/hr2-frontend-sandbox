import { useEffect, useMemo, useRef, useState } from 'react'
import { foldIncludes, searchFold } from '@/lib/searchFold'
import { useTranslation } from 'react-i18next'
import { Building2, Check, ChevronDown, Layers, Search, Users, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useArrowNav } from '@/hooks/useArrowNav'
import { canSwitchBranchScope, ownBranchIds as ownBranchIdsOf } from '@/auth/permissions'
import { visibleBranches } from '@/auth/branchHelpers'
import type { OrganizationBranch } from '@/types'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { control, POPOVER } from '@/components/ui/control'

/** Header branch switcher: current scope + searchable panel with the user's own
 *  branches surfaced as quick chips (helps multi-branch employees). */
export function BranchSelector() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const branches = useBranchStore((s) => s.branches)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const setSelectedBranchId = useBranchStore((s) => s.setSelectedBranchId)

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // Typeahead off: the panel already has a search box, so letters must reach it.
  const onPanelKeyDown = useArrowNav(panelRef, {
    selector: '[data-nav-item]',
    typeahead: false,
  })

  const canSwitchScope = canSwitchBranchScope(user)

  // Branches this user is allowed to view — see `visibleBranches`.
  const allowedBranches = useMemo<OrganizationBranch[]>(
    () => visibleBranches(branches, user),
    [branches, user],
  )

  // The user's *own* branches — quick chips.
  const ownBranchIds = useMemo(() => ownBranchIdsOf(user) ?? [], [user])
  const ownBranches = useMemo(
    () => allowedBranches.filter((b) => ownBranchIds.includes(b.id)),
    [allowedBranches, ownBranchIds],
  )

  const filtered = useMemo(() => {
    const q = searchFold(search.trim())
    return q ? allowedBranches.filter((b) => foldIncludes(b.name ?? '', q)) : allowedBranches
  }, [allowedBranches, search])

  const current = branches.find((b) => b.id === selectedBranchId)
  const totalEmployees = allowedBranches.reduce((s, b) => s + (b.employee_count || 0), 0)

  const label =
    selectedBranchId == null ? t('header.allBranches') : current?.name ?? t('header.selectBranch')

  const pick = (id: number | null) => {
    setSelectedBranchId(id)
    setOpen(false)
    setSearch('')
  }

  const chipRef = useRef<HTMLDivElement>(null)
  const [chipNarrow, setChipNarrow] = useState(false)
  useEffect(() => {
    const el = chipRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setChipNarrow(el.clientWidth < 80))
    ro.observe(el)
    return () => ro.disconnect()
  })

  // Only one branch and can't switch scope — show a static chip, no dropdown.
  const isStatic = !canSwitchScope && allowedBranches.length <= 1

  if (isStatic) {
    // A branch-scoped account (e.g. a branch administrator) never sees «all
    // branches» — the chip names the one organisation it works in.
    const staticLabel = allowedBranches[0]?.name ?? label
    return (
      <div
        ref={chipRef}
        // In low-vision mode (big controls) a 390px header leaves this chip a
        // few pixels: only its border and half an icon showed up as a stray
        // «•» beside the burger. When there is no room for the name, draw nothing.
        className={cn(
          'flex h-control min-w-0 max-w-branch items-center gap-2 overflow-hidden rounded-lg border border-line bg-surface px-3 text-sm',
          chipNarrow && 'invisible',
        )}
      >
        <Building2 size={16} className="shrink-0 text-brand" />
        <span className="min-w-0 truncate font-medium text-fg">{staticLabel}</span>
      </div>
    )
  }

  return (
    <div ref={chipRef} className={cn('relative min-w-0 flex-1 max-w-branch overflow-hidden', chipNarrow && 'invisible')}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('header.selectBranch')}: ${label}`}
        title={label}
        className={cn(
          'flex h-control w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2.5 text-sm transition-colors sm:px-3',
          open ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2',
        )}
      >
        <Building2 size={16} className="shrink-0 text-brand" />
        <span className="min-w-0 truncate font-medium text-fg">{label}</span>
        <ChevronDown
          size={15}
          className={cn('shrink-0 text-fg-subtle transition-transform', open && 'rotate-180')}
        />
      </button>

      <AnchoredPanel
        anchorRef={btnRef}
        open={open}
        onClose={() => setOpen(false)}
        width={POPOVER.branchW}
        height={460}
        align="start"
        role="listbox"
        label={t('header.selectBranch')}
        className="overflow-hidden"
      >
        <div ref={panelRef} onKeyDown={onPanelKeyDown}>
          {/* Search */}
          <div className="border-b border-line p-3">
            <div className={cn(control({ size: 'sm', focusWithin: true }), 'flex items-center gap-2 px-2.5')}>
              <Search size={15} className="text-fg-subtle" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('header.searchBranch')}
                type="search"
                name="branch-search"
                aria-label={t('header.searchBranch')}
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label={t('common.clear')}
                  className="inline-grid h-6 w-6 shrink-0 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div
            role="listbox"
            aria-label={t('header.selectBranch')}
            className="scroll-thin max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-2"
          >
            {/* Quick chips — the user's own branches */}
            {!search && ownBranches.length > 1 && (
              <div className="mb-1 px-1.5 pb-2">
                <p className="mb-2 px-0.5 text-[11.5px] font-semibold text-fg-subtle">
                  {t('header.myBranches')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {ownBranches.map((b) => {
                    const active = b.id === selectedBranchId
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => pick(b.id)}
                        data-nav-item
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-xs border px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'border-brand bg-brand text-fg-on-brand'
                            : 'border-line bg-surface text-fg-muted hover:border-brand/40 hover:text-fg',
                        )}
                      >
                        <span className="max-w-[130px] truncate">{b.name}</span>
                        <span
                          className={cn(
                            'tabnum rounded-xs px-1 text-[10px] font-bold',
                            active ? 'bg-white/20' : 'bg-surface-2',
                          )}
                        >
                          {b.employee_count ?? 0}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All-branches scope */}
            {canSwitchScope && !search && (
              <BranchOption
                icon={<Layers size={16} />}
                name={t('header.allBranches')}
                count={totalEmployees}
                active={selectedBranchId == null}
                onClick={() => pick(null)}
                emphasize
              />
            )}

            {(canSwitchScope || ownBranches.length > 1) && !search && (
              <div className="my-1.5 h-px bg-line" />
            )}

            {/* Full list */}
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-fg-subtle">{t('header.branchNotFound')}</p>
            ) : (
              filtered.map((b) => (
                <BranchOption
                  key={b.id}
                  icon={<Users size={15} className="text-fg-subtle" />}
                  name={b.name}
                  count={b.employee_count ?? 0}
                  active={b.id === selectedBranchId}
                  onClick={() => pick(b.id)}
                />
              ))
            )}
          </div>
        </div>
      </AnchoredPanel>
    </div>
  )
}

function BranchOption({
  icon,
  name,
  count,
  active,
  onClick,
  emphasize = false,
}: {
  icon: React.ReactNode
  name: string
  count: number
  active: boolean
  onClick: () => void
  emphasize?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="option"
      data-nav-item
      aria-selected={active}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
        active ? 'bg-brand-soft' : 'hover:bg-surface-2',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-brand' : 'text-fg-subtle')}>{icon}</span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          active ? 'font-semibold text-brand-strong' : emphasize ? 'font-medium text-fg' : 'text-fg',
        )}
      >
        {name}
      </span>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-fg-muted">{count}</span>
      {active && <Check size={15} className="shrink-0 text-brand" />}
    </button>
  )
}
