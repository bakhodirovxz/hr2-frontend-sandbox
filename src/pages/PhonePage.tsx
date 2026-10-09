import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Pencil, Phone, PhoneCall, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { useListParams } from '@/hooks/useListParams'
import { useElementHeight } from '@/hooks/useStickyOffsets'
import { useFilterReset } from '@/hooks/useFilterReset'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useBranchStore } from '@/store/branchStore'
import { findExecutiveBranchId } from '@/auth/branchHelpers'
import { usePhoneDirectory, useUpdatePhones, type PhoneEntry } from '@/features/phone/usePhoneDirectory'
import { errorMessage } from '@/api/errorMessage'
import { useToast } from '@/components/ui/Toast'
import { control } from '@/components/ui/control'
import { maskValue } from '@/lib/fieldMask'
import { groupPhoneBook, type PhoneGroup } from '@/features/phone/phoneOrder'
import { TH, TD_COMPACT } from '@/components/data/tableStyles'
import { cn } from '@/lib/cn'

const FILTER_KEYS = ['scope', 'branch'] as const

interface Section {
  branchId: number | null
  branchName: string | null
  groups: PhoneGroup[]
}

const PHONE_FILTERS = ['branch'] as const

export function PhonePage() {
  const { t } = useTranslation()
  const lp = useListParams(FILTER_KEYS)
  const { search, setSearch, filters, setFilter, setFilters } = lp
  // `scope` is a tab — the reset only clears the search and the branch.
  const { count: activeFilterCount, reset } = useFilterReset(lp, PHONE_FILTERS)

  const branches = useBranchStore((s) => s.branches)
  const execBranchId = useMemo(() => findExecutiveBranchId(branches), [branches])
  const scope = filters.scope === 'system' ? 'system' : 'exec'
  const systemBranchId = filters.branch ? Number(filters.branch) : null

  /**
   * ⚠️ FETCH ONLY THE BRANCH ON SCREEN.
   *
   * The whole directory is 2321 rows / 2.5 MB (measured), and this page used
   * to pull all of it and then throw most of it away in a client-side filter —
   * on the DEFAULT tab, which shows one branch. v1 hit the same wall and fixed
   * it the same way (opt-in `branch_id`): 2542 KB → 163 KB for the executive
   * apparatus.
   *
   * The one case that still needs everything is "system organisations" with no
   * particular branch chosen — there the user is genuinely asking across all
   * of them, and that is a deliberate click rather than the landing state.
   */
  const fetchBranchId = scope === 'exec' ? execBranchId : systemBranchId
  const { all, loading } = usePhoneDirectory({
    branchId: fetchBranchId,
    excludeBranchId: scope === 'system' ? execBranchId : null,
    search,
  })
  const systemBranches = useMemo(
    () => branches.filter((b) => b.id !== execBranchId),
    [branches, execBranchId],
  )

  // The server already narrowed by branch and search; this only guards the
  // tab boundary while the next response is on its way (placeholder data).
  const visible = useMemo(
    () =>
      all.filter((e) =>
        scope === 'exec'
          ? e.branch_id === execBranchId
          : e.branch_id !== execBranchId && (systemBranchId == null || e.branch_id === systemBranchId),
      ),
    [all, scope, systemBranchId, execBranchId],
  )

  const labels = useMemo(() => ({ leadership: t('phone.leadership'), noDepartment: t('phone.noDepartment') }), [t])
  // Exec scope → one department-grouped list. System scope → a section per
  // branch (with its own header), each grouped by department.
  const sections: Section[] = useMemo(() => {
    if (scope !== 'system') {
      return [{ branchId: null, branchName: null, groups: groupPhoneBook(visible, labels) }]
    }
    const order = systemBranchId != null ? systemBranches.filter((b) => b.id === systemBranchId) : systemBranches
    return order
      .map((b) => ({
        branchId: b.id,
        branchName: b.name ?? null,
        groups: groupPhoneBook(visible.filter((e) => e.branch_id === b.id), labels),
      }))
      .filter((s) => s.groups.length > 0)
  }, [visible, scope, systemBranchId, systemBranches, labels])

  /**
   * ⚠️ THE TABLE-HEAD OFFSET WAS HARDCODED AT 40 AND IT WAS WRONG — measured in
   * the browser, the head is 49px, so the branch header was pinned 9px too high
   * and sat partly BEHIND it. Both layers are opaque, so the clipping only
   * showed while scrolling. The head is the one height this page does not
   * control (it follows the `TH` padding), so it is measured; the three ROW
   * heights below are pinned instead, because the virtualisation arithmetic
   * needs them to be exact.
   */
  const headRef = useRef<HTMLTableSectionElement>(null)
  const HEAD_H = useElementHeight(headRef, 49)

  const isEmpty = !loading && sections.every((s) => s.groups.length === 0)

  /* INLINE EDIT (2026-09-30): admin, HR and the branch `phone_editor` role fix
     a number right here instead of opening the full employee card. The server
     marks each row with `can_edit`; the pencil follows it. One row at a time,
     inside the fixed 59px row — the virtualised window depends on it. */
  const toast = useToast()
  const updatePhones = useUpdatePhones()
  const [editing, setEditing] = useState<{ id: number; phone: string; internal: string } | null>(null)
  const startEdit = (row: PhoneEntry) =>
    setEditing({ id: row.id, phone: row.phone_number ?? '', internal: row.internal_phone_number ?? '' })
  const cancelEdit = () => setEditing(null)
  const saveEdit = (row: PhoneEntry) => {
    if (!editing) return
    const body: { phone_number?: string | null; internal_phone_number?: string | null } = {}
    if (editing.phone !== (row.phone_number ?? '')) body.phone_number = editing.phone || null
    if (editing.internal !== (row.internal_phone_number ?? '')) body.internal_phone_number = editing.internal || null
    if (!Object.keys(body).length) {
      setEditing(null)
      return
    }
    updatePhones.mutate(
      { id: row.id, body },
      {
        onSuccess: () => {
          toast.ok(t('phone.saved'))
          setEditing(null)
        },
        onError: (e) => toast.error(errorMessage(e, t('phone.saveError'))),
      },
    )
  }
  const onEditKey = (e: KeyboardEvent, row: PhoneEntry) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      saveEdit(row)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    }
  }

  /**
   * VIRTUALISED ROWS — "all branches" renders the whole directory.
   *
   * Measured 2026-09-10 before this: choosing «Tizim tashkilotlari» with no
   * branch picked drew 2 486 rows, 2 085 images and **49 637 DOM nodes**, and
   * took 2.65 s to settle. The default scope (one branch, 188 rows) was always
   * fine — this is the price of deliberately asking for the whole organisation.
   *
   * ⚠️ NOT react-window / react-virtual: those lay out `<div>`s, and this view
   * is a real `<table>` with shared column widths AND TWO LAYERS OF STICKY
   * HEADER (branch at `top: HEAD_H`, department under it). Moving to a div grid
   * would mean rewriting the whole view.
   *
   * The spacer-row technique instead (the same one v1's TabelPage uses): every
   * row — branch header, department header, person — goes into ONE flat list
   * with an exact height, the visible window is computed from the scroll
   * position, and everything outside it is replaced by two empty `<tr>`s of the
   * right height. Table structure and sticky behaviour are untouched.
   *
   * ⚠️ THE WINDOW START IS SNAPPED BACK to the row's ANCHOR — the sticky header
   * that has to stay mounted, or it scrolls out of the DOM and vanishes
   * mid-scroll and the reader loses track of where they are. Which header that
   * is depends on the view: with branch sections it is the BRANCH header (so the
   * branch row above the department row survives too), and in the single-section
   * view — the default «Ijro apparati» scope, which has no branch headers at all
   * — it is the DEPARTMENT header. Anchoring everything to the section start
   * there was measured to defeat the whole thing: with one section every row
   * anchored to offset 0, so scrolling to the end rendered all 188 rows.
   *
   * ⚠️ THE `h-[...]` CLASSES ON THE ROWS MUST MATCH THESE NUMBERS. If they
   * drift the window lands in the wrong place and scrolling jumps. The person
   * row is therefore a FIXED height and its name/position cells `truncate` —
   * before this a long job title wrapped to a second line and the row grew to
   * 69px, which is exactly what makes the arithmetic impossible.
   */
  const BRANCH_H = 41
  const DEPT_H = 36
  const EMP_H = 59

  type FlatRow =
    | { kind: 'branch'; key: string; top: number; anchorTop: number; name: string }
    | { kind: 'dept'; key: string; top: number; anchorTop: number; name: string; count: number; underBranch: boolean }
    | { kind: 'emp'; key: string; top: number; anchorTop: number; row: PhoneEntry; num: number; underBranch: boolean }

  const flat = useMemo(() => {
    const out: FlatRow[] = []
    let top = 0
    let num = 0
    for (const section of sections) {
      const underBranch = !!section.branchName
      const branchTop = top
      if (section.branchName) {
        out.push({ kind: 'branch', key: `b-${section.branchId}`, top, anchorTop: top, name: section.branchName })
        top += BRANCH_H
      }
      for (const g of section.groups) {
        const deptTop = top
        out.push({
          kind: 'dept',
          key: `d-${section.branchId ?? 's'}-${g.dept}`,
          top,
          anchorTop: underBranch ? branchTop : deptTop,
          name: g.dept, count: g.rows.length, underBranch,
        })
        top += DEPT_H
        for (const row of g.rows) {
          num += 1
          out.push({
            kind: 'emp', key: `e-${row.id}`, top,
            anchorTop: underBranch ? branchTop : deptTop,
            row, num, underBranch,
          })
          top += EMP_H
        }
      }
    }
    return { rows: out, totalH: top }
  }, [sections])

  const scrollRef = useRef<HTMLDivElement>(null)
  const [winTop, setWinTop] = useState(0)
  const viewH = useElementHeight(scrollRef, 700)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => setWinTop(el.scrollTop)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // A new scope or search term is a new list: stay at the top, or the window
  // would be computed against rows that no longer exist.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
    setWinTop(0)
  }, [scope, systemBranchId, search])

  const windowed = useMemo(() => {
    const rows = flat.rows
    const n = rows.length
    if (n === 0) return { rows, padTop: 0, padBottom: 0 }
    const OVERSCAN = 400
    const from = Math.max(0, winTop - OVERSCAN)
    const to = winTop + viewH + OVERSCAN

    let first = 0
    while (first < n - 1 && rows[first + 1].top <= from) first += 1
    // Back to this row's anchor so the sticky layer above it stays mounted.
    const anchor = rows[first].anchorTop
    while (first > 0 && rows[first - 1].top >= anchor) first -= 1

    let last = first
    while (last < n && rows[last].top < to) last += 1

    const padTop = rows[first].top
    const endTop = last < n ? rows[last].top : flat.totalH
    return { rows: rows.slice(first, last), padTop, padBottom: Math.max(0, flat.totalH - endTop) }
  }, [flat, winTop, viewH])

  return (
    <PageContainer>
      <PageHeader title={t('phone.title')} subtitle={t('phone.subtitle')} />

      <Card className="flex h-[calc(100dvh-13rem)] flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-col gap-2.5 border-b border-line p-4 lg:flex-row lg:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={t('phone.searchPlaceholder')} className="flex-1 lg:max-w-sm" />
          <Segmented
            value={scope}
            onChange={(v) => setFilters({ scope: v === 'exec' ? null : v, branch: null })}
            options={[
              { value: 'exec', label: t('phone.scopeExecutive') },
              { value: 'system', label: t('phone.scopeSystem') },
            ]}
          />
          {scope === 'system' && (
            <Select
              value={filters.branch}
              onChange={(e) => setFilter('branch', e.target.value)}
              aria-label={t('phone.allBranches')}
              placeholder={t('phone.allBranches')}
              options={systemBranches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))}
              wrapperClassName="lg:w-56"
            />
          )}
          <FilterReset count={activeFilterCount} onReset={reset} />
        </div>

        {/*
          ⚠️ FILIAL VA BO'LIM SARLAVHALARI SCROLLDA YOPISHIB TURADI (v1 bilan
          bir xil xulq). Bo'lim qatori filial qatorining TAGIGA aniq tushishi
          uchun balandliklar QAT'IY: jadval sarlavhasi 40px, filial qatori
          42px. `position: sticky` <tr> da hamma brauzerda ishlamaydi — shu
          bois <td> ga qo'yiladi; foni SHAFFOF BO'LMASLIGI shart, aks holda
          ostidan o'tayotgan qatorlar ko'rinib qoladi. Chegara
          `border-collapse` da yo'qolgani uchun `box-shadow` bilan chiziladi.
        */}
        {/* Single table with department (and branch) header rows */}
        <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead ref={headRef} className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-line text-[11.5px] font-semibold text-fg-muted">
                <th scope="col" className={cn(TH, "w-16")}>{t('phone.colNo')}</th>
                <th scope="col" className={cn(TH, "w-16")}>{t('phone.colPhoto')}</th>
                <th scope="col" className={TH}>{t('phone.colName')}</th>
                <th scope="col" className={TH}>{t('phone.colPosition')}</th>
                <th scope="col" className={cn(TH, "w-48")}>{t('phone.colPhonePersonal')}</th>
                <th scope="col" className={cn(TH, "w-56")}>{t('phone.colPhoneInternal')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-line">
                    <td className={TD_COMPACT}><Skeleton className="h-4 w-6" /></td>
                    <td className={TD_COMPACT}><Skeleton className="h-9 w-9 rounded-full" /></td>
                    <td className={TD_COMPACT}><Skeleton className="h-4 w-40" /></td>
                    <td className={TD_COMPACT}><Skeleton className="h-4 w-28" /></td>
                    <td className={TD_COMPACT}><Skeleton className="h-4 w-28" /></td>
                    <td className={TD_COMPACT}><Skeleton className="h-4 w-20" /></td>
                  </tr>
                ))
              ) : isEmpty ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState icon={<Phone size={20} />} title={t('phone.empty')} description={t('phone.emptyHint')} />
                  </td>
                </tr>
              ) : (
                <>
                  {/* The two spacers ARE the virtualisation: they hold the
                      scrollbar at the full list's height while only the visible
                      slice exists in the DOM. */}
                  {windowed.padTop > 0 && <tr aria-hidden="true" style={{ height: windowed.padTop }} />}
                  {windowed.rows.map((r) =>
                    r.kind === 'branch' ? (
                      <tr key={r.key} className="h-[41px]">
                        <td
                          colSpan={6}
                          className="sticky z-[9] bg-elevated py-2 pl-4 shadow-[inset_0_1px_0_rgb(var(--brand)/0.45),inset_0_-1px_0_rgb(var(--brand)/0.45)]"
                          style={{ top: HEAD_H }}
                        >
                          <span className="text-[12px] font-bold text-brand-strong">
                            {r.name}
                          </span>
                        </td>
                      </tr>
                    ) : r.kind === 'dept' ? (
                      <tr key={r.key} className="h-[36px]">
                        <td
                          colSpan={6}
                          className="sticky z-[8] bg-surface-2 py-1.5 pl-4 shadow-[inset_0_1px_0_rgb(var(--border)),inset_0_-1px_0_rgb(var(--border))]"
                          style={{ top: r.underBranch ? HEAD_H + BRANCH_H : HEAD_H }}
                        >
                          <span className="text-[11.5px] font-bold text-fg-muted">
                            {r.name}
                          </span>
                          <span className="ml-2.5 text-[10px] tabular-nums text-fg-subtle">
                            {t('phone.deptCount', { count: r.count })}
                          </span>
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={r.key}
                        className="h-[59px] border-b border-line transition-colors hover:bg-surface-2/40"
                      >
                        <td className={cn(TD_COMPACT, "text-[13px] tabular-nums text-fg-subtle")}>{r.num}.</td>
                        <td className={TD_COMPACT}>
                          <Avatar src={r.row.photo_thumb_path} fallbackSrc={r.row.photo_path} name={r.row.legal_name} size={38} />
                        </td>
                        {/* `truncate` is what keeps the row at exactly 59px: a
                            long job title used to wrap and grow the row to 69px,
                            which the window arithmetic cannot survive. The full
                            text stays available through the title attribute. */}
                        <td className="max-w-[1px] py-2.5 pr-3">
                          <span
                            className="block truncate text-[13px] font-semibold text-fg"
                            title={r.row.legal_name ?? undefined}
                          >
                            {r.row.legal_name || t('common.unknown')}
                          </span>
                        </td>
                        <td className="max-w-[1px] py-2.5 pr-3">
                          <span
                            className="block truncate text-[12px] text-fg-muted"
                            title={r.row.job_position_name ?? undefined}
                          >
                            {r.row.job_position_name || t('common.positionNotSet')}
                          </span>
                        </td>
                        {editing?.id === r.row.id ? (
                          <>
                            <td className="py-2.5 pr-3">
                              <input
                                autoFocus
                                value={editing.phone}
                                inputMode="tel"
                                onChange={(e) => setEditing({ ...editing, phone: maskValue('phone', e.target.value) })}
                                onKeyDown={(e) => onEditKey(e, r.row)}
                                aria-label={t('phone.colPhonePersonal')}
                                placeholder="+998901234567"
                                className={cn(control({ size: 'sm' }), 'w-full tabular-nums')}
                              />
                            </td>
                            <td className={TD_COMPACT}>
                              <span className="flex items-center gap-1.5">
                                <input
                                  value={editing.internal}
                                  inputMode="numeric"
                                  onChange={(e) => setEditing({ ...editing, internal: maskValue('internalPhone', e.target.value) })}
                                  onKeyDown={(e) => onEditKey(e, r.row)}
                                  aria-label={t('phone.colPhoneInternal')}
                                  className={cn(control({ size: 'sm' }), 'w-20 tabular-nums tracking-wider')}
                                />
                                <button
                                  type="button"
                                  onClick={() => saveEdit(r.row)}
                                  disabled={updatePhones.isPending}
                                  aria-label={t('common.save')}
                                  title={t('common.save')}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-control bg-brand text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                >
                                  <Check size={15} />
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  aria-label={t('common.cancel')}
                                  title={t('common.cancel')}
                                  className="grid h-8 w-8 shrink-0 place-items-center rounded-control text-fg-muted transition-colors hover:bg-surface-2"
                                >
                                  <X size={15} />
                                </button>
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-2.5 pr-3">
                              <span className="inline-flex items-center gap-2 text-[13px] text-fg-muted">
                                <span className="grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-fg-subtle">
                                  <Phone size={12} />
                                </span>
                                <span className="tabular-nums">{r.row.phone_number || '—'}</span>
                              </span>
                            </td>
                            <td className={TD_COMPACT}>
                              <span className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-2 text-[13px] font-bold text-brand">
                                  <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-soft">
                                    <PhoneCall size={12} />
                                  </span>
                                  <span className="tabular-nums tracking-wider">{r.row.internal_phone_number || '—'}</span>
                                </span>
                                {r.row.can_edit && (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(r.row)}
                                    aria-label={t('phone.editPhones', { name: r.row.legal_name ?? '' })}
                                    title={t('phone.editPhones', { name: r.row.legal_name ?? '' })}
                                    className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-control text-fg-subtle opacity-60 transition hover:bg-surface-2 hover:text-brand hover:opacity-100 focus-visible:opacity-100"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    ),
                  )}
                  {windowed.padBottom > 0 && <tr aria-hidden="true" style={{ height: windowed.padBottom }} />}
                </>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </PageContainer>
  )
}
