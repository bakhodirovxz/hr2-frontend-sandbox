import { useEffect, useMemo, useRef, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, ChevronRight, Clock, FileText, Paperclip, Pencil, Plus, Send, Trash2, X, XCircle } from 'lucide-react'
import { apiDelete, apiPost } from '@/api/http'
import { IconButton } from '@/components/ui/IconButton'
import { ORDER_ACTS } from '@/api/endpoints'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Select'
import { DateInput } from '@/components/ui/DateInput'
import { SearchInput } from '@/components/data/SearchInput'
import { FilterToggle } from '@/components/data/FilterToggle'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { FilterReset } from '@/components/data/FilterReset'
import { Pagination } from '@/components/data/Pagination'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { PageContainer } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { useListParams } from '@/hooks/useListParams'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { ScopeTabs } from '@/features/documents/ScopeTabs'
import {
  orderScopeParams,
  orderScopesFor,
  resolveScope,
  type OrderScope,
} from '@/features/documents/scopes'
import * as roles from '@/auth/roles'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { CreateOrderModal } from '@/features/orders/CreateOrderModal'
import { BlankSettingsButton } from '@/features/tabel/BlankSettingsButton'
import { OrderDecreePanel } from '@/features/orders/OrderDecreePanel'
import { OrderNotesPanel } from '@/features/orders/OrderNotesPanel'
import { OrderActionsPanel } from '@/features/orders/OrderActionsPanel'
import { cn } from '@/lib/cn'
import { formatAppDate } from '@/lib/format'
import { useOrderTypes } from '@/features/orderTypes/useOrderTypes'
import {
  useOrder,
  useOrderMutations,
  useOrders,
  useOrderStats,
  ORDER_STATUS_FILTERS,
  orderStatusKey,
  type OrderAct,
  type OrderSigner,
  type OrderStatusKey,
} from '@/features/orders/useOrders'
import type { Translation } from '@/i18n/uz'
import { Textarea } from '@/components/ui/Textarea'
import { TH, TD, TD_MESSAGE } from '@/components/data/tableStyles'
import { filterTile } from '@/components/ui/control'

type OKey = keyof Translation['orders']
const STATUS: Record<OrderStatusKey, { label: OKey; tone: BadgeTone; dot: string }> = {
  draft: { label: 'stDraft', tone: 'neutral', dot: '--fg-subtle' },
  signing: { label: 'stSigning', tone: 'warning', dot: '--warning' },
  changes: { label: 'stChanges', tone: 'danger', dot: '--danger' },
  signed: { label: 'stSigned', tone: 'info', dot: '--info' },
  registered: { label: 'stRegistered', tone: 'success', dot: '--success' },
  rejected: { label: 'stRejected', tone: 'danger', dot: '--danger' },
}

const LIST_KEYS = ['cat', 'doc', 'scope', 'from', 'to', 'status', 'emp'] as const

export function OrdersPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { search, setSearch, page, setPage, size, setSize, filters, setFilter, setFilters } =
    useListParams(LIST_KEYS)

  const selectedBranchId = useBranchStore((st) => st.selectedBranchId)

  // WHOSE orders — same rule set as the letters page (features/documents/scopes).
  const scopes = useMemo(() => orderScopesFor(user), [user])
  const scope = resolveScope<OrderScope>(filters.scope || null, scopes)
  const scopeParams = useMemo(
    () => orderScopeParams(scope, { employeeId: user?.employee?.id }),
    [scope, user],
  )
  // The registration queue IS a status — no second status filter there.
  const scopeHasStatus = 'status' in scopeParams

  // Unknown status from a hand-edited URL is dropped, never sent (422).
  const statusKey = (filters.status in ORDER_STATUS_FILTERS ? filters.status : '') as OrderStatusKey | ''
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  const { orders, total, pages, loading, fetching } = useOrders(filters.cat, search, scopeParams, {
    dateFrom: filters.from,
    dateTo: filters.to,
    status: !scopeHasStatus && statusKey ? ORDER_STATUS_FILTERS[statusKey] : undefined,
    employeeId: filters.emp,
    page,
    size,
    enabled: !rangeInvalid,
  })
  const { options: employeeOptions, error: employeeOptionsError } = useEmployeeOptions(selectedBranchId, true)
  const categories = useOrderTypes('', '')
  const { stats } = useOrderStats()
  const selectedId = filters.doc ? Number(filters.doc) : null
  const [creating, setCreating] = useState(false)

  const filterCount = [filters.cat, filters.from, filters.to, statusKey, filters.emp, search].filter(Boolean).length
  // The badge counts search too, but search never folds — so the panel's own
  // count excludes it, or an active search would open an empty panel.
  const foldedCount = [filters.cat, filters.from, filters.to, statusKey, filters.emp].filter(Boolean).length
  // Open by default only when a filter arrived with the URL (deep link, back
  // navigation): a narrowed list must never hide WHY it is narrow.
  const [filtersOpen, setFiltersOpen] = useState(() => foldedCount > 0)
  const resetFilters = () =>
    setFilters({ cat: null, from: null, to: null, status: null, emp: null, q: null, doc: null })

  // Phone: the detail opens full-screen on tap; desktop auto-opens the first.
  const wide = useMediaQuery('(min-width: 1024px)')
  useEffect(() => {
    if (wide && !filters.doc && orders[0]) setFilter('doc', String(orders[0].id))
  }, [wide, filters.doc, orders, setFilter])

  const catOptions = useMemo(
    () => categories.all.map((c) => ({ value: String(c.id), label: c.name ?? `#${c.id}` })),
    [categories.all],
  )
  const statusOptions = useMemo(
    () =>
      (Object.keys(ORDER_STATUS_FILTERS) as OrderStatusKey[]).map((k) => ({
        value: k,
        label: t(`orders.${STATUS[k].label}`),
      })),
    [t],
  )

  return (
    <PageContainer className="max-w-none">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-fg sm:text-2xl">{t('orders.title')}</h1>
          <p className="mt-1 text-sm text-fg-muted">{t('orders.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Buyruq blanki — yaratish tugmasi yonida (devonxona/kadr). */}
          <BlankSettingsButton />
          <Button data-tour="orders-create" leftIcon={<Plus size={16} />} onClick={() => setCreating(true)}>{t('orders.create')}</Button>
        </div>
      </div>

      {/* The whole branch's register at a glance — the numbers people quote,
          as opposed to the filtered page below them. */}
      {stats && (
        /* The branch's register at a glance; each number is also the way INTO
           that slice of the list (redesign 2026-09-24 — they were inert labels). */
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {([
            ['total', stats.total, '', <FileText key="i" size={17} />, 'from-[#8B5CF6] to-[#6D28D9]'],
            ['pending', stats.pending, 'signing', <Clock key="i" size={17} />, 'from-[#FCD34D] to-[#F59E0B]'],
            ['approved', stats.approved, 'registered', <CheckCircle2 key="i" size={17} />, 'from-[#34D399] to-[#059669]'],
            ['rejected', stats.rejected, 'rejected', <XCircle key="i" size={17} />, 'from-[#FB7185] to-[#E11D48]'],
          ] as const).map(([key, value, status, icon, tone]) => {
            const on = !scopeHasStatus && (statusKey || '') === status
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={scopeHasStatus && !!status}
                onClick={() => setFilters({ status: status || null, doc: null })}
                className={filterTile(on, 'enabled:hover:-translate-y-0.5 disabled:opacity-60')}
              >
                <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br text-white', tone)}>{icon}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold text-fg-muted">{t(`orders.stat_${key}` as never)}</span>
                  <span className="block text-[20px] font-extrabold leading-tight tabular-nums text-fg">{value ?? 0}</span>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Whose orders (role-scoped) */}
      <ScopeTabs
        scopes={scopes}
        value={scope}
        onChange={(next) => setFilters({ scope: next, doc: null })}
        className="mb-4 w-fit"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col overflow-hidden">
          <div className="space-y-2.5 border-b border-line p-3">
            {/* Search stays out — it is used on every visit. Everything else
                folds away behind the toggle: five stacked controls ate a third
                of this column before a single order was visible. */}
            <div className="flex items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder={t('orders.searchPlaceholder')} delay={300} className="min-w-0 flex-1" />
              <FilterToggle open={filtersOpen} onToggle={() => setFiltersOpen((o) => !o)} count={foldedCount} />
            </div>
            {filtersOpen && (<>
            <Combobox value={filters.cat} onChange={(v) => setFilter('cat', v)} options={catOptions} placeholder={t('orders.allCategories')} />
            {/* WHOSE decrees. v1 had this and v2 dropped it, so "every order
                about this person" could only be answered by reading the list. */}
            <Combobox
              value={filters.emp}
              onChange={(v) => setFilter('emp', v)}
              options={employeeOptions}
              error={employeeOptionsError}
              placeholder={t('orders.allEmployees')}
            />
            <div className="grid grid-cols-2 gap-2">
              <DateInput value={filters.from} onChange={(v) => setFilter('from', v)} invalid={rangeInvalid} aria-label={t('orders.dateFrom')} />
              <DateInput value={filters.to} onChange={(v) => setFilter('to', v)} invalid={rangeInvalid} aria-label={t('orders.dateTo')} />
            </div>
            {rangeInvalid && <p role="alert" className="text-xs text-danger">{t('list.invalidRange')}</p>}
            {!scopeHasStatus && (
              <Select
                value={statusKey}
                onChange={(e) => setFilter('status', e.target.value)}
                options={statusOptions}
                placeholder={t('orders.allStatuses')}
                aria-label={t('orders.allStatuses')}
              />
            )}
            <FilterReset count={filterCount} onReset={resetFilters} />
            </>)}
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : orders.length === 0 ? (
              <EmptyState
                icon={<FileText size={20} />}
                title={filterCount > 0 ? t('list.noResultsFiltered') : t('orders.empty')}
                description={filterCount > 0 ? t('list.noResultsFilteredHint') : undefined}
              />
            ) : (
              <ul>
                {orders.map((o) => (
                  <OrderRow key={o.id} order={o} active={selectedId === o.id} onClick={() => setFilter('doc', String(o.id))} />
                ))}
              </ul>
            )}
          </div>
          {/* Narrow column: stack the shared control's two rows. */}
          <div className="[&>div]:!flex-col [&>div]:!items-stretch">
            <Pagination page={page} size={size} total={total} pages={pages} onPage={setPage} onSize={setSize} loading={fetching} />
          </div>
        </Card>

        {wide && (
          <Card className="flex h-[calc(100dvh-13rem)] min-h-[480px] flex-col overflow-hidden">
            {selectedId ? (
              <OrderDetail id={selectedId} onClose={() => setFilter('doc', '')} />
            ) : (
              <div className="flex flex-1 items-center justify-center"><EmptyState icon={<FileText size={22} />} title={t('orders.selectDoc')} /></div>
            )}
          </Card>
        )}
      </div>
      {!wide && selectedId && (
        <Modal open onClose={() => setFilter('doc', '')} size="full" bodyFill title={t('orders.title')}>
          <div className="flex min-h-0 w-full flex-col">
            <OrderDetail id={selectedId} onClose={() => setFilter('doc', '')} />
          </div>
        </Modal>
      )}

      <CreateOrderModal open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setFilter('doc', id ? String(id) : '') }} />
    </PageContainer>
  )
}

function OrderRow({ order, active, onClick }: { order: OrderAct; active: boolean; onClick: () => void }) {
  const sk = orderStatusKey(order.status, !!order.is_stamped)
  return (
    <li>
      <button type="button" onClick={onClick} className={cn('flex w-full items-start gap-2 border-b border-line px-3 py-2.5 text-left transition-colors', active ? 'bg-brand-soft' : 'hover:bg-surface-2/60')}>
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: `rgb(var(${STATUS[sk].dot}))` }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-fg">{order.act_number || `#${order.id}`}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{order.act_date ? formatAppDate(order.act_date) : ''}</span>
          </div>
          <p className="truncate text-[11px] font-medium text-brand-strong">{order.category_rel?.name || '—'}</p>
          <p className="truncate text-[12px] text-fg-muted">{order.summary || '—'}</p>
        </div>
      </button>
    </li>
  )
}

function OrderDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { order, loading, failed } = useOrder(id)
  const mut = useOrderMutations()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const myEmployeeId = user?.employee?.id
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [removingDoc, setRemovingDoc] = useState<number | null>(null)
  const [rejecting, setRejecting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const docRef = useRef<HTMLInputElement>(null)

  if (failed) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<FileText size={22} />}
          title={t('list.docNotFound')}
          description={t('list.docNotFoundHint')}
          action={<Button variant="secondary" size="sm" onClick={onClose}>{t('common.close')}</Button>}
        />
      </div>
    )
  }
  if (loading || !order) return <div className="space-y-4 p-5"><Skeleton className="h-8 w-48" /><Skeleton className="h-40 w-full" /></div>

  const sk = orderStatusKey(order.status, !!order.is_stamped)
  const isDraft = sk === 'draft'
  const mySigner = (order.assigned_signers ?? []).find((s) => s.employee_id === myEmployeeId)
  /**
   * A decree (`creator_role` 'employee' or 'hr') is signed stage by stage
   * through `decree/approve` + `decree/send-to-leadership`; the backend rejects
   * the generic `/sign` and `/reject` on it outright
   * (`decree_uses_approval_flow`). Only the legacy acts — leave / trip / sick,
   * `creator_role` null — still use those routes, so the generic buttons must
   * follow the same split or they 400 on every click.
   */
  const isDecree = ['employee', 'hr'].includes(order.category_rel?.creator_role ?? '')
  const canSign = !!mySigner && sk === 'signing' && !isDecree

  /**
   * Decree powers, split per action instead of one `canManage` flag.
   *
   * The chancellery used to get ALL of them — approve, reject, send to
   * leadership, send to chancellery (to itself), register, apply, assign
   * readers. The backend allows them exactly one: `decree/register`, only while
   * the order sits in `pending_chancellery`, and never for an HR decree
   * (`hr_decree_no_chancellery`). Every other button 403'd on click.
   */
  // ⚠️ `isSiteMasterAdmin`, not `isMasterAdmin`: the wider one also matches a ministr, whom the server denies here (measured 2026-09-11: 403).
  const isAdmin = roles.isSiteMasterAdmin(user)
  /**
   * ⚠️ THIS DECREE'S BRANCH, not "is a clerk somewhere".
   *
   * `isAnyChancellery(user)` answers yes for a clerk assigned to ANY branch, so
   * on a list that mixes branches the Register and Edit-stamp buttons appeared
   * on other branches' decrees and the server refused them — the same
   * "button shown ≠ action allowed" split v1 avoids by passing the row's
   * branch (`canActAsChancellery(user, row.organization_branch_id)`).
   */
  const isChancelleryUser = roles.canActAsChancellery(user, order.organization_branch_id)
  const isHrDecree = order.category_rel?.creator_role === 'hr'
  // An HR decree carries no `created_by`, so the HR manager IS its owner.
  const isHrManager = roles.isHR(user) && isHrDecree
  const isCreator =
    !!myEmployeeId &&
    (order.created_by?.id === myEmployeeId || order.created_by_id === myEmployeeId)
  const isOwner = isCreator || isHrManager
  /* `_hr_can_manage`: HR of the decree's branch (the head-office HR of any). */
  const hrCanManage =
    roles.isHR(user) &&
    (!!user?.is_executive_hr ||
      roles.employeeBranchIds(user).includes(Number(order.organization_branch_id)))
  /* Submit: `_assert_decree_creator` — the author, HR on an HR decree, or the
     site admin. Delete: the same people plus the branch chancellery, which
     may remove a (non-HR) decree at ANY stage (`can_force_delete`). The
     subject of the decree used to see both buttons and get 403. */
  const canSubmit = isDraft && (isAdmin || isOwner)
  const canDelete =
    (isDraft && (isAdmin || isCreator || hrCanManage)) || (isChancelleryUser && !isHrDecree)
  /* Uploading/removing files, assigning familiarizers and recording
     movements share ONE server gate (`_assert_can_edit_decree`), which the
     server now ships as `can_manage`. The old re-derivation
     (creator ‖ HR-manager ‖ site-admin) missed the submitter and branch HR. */
  const canManageFiles = !!order.can_manage

  /**
   * WHAT MAY BE DONE TO THIS DECREE RIGHT NOW.
   *
   * ⚠️ EVERY POWER IS GATED ON THE STAGE, not only on the role. Most of these
   * used to be role-only, so an already-executed decree still offered
   * "Tasdiqlash", "Rahbariyatga yuborish" and "Ijroga qo'yish" — buttons the
   * server answers with 400. v1 hit exactly this confusion and narrowed the
   * admin too ("jadval bilan izchil"), which is what these windows mirror.
   */
  const st = (order.status ?? '').toLowerCase()
  const isSignStage = st === 'pending_approval' || st === 'pending_leadership'

  const decreePowers = {
    // Chancellery's one and only act — the number is already assigned, this
    // confirms it and draws the stamp.
    register: (isChancelleryUser || isAdmin) && !isHrDecree && st === 'pending_chancellery',
    // Approve / reject belongs to whoever the current stage is waiting on.
    // ⚠️ The signer of the CURRENT stage, not any signer: the server checks
    // `_current_stage_signer_type` (pending_approval → approver,
    // pending_leadership → leadership). A leadership signer looking at a
    // decree still at the approver stage saw Approve and got 403.
    approve:
      isSignStage &&
      (isAdmin ||
        (!!myEmployeeId &&
          !isChancelleryUser &&
          (order.assigned_signers ?? []).some(
            (sg) =>
              Number(sg.employee_id) === Number(myEmployeeId) &&
              sg.signer_type === (st === 'pending_approval' ? 'approver' : 'leadership'),
          ))),
    // The person entering the decree on the author's behalf confirms it first.
    confirmSubmission:
      st === 'pending_submitter' && (isAdmin || (!!myEmployeeId && order.submitter_id === myEmployeeId)),
    // Only the author can re-open a decree the approver sent back, and only
    // while it sits in `changes_requested` — the backend guards both.
    resubmit: (isAdmin || isOwner) && st === 'changes_requested',
    // Routing the decree onward is the author's (or HR's) step, and the server
    // takes it only from `approved`.
    route: (isAdmin || (isOwner && !isChancelleryUser)) && st === 'approved',
    // Applying a decree to an employee is strictly HR (backend: _is_hr_user)
    // and strictly from `confirmed`.
    // Applying is strictly HR — and deliberately NOT branch-scoped here: the
    // server's own gate (`OrderActService._is_hr_user`) says in as many words
    // that it is not limited by branch, so narrowing the client would hide a
    // button for an action the API allows.
    apply: (isAdmin || roles.isHR(user)) && !isChancelleryUser && st === 'confirmed',
    familiarizers: !!order.can_manage && st === 'confirmed',
    // The number is printed onto the document; a typo can only be corrected
    // here, and only by the office that owns the register.
    // ⚠️ An HR decree has no chancellery step: its number is fixed by the
    // creator or branch HR and the server REFUSES chancellery there
    // (`update_stamp`, 4948-4961). Only a regular decree's stamp belongs to
    // the register's office.
    editStamp: isHrDecree ? isCreator || roles.isHR(user) || isAdmin : isChancelleryUser || isAdmin,
  }
  /* Only the agreer whose removal was requested may answer it — the decree's
     other readers have nothing to decide here. */
  const removalAsked = (order.assigned_signers ?? []).some(
    (sg) =>
      sg.signer_type === 'approver' &&
      !!sg.removal_requested &&
      !!myEmployeeId &&
      Number(sg.employee_id) === Number(myEmployeeId),
  )
  const myFamiliarizer = (order.familiarizers ?? []).find((f) => f.employee_id === myEmployeeId)
  const canAcknowledge = !!myFamiliarizer && !myFamiliarizer.acknowledged
  // The mutation cache already toasts a failure; catching here keeps the
  // success notice from showing and the rejection from going unhandled.
  const run = async (p: Promise<unknown>, msg: string) => {
    try { await p } catch { return }
    mut.invalidate(); setNotice(msg)
  }
  // Named in the confirmation so the user sees which decree they act on.
  const orderSubject = order.act_number ? `№${order.act_number}` : order.summary

  // The backend auto-generates the decree .docx from the entered text on
  // create, and its own editor-config guard is exactly `if not
  // order_act.document` — so mirror that, nothing narrower.
  const doc = order.document
  const hasDocument = !!(doc && (doc.file_path || doc.document_objectname))
  const documentName = doc?.document_objectname?.split('/').pop() ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Button size="sm" variant="ghost" leftIcon={<ArrowLeft size={15} />} onClick={onClose} className="lg:hidden">{t('letters.back')}</Button>
        <div className="ml-auto flex items-center gap-2">
          {canSubmit && <Button size="sm" leftIcon={<Send size={14} />} onClick={async () => { if (!(await confirm({ kind: 'send', subject: orderSubject, confirmLabel: t('orders.submit') }))) return; await run(mut.submit.mutateAsync(order.id), t('orders.submitted')) }}>{t('orders.submit')}</Button>}
          {canSign && (
            <>
              <Button size="sm" variant="secondary" leftIcon={<Check size={14} />} onClick={async () => { if (!(await confirm({ kind: 'sign', subject: orderSubject, confirmLabel: t('orders.sign') }))) return; await run(mut.sign.mutateAsync(order.id), t('orders.signed_notice')) }}>{t('orders.sign')}</Button>
              <Button size="sm" variant="danger" leftIcon={<X size={14} />} onClick={() => setRejecting(true)}>{t('orders.reject')}</Button>
            </>
          )}
          {/* Edit is NOT "is it a draft": the author and HR keep editing until
              the chancellery registers it, and a decree sent back for changes
              has to be changeable. The server answers that question itself
              (`can_edit`), so this button and PATCH share one rule. */}
          {order.can_edit && (
            <Button size="sm" variant="outline" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
              {t('common.edit')}
            </Button>
          )}
          {canDelete && <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} className="text-danger" onClick={() => setConfirmDelete(true)}>{t('common.delete')}</Button>}
        </div>
      </div>

      <CreateOrderModal
        open={editing}
        order={editing ? order : null}
        onClose={() => setEditing(false)}
        onCreated={() => {
          setEditing(false)
          mut.invalidate()
          // A returned order waits for «Qayta yuborish» after the fix (the
          // edit no longer sends it on by itself) — say so.
          setNotice(order.status === 'changes_requested' ? t('orders.savedResubmitHint') : t('orders.saved'))
        }}
      />

      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto p-5">
        {notice && <div role="status" className="mb-4 rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">{notice}</div>}

        {/* What the document IS comes first — number, date, author, summary —
            and only then the buttons to sign it. A deputy used to meet
            «Tasdiqlash» before the order's own title (audit 2026-09-22). */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[15px] font-semibold text-brand-strong">{order.category_rel?.name || '—'}</span>
            <ChevronRight size={15} className="text-fg-subtle" />
            <span className="text-[15px] font-semibold text-fg">{order.act_number || `#${order.id}`}</span>
            <Badge tone={STATUS[sk].tone}>{t(`orders.${STATUS[sk].label}`)}</Badge>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Meta label={t('orders.docNumber')} value={order.act_number || '—'} />
            <Meta label={t('orders.docDate')} value={order.act_date ? formatAppDate(order.act_date) : '—'} />
            <Meta label={t('orders.docCategory')} value={order.category_rel?.name || '—'} />
            <Meta label={t('orders.author')} value={order.created_by?.legal_name || '—'} person={order.created_by} />
            {order.employee?.legal_name && (
              <Meta label={t('orders.subject')} value={order.employee.legal_name} person={order.employee} />
            )}
            {(order.planned_departure_date || order.planned_arrival_date) && (
              <Meta
                label={t('orders.plannedPeriod')}
                value={`${order.planned_departure_date ? formatAppDate(order.planned_departure_date) : '—'} — ${
                  order.planned_arrival_date ? formatAppDate(order.planned_arrival_date) : '—'
                }`}
              />
            )}
            <Meta label={t('orders.summary')} value={order.summary || order.description || '—'} wide />
            {order.plans && <Meta label={t('orders.plans')} value={order.plans} wide />}
            {order.arrival_report && (
              <Meta label={t('orders.arrivalReport')} value={order.arrival_report} wide />
            )}
          </dl>
          {order.deletion_requested && (
            <p className="mt-3 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-[13px] text-warning">
              {t('orders.deletionRequested')}
            </p>
          )}
          {sk === 'rejected' && order.rejection_reason && <p className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[13px] text-danger">{order.rejection_reason}</p>}
          {sk === 'rejected' && order.rejected_by?.legal_name && (
            <p className="mt-1 text-[12px] text-fg-muted">
              {t('orders.rejectedBy', { name: order.rejected_by.legal_name })}
            </p>
          )}
        </section>

        <OrderDecreePanel
          order={order}
          powers={decreePowers}
          canAcknowledge={canAcknowledge}
          removalAsked={removalAsked}
          onDone={(msg) => { mut.invalidate(); setNotice(msg) }}
        />

        <OrderNotesPanel orderId={order.id} onDone={(msg) => { mut.invalidate(); setNotice(msg) }} />

        {/* Arrival / departure records — HR's own log on a signed order. */}
        <OrderActionsPanel
          order={order}
          onDone={(msg) => { mut.invalidate(); setNotice(msg) }}
        />

        <section className="mb-6">
          <h3 className="mb-2 text-[15px] font-semibold text-fg">{t('orders.signers')}</h3>
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-[13px]">
              <thead className="bg-surface-2/60 text-[11.5px] font-semibold text-fg-muted">
                <tr><th className={TH}>{t('orders.colName')}</th><th className={TH}>{t('orders.colStatus')}</th></tr>
              </thead>
              <tbody>
                {(order.assigned_signers ?? []).map((s) => <SignerRow key={s.id} signer={s} signed={(order.signers ?? []).some((x) => x.employee_id === s.employee_id)} />)}
                {(order.assigned_signers ?? []).length === 0 && <tr><td colSpan={2} className={TD_MESSAGE}>—</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {/* The FILE ITSELF opens the document — one click, no choice of mode.
            Whether it opens editable or read-only is not the reader's decision
            and never was: the server downgrades `edit` to `view` for a locked
            decree or a user without the right, so offering two buttons only
            asked people to guess at their own permissions. */}
        <Card
          className={cn(
            'flex flex-wrap items-center gap-4 p-4',
            hasDocument && 'cursor-pointer transition-colors hover:border-brand/50 hover:bg-brand-soft/30',
          )}
          role={hasDocument ? 'button' : undefined}
          tabIndex={hasDocument ? 0 : undefined}
          aria-label={hasDocument ? t('orders.openFile') : undefined}
          onClick={hasDocument ? () => navigate(`/hujjatlar/edit/order-${order.id}`) : undefined}
          onKeyDown={
            hasDocument
              ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    navigate(`/hujjatlar/edit/order-${order.id}`)
                  }
                }
              : undefined
          }
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><FileText size={22} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-fg">
              {hasDocument ? (documentName ?? t('orders.openFile')) : t('orders.documentMissing')}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-subtle">
              {hasDocument ? t('orders.openFileHint') : t('orders.documentMissingHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Upload is always available: a decree may be drafted from a file. */}
            <input
              ref={docRef}
              type="file"
              aria-label={t('orders.uploadFiles')}
              multiple
              className="hidden"
              onChange={async (e) => {
                const list = Array.from(e.target.files ?? [])
                if (list.length === 0) return
                try {
                  const fd = new FormData()
                  list.forEach((f) => fd.append('files', f))
                  await apiPost(`${ORDER_ACTS}/${order.id}/documents`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  })
                  mut.invalidate()
                  setNotice(t('orders.actionDone'))
                } catch {
                  setNotice(t('orders.actionFailed'))
                } finally {
                  if (docRef.current) docRef.current.value = ''
                }
              }}
            />
            {/* stopPropagation: the card itself opens the document now, so
                without it "upload" would also navigate away. */}
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Paperclip size={14} />}
              onClick={(e) => {
                e.stopPropagation()
                docRef.current?.click()
              }}
            >
              {t('orders.uploadFiles')}
            </Button>
          </div>
        </Card>

        {/* UPLOADED FILES. v2 could attach them and never list them, so a file
            added by mistake stayed on the decree with no way to take it off.
            Inside the scroll area: outside it the list was pinned under the
            pane and drawn over its bottom edge (2026-09-24). */}
        {(order.documents ?? []).length > 0 && (
          <section className="mt-6">
            <h3 className="mb-2 text-[15px] font-semibold text-fg">{t('orders.attachedFiles')}</h3>
            <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line">
              {(order.documents ?? []).map((d) => {
                const name = (d.document_objectname ?? '').split('/').pop() || `#${d.id}`
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-fg-muted">
                      <Paperclip size={15} />
                    </span>
                    {d.file_path ? (
                      <a
                        href={d.file_path}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 truncate text-[13px] text-brand hover:underline"
                      >
                        {name}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{name}</span>
                    )}
                    {canManageFiles && (
                      <IconButton size="sm" label={t('common.delete')} onClick={() => setRemovingDoc(d.id)}>
                        <Trash2 size={15} className="text-danger" />
                      </IconButton>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={removingDoc != null}
        onClose={() => setRemovingDoc(null)}
        onConfirm={async () => {
          const id = removingDoc
          setRemovingDoc(null)
          if (id == null) return
          try {
            await apiDelete(`${ORDER_ACTS}/${order.id}/documents/${id}`)
            mut.invalidate()
            setNotice(t('orders.fileDeleted'))
          } catch {
            setNotice(t('orders.actionFailed'))
          }
        }}
        danger
        title={t('orders.fileDeleteTitle')}
        description={t('orders.fileDeleteConfirm')}
        confirmLabel={t('common.delete')}
      />

      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={async () => { setConfirmDelete(false); await run(mut.remove.mutateAsync(order.id), t('orders.deleted')); onClose() }} danger title={t('orders.deleteTitle')} description={t('orders.deleteConfirm')} confirmLabel={t('common.delete')} />

      <RejectModal open={rejecting} loading={mut.reject.isPending} onClose={() => setRejecting(false)} onSubmit={async (reason) => { setRejecting(false); await run(mut.reject.mutateAsync({ id: order.id, reason }), t('orders.rejected_notice')) }} />
    </div>
  )
}

function SignerRow({ signer, signed }: { signer: OrderSigner; signed: boolean }) {
  const { t } = useTranslation()
  return (
    <tr className="border-t border-line">
      <td className={TD}><div className="flex items-center gap-2"><Avatar src={signer.employee?.photo_thumb_path} name={signer.employee?.legal_name} size={26} /><span className="text-fg">{signer.employee?.legal_name || '—'}</span></div></td>
      <td className={TD}><Badge tone={signed ? 'success' : 'warning'}>{signed ? t('orders.signed') : t('orders.waiting')}</Badge></td>
    </tr>
  )
}

function Meta({ label, value, wide, person }: { label: string; value: string; wide?: boolean; person?: { legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null } | null }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2 text-[13px] text-fg">
        {person?.legal_name && <Avatar src={person.photo_thumb_path} fallbackSrc={person.photo_path} name={person.legal_name} size={22} />}
        {value}
      </dd>
    </div>
  )
}

function RejectModal({ open, loading, onClose, onSubmit }: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setReason(''); setError('') } }, [open])
  return (
    <Modal open={open} onClose={onClose} title={t('orders.reject')} size="sm" footer={<><Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => reason.trim() ? onSubmit(reason.trim()) : setError(t('orders.reasonRequired'))} loading={loading}>{t('common.confirm')}</Button></>}>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} aria-label={t('orders.reject')}
       />
      <FormError className="mt-1.5 text-xs">{error}</FormError>
    </Modal>
  )
}

