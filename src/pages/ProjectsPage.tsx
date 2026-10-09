import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Flag,
  FolderKanban,
  KanbanSquare,
  List as ListIcon,
  ListChecks,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Search,
  Sun,
  Table2,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Card as UICard } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { Avatar } from '@/components/ui/Avatar'
import { Checkbox } from '@/components/ui/Checkbox'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { POPOVER, filterChip } from '@/components/ui/control'
import { PageContainer } from '@/components/layout/Page'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { useConfirm } from '@/components/data/useConfirm'
import { BulkBar } from '@/components/data/BulkBar'
import { FilterReset } from '@/components/data/FilterReset'
import { SearchInput } from '@/components/data/SearchInput'
import { useListParams } from '@/hooks/useListParams'
import { useFilterReset } from '@/hooks/useFilterReset'
import { useRowSelection } from '@/hooks/useRowSelection'
import { useBulkAction } from '@/hooks/useBulkAction'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { formatUzShort } from '@/lib/format'
import {
  useBoard,
  useBoardMutations,
  useWorkspaceDetail,
  useWorkspaceMutations,
  useWorkspaces,
  type Card,
  type Column,
  type EmployeeBrief,
  type Label,
  type Priority,
} from '@/features/projects/useBoard'
import { AssigneeStack, LabelChips, QuickAdd, StatusPicker, labelStyle } from '@/features/projects/TaskPickers'
import { PRIORITIES, PriorityFlag, PriorityPicker } from '@/features/projects/Priority'
import { DoneToggle, TaskDetail, type TaskRights } from '@/features/projects/TaskDetail'
import {
  cardLabels,
  cardMembers,
  checklistProgress,
  dueTone,
  isDueSoon,
  isOverdue,
  relativeDue,
} from '@/features/projects/taskUtils'
import { ProjectMembersModal } from '@/features/projects/ProjectMembersModal'
import { useAuthStore } from '@/store/authStore'
import * as roles from '@/auth/roles'
import dayjs from 'dayjs'
import { DateInput } from '@/components/ui/DateInput'

/**
 * Loyihalar — a task manager on the ClickUp model (redesign 2026-09-24).
 *
 * The frame is ClickUp's: projects in a sidebar of their own, the open project
 * as a header with its people and its progress, then VIEW TABS over one set of
 * tasks (List · Board · Table) and a single filter row. The list is grouped
 * under coloured status pills; every row carries the four things a planner
 * scans for — who, when, how urgent, how far along (subtasks) — and each of
 * them is edited right on the row. Opening a task gives the two-pane view
 * (`TaskDetail`): the work on the left, the record on the right.
 *
 * Everything that shapes what is shown — project, view, grouping, every
 * filter, the opened task — lives in the URL, so a filtered view is a link.
 */

type View = 'list' | 'board' | 'table'
type GroupBy = 'status' | 'assignee' | 'label' | 'priority'

// `card` is what a task notification deep-links to — see
// `features/notifications/notificationRoutes.ts`.
const PROJECT_KEYS = ['workspace', 'view', 'group', 'assignee', 'label', 'done', 'card', 'prio', 'due'] as const
const PROJECT_FILTERS = ['assignee', 'label', 'done', 'prio', 'due'] as const

/** A project's own colour — stable per id, so the tile never changes. */
const PROJECT_TONES = [
  'from-[#8B5CF6] to-[#6D28D9]',
  'from-[#38BDF8] to-[#0284C7]',
  'from-[#34D399] to-[#059669]',
  'from-[#FB7185] to-[#E11D48]',
  'from-[#FCD34D] to-[#F59E0B]',
  'from-[#A78BFA] to-[#DB2777]',
]
const projectTone = (id: number) => PROJECT_TONES[Math.abs(id) % PROJECT_TONES.length]

export function ProjectsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const lp = useListParams(PROJECT_KEYS)
  const { search, setSearch, filters, setFilter } = lp
  // workspace / view / group are view state, not filters — a reset keeps them.
  const { count: activeFilterCount, reset } = useFilterReset(lp, PROJECT_FILTERS)
  const { workspaces, loading: wsLoading } = useWorkspaces()

  const workspaceId = filters.workspace ? Number(filters.workspace) : (workspaces[0]?.id ?? null)
  useEffect(() => {
    if (!filters.workspace && workspaces[0]) setFilter('workspace', String(workspaces[0].id))
  }, [filters.workspace, workspaces, setFilter])

  const view = (filters.view || 'list') as View
  const groupBy = (filters.group || 'status') as GroupBy
  const showDone = filters.done === '1'

  const { columns, loading } = useBoard(workspaceId)
  const { members: projectMembers, labels: projectLabels } = useWorkspaceDetail(workspaceId)
  const mut = useBoardMutations(workspaceId)

  /**
   * `create_card` is an employee's act on the server (`not_an_employee`), while
   * editing an existing card is not — so an admin login keeps the board it can
   * legitimately manage and simply loses the add row, instead of being offered
   * a field that answers 400.
   */
  const user = useAuthStore((st) => st.user)
  const myEmployeeId = user?.employee?.id ?? null
  const canCreateTasks = !!myEmployeeId
  const current = workspaces.find((w) => w.id === workspaceId) ?? null
  /* Mirrors of the three server gates, so nothing is offered that answers 403:
       board  — `WorkspaceService.require_owner`: the project's creator, or an
                admin / master-admin (columns, project name, members);
       own    — `CardService._require_owner`: the card's creator (fields,
                priority, labels, members, delete);
       act    — `CardService._require_assignee`: creator or a card member
                (done / undo / reject / move / checklist / attachments).
     `created_by_id` comes with every card and project, so the verdict is the
     server's own data, not a role guess. */
  const privileged = roles.isSiteMasterAdmin(user) || roles.isBranchAdmin(user)
  const own = (c: Card) => privileged || (c.created_by_id != null && c.created_by_id === myEmployeeId)
  const rights: TaskRights = {
    board: privileged || (current?.created_by_id != null && current.created_by_id === myEmployeeId),
    own,
    act: (c: Card) => own(c) || (c.members ?? []).some((m) => m.member_id != null && m.member_id === myEmployeeId),
  }

  const [deleting, setDeleting] = useState<Card | null>(null)
  const wsMut = useWorkspaceMutations()
  const [creatingProject, setCreatingProject] = useState(false)
  const [renamingProject, setRenamingProject] = useState<{ id: number; name: string } | null>(null)
  const [deletingProject, setDeletingProject] = useState<{ id: number; name: string } | null>(null)
  const [addingColumn, setAddingColumn] = useState(false)
  const [renamingColumn, setRenamingColumn] = useState<Column | null>(null)
  const [columnColor, setColumnColor] = useState('')
  const [projectDesc, setProjectDesc] = useState('')
  const [deletingColumn, setDeletingColumn] = useState<Column | null>(null)
  /** The members window; `fresh` right after a project is created. */
  const [membersOpen, setMembersOpen] = useState<{ fresh: boolean } | null>(null)

  const run = async (p: Promise<unknown>) => {
    try {
      await p
      mut.invalidate()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  /** Every card of the project, flattened once — each view slices this list. */
  const allCards = useMemo(
    () => columns.flatMap((c) => (c.cards ?? []).map((k) => ({ ...k, column_id: k.column_id ?? c.id }))),
    [columns],
  )

  /**
   * The opened task IS `?card=<id>` — no local copy. A notification deep link
   * («Sizga vazifa biriktirildi») and a click land the same way, and closing
   * clears the one place it lives. (A local id next to the URL reopened the
   * task right after Escape: the state cleared a render before the URL did and
   * the deep-link effect put it back.)
   */
  const openCardId = filters.card ? Number(filters.card) : null
  const openCard = openCardId != null ? (allCards.find((c) => c.id === openCardId) ?? null) : null
  const openTask = (c: Card) => setFilter('card', String(c.id))
  const closeTask = () => setFilter('card', '')

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const today = dayjs().startOf('day')
    return allCards.filter((c) => {
      if (!showDone && c.is_completed) return false
      if (filters.assignee && !cardMembers(c).some((m) => String(m.id) === filters.assignee)) return false
      if (filters.label && !cardLabels(c).some((l) => String(l.id) === filters.label)) return false
      if (filters.prio) {
        if (filters.prio === 'none' ? c.priority != null : String(c.priority ?? '') !== filters.prio) return false
      }
      if (filters.due) {
        const d = c.end_date ? dayjs(c.end_date).startOf('day') : null
        if (filters.due === 'none' && d) return false
        if (filters.due === 'overdue' && !isOverdue(c)) return false
        if (filters.due === 'today' && !(d && d.isSame(today))) return false
        if (filters.due === 'week' && !(d && !d.isBefore(today) && d.diff(today, 'day') < 7)) return false
      }
      if (q && !`${c.title ?? ''} ${c.description ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [allCards, search, showDone, filters.assignee, filters.label, filters.prio, filters.due])

  /** The project's pulse — computed over ALL its tasks, not the filtered slice. */
  const stats = useMemo(() => {
    const done = allCards.filter((c) => c.is_completed).length
    return {
      total: allCards.length,
      done,
      open: allCards.length - done,
      overdue: allCards.filter(isOverdue).length,
      soon: allCards.filter(isDueSoon).length,
      pct: allCards.length ? Math.round((done / allCards.length) * 100) : 0,
    }
  }, [allCards])

  /** Groups for the list view — the header a task manager collapses. */
  const groups = useMemo<Group[]>(() => {
    if (groupBy === 'status') {
      return columns.map((col) => ({
        key: `c${col.id}`,
        name: col.name ?? '—',
        color: col.color ?? null,
        columnId: col.id,
        column: col,
        cards: visible.filter((c) => c.column_id === col.id),
      }))
    }
    if (groupBy === 'priority') {
      const out: Group[] = PRIORITIES.map((p) => ({
        key: `p${p.value}`,
        name: t(`projects.${p.key}`),
        color: p.fill,
        columnId: null,
        flag: p.value,
        cards: visible.filter((c) => c.priority === p.value),
      }))
      out.push({ key: 'pnone', name: t('projects.prioNone'), color: null, columnId: null, flag: null, cards: visible.filter((c) => c.priority == null) })
      return out.filter((g) => g.cards.length > 0)
    }
    if (groupBy === 'assignee') {
      const out: Group[] = projectMembers.map((m) => ({
        key: `m${m.id}`,
        name: m.legal_name ?? '—',
        color: null,
        columnId: null,
        person: m,
        cards: visible.filter((c) => cardMembers(c).some((x) => x.id === m.id)),
      }))
      out.push({ key: 'unassigned', name: t('projects.unassigned'), color: null, columnId: null, cards: visible.filter((c) => cardMembers(c).length === 0) })
      return out.filter((g) => g.cards.length > 0)
    }
    const out: Group[] = projectLabels.map((l) => ({
      key: `l${l.id}`,
      name: l.name ?? '—',
      color: l.color ?? null,
      columnId: null,
      cards: visible.filter((c) => cardLabels(c).some((x) => x.id === l.id)),
    }))
    out.push({ key: 'nolabel', name: t('projects.noLabelGroup'), color: null, columnId: null, cards: visible.filter((c) => cardLabels(c).length === 0) })
    return out.filter((g) => g.cards.length > 0)
  }, [groupBy, columns, visible, projectMembers, projectLabels, t])

  // Adding a member/label is harmless; only taking one off asks first.
  const toggleMember = async (card: Card, employeeId: number, on: boolean) => {
    if (!on && !(await confirm({ kind: 'delete', subject: card.title }))) return
    await run(on
      ? mut.addMember.mutateAsync({ cardId: card.id, memberId: employeeId })
      : mut.removeMember.mutateAsync({ cardId: card.id, memberId: employeeId }))
  }
  const toggleLabel = async (card: Card, labelId: number, on: boolean) => {
    if (!on && !(await confirm({ kind: 'delete', subject: card.title }))) return
    await run(on
      ? mut.addLabel.mutateAsync({ cardId: card.id, labelId })
      : mut.removeLabel.mutateAsync({ cardId: card.id, labelId }))
  }
  /** Done/undone from any view (circle, row, panel) — one confirmed path. */
  const toggleDone = async (c: Card) => {
    const ok = await confirm({
      kind: 'status',
      subject: c.title,
      confirmLabel: c.is_completed ? t('projects.markUndone') : t('projects.markDone'),
    })
    if (ok) await run(mut.completeCard.mutateAsync({ id: c.id, done: !c.is_completed }))
  }
  /** A move to ANOTHER column is a status change and asks first; reordering
   *  inside the same column (drag) stays instant. */
  const moveCard = async (c: Card, columnId: number, position?: number) => {
    if (c.column_id !== columnId && !(await confirm({ kind: 'status', subject: c.title }))) return
    await run(mut.moveCard.mutateAsync({ id: c.id, columnId, position }))
  }
  const setPriority = async (c: Card, p: Priority | null) => {
    if (c.priority === p) return
    if (!(await confirm({ kind: 'status', subject: c.title, confirmLabel: t('projects.priority') }))) return
    await run(mut.setPriority.mutateAsync({ id: c.id, priority: p }))
  }

  const rowProps: RowProps = {
    columns,
    projectMembers,
    projectLabels,
    onOpen: openTask,
    onToggleDone: toggleDone,
    onMove: moveCard,
    onPriority: setPriority,
    onDue: (c: Card, date: string) => run(mut.updateCard.mutateAsync({ id: c.id, body: { end_date: date || null } })),
    onToggleMember: toggleMember,
    onToggleLabel: toggleLabel,
    onManageMembers: rights.board ? () => setMembersOpen({ fresh: false }) : undefined,
    rights,
  }

  const quickCreate = (columnId: number, extra?: Record<string, unknown>) => async (title: string) => {
    await run(mut.createCard.mutateAsync({ title, column_id: columnId, ...extra }))
  }

  /* ── bulk: the selection spans every visible task, not a page ── */
  const sel = useRowSelection(view === 'board' ? [] : visible, { resetKey: `${workspaceId}|${view}` })
  const bulk = useBulkAction()
  const selectedCards = allCards.filter((c) => sel.selected.has(c.id))
  const runBulk = async (kind: 'status' | 'delete', allowed: (c: Card) => boolean, action: (c: Card) => Promise<unknown>, label: string) => {
    const eligible = selectedCards.filter(allowed)
    const skipped = selectedCards.length - eligible.length
    if (!eligible.length) {
      toast.error(t('projects.bulkNoRights'))
      return
    }
    if (!(await confirm({ kind, count: eligible.length, confirmLabel: label }))) return
    const byId = new Map(eligible.map((c) => [c.id, c]))
    const failed = await bulk.run(eligible.map((c) => c.id), (id) => action(byId.get(id)!))
    mut.invalidate()
    const bad = failed.length + skipped
    if (bad) toast.error(t('list.bulkPartialFail', { count: bad }))
    else toast.ok(t('projects.bulkDone', { count: eligible.length }))
    sel.clear()
  }

  const firstColumnId = columns[0]?.id ?? null

  return (
    <PageContainer className="max-w-none">
      <div className="grid gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <ProjectSidebar
          workspaces={workspaces}
          currentId={workspaceId}
          loading={wsLoading}
          onPick={(id) => setFilters(lp, { workspace: String(id), card: '' })}
          onCreate={canCreateTasks ? () => { setProjectDesc(''); setCreatingProject(true) } : null}
        />

        {/* A div, not <main>: the shell already owns the one main landmark. */}
        <div className="min-w-0">
          {wsLoading ? (
            <div className="flex h-64 items-center justify-center"><Spinner /></div>
          ) : workspaces.length === 0 ? (
            <UICard className="p-8">
              <EmptyState
                icon={<FolderKanban size={22} />}
                title={t('projects.noProjects')}
                description={canCreateTasks ? t('projects.noProjectsHintOwn') : t('projects.noProjectsHint')}
                action={canCreateTasks ? <Button leftIcon={<Plus size={16} />} onClick={() => setCreatingProject(true)}>{t('projects.newProject')}</Button> : undefined}
              />
            </UICard>
          ) : (
            <>
              {/* Phone: the sidebar is off-screen, so the project picker sits here. */}
              <div className="mb-3 lg:hidden">
                <Combobox
                  value={workspaceId ? String(workspaceId) : ''}
                  onChange={(v) => setFilters(lp, { workspace: v, card: '' })}
                  options={workspaces.map((w) => ({ value: String(w.id), label: w.name ?? `#${w.id}` }))}
                  placeholder={t('projects.selectProject')}
                  clearable={false}
                />
              </div>

              {current && (
                <ProjectHeader
                  id={current.id}
                  name={current.name ?? `#${current.id}`}
                  description={current.description ?? ''}
                  members={projectMembers}
                  canManage={rights.board}
                  stats={stats}
                  onStat={(k) => {
                    if (k === 'overdue') setFilter('due', filters.due === 'overdue' ? '' : 'overdue')
                    if (k === 'soon') setFilter('due', filters.due === 'today' ? '' : 'today')
                    if (k === 'done') setFilter('done', showDone ? '' : '1')
                  }}
                  activeDue={filters.due}
                  showDone={showDone}
                  onRename={() => { setProjectDesc(current.description ?? ''); setRenamingProject({ id: current.id, name: current.name ?? '' }) }}
                  onDelete={() => setDeletingProject({ id: current.id, name: current.name ?? '' })}
                  onAddStatus={() => setAddingColumn(true)}
                  onMembers={() => setMembersOpen({ fresh: false })}
                />
              )}

              {/* View tabs — ClickUp's strip: one set of tasks, three ways to read it. */}
              <div className="mb-3 flex items-end gap-1 border-b border-line">
                {([
                  ['list', ListIcon, t('projects.viewList')],
                  ['board', KanbanSquare, t('projects.viewBoard')],
                  ['table', Table2, t('projects.viewTable')],
                ] as const).map(([v, Icon, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setFilter('view', v === 'list' ? '' : v)}
                    className={cn(
                      '-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-semibold transition-colors',
                      view === v ? 'border-brand text-fg' : 'border-transparent text-fg-muted hover:text-fg',
                    )}
                  >
                    <Icon size={15} className={view === v ? 'text-brand-strong' : ''} />
                    {label}
                  </button>
                ))}
              </div>

              {/* One filter row. Each control is small and says its value. */}
              {/* Phone: search on its own line, the chips one swipeable row
                  (five wrapped rows of chips pushed the tasks off the screen). */}
              <div className="mb-4 flex items-center gap-2 max-sm:-mx-page max-sm:flex-col max-sm:items-stretch max-sm:px-page sm:flex-wrap">
                <div className="w-full sm:w-56">
                  <SearchInput value={search} onChange={setSearch} placeholder={t('projects.searchTasks')} />
                </div>
                <div className="scroll-thin flex items-center gap-2 max-sm:overflow-x-auto max-sm:pb-1 sm:contents [&>*]:shrink-0">
                {view === 'list' && (
                  <FilterMenu
                    icon={<ListIcon size={14} />}
                    label={t('projects.groupBy')}
                    value={groupBy}
                    options={[
                      { value: 'status', label: t('projects.groupStatus') },
                      { value: 'priority', label: t('projects.groupPriority') },
                      { value: 'assignee', label: t('projects.groupAssignee') },
                      { value: 'label', label: t('projects.groupLabel') },
                    ]}
                    onChange={(v) => setFilter('group', v === 'status' ? '' : v)}
                    alwaysOn
                  />
                )}
                {myEmployeeId && (
                  <button
                    type="button"
                    aria-pressed={filters.assignee === String(myEmployeeId)}
                    onClick={() => setFilter('assignee', filters.assignee === String(myEmployeeId) ? '' : String(myEmployeeId))}
                    className={chipCls(filters.assignee === String(myEmployeeId))}
                  >
                    <UserCheck size={14} /> {t('projects.myTasks')}
                  </button>
                )}
                <FilterMenu
                  icon={<Users size={14} />}
                  label={t('projects.colAssignee')}
                  value={filters.assignee}
                  options={projectMembers.map((m) => ({ value: String(m.id), label: m.legal_name ?? `#${m.id}` }))}
                  onChange={(v) => setFilter('assignee', v)}
                  searchable
                />
                <FilterMenu
                  icon={<Flag size={14} />}
                  label={t('projects.priority')}
                  value={filters.prio}
                  options={[
                    ...PRIORITIES.map((p) => ({ value: String(p.value), label: t(`projects.${p.key}`), icon: <PriorityFlag value={p.value} /> })),
                    { value: 'none', label: t('projects.prioNone'), icon: <PriorityFlag value={null} /> },
                  ]}
                  onChange={(v) => setFilter('prio', v)}
                />
                <FilterMenu
                  icon={<CalendarClock size={14} />}
                  label={t('projects.colDue')}
                  value={filters.due}
                  options={[
                    { value: 'overdue', label: t('projects.dueOverdue') },
                    { value: 'today', label: t('projects.dueToday') },
                    { value: 'week', label: t('projects.dueWeek') },
                    { value: 'none', label: t('projects.noDue') },
                  ]}
                  onChange={(v) => setFilter('due', v)}
                />
                {projectLabels.length > 0 && (
                  <FilterMenu
                    icon={<Flag size={14} className="rotate-90" />}
                    label={t('projects.colLabels')}
                    value={filters.label}
                    options={projectLabels.map((l) => ({ value: String(l.id), label: l.name ?? `#${l.id}` }))}
                    onChange={(v) => setFilter('label', v)}
                  />
                )}
                <button type="button" aria-pressed={showDone} onClick={() => setFilter('done', showDone ? '' : '1')} className={chipCls(showDone)}>
                  <CheckCircle2 size={14} /> {t('projects.showDone')}
                </button>
                <FilterReset count={activeFilterCount} onReset={reset} />
                </div>
                <span className="text-[12px] tabular-nums text-fg-subtle sm:ml-auto">{t('projects.taskCount', { count: visible.length })}</span>
              </div>

              {sel.count > 0 && (
                <BulkBar count={sel.count} onClear={sel.clear} progress={bulk.progress}>
                  <MenuButton label={t('projects.colStatus')} icon={<CircleDot size={14} />}>
                    {(close) =>
                      columns.map((col) => (
                        <MenuItem
                          key={col.id}
                          onClick={() => {
                            close()
                            void runBulk('status', rights.act, (c) => mut.moveCard.mutateAsync({ id: c.id, columnId: col.id }), col.name ?? '')
                          }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: col.color || 'rgb(var(--brand))' }} />
                          {col.name}
                        </MenuItem>
                      ))
                    }
                  </MenuButton>
                  <MenuButton label={t('projects.priority')} icon={<Flag size={14} />}>
                    {(close) =>
                      [...PRIORITIES.map((p) => ({ v: p.value as Priority | null, label: t(`projects.${p.key}`) })), { v: null, label: t('projects.prioClear') }].map((p) => (
                        <MenuItem
                          key={String(p.v)}
                          onClick={() => {
                            close()
                            void runBulk('status', rights.own, (c) => mut.setPriority.mutateAsync({ id: c.id, priority: p.v }), p.label)
                          }}
                        >
                          <PriorityFlag value={p.v} /> {p.label}
                        </MenuItem>
                      ))
                    }
                  </MenuButton>
                  <Button
                    size="sm"
                    variant="secondary"
                    leftIcon={<Check size={14} />}
                    onClick={() => runBulk('status', (c) => rights.act(c) && !c.is_completed, (c) => mut.completeCard.mutateAsync({ id: c.id, done: true }), t('projects.markDone'))}
                  >
                    {t('projects.bulkComplete')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-danger"
                    leftIcon={<Trash2 size={14} />}
                    onClick={() => runBulk('delete', rights.own, (c) => mut.deleteCard.mutateAsync(c.id), t('common.delete'))}
                  >
                    {t('common.delete')}
                  </Button>
                </BulkBar>
              )}

              {loading ? (
                <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-lg" />)}</div>
              ) : columns.length === 0 ? (
                <UICard className="p-8">
                  <EmptyState
                    icon={<CircleDot size={22} />}
                    title={t('projects.noColumns')}
                    description={t('projects.noColumnsHint')}
                    action={rights.board ? <Button leftIcon={<Plus size={16} />} onClick={() => setAddingColumn(true)}>{t('projects.addStatus')}</Button> : undefined}
                  />
                </UICard>
              ) : view === 'board' ? (
                <BoardView
                  cards={visible}
                  {...rowProps}
                  onQuickAdd={canCreateTasks ? (id) => quickCreate(id) : null}
                  onRenameColumn={(c) => { setColumnColor(c.color ?? ''); setRenamingColumn(c) }}
                  onDeleteColumn={setDeletingColumn}
                  onAddColumn={rights.board ? () => setAddingColumn(true) : null}
                />
              ) : view === 'table' ? (
                <TableView cards={visible} sel={sel} {...rowProps} />
              ) : (
                <ListView
                  groups={groups}
                  groupBy={groupBy}
                  sel={sel}
                  {...rowProps}
                  onQuickAdd={canCreateTasks ? quickCreate : null}
                  fallbackColumnId={firstColumnId}
                  onRenameColumn={rights.board ? (c) => { setColumnColor(c.color ?? ''); setRenamingColumn(c) } : null}
                  onDeleteColumn={rights.board ? setDeletingColumn : null}
                />
              )}
            </>
          )}
        </div>
      </div>

      {current && (
        <ProjectMembersModal
          open={!!membersOpen}
          fresh={membersOpen?.fresh}
          onClose={() => setMembersOpen(null)}
          projectId={current.id}
          projectName={current.name ?? ''}
          members={projectMembers}
          ownerId={current.created_by_id ?? null}
          canManage={rights.board}
          wsMut={wsMut}
        />
      )}

      {openCard && (
        <TaskDetail
          card={openCard}
          projectName={current?.name ?? ''}
          columns={columns}
          projectMembers={projectMembers}
          projectLabels={projectLabels}
          rights={rights}
          mut={mut}
          onClose={closeTask}
          onSave={(body) => run(mut.updateCard.mutateAsync({ id: openCard.id, body }))}
          onToggleDone={toggleDone}
          onReject={async (c) => {
            if (await confirm({ kind: 'reject', subject: c.title, confirmLabel: t('projects.reject') })) await run(mut.rejectCard.mutateAsync(c.id))
          }}
          onMove={(c, columnId) => moveCard(c, columnId)}
          onPriority={setPriority}
          onToggleMember={toggleMember}
          onToggleLabel={toggleLabel}
          onDelete={(c) => { closeTask(); setDeleting(c) }}
          onManageMembers={rights.board ? () => setMembersOpen({ fresh: false }) : undefined}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const d = deleting
          setDeleting(null)
          if (d) await run(mut.deleteCard.mutateAsync(d.id))
        }}
        danger
        title={t('projects.deleteCardTitle')}
        description={t('projects.deleteCardConfirm')}
        confirmLabel={t('common.delete')}
      />

      <ConfirmDialog
        open={!!deletingColumn}
        onClose={() => setDeletingColumn(null)}
        onConfirm={async () => {
          const c = deletingColumn
          setDeletingColumn(null)
          if (c) await run(mut.removeColumn.mutateAsync(c.id))
        }}
        danger
        title={t('projects.deleteColumnTitle')}
        description={t('projects.deleteColumnConfirm')}
        confirmLabel={t('common.delete')}
      />

      <NamePrompt
        open={!!renamingColumn}
        title={t('projects.renameColumn')}
        label={t('projects.columnName')}
        initial={renamingColumn?.name ?? ''}
        loading={mut.renameColumn.isPending}
        extra={<ColorPicker value={columnColor} onChange={setColumnColor} label={t('projects.columnColor')} />}
        onClose={() => setRenamingColumn(null)}
        onSubmit={async (name) => {
          const c = renamingColumn
          if (!c || !(await confirm({ kind: 'action', subject: c.name ?? '', confirmLabel: t('common.save') }))) return
          setRenamingColumn(null)
          await run(mut.renameColumn.mutateAsync({ id: c.id, name, color: columnColor || null }))
        }}
      />

      <NamePrompt
        open={creatingProject}
        title={t('projects.newProject')}
        label={t('projects.projectName')}
        loading={wsMut.create.isPending}
        extra={
          <Field label={t('projects.projectDescription')}>
            <Textarea rows={2} value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} />
          </Field>
        }
        onClose={() => setCreatingProject(false)}
        onSubmit={async (name) => {
          setCreatingProject(false)
          try {
            const made = await wsMut.create.mutateAsync({ name, description: projectDesc.trim() })
            setProjectDesc('')
            wsMut.invalidate()
            // Land the author IN the project they just made — and ask for its
            // people right away: a project nobody else is in cannot assign work.
            if (made?.id) {
              setFilter('workspace', String(made.id))
              setMembersOpen({ fresh: true })
            }
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />

      <NamePrompt
        open={!!renamingProject}
        title={t('projects.renameProject')}
        label={t('projects.projectName')}
        initial={renamingProject?.name ?? ''}
        loading={wsMut.update.isPending}
        extra={
          <Field label={t('projects.projectDescription')}>
            <Textarea rows={2} value={projectDesc} onChange={(e) => setProjectDesc(e.target.value)} />
          </Field>
        }
        onClose={() => setRenamingProject(null)}
        onSubmit={async (name) => {
          const w = renamingProject
          if (!w || !(await confirm({ kind: 'action', subject: w.name, confirmLabel: t('common.save') }))) return
          setRenamingProject(null)
          try {
            await wsMut.update.mutateAsync({ id: w.id, body: { name, description: projectDesc.trim() } })
            wsMut.invalidate()
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
      />

      <ConfirmDialog
        open={!!deletingProject}
        onClose={() => setDeletingProject(null)}
        onConfirm={async () => {
          const w = deletingProject
          setDeletingProject(null)
          if (!w) return
          try {
            await wsMut.remove.mutateAsync(w.id)
            wsMut.invalidate()
            setFilter('workspace', '')
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
        danger
        title={t('projects.deleteProjectTitle')}
        description={t('projects.deleteProjectConfirm', { name: deletingProject?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />

      <NamePrompt
        open={addingColumn}
        title={t('projects.addStatus')}
        label={t('projects.columnName')}
        loading={mut.createColumn.isPending}
        onClose={() => setAddingColumn(false)}
        onSubmit={async (name) => {
          setAddingColumn(false)
          await run(mut.createColumn.mutateAsync(name))
        }}
      />
    </PageContainer>
  )
}

/** Two URL params at once (project + closing the opened task) in one history step. */
function setFilters(lp: ReturnType<typeof useListParams>, patch: Record<string, string>) {
  lp.setFilters(Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, v || null])))
}

const chipCls = (on: boolean) => filterChip(on)

/* ─────────────────────────────── sidebar ─────────────────────────────── */

function ProjectSidebar({
  workspaces,
  currentId,
  loading,
  onPick,
  onCreate,
}: {
  workspaces: { id: number; name?: string | null }[]
  currentId: number | null
  loading: boolean
  onPick: (id: number) => void
  onCreate: (() => void) | null
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const shown = workspaces.filter((w) => (w.name ?? '').toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-4 flex max-h-[calc(100dvh-7rem)] flex-col rounded-card border border-line bg-surface p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between px-1">
          <h1 className="m-0 text-[17px] font-bold tracking-[-0.01em] text-fg">{t('projects.title')}</h1>
          {onCreate && (
            <IconButton size="sm" label={t('projects.newProject')} onClick={onCreate}>
              <Plus size={16} />
            </IconButton>
          )}
        </div>
        <div className="relative mb-2">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('projects.findProject')} aria-label={t('projects.findProject')} className="h-8 pl-8 text-[13px]" />
        </div>
        <nav aria-label={t('projects.title')} className="scroll-thin -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {loading ? (
            <div className="space-y-1.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}</div>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {shown.map((w) => {
                const on = w.id === currentId
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      aria-current={on ? 'page' : undefined}
                      onClick={() => onPick(w.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13.5px] transition-colors',
                        on ? 'bg-brand-soft font-semibold text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                      )}
                    >
                      <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-[7px] bg-gradient-to-br text-[11px] font-bold text-white', projectTone(w.id))}>
                        {(w.name ?? '#').trim().charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{w.name ?? `#${w.id}`}</span>
                    </button>
                  </li>
                )
              })}
              {shown.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-fg-subtle">{t('common.noResults')}</li>}
            </ul>
          )}
        </nav>
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-[13px] font-medium text-fg-muted transition-colors hover:border-brand/40 hover:text-brand-strong"
          >
            <Plus size={15} /> {t('projects.newProject')}
          </button>
        )}
      </div>
    </aside>
  )
}

/* ───────────────────────────── project header ──────────────────────────── */

function ProjectHeader({
  id,
  name,
  description,
  members,
  canManage,
  stats,
  onStat,
  activeDue,
  showDone,
  onRename,
  onDelete,
  onAddStatus,
  onMembers,
}: {
  id: number
  name: string
  description: string
  members: EmployeeBrief[]
  canManage: boolean
  stats: { total: number; done: number; open: number; overdue: number; soon: number; pct: number }
  onStat: (k: 'overdue' | 'soon' | 'done') => void
  activeDue: string
  showDone: boolean
  onRename: () => void
  onDelete: () => void
  onAddStatus: () => void
  onMembers: () => void
}) {
  const { t } = useTranslation()
  return (
    <section className="mb-4 rounded-card border border-line bg-surface p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn('grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br text-[18px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(124,58,237,0.8)]', projectTone(id))}>
          {name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 basis-[180px]">
          <h2 className="m-0 text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg [overflow-wrap:anywhere]">{name}</h2>
          {description && <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMembers}
            aria-label={t('projects.members')}
            className="flex items-center gap-2 rounded-pill border border-line bg-surface px-2 py-1 transition-colors hover:border-brand/40"
          >
            <span className="flex -space-x-1.5">
              {members.slice(0, 4).map((m) => (
                <Avatar key={m.id} src={m.photo_thumb_path ?? undefined} fallbackSrc={m.photo_path ?? undefined} name={m.legal_name ?? ''} size={24} className="ring-2 ring-surface" />
              ))}
              {members.length === 0 && <span className="grid h-6 w-6 place-items-center rounded-full border border-dashed border-line text-fg-subtle"><Users size={12} /></span>}
            </span>
            <span className="text-[12.5px] font-semibold tabular-nums text-fg-muted">{members.length}</span>
          </button>
          {canManage && (
            <Button size="sm" variant="secondary" leftIcon={<UserPlus size={15} />} onClick={onMembers}>
              {t('projects.addMember')}
            </Button>
          )}
          {canManage && (
            <MenuButton label={t('projects.moreActions')} icon={<MoreHorizontal size={16} />} iconOnly>
              {(close) => (
                <>
                  <MenuItem onClick={() => { close(); onAddStatus() }}><Plus size={14} /> {t('projects.addStatus')}</MenuItem>
                  <MenuItem onClick={() => { close(); onRename() }}><Pencil size={14} /> {t('projects.renameProject')}</MenuItem>
                  <MenuItem danger onClick={() => { close(); onDelete() }}><Trash2 size={14} /> {t('projects.deleteProjectTitle')}</MenuItem>
                </>
              )}
            </MenuButton>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex min-w-[200px] flex-1 items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]" role="progressbar" aria-valuenow={stats.pct} aria-valuemin={0} aria-valuemax={100} aria-label={t('projects.progress', { pct: stats.pct })}>
            <div className="h-full rounded-pill bg-gradient-to-r from-[#7C3AED] to-[#C026D3]" style={{ width: `${stats.pct}%` }} />
          </div>
          <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-fg">{t('projects.progress', { pct: stats.pct })}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <StatChip icon={<CircleDot size={13} />} label={t('projects.statOpen')} value={stats.open} />
          <StatChip icon={<AlertTriangle size={13} />} label={t('projects.dueOverdue')} value={stats.overdue} tone="danger" active={activeDue === 'overdue'} onClick={() => onStat('overdue')} />
          <StatChip icon={<Sun size={13} />} label={t('projects.statSoon')} value={stats.soon} tone="warning" active={activeDue === 'today'} onClick={() => onStat('soon')} />
          <StatChip icon={<CheckCircle2 size={13} />} label={t('projects.completed')} value={stats.done} tone="success" active={showDone} onClick={() => onStat('done')} />
        </div>
      </div>
    </section>
  )
}

function StatChip({ icon, label, value, tone, active, onClick }: { icon: ReactNode; label: string; value: number; tone?: 'danger' | 'warning' | 'success'; active?: boolean; onClick?: () => void }) {
  const toneCls = tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'success' ? 'text-success' : 'text-fg-muted'
  const Tag = onClick ? 'button' : 'span'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': !!active } : {})}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[12px] transition-colors',
        active ? 'border-brand/50 bg-brand-soft' : 'border-line bg-surface-2/60',
        onClick && 'hover:border-brand/30',
      )}
    >
      <span className={toneCls}>{icon}</span>
      <span className="text-fg-muted">{label}</span>
      <span className={cn('font-bold tabular-nums', value > 0 ? toneCls : 'text-fg-subtle')}>{value}</span>
    </Tag>
  )
}

/* ────────────────────────────── small menus ────────────────────────────── */

function FilterMenu({
  icon,
  label,
  value,
  options,
  onChange,
  searchable,
  alwaysOn,
}: {
  icon: ReactNode
  label: string
  value: string
  options: { value: string; label: string; icon?: ReactNode }[]
  onChange: (v: string) => void
  searchable?: boolean
  alwaysOn?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const picked = options.find((o) => o.value === value)
  const shown = options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <>
      <button ref={ref} type="button" onClick={() => setOpen((v) => !v)} className={chipCls(!!picked && !alwaysOn)} aria-haspopup="listbox" aria-expanded={open}>
        {icon}
        <span className="max-w-[160px] truncate">{picked ? (alwaysOn ? `${label}: ${picked.label}` : picked.label) : label}</span>
        <ChevronDown size={13} className="text-fg-subtle" />
      </button>
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={POPOVER.menuW} role="listbox" label={label}>
        {searchable && (
          <div className="p-1.5">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} autoFocus />
          </div>
        )}
        <ul className="scroll-thin max-h-72 overflow-y-auto p-1">
          {!alwaysOn && value && (
            <li>
              <MenuItem onClick={() => { onChange(''); setOpen(false) }}>
                <span className="text-fg-muted">{t('projects.filterAll')}</span>
              </MenuItem>
            </li>
          )}
          {shown.map((o) => (
            <li key={o.value}>
              <MenuItem onClick={() => { onChange(o.value); setOpen(false) }} selected={o.value === value}>
                {o.icon}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && <Check size={14} className="text-brand-strong" />}
              </MenuItem>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-fg-subtle">{t('common.noResults')}</li>}
        </ul>
      </AnchoredPanel>
    </>
  )
}

function MenuButton({ label, icon, iconOnly, children }: { label: string; icon: ReactNode; iconOnly?: boolean; children: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      {iconOnly ? (
        <button
          ref={ref}
          type="button"
          aria-label={label}
          onClick={() => setOpen((v) => !v)}
          className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-surface text-fg-muted transition-colors hover:text-fg"
        >
          {icon}
        </button>
      ) : (
        <button ref={ref} type="button" onClick={() => setOpen((v) => !v)} className={chipCls(false)}>
          {icon} {label} <ChevronDown size={13} className="text-fg-subtle" />
        </button>
      )}
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={POPOVER.menuW} label={label}>
        <div className="p-1">{children(() => setOpen(false))}</div>
      </AnchoredPanel>
    </>
  )
}

function MenuItem({ children, onClick, danger, selected }: { children: ReactNode; onClick: () => void; danger?: boolean; selected?: boolean }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2',
        danger ? 'text-danger' : 'text-fg',
      )}
    >
      {children}
    </button>
  )
}

/* ─────────────────────────── shared row plumbing ────────────────────────── */

interface Group {
  key: string
  name: string
  color: string | null
  columnId: number | null
  column?: Column
  person?: EmployeeBrief
  flag?: Priority | null
  cards: Card[]
}

interface RowProps {
  rights: TaskRights
  columns: Column[]
  projectMembers: EmployeeBrief[]
  projectLabels: Label[]
  onOpen: (c: Card) => void
  onToggleDone: (c: Card) => void
  onMove: (c: Card, columnId: number, position?: number) => void
  onPriority: (c: Card, p: Priority | null) => void
  onDue: (c: Card, date: string) => void
  onToggleMember: (c: Card, employeeId: number, on: boolean) => void
  onToggleLabel: (c: Card, labelId: number, on: boolean) => void
  /** Opens the project's members window (owner only) — from any assignee picker. */
  onManageMembers?: () => void
}

type Selection = ReturnType<typeof useRowSelection<Card>>

function DueCell({ card, onDue, readOnly }: { card: Card; onDue: (c: Card, d: string) => void; readOnly?: boolean }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={readOnly}
        title={card.end_date ? formatUzShort(card.end_date) : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={cn(
          'tap-expand relative inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] tabular-nums transition-colors',
          readOnly ? 'cursor-default' : 'hover:bg-surface-2',
          card.end_date ? dueTone(card) : 'text-fg-subtle',
        )}
      >
        <CalendarClock size={13} />
        {card.end_date ? (card.is_completed ? formatUzShort(card.end_date) : relativeDue(card.end_date, t)) : <span className="text-fg-subtle/80">—</span>}
      </button>
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={260} label={t('projects.colDue')}>
        <div className="flex flex-col gap-1 p-2">
          {[
            [t('projects.dueToday'), dayjs()],
            [t('projects.dueTomorrow'), dayjs().add(1, 'day')],
            [t('projects.dueNextWeek'), dayjs().add(7, 'day')],
          ].map(([label, d]) => (
            <MenuItem key={label as string} onClick={() => { onDue(card, (d as dayjs.Dayjs).format('YYYY-MM-DD')); setOpen(false) }}>
              <span className="flex-1">{label as string}</span>
              <span className="text-[12px] text-fg-subtle">{(d as dayjs.Dayjs).format('DD.MM')}</span>
            </MenuItem>
          ))}
          <label className="mt-1 flex items-center gap-2 border-t border-line px-2 pt-2 text-[12px] text-fg-muted">
            {t('projects.pickDate')}
            {/* The app's DateInput, not <input type="date">: the native field
                renders in the browser's locale (mm/dd/yyyy on an en-US box). */}
            <DateInput
              className="min-w-0 flex-1"
              value={card.end_date ?? ''}
              onChange={(v) => { if (v) { onDue(card, v); setOpen(false) } }}
            />
          </label>
          {card.end_date && (
            <MenuItem danger onClick={() => { onDue(card, ''); setOpen(false) }}>{t('projects.clearDue')}</MenuItem>
          )}
        </div>
      </AnchoredPanel>
    </>
  )
}

/** Subtask progress and file count — the two «how far along» marks on a row. */
function TaskMeta({ card }: { card: Card }) {
  const { done, total } = checklistProgress(card)
  const files = card.attachments?.length ?? 0
  if (!total && !files) return null
  return (
    <span className="flex shrink-0 items-center gap-2 text-[11.5px] tabular-nums text-fg-subtle">
      {total > 0 && (
        <span className={cn('inline-flex items-center gap-1', done === total && 'text-success')}>
          <ListChecks size={13} /> {done}/{total}
        </span>
      )}
      {files > 0 && (
        <span className="inline-flex items-center gap-0.5"><Paperclip size={12} /> {files}</span>
      )}
    </span>
  )
}

/* ───────────────────────────────── list view ────────────────────────────── */

const LIST_GRID = 'grid grid-cols-[20px_22px_minmax(0,1fr)] items-center gap-x-2 sm:grid-cols-[20px_22px_minmax(0,1fr)_96px_120px_44px_140px]'

function ListView({
  groups,
  groupBy,
  sel,
  onQuickAdd,
  fallbackColumnId,
  onRenameColumn,
  onDeleteColumn,
  ...row
}: RowProps & {
  groups: Group[]
  groupBy: GroupBy
  sel: Selection
  onQuickAdd: ((columnId: number, extra?: Record<string, unknown>) => (title: string) => Promise<unknown>) | null
  fallbackColumnId: number | null
  onRenameColumn: ((c: Column) => void) | null
  onDeleteColumn: ((c: Column) => void) | null
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const selecting = sel.count > 0

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const off = !!collapsed[g.key]
        const addInto = g.columnId ?? fallbackColumnId
        const allOn = g.cards.length > 0 && g.cards.every((c) => sel.isSelected(c.id))
        // A task added under a priority group gets that priority.
        const extra = groupBy === 'priority' && g.flag ? { priority: g.flag } : undefined
        return (
          <section key={g.key}>
            <div className="group/head mb-1.5 flex items-center gap-2">
              <button
                type="button"
                aria-expanded={!off}
                onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !s[g.key] }))}
                className="grid h-6 w-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-2"
              >
                <ChevronRight size={15} className={cn('transition-transform', !off && 'rotate-90')} />
              </button>
              <GroupPill group={g} groupBy={groupBy} />
              <span className="text-[12.5px] font-semibold tabular-nums text-fg-subtle">{g.cards.length}</span>
              {g.column && (onRenameColumn || onDeleteColumn) && (
                <span className="flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/head:opacity-100">
                  {onRenameColumn && <IconButton size="sm" label={t('projects.renameColumn')} onClick={() => onRenameColumn(g.column!)}><Pencil size={13} /></IconButton>}
                  {onDeleteColumn && <IconButton size="sm" label={t('projects.deleteColumnTitle')} onClick={() => onDeleteColumn(g.column!)}><Trash2 size={13} /></IconButton>}
                </span>
              )}
            </div>

            {!off && (
              <div className="overflow-hidden rounded-card border border-line bg-surface shadow-sm">
                <div className={cn(LIST_GRID, 'hidden border-b border-line bg-surface-2/50 px-3 py-1.5 text-[11.5px] font-semibold text-fg-subtle sm:grid')}>
                  <span>
                    <Checkbox
                      checked={allOn}
                      indeterminate={!allOn && g.cards.some((c) => sel.isSelected(c.id))}
                      onChange={() => g.cards.forEach((c) => { if (allOn || !sel.isSelected(c.id)) sel.toggle(c.id) })}
                      srLabel={t('list.selectAllOnPage')}
                    />
                  </span>
                  <span />
                  <span>{t('projects.colName')}</span>
                  <span className="text-center">{t('projects.colAssignee')}</span>
                  <span>{t('projects.colDue')}</span>
                  <span className="text-center"><Flag size={12} className="inline" /></span>
                  <span>{groupBy === 'status' ? t('projects.colLabels') : t('projects.colStatus')}</span>
                </div>
                <ul className="divide-y divide-line/60">
                  {g.cards.map((c) => (
                    <li key={c.id}>
                      <TaskRow card={c} sel={sel} selecting={selecting} showStatus={groupBy !== 'status'} {...row} />
                    </li>
                  ))}
                </ul>
                {g.cards.length === 0 && <p className="px-4 py-3 text-[12.5px] text-fg-subtle">{t('projects.emptyColumn')}</p>}
                {addInto != null && onQuickAdd && (
                  <div className="border-t border-line/60 px-2 py-1">
                    <QuickAdd onCreate={onQuickAdd(addInto, extra)} />
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
      {groups.length === 0 && (
        <UICard className="p-8"><EmptyState title={t('projects.noTasks')} description={t('projects.noTasksHint')} /></UICard>
      )}
    </div>
  )
}

/** The group header as ClickUp draws it: a filled pill in the status colour. */
function GroupPill({ group, groupBy }: { group: Group; groupBy: GroupBy }) {
  if (groupBy === 'priority') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-[12.5px] font-bold text-fg">
        <PriorityFlag value={group.flag ?? null} /> {group.name}
      </span>
    )
  }
  if (groupBy === 'assignee') {
    return (
      <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-fg">
        {group.person ? (
          <Avatar src={group.person.photo_thumb_path ?? undefined} fallbackSrc={group.person.photo_path ?? undefined} name={group.person.legal_name ?? ''} size={22} />
        ) : (
          <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-dashed border-line text-fg-subtle"><Users size={11} /></span>
        )}
        {group.name}
      </span>
    )
  }
  const color = group.color || 'rgb(var(--brand))'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-bold text-white shadow-sm"
      style={{ background: color }}
    >
      <CircleDot size={12} /> {group.name}
    </span>
  )
}

function TaskRow({
  card,
  sel,
  selecting,
  showStatus,
  columns,
  projectMembers,
  projectLabels,
  onOpen,
  onToggleDone,
  onMove,
  onPriority,
  onDue,
  onToggleMember,
  onToggleLabel,
  onManageMembers,
  rights,
}: RowProps & { card: Card; sel: Selection; selecting: boolean; showStatus: boolean }) {
  const { t } = useTranslation()
  const own = rights.own(card)
  const act = rights.act(card)
  const picked = sel.isSelected(card.id)
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(card) }}
      className={cn(LIST_GRID, 'group/row cursor-pointer px-3 py-2 transition-colors hover:bg-surface-2/60', picked && 'bg-brand-soft/50')}
    >
      {/* Selection and completion are two slots, as in ClickUp: the checkbox
          shows on hover (or while selecting) in its own column, so it can
          never sit on top of the done circle and take its click. */}
      <span
        className={cn('flex items-center justify-center transition-opacity', selecting || picked ? 'opacity-100' : 'opacity-0 focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100')}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox checked={picked} onChange={() => sel.toggle(card.id)} srLabel={t('list.selectRow')} />
      </span>
      <span className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <DoneToggle card={card} onToggle={() => onToggleDone(card)} readOnly={!act} />
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className={cn('min-w-0 truncate text-[13.5px] font-medium text-fg', card.is_completed && 'font-normal text-fg-subtle line-through')}>
          {card.title || '—'}
        </span>
        <TaskMeta card={card} />
      </span>
      <span className="hidden justify-center sm:flex" onClick={(e) => e.stopPropagation()}>
        <AssigneeStack members={cardMembers(card)} candidates={projectMembers} onToggle={(id, on) => onToggleMember(card, id, on)} readOnly={!own} onManage={onManageMembers} />
      </span>
      <span className="hidden sm:block" onClick={(e) => e.stopPropagation()}><DueCell card={card} onDue={onDue} readOnly={!own} /></span>
      <span className="hidden justify-center sm:flex" onClick={(e) => e.stopPropagation()}>
        <PriorityPicker value={card.priority} onPick={(p) => onPriority(card, p)} readOnly={!own} />
      </span>
      <span className="hidden min-w-0 sm:block" onClick={(e) => e.stopPropagation()}>
        {showStatus ? (
          <StatusPicker columnId={card.column_id} columns={columns} onPick={(id) => onMove(card, id)} readOnly={!act} />
        ) : (
          <LabelChips labels={cardLabels(card)} all={projectLabels} onToggle={(id, on) => onToggleLabel(card, id, on)} readOnly={!own} />
        )}
      </span>
      {/* Phone: the four fields fold into one line under the title. */}
      <span className="col-start-3 mt-1 flex flex-wrap items-center gap-2 sm:hidden" onClick={(e) => e.stopPropagation()}>
        <PriorityPicker value={card.priority} onPick={(p) => onPriority(card, p)} readOnly={!own} />
        <DueCell card={card} onDue={onDue} readOnly={!own} />
        <AssigneeStack members={cardMembers(card)} candidates={projectMembers} onToggle={(id, on) => onToggleMember(card, id, on)} readOnly={!own} size={20} onManage={onManageMembers} />
        {showStatus && <StatusPicker columnId={card.column_id} columns={columns} onPick={(id) => onMove(card, id)} readOnly={!act} />}
      </span>
    </div>
  )
}

/* ──────────────────────────────── board view ────────────────────────────── */

function BoardView({
  columns,
  cards,
  onQuickAdd,
  onRenameColumn,
  onDeleteColumn,
  onAddColumn,
  ...row
}: RowProps & {
  cards: Card[]
  onQuickAdd: ((columnId: number) => (title: string) => Promise<unknown>) | null
  onRenameColumn: (c: Column) => void
  onDeleteColumn: (c: Column) => void
  onAddColumn: (() => void) | null
}) {
  const { t } = useTranslation()
  const [dragCard, setDragCard] = useState<number | null>(null)
  const [dropCol, setDropCol] = useState<number | null>(null)
  const [dropBefore, setDropBefore] = useState<number | null>(null)

  /**
   * Drag & drop between columns AND inside one. `position` is a FLOAT: a card
   * dropped between two neighbours takes their midpoint, so one PATCH reorders
   * without touching the rest.
   */
  const drop = (columnId: number, beforeCardId?: number) => {
    const id = dragCard
    setDragCard(null)
    setDropCol(null)
    setDropBefore(null)
    if (id == null) return
    const card = cards.find((c) => c.id === id)
    if (!card || card.id === beforeCardId) return
    const list = cards
      .filter((c) => c.column_id === columnId && c.id !== id)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const at = beforeCardId == null ? list.length : list.findIndex((c) => c.id === beforeCardId)
    const idx = at < 0 ? list.length : at
    const prev = idx > 0 ? list[idx - 1] : null
    const next = idx < list.length ? list[idx] : null
    const position =
      prev && next ? ((prev.position ?? 0) + (next.position ?? 0)) / 2 : next ? (next.position ?? 0) - 1 : (prev?.position ?? 0) + 1
    if (card.column_id === columnId && card.position === position) return
    row.onMove(card, columnId, position)
  }

  return (
    <div className="scroll-thin flex gap-3 overflow-x-auto pb-3">
      {columns.map((col) => {
        const list = cards.filter((c) => c.column_id === col.id)
        const color = col.color || 'rgb(var(--brand))'
        return (
          <section
            key={col.id}
            onDragOver={(e: DragEvent) => { e.preventDefault(); if (dropCol !== col.id) setDropCol(col.id) }}
            onDrop={() => drop(col.id)}
            onDragLeave={() => dropCol === col.id && setDropCol(null)}
            className={cn(
              'group/col flex max-h-[72vh] w-[292px] shrink-0 flex-col rounded-card border bg-surface-2/50 transition-colors',
              dropCol === col.id ? 'border-brand bg-brand-soft/40' : 'border-line',
            )}
          >
            <div className="h-1 rounded-t-card" style={{ background: color }} />
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="inline-flex max-w-[180px] items-center gap-1.5 truncate rounded-md px-2 py-0.5 text-[12px] font-bold text-white" style={{ background: color }}>
                <CircleDot size={11} /> <span className="truncate">{col.name}</span>
              </span>
              <span className="text-[12px] font-semibold tabular-nums text-fg-subtle">{list.length}</span>
              <span className="flex-1" />
              {row.rights.board && (
                <span className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/col:opacity-100">
                  <IconButton size="sm" label={t('projects.renameColumn')} onClick={() => onRenameColumn(col)}><Pencil size={13} /></IconButton>
                  <IconButton size="sm" label={t('projects.deleteColumnTitle')} onClick={() => onDeleteColumn(col)}><Trash2 size={13} /></IconButton>
                </span>
              )}
            </div>

            <div className="scroll-thin flex min-h-[60px] flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
              {list.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-1 py-5 text-center text-[12px] text-fg-subtle">{t('projects.emptyColumn')}</p>
              ) : (
                list.map((card) => {
                  const { done, total, pct } = checklistProgress(card)
                  return (
                    <article
                      key={card.id}
                      draggable={row.rights.act(card)}
                      onDragStart={() => setDragCard(card.id)}
                      onDragOver={(e: DragEvent) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (dropCol !== col.id) setDropCol(col.id)
                        if (dropBefore !== card.id) setDropBefore(card.id)
                      }}
                      onDrop={(e) => { e.stopPropagation(); drop(col.id, card.id) }}
                      onClick={() => row.onOpen(card)}
                      className={cn(
                        'cursor-pointer rounded-lg border border-line bg-surface p-3 shadow-xs transition-[border-color,box-shadow] hover:border-brand/40 hover:shadow-sm',
                        dropBefore === card.id && 'border-t-2 border-t-brand',
                      )}
                    >
                      {cardLabels(card).length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-1">
                          {cardLabels(card).map((l) => (
                            <span key={l.id} className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold" style={labelStyle(l.color)}>{l.name}</span>
                          ))}
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <DoneToggle card={card} onToggle={() => row.onToggleDone(card)} readOnly={!row.rights.act(card)} />
                        <p className={cn('min-w-0 flex-1 text-[13px] font-medium leading-snug text-fg', card.is_completed && 'font-normal text-fg-subtle line-through')}>
                          {card.title}
                        </p>
                      </div>
                      {total > 0 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-pill bg-fg/[0.07]">
                            <div className={cn('h-full rounded-pill', pct === 100 ? 'bg-success' : 'bg-brand')} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-fg-subtle">{done}/{total}</span>
                        </div>
                      )}
                      <div className="mt-2.5 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <PriorityPicker value={card.priority} onPick={(p) => row.onPriority(card, p)} readOnly={!row.rights.own(card)} />
                        {card.end_date && (
                          <span className={cn('inline-flex items-center gap-1 text-[11.5px] tabular-nums', dueTone(card))}>
                            <CalendarClock size={12} />
                            {card.is_completed ? formatUzShort(card.end_date) : relativeDue(card.end_date, t)}
                          </span>
                        )}
                        {(card.attachments?.length ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[11px] text-fg-subtle"><Paperclip size={11} />{card.attachments!.length}</span>
                        )}
                        <span className="ml-auto">
                          <AssigneeStack
                            members={cardMembers(card)}
                            candidates={row.projectMembers}
                            onToggle={(id, on) => row.onToggleMember(card, id, on)}
                            size={22}
                            readOnly={!row.rights.own(card)}
                            onManage={row.onManageMembers}
                          />
                        </span>
                      </div>
                    </article>
                  )
                })
              )}
            </div>

            {onQuickAdd && (
              <div className="border-t border-line/60 px-1.5 py-1">
                <QuickAdd onCreate={onQuickAdd(col.id)} />
              </div>
            )}
          </section>
        )
      })}
      {onAddColumn && (
        <button
          type="button"
          onClick={onAddColumn}
          className="flex h-12 w-[220px] shrink-0 items-center justify-center gap-1.5 rounded-card border border-dashed border-line text-[13px] font-medium text-fg-muted transition-colors hover:border-brand/40 hover:text-brand-strong"
        >
          <Plus size={15} /> {t('projects.addStatus')}
        </button>
      )}
    </div>
  )
}

/* ──────────────────────────────── table view ────────────────────────────── */

type SortKey = 'title' | 'end_date' | 'priority' | 'status'

function TableView({ cards, sel, ...row }: RowProps & { cards: Card[]; sel: Selection }) {
  const { t } = useTranslation()
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'end_date', dir: 'asc' })
  const colIndex = useMemo(() => new Map(row.columns.map((c, i) => [c.id, i])), [row.columns])

  const rows = useMemo(() => {
    const v = [...cards]
    const val = (c: Card): string | number | null =>
      sort.key === 'priority' ? (c.priority ?? null) : sort.key === 'status' ? (colIndex.get(c.column_id ?? -1) ?? null) : (c[sort.key] ?? null)
    v.sort((a, b) => {
      const x = val(a)
      const y = val(b)
      // An unset value («no date», «no priority») sorts last either way: it is
      // unknown, never the most urgent.
      if (x == null || x === '') return 1
      if (y == null || y === '') return -1
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
      return sort.dir === 'asc' ? r : -r
    })
    return v
  }, [cards, sort, colIndex])

  const head = (key: SortKey, label: ReactNode, cls: string) => (
    <th className={cn('px-3 py-2 text-left text-[11.5px] font-semibold text-fg-subtle', cls)}>
      <button
        type="button"
        onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))}
        aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className="inline-flex min-h-icon-xs items-center gap-1 hover:text-fg"
      >
        {label}{sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  )
  const allOn = rows.length > 0 && rows.every((c) => sel.isSelected(c.id))

  return (
    <UICard className="overflow-hidden p-0">
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse">
          <thead className="border-b border-line bg-surface-2/50">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  checked={allOn}
                  indeterminate={!allOn && rows.some((c) => sel.isSelected(c.id))}
                  onChange={() => rows.forEach((c) => { if (allOn || !sel.isSelected(c.id)) sel.toggle(c.id) })}
                  srLabel={t('list.selectAllOnPage')}
                />
              </th>
              <th className="w-9 px-1 py-2" />
              {head('title', t('projects.colName'), 'min-w-[240px]')}
              {head('status', t('projects.colStatus'), 'w-40')}
              <th className="w-24 px-3 py-2 text-center text-[11.5px] font-semibold text-fg-subtle">{t('projects.colAssignee')}</th>
              {head('end_date', t('projects.colDue'), 'w-36')}
              {head('priority', t('projects.priority'), 'w-32')}
              <th className="w-40 px-3 py-2 text-left text-[11.5px] font-semibold text-fg-subtle">{t('projects.colLabels')}</th>
              <th className="w-16 px-3 py-2 text-left text-[11.5px] font-semibold text-fg-subtle"><ListChecks size={14} aria-label={t('projects.checklist')} /></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/60">
            {rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-10 text-center text-[12.5px] text-fg-subtle">{t('projects.noTasks')}</td></tr>
            )}
            {rows.map((c) => {
              const { done, total } = checklistProgress(c)
              return (
                <tr key={c.id} className={cn('cursor-pointer transition-colors hover:bg-surface-2/60', sel.isSelected(c.id) && 'bg-brand-soft/50')} onClick={() => row.onOpen(c)}>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={sel.isSelected(c.id)} onChange={() => sel.toggle(c.id)} srLabel={t('list.selectRow')} />
                  </td>
                  <td className="px-1 py-2"><DoneToggle card={c} onToggle={() => row.onToggleDone(c)} readOnly={!row.rights.act(c)} /></td>
                  <td className={cn('px-3 py-2 text-[13.5px] font-medium text-fg', c.is_completed && 'font-normal text-fg-subtle line-through')}>{c.title}</td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <StatusPicker columnId={c.column_id} columns={row.columns} onPick={(id) => row.onMove(c, id)} readOnly={!row.rights.act(c)} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <span className="flex justify-center">
                      <AssigneeStack members={cardMembers(c)} candidates={row.projectMembers} onToggle={(id, on) => row.onToggleMember(c, id, on)} readOnly={!row.rights.own(c)} onManage={row.onManageMembers} />
                    </span>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><DueCell card={c} onDue={row.onDue} readOnly={!row.rights.own(c)} /></td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <PriorityPicker value={c.priority} onPick={(p) => row.onPriority(c, p)} readOnly={!row.rights.own(c)} withLabel={c.priority != null} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <LabelChips labels={cardLabels(c)} all={row.projectLabels} onToggle={(id, on) => row.onToggleLabel(c, id, on)} readOnly={!row.rights.own(c)} />
                  </td>
                  <td className="px-3 py-2 text-[12px] tabular-nums text-fg-muted">{total ? `${done}/${total}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </UICard>
  )
}

/* ─────────────────────────────── prompts ─────────────────────────────── */

/** Small colour picker for a status (board column). */
function ColorPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const swatches = ['#7C3AED', '#0A70C2', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#64748B']
  return (
    <Field label={label}>
      <div className="flex flex-wrap items-center gap-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            style={{ backgroundColor: c }}
            className={cn('h-7 w-7 rounded-full border-2 transition-transform', value === c ? 'scale-110 border-fg' : 'border-transparent')}
          />
        ))}
        <button
          type="button"
          onClick={() => onChange('')}
          aria-pressed={!value}
          className={cn('h-7 rounded-pill border px-2.5 text-[11px]', value ? 'border-line text-fg-muted' : 'border-fg text-fg')}
        >
          —
        </button>
      </div>
    </Field>
  )
}

function NamePrompt({ open, title, label, loading, onClose, onSubmit, initial = '', extra }: { open: boolean; title: string; label: string; loading: boolean; onClose: () => void; onSubmit: (name: string) => void; initial?: string; extra?: ReactNode }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  // Seeded from `initial` so the same prompt serves "add" (empty) and "rename".
  useEffect(() => { if (open) setName(initial) }, [open, initial])
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={
      <>
        <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
        <Button onClick={() => name.trim() && onSubmit(name.trim())} disabled={!name.trim()} loading={loading}>{t('common.save')}</Button>
      </>
    }>
      <div className="flex flex-col gap-3">
        <Field label={label}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) onSubmit(name.trim()) }}
            aria-label={label}
            autoFocus
          />
        </Field>
        {extra}
      </div>
    </Modal>
  )
}
