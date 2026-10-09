import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowDownWideNarrow,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  Hand,
  Hash,
  Inbox,
  LifeBuoy,
  MapPin,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Star,
  Trash2,
  Trophy,
  User,
  UserCheck,
  X,
} from 'lucide-react'
import { FormError } from '@/components/ui/FormError'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Avatar } from '@/components/ui/Avatar'
import { Checkbox } from '@/components/ui/Checkbox'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { LABEL_CLS, filterChip } from '@/components/ui/control'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { BulkBar } from '@/components/data/BulkBar'
import { SearchInput } from '@/components/data/SearchInput'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { useListParams } from '@/hooks/useListParams'
import { useFileDrop } from '@/hooks/useFileDrop'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { formatDateTime, inTashkent } from '@/lib/format'
import { useSupportMutations, useTicketById, useTicketSummary, useTickets, ticketStatusKey, type Ticket } from '@/features/support/useSupport'
import { TicketConversation } from '@/features/support/TicketConversation'
import { SupportRatingsPanel } from '@/features/support/SupportRatingsPanel'
import { PriorityFlag } from '@/features/projects/Priority'
import type { Priority } from '@/features/projects/useBoard'
import type { Translation } from '@/i18n/uz'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import dayjs from 'dayjs'

/**
 * Texnik yordam — a HELPDESK INBOX (redesign 2026-09-24, after Intercom's and
 * Fernand's inboxes on Refero).
 *
 * Three panes, left to right the order an operator works in: WHICH pile
 * (mine / the queue, split by status with live counts), WHICH ticket (a dense,
 * searchable list where new and unread stand out), and THE ticket — its facts,
 * its screenshots and the conversation, with the next action as the pane's
 * primary button. Nothing opens over the list any more, so moving from one
 * ticket to the next is one click. On a phone the panes collapse into the
 * usual list → full-screen ticket.
 *
 * Which views and actions exist is the server's rule, mirrored (see the notes
 * on each): an action is never drawn for someone it would answer 400/404 to.
 */

type SupportKey = keyof Translation['support']
type StatusKey = 'new' | 'taken' | 'done' | 'rated'
const STATUS_LABEL: Record<StatusKey, SupportKey> = { new: 'statusNew', taken: 'statusTaken', done: 'statusDone', rated: 'statusRated' }
const STATUS_TONE: Record<StatusKey, string> = {
  new: 'bg-info-soft text-info',
  taken: 'bg-warning-soft text-warning',
  done: 'bg-success-soft text-success',
  rated: 'bg-success-soft text-success',
}
const STATUS_DOT: Record<StatusKey, string> = { new: 'bg-info', taken: 'bg-warning', done: 'bg-success', rated: 'bg-success' }
const PRIO_LABEL: Record<string, SupportKey> = { low: 'prioLow', normal: 'prioNormal', high: 'prioHigh', urgent: 'prioUrgent' }
/** Ticket priority strings on the same four flags as the task board. */
const PRIO_FLAG: Record<string, Priority> = { urgent: 1, high: 2, normal: 3, low: 4 }

// `ticket` is what a notification deep-links to — see
// `features/notifications/notificationRoutes.ts`.
const SUPPORT_KEYS = ['tab', 'status', 'ticket', 'sort'] as const

/** Today → the time; earlier → the date. An inbox reads «when», not a timestamp. */
const shortWhen = (iso?: string | null) => {
  if (!iso) return ''
  const d = inTashkent(iso)
  return d.isSame(dayjs(), 'day') ? d.format('HH:mm') : d.format('DD.MM')
}

export function SupportPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const lp = useListParams(SUPPORT_KEYS)
  const { filters, setFilter, setFilters, search, setSearch } = lp
  const wide = useMediaQuery('(min-width: 1024px)')

  // ⚠️ «Mening murojaatlarim» needs an EMPLOYEE record: `?mine=true` answers
  // 400 `employee_required` otherwise. Master/admin logins have none — they
  // get the queue only.
  const user = useAuthStore((s) => s.user)
  const hasEmployee = !!user?.employee
  const myEmployeeId = user?.employee?.id ?? null
  /** The queue needs an employee too unless the caller is a master admin
   *  (`list_tickets` falls back to «my own» and calls `_require_employee`). */
  const canUse = hasEmployee || roles.isMasterAdmin(user)
  // Deleting is the site master-admin's alone — the server refuses everyone else.
  const isMaster = roles.isSiteMasterAdmin(user)
  // Views follow v1 and the server: the queue is AKT/master only (for anyone
  // else it silently returns their own tickets), ratings AKT/master/HR
  // (`ratings_summary` 404s without an AKT/HR branch).
  const isAkt = (user?.akt_branch_ids?.length ?? 0) > 0
  const showQueue = isAkt || roles.isMasterAdmin(user)
  const showRatings = isAkt || roles.isMasterAdmin(user) || roles.isHR(user)
  const ratingsTab = filters.tab === 'ratings' && showRatings
  const mine = hasEmployee && !(filters.tab === 'queue' && showQueue) && !ratingsTab
  const view: 'mine' | 'queue' | 'ratings' = ratingsTab ? 'ratings' : mine ? 'mine' : 'queue'

  const status = (filters.status || '') as '' | 'new' | 'taken' | 'done'
  const sortBy = filters.sort === 'priority' ? 'priority' : 'recent'
  // Filtered, searched, sorted and paged on the server; folders are counted
  // there too (`/support-tickets/summary`).
  const { list, loading, hasMore, loadingMore, loadMore } = useTickets({
    mine,
    status,
    search,
    sort: sortBy,
    enabled: canUse && !ratingsTab,
  })
  const counts = useTicketSummary({ mine, search, enabled: canUse && !ratingsTab })
  const mut = useSupportMutations()

  const openId = filters.ticket ? Number(filters.ticket) : null
  const listed = openId != null ? (list.find((x) => x.id === openId) ?? null) : null
  // A deep link, or a ticket on a page not loaded yet / outside the folder.
  const fetched = useTicketById(openId, openId != null && !listed && !loading)
  const open = listed ?? (openId != null && fetched?.id === openId ? fetched : null)
  const openTicket = (x: Ticket) => setFilter('ticket', String(x.id))
  // Desktop: the pane is never an empty frame — the top ticket opens, as in
  // any inbox. (On a phone the list stays the first screen.)
  // ⚠️ Keyed on the REQUESTED id, not the resolved ticket: right after «Yangi
  // murojaat» the URL already names the new ticket while the list has not
  // refetched yet — keying on `open` jumped to the top ticket instead, and the
  // first message went into the wrong thread (caught by the e2e run).
  useEffect(() => {
    if (wide && !ratingsTab && openId == null && list[0]) setFilter('ticket', String(list[0].id))
  }, [wide, ratingsTab, openId, list, setFilter])
  const closeTicket = () => setFilter('ticket', '')

  const [creating, setCreating] = useState(false)
  const [removing, setRemoving] = useState<Ticket | null>(null)
  const [rating, setRating] = useState<Ticket | null>(null)
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null)

  const notice = useCallback((msg: string, error?: boolean) => (error ? toast.error(msg) : toast.ok(msg)), [toast])
  const act = async (fn: Promise<unknown>, msg: string) => {
    try {
      await fn
      mut.invalidate()
      notice(msg)
    } catch (e) {
      notice(errorMessage(e, t('common.actionFailed')), true)
    }
  }

  /** What THIS reader may do to a ticket — the server's rules, mirrored. */
  const can = (x: Ticket) => {
    const sk = ticketStatusKey(x.status)
    const author = x.created_by_id === myEmployeeId
    return {
      // You cannot take your own ticket; `take_ticket` starts with
      // `_require_employee` (a master admin without a card got 400).
      take: sk === 'new' && hasEmployee && !author,
      // `mark_done` → the ASSIGNEE (or site admin) only, 404 otherwise.
      done: sk === 'taken' && !author && (x.assignee_id === myEmployeeId || isMaster),
      rate: author && sk === 'done' && x.rating == null,
      reopen: author && sk === 'done',
      manage: isMaster,
    }
  }

  const take = async (x: Ticket) => {
    if (await confirm({ kind: 'status', subject: `#${x.id}`, confirmLabel: t('support.take') })) await act(mut.take.mutateAsync(x.id), t('support.taken'))
  }
  const done = async (x: Ticket) => {
    if (await confirm({ kind: 'status', subject: `#${x.id}`, confirmLabel: t('support.done') })) await act(mut.done.mutateAsync(x.id), t('support.completed'))
  }
  const reopen = async (x: Ticket) => {
    if (await confirm({ kind: 'status', subject: `#${x.id}`, confirmLabel: t('support.reopen') })) await act(mut.reopen.mutateAsync(x.id), t('support.reopened'))
  }

  /* ── bulk: taking a pile of new tickets, or (master) clearing junk ── */
  const bulkable = view === 'queue' && (hasEmployee || isMaster)
  const sel = useRowSelection(bulkable ? list : [], { resetKey: `${view}|${status}` })
  const bulk = useBulkAction()
  const runBulk = async (allowed: (x: Ticket) => boolean, action: (x: Ticket) => Promise<unknown>, kind: 'status' | 'delete', label: string, okMsg: string) => {
    const picked = list.filter((x) => sel.selected.has(x.id))
    const eligible = picked.filter(allowed)
    if (!eligible.length) return notice(t('support.bulkNoneEligible'), true)
    if (!(await confirm({ kind, count: eligible.length, confirmLabel: label }))) return
    const byId = new Map(eligible.map((x) => [x.id, x]))
    const failed = await bulk.run(eligible.map((x) => x.id), (id) => action(byId.get(id)!))
    mut.invalidate()
    const bad = failed.length + picked.length - eligible.length
    notice(bad ? t('list.bulkPartialFail', { count: bad }) : okMsg, bad > 0)
    sel.clear()
  }

  if (!canUse) {
    return (
      <PageContainer>
        <PageHeader title={t('support.title')} subtitle={t('support.subtitle')} />
        <Card className="p-6">
          <EmptyState icon={<LifeBuoy size={22} />} title={t('support.employeeOnly')} description={t('support.employeeOnlyHint')} />
        </Card>
      </PageContainer>
    )
  }

  const folders: { key: 'mine' | 'queue' | 'ratings'; label: string; icon: ReactNode }[] = [
    ...(hasEmployee ? [{ key: 'mine' as const, label: t('support.tabMine'), icon: <User size={15} /> }] : []),
    ...(showQueue || !hasEmployee ? [{ key: 'queue' as const, label: t('support.tabQueue'), icon: <Inbox size={15} /> }] : []),
    ...(showRatings ? [{ key: 'ratings' as const, label: t('support.tabRatings'), icon: <Trophy size={15} /> }] : []),
  ]
  const statusFolders: { key: '' | 'new' | 'taken' | 'done'; label: string; count: number; dot?: string }[] = [
    { key: '', label: t('support.allStatuses'), count: counts.all },
    { key: 'new', label: t('support.statusNew'), count: counts.new, dot: 'bg-info' },
    { key: 'taken', label: t('support.statusTaken'), count: counts.taken, dot: 'bg-warning' },
    { key: 'done', label: t('support.statusDone'), count: counts.done, dot: 'bg-success' },
  ]
  const pickView = (v: 'mine' | 'queue' | 'ratings') => setFilters({ tab: v === 'mine' ? null : v, status: null, ticket: null })

  return (
    <PageContainer className="max-w-none">
      <PageHeader
        title={t('support.title')}
        subtitle={t('support.subtitle')}
        actions={
          /* Only someone with an employee card can FILE a ticket — the server
             needs a requester and their branch (`no_branch` / `employee_required`
             for a master admin, measured live). */
          /* `can_create: false` — the requester's branch has no AKT staff, so
             the server refuses every ticket there; say so up front instead of
             after the form is filled (09-25 sweep). */
          hasEmployee ? (
            <Button
              leftIcon={<Plus size={16} />}
              onClick={() => setCreating(true)}
              disabled={counts.can_create === false}
              title={counts.can_create === false ? t('support.notAvailable') : undefined}
            >
              {t('support.create')}
            </Button>
          ) : undefined
        }
      />

      {/* Phone / tablet: the folders as one swipeable chip row. */}
      <div className="scroll-thin -mx-page mb-3 flex gap-2 overflow-x-auto px-page pb-1 lg:hidden">
        {folders.map((f) => (
          <button key={f.key} type="button" aria-pressed={view === f.key} onClick={() => pickView(f.key)} className={chip(view === f.key)}>
            {f.icon} {f.label}
          </button>
        ))}
        {!ratingsTab &&
          statusFolders.map((s) => (
            <button key={s.key || 'all'} type="button" aria-pressed={status === s.key} onClick={() => setFilters({ status: s.key || null, ticket: null })} className={chip(status === s.key)}>
              {s.dot && <span className={cn('h-2 w-2 rounded-full', s.dot)} />} {s.label} <span className="tabular-nums text-fg-subtle">{s.count}</span>
            </button>
          ))}
      </div>

      <div className="grid gap-4 lg:h-[calc(100dvh-11.5rem)] lg:min-h-[560px] lg:grid-cols-[228px_minmax(300px,380px)_minmax(0,1fr)]">
        {/* ── folders ───────────────────────────────────────────────── */}
        <nav aria-label={t('support.title')} className="hidden flex-col gap-4 rounded-card border border-line bg-surface p-3 shadow-sm lg:flex">
          <ul className="flex flex-col gap-0.5">
            {folders.map((f) => (
              <li key={f.key}>
                <button
                  type="button"
                  aria-current={view === f.key ? 'page' : undefined}
                  onClick={() => pickView(f.key)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors',
                    view === f.key ? 'bg-brand-soft font-semibold text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  <span className={view === f.key ? 'text-brand-strong' : 'text-fg-subtle'}>{f.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{f.label}</span>
                  {f.key === view && f.key !== 'ratings' && counts.unread > 0 && (
                    <span className="rounded-pill bg-danger px-1.5 text-[11px] font-bold tabular-nums text-white">{counts.unread}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {!ratingsTab && (
            <div>
              <p className="mb-1 px-2.5 text-[11.5px] font-semibold text-fg-subtle">{t('support.byStatus')}</p>
              <ul className="flex flex-col gap-0.5">
                {statusFolders.map((s) => (
                  <li key={s.key || 'all'}>
                    <button
                      type="button"
                      aria-pressed={status === s.key}
                      onClick={() => setFilters({ status: s.key || null, ticket: null })}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                        status === s.key ? 'bg-surface-2 font-semibold text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                      )}
                    >
                      {s.dot ? <span className={cn('h-2 w-2 rounded-full', s.dot)} /> : <CircleDot size={13} className="text-fg-subtle" />}
                      <span className="min-w-0 flex-1 truncate">{s.label}</span>
                      <span className="text-[12px] font-semibold tabular-nums text-fg-subtle">{s.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>

        {ratingsTab ? (
          <div className="min-w-0 lg:col-span-2 lg:overflow-y-auto">
            <SupportRatingsPanel />
          </div>
        ) : (
          <>
            {/* ── the pile ───────────────────────────────────────────── */}
            <section className="flex min-h-0 flex-col rounded-card border border-line bg-surface shadow-sm">
              <div className="flex items-center gap-2 border-b border-line p-2.5">
                <div className="min-w-0 flex-1">
                  <SearchInput value={search} onChange={setSearch} placeholder={t('support.searchPlaceholder')} />
                </div>
                <IconButton
                  size="sm"
                  label={sortBy === 'priority' ? t('support.sortRecent') : t('support.sortPriority')}
                  onClick={() => setFilter('sort', sortBy === 'priority' ? '' : 'priority')}
                  className={sortBy === 'priority' ? 'bg-brand-soft text-brand-strong' : ''}
                >
                  <ArrowDownWideNarrow size={15} />
                </IconButton>
              </div>
              <p className="flex items-center gap-2 border-b border-line/70 px-3 py-1.5 text-[11.5px] text-fg-subtle">
                {bulkable && list.length > 0 && (
                  <Checkbox
                    checked={sel.allOnPageSelected}
                    indeterminate={sel.someOnPageSelected}
                    onChange={sel.toggleAllOnPage}
                    srLabel={t('list.selectAllOnPage')}
                  />
                )}
                <span className="flex-1">{t('support.ticketCount', { count: list.length })}</span>
                <span>{sortBy === 'priority' ? t('support.sortedPriority') : t('support.sortedRecent')}</span>
              </p>

              {sel.count > 0 && (
                <div className="border-b border-line p-2">
                  <BulkBar count={sel.count} onClear={sel.clear} progress={bulk.progress}>
                    <Button size="sm" leftIcon={<Hand size={14} />} onClick={() => runBulk((x) => can(x).take, (x) => mut.take.mutateAsync(x.id), 'status', t('support.take'), t('support.bulkTaken'))}>
                      {t('support.take')}
                    </Button>
                    {isMaster && (
                      <Button size="sm" variant="ghost" className="text-danger" leftIcon={<Trash2 size={14} />} onClick={() => runBulk(() => true, (x) => mut.remove.mutateAsync(x.id), 'delete', t('common.delete'), t('support.deleted'))}>
                        {t('common.delete')}
                      </Button>
                    )}
                  </BulkBar>
                </div>
              )}

              <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="space-y-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
                ) : list.length === 0 ? (
                  <div className="p-6">
                    <EmptyState
                      icon={<LifeBuoy size={22} />}
                      title={search || status ? t('list.noResultsFiltered') : t('support.empty')}
                      description={search || status ? t('list.noResultsFilteredHint') : t('support.emptyHint')}
                    />
                  </div>
                ) : (
                  <ul className="divide-y divide-line/60">
                    {list.map((x) => (
                      <li key={x.id}>
                        <TicketRow
                          ticket={x}
                          active={x.id === openId}
                          onOpen={() => openTicket(x)}
                          selectable={bulkable}
                          selected={sel.isSelected(x.id)}
                          onSelect={() => sel.toggle(x.id)}
                        />
                      </li>
                    ))}
                    {hasMore && (
                      <li className="p-2 text-center">
                        <button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-md px-3 py-1.5 text-[12.5px] font-medium text-brand-strong hover:bg-brand-soft disabled:text-fg-subtle">
                          {loadingMore ? t('common.loading') : t('common.loadMore')}
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </section>

            {/* ── the ticket ─────────────────────────────────────────── */}
            {wide && (
              <section className="flex min-h-0 min-w-0 flex-col rounded-card border border-line bg-surface shadow-sm">
                {open ? (
                  <TicketView
                    ticket={open}
                    rights={can(open)}
                    onTake={() => take(open)}
                    onDone={() => done(open)}
                    onReopen={() => reopen(open)}
                    onRate={() => setRating(open)}
                    onEdit={() => setEditingTicket(open)}
                    onDelete={() => setRemoving(open)}
                    onNotice={notice}
                  />
                ) : (
                  <div className="grid flex-1 place-items-center p-8">
                    <EmptyState icon={<Inbox size={22} />} title={t('support.pickTicket')} description={t('support.pickTicketHint')} />
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Phone / tablet: the ticket opens full-screen over the list. */}
      {!wide && open && !ratingsTab && (
        <Modal open onClose={closeTicket} size="full" bodyFill title={`#${open.id}`}>
          <TicketView
            ticket={open}
            rights={can(open)}
            onTake={() => take(open)}
            onDone={() => done(open)}
            onReopen={() => reopen(open)}
            onRate={() => setRating(open)}
            onEdit={() => setEditingTicket(open)}
            onDelete={() => setRemoving(open)}
            onNotice={notice}
            inModal
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('support.deleteTitle')}
        description={t('support.deleteConfirm')}
        loading={mut.remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          const id = removing.id
          setRemoving(null)
          if (openId === id) closeTicket()
          await act(mut.remove.mutateAsync(id), t('support.deleted'))
        }}
      />

      <RateModal
        ticket={rating}
        onClose={() => setRating(null)}
        onSubmit={async (stars, note) => {
          const tk = rating!
          setRating(null)
          await act(mut.rate.mutateAsync({ id: tk.id, rating: stars, note: note || undefined }), t('support.rated'))
        }}
      />

      <EditTicketModal
        ticket={editingTicket}
        loading={mut.update.isPending}
        onClose={() => setEditingTicket(null)}
        onSubmit={async (body) => {
          const tk = editingTicket
          if (!tk || !(await confirm({ kind: 'action', subject: `#${tk.id}`, confirmLabel: t('common.save') }))) return
          setEditingTicket(null)
          await act(mut.update.mutateAsync({ id: tk.id, body }), t('support.saved'))
        }}
      />

      <CreateTicketModal
        open={creating}
        loading={mut.create.isPending}
        onClose={() => setCreating(false)}
        onSubmit={async (fields, files) => {
          try {
            const made = (await mut.create.mutateAsync({ fields, files })) as { id?: number } | undefined
            mut.invalidate()
            setCreating(false)
            notice(t('support.created'))
            // Land on the new ticket in «my tickets», where the thread starts.
            if (made?.id) setFilters({ tab: null, status: null, ticket: String(made.id) })
          } catch (e) {
            notice(errorMessage(e, t('common.actionFailed')), true)
          }
        }}
      />
    </PageContainer>
  )
}

const chip = (on: boolean) => filterChip(on)

/* ───────────────────────────────── row ───────────────────────────────── */

function TicketRow({
  ticket: x,
  active,
  onOpen,
  selectable,
  selected,
  onSelect,
}: {
  ticket: Ticket
  active: boolean
  onOpen: () => void
  selectable: boolean
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const sk = ticketStatusKey(x.status)
  const prio = (x.priority || 'normal').toLowerCase()
  const unread = (x.unread_count ?? 0) > 0
  const fresh = sk === 'new'
  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={active ? 'true' : undefined}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      className={cn(
        'group/row relative flex cursor-pointer gap-2.5 px-3 py-2.5 transition-colors',
        active ? 'bg-brand-soft/70' : 'hover:bg-surface-2/60',
        selected && !active && 'bg-brand-soft/40',
      )}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand" aria-hidden />}
      {selectable && (
        <span className={cn('pt-0.5', selected ? '' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100')} onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected} onChange={onSelect} srLabel={t('list.selectRow')} />
        </span>
      )}
      <Avatar src={x.creator?.photo_thumb_path ?? undefined} name={x.creator?.legal_name ?? '?'} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={cn('min-w-0 flex-1 truncate text-[13px]', fresh || unread ? 'font-bold text-fg' : 'font-medium text-fg-muted')}>
            {x.creator?.legal_name ?? '—'}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums text-fg-subtle">{shortWhen(x.created_at)}</span>
        </div>
        <p className={cn('mt-0.5 line-clamp-2 text-[12.5px] leading-snug', fresh || unread ? 'text-fg' : 'text-fg-muted')}>{x.description}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-fg-subtle">
          <span className={cn('inline-flex items-center gap-1 rounded-pill px-1.5 py-px font-semibold', STATUS_TONE[sk])}>
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[sk])} />
            {t(`support.${STATUS_LABEL[sk]}` as `support.${SupportKey}`)}
          </span>
          <PriorityFlag value={PRIO_FLAG[prio] ?? 3} size={12} />
          {x.room_number && <span className="inline-flex items-center gap-0.5"><MapPin size={11} />{x.room_number}</span>}
          {(x.attachments?.length ?? 0) > 0 && <span className="inline-flex items-center gap-0.5"><Paperclip size={11} />{x.attachments!.length}</span>}
          {sk === 'rated' && x.rating != null && <span className="inline-flex items-center gap-0.5 text-warning"><Star size={11} fill="currentColor" />{x.rating}</span>}
          <span className="ml-auto text-fg-subtle">#{x.id}</span>
        </div>
      </div>
      {unread && (
        <span className="absolute right-3 top-9 grid h-4 min-w-4 place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold text-white" aria-label={t('support.unread', { count: x.unread_count ?? 0 })}>
          {x.unread_count}
        </span>
      )}
    </div>
  )
}

/* ─────────────────────────────── ticket pane ─────────────────────────── */

function TicketView({
  ticket: x,
  rights,
  onTake,
  onDone,
  onReopen,
  onRate,
  onEdit,
  onDelete,
  onNotice,
  inModal,
}: {
  ticket: Ticket
  rights: { take: boolean; done: boolean; rate: boolean; reopen: boolean; manage: boolean }
  onTake: () => void
  onDone: () => void
  onReopen: () => void
  onRate: () => void
  onEdit: () => void
  onDelete: () => void
  onNotice: (msg: string, error?: boolean) => void
  inModal?: boolean
}) {
  const { t } = useTranslation()
  const sk = ticketStatusKey(x.status)
  const prio = (x.priority || 'normal').toLowerCase()
  const images = (x.attachments ?? []).filter((a) => a.content_type?.startsWith('image/') && a.file_url)
  const files = (x.attachments ?? []).filter((a) => !(a.content_type?.startsWith('image/') && a.file_url))

  // Progress as three steps — sent → taken → done — the question a requester
  // actually has («has anyone picked it up?»).
  const steps: { key: string; label: string; at?: string | null; on: boolean }[] = [
    { key: 'new', label: t('support.stepSent'), at: x.created_at, on: true },
    { key: 'taken', label: t('support.stepTaken'), at: x.taken_at, on: sk !== 'new' },
    { key: 'done', label: t('support.stepDone'), at: x.done_at, on: sk === 'done' || sk === 'rated' },
  ]

  return (
    <div className={cn('scroll-thin flex min-h-0 w-full flex-col overflow-y-auto', inModal ? '' : 'flex-1')}>
      <header className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold tabular-nums text-fg-subtle"><Hash size={13} />{x.id}</span>
          <span className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[12px] font-semibold', STATUS_TONE[sk])}>
            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[sk])} />
            {t(`support.${STATUS_LABEL[sk]}` as `support.${SupportKey}`)}
          </span>
          <span className="inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 text-[12px] font-medium text-fg-muted">
            <PriorityFlag value={PRIO_FLAG[prio] ?? 3} size={12} /> {t(`support.${PRIO_LABEL[prio] ?? 'prioNormal'}` as `support.${SupportKey}`)}
          </span>
          <span className="flex-1" />
          {rights.manage && (
            <>
              <IconButton size="sm" label={t('common.edit')} onClick={onEdit}><Pencil size={14} /></IconButton>
              <IconButton size="sm" label={t('common.delete')} onClick={onDelete}><Trash2 size={14} /></IconButton>
            </>
          )}
        </div>
        <p className="mt-2.5 whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-fg">{x.description}</p>

        {(rights.take || rights.done || rights.rate || rights.reopen) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {rights.take && <Button leftIcon={<Hand size={15} />} onClick={onTake}>{t('support.take')}</Button>}
            {rights.done && <Button leftIcon={<CheckCircle2 size={15} />} onClick={onDone}>{t('support.done')}</Button>}
            {rights.rate && <Button leftIcon={<Star size={15} />} onClick={onRate}>{t('support.rate')}</Button>}
            {rights.reopen && <Button variant="ghost" leftIcon={<RotateCcw size={15} />} onClick={onReopen}>{t('support.reopen')}</Button>}
          </div>
        )}
      </header>

      <div className="grid gap-5 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* the three steps */}
          <ol className="flex items-start gap-1">
            {steps.map((s, i) => (
              <li key={s.key} className="flex min-w-0 flex-1 items-start gap-2">
                <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', s.on ? 'bg-success text-white' : 'border border-line text-fg-subtle')}>
                  {s.on ? <CheckCircle2 size={13} /> : <Circle size={9} />}
                </span>
                <span className="min-w-0">
                  <span className={cn('block text-[12.5px] font-semibold', s.on ? 'text-fg' : 'text-fg-subtle')}>{s.label}</span>
                  {s.on && s.at && <span className="block text-[11.5px] tabular-nums text-fg-subtle">{formatDateTime(s.at)}</span>}
                </span>
                {i < steps.length - 1 && <span className={cn('mt-2.5 h-px min-w-[12px] flex-1', steps[i + 1].on ? 'bg-success' : 'bg-line')} />}
              </li>
            ))}
          </ol>

          {(images.length > 0 || files.length > 0) && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg"><Paperclip size={14} className="text-fg-subtle" /> {t('support.fieldFiles')}</p>
              {images.length > 0 && (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
                  {images.map((a) => (
                    <a key={a.id} href={a.file_url!} target="_blank" rel="noopener noreferrer" className="group overflow-hidden rounded-lg border border-line" title={a.original_filename ?? ''}>
                      <img src={a.file_url!} alt={a.original_filename ?? ''} loading="lazy" className="h-24 w-full object-cover transition-transform group-hover:scale-[1.03]" />
                    </a>
                  ))}
                </div>
              )}
              {files.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {files.map((a) => (
                    <li key={a.id}>
                      <a href={a.file_url ?? '#'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[12px] text-fg-muted hover:border-brand/50 hover:text-fg">
                        <Paperclip size={13} /> <span className="max-w-[180px] truncate">{a.original_filename || t('support.attachment')}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <TicketConversation ticket={x} onNotice={onNotice} />
        </div>

        {/* the record */}
        <dl className="m-0 flex flex-col gap-3 rounded-inner bg-surface-2/50 p-3 text-[12.5px] xl:self-start">
          <Prop icon={<User size={13} />} label={t('support.creator')}>
            <span className="flex items-center gap-2 text-fg"><Avatar src={x.creator?.photo_thumb_path ?? undefined} name={x.creator?.legal_name ?? ''} size={22} />{x.creator?.legal_name ?? '—'}</span>
          </Prop>
          {x.creator_internal_number && (
            <Prop icon={<Phone size={13} />} label={t('support.internalPhone')}>
              <span className="font-semibold tabular-nums text-fg">{x.creator_internal_number}</span>
            </Prop>
          )}
          <Prop icon={<UserCheck size={13} />} label={t('support.assignee')}>
            {x.assignee?.legal_name ? (
              <span className="flex items-center gap-2 text-fg"><Avatar src={x.assignee.photo_thumb_path ?? undefined} name={x.assignee.legal_name} size={22} />{x.assignee.legal_name}</span>
            ) : (
              <span className="text-fg-subtle">{t('support.unassigned')}</span>
            )}
          </Prop>
          {x.room_number && <Prop icon={<MapPin size={13} />} label={t('support.fieldRoom')}><span className="text-fg">{x.room_number}</span></Prop>}
          {x.uge_number && <Prop icon={<Hash size={13} />} label={t('support.fieldUge')}><span className="tabular-nums text-fg">{x.uge_number}</span></Prop>}
          <Prop icon={<Clock size={13} />} label={t('support.createdAt')}><span className="tabular-nums text-fg">{x.created_at ? formatDateTime(x.created_at) : '—'}</span></Prop>
          {x.rating != null && (
            <Prop icon={<Star size={13} />} label={t('support.rating')}>
              <span className="flex flex-col gap-0.5">
                <span className="flex gap-0.5 text-warning">
                  {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={14} fill={n <= (x.rating ?? 0) ? 'currentColor' : 'none'} />)}
                </span>
                {x.rating_note && <span className="text-fg-muted">«{x.rating_note}»</span>}
              </span>
            </Prop>
          )}
        </dl>
      </div>
    </div>
  )
}

function Prop({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5 text-[11.5px] text-fg-subtle">{icon}{label}</dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  )
}

/* ─────────────────────────────── modals ──────────────────────────────── */

function RateModal({ ticket, onClose, onSubmit }: { ticket: Ticket | null; onClose: () => void; onSubmit: (stars: number, note: string) => void }) {
  const { t } = useTranslation()
  const [stars, setStars] = useState(0)
  const [note, setNote] = useState('')
  useEffect(() => { if (ticket) { setStars(0); setNote('') } }, [ticket])
  return (
    <Modal
      open={!!ticket}
      onClose={onClose}
      title={t('support.rate')}
      description={t('support.ratePrompt')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button disabled={!stars} onClick={() => onSubmit(stars, note.trim())}>{t('common.save')}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex justify-center gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={String(n)}
              aria-pressed={stars >= n}
              onClick={() => setStars(n)}
              className={cn('grid h-11 w-11 place-items-center rounded-lg border transition-colors', stars >= n ? 'border-warning bg-warning-soft text-warning' : 'border-line text-fg-subtle')}
            >
              <Star size={20} fill={stars >= n ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
        {/* The note is saved as `rating_note` — the quality side of the AKT rating. */}
        <Field label={t('support.rateNote')}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/** Master-admin edit — the four fields `SupportTicketUpdate` takes. */
function EditTicketModal({ ticket, loading, onClose, onSubmit }: {
  ticket: Ticket | null
  loading: boolean
  onClose: () => void
  onSubmit: (body: Record<string, unknown>) => void
}) {
  const { t } = useTranslation()
  const [uge, setUge] = useState('')
  const [room, setRoom] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')

  useEffect(() => {
    if (!ticket) return
    setUge(ticket.uge_number ?? '')
    setRoom(ticket.room_number ?? '')
    setDescription(ticket.description ?? '')
    setPriority(ticket.priority ?? 'normal')
  }, [ticket])

  return (
    <Modal
      open={!!ticket}
      onClose={onClose}
      title={t('support.editTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            loading={loading}
            disabled={!description.trim()}
            onClick={() => onSubmit({ uge_number: uge.trim() || null, room_number: room.trim() || null, description: description.trim(), priority })}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('support.fieldUge')}><Input value={uge} onChange={(e) => setUge(e.target.value)} /></Field>
        <Field label={t('support.fieldRoom')}><Input value={room} onChange={(e) => setRoom(e.target.value)} /></Field>
        <Field label={t('support.fieldPriority')}>
          <Select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            options={['urgent', 'high', 'normal', 'low'].map((p) => ({ value: p, label: t(`support.${PRIO_LABEL[p]}` as `support.${SupportKey}`) }))}
          />
        </Field>
        <Field label={t('support.fieldDescription')} wide>
          <Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function CreateTicketModal({ open, loading, onClose, onSubmit }: { open: boolean; loading: boolean; onClose: () => void; onSubmit: (fields: Record<string, string>, files: File[]) => void }) {
  const { t } = useTranslation()
  const [room, setRoom] = useState('')
  const [uge, setUge] = useState('')
  const [priority, setPriority] = useState('normal')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Screenshots reach this form three ways: the picker, a drag, and Ctrl+V —
  // the third is the one people use, a screenshot starts in the clipboard.
  const addFiles = useCallback((incoming: File[]) => setFiles((prev) => [...prev, ...incoming]), [])
  const { dragging, dropProps, take } = useFileDrop({ enabled: open, onFiles: addFiles })

  useEffect(() => {
    if (!open) return
    setRoom(''); setUge(''); setPriority('normal'); setDescription(''); setError(''); setFiles([])
  }, [open])

  const prioOptions = useMemo(
    () => ['urgent', 'high', 'normal', 'low'].map((p) => ({ value: p, label: t(`support.${PRIO_LABEL[p]}` as `support.${SupportKey}`) })),
    [t],
  )

  const submit = () => {
    if (!description.trim()) return setError(t('support.descRequired'))
    onSubmit({ room_number: room, uge_number: uge, priority, description: description.trim() }, files)
  }

  return (
    <Modal open={open} onClose={onClose} title={t('support.createTitle')} description={t('support.createHint')} footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
        <Button onClick={submit} loading={loading}>{t('support.send')}</Button>
      </>
    }>
      <div className="space-y-4">
        <Field label={t('support.fieldDescription')}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} name="description" aria-label={t('support.fieldDescription')} placeholder={t('support.descPlaceholder')} autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('support.fieldRoom')}>
            <Input value={room} onChange={(e) => setRoom(e.target.value)} name="room_number" aria-label={t('support.fieldRoom')} />
          </Field>
          <Field label={t('support.fieldUge')}>
            <Input value={uge} onChange={(e) => setUge(e.target.value)} name="uge_number" aria-label={t('support.fieldUge')} />
          </Field>
          <div>
            <span className={LABEL_CLS}>{t('support.fieldPriority')}</span>
            <Combobox value={priority} onChange={setPriority} options={prioOptions} placeholder={t('support.fieldPriority')} clearable={false} />
          </div>
        </div>
        <div>
          <span className={LABEL_CLS}>{t('support.fieldFiles')}</span>
          <div {...dropProps} className={cn('rounded-lg border border-dashed p-3 transition-colors', dragging ? 'border-brand bg-brand-soft' : 'border-line')}>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" leftIcon={<Paperclip size={14} />} onClick={() => fileRef.current?.click()}>
                {t('support.pickFiles')}
              </Button>
              <span className="text-xs text-fg-subtle">{t('support.filesHint')}</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { take(e.target.files); e.target.value = '' }} />
            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2 text-[13px]">
                    <Paperclip size={13} className="shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate text-fg">{f.name}</span>
                    <span className="shrink-0 tabular-nums text-fg-subtle">{Math.round(f.size / 1024)} KB</span>
                    <button type="button" aria-label={t('common.delete')} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} className="shrink-0 rounded-xs p-1 text-fg-subtle hover:bg-danger-soft hover:text-danger">
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}
