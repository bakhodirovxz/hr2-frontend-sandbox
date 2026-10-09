import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft,
  Calendar,
  CalendarClock,
  Check,
  CircleDot,
  Flag,
  ListChecks,
  Paperclip,
  Plus,
  Tag,
  Trash2,
  Undo2,
  User,
  Users,
  X,
} from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { DateInput } from '@/components/ui/DateInput'
import { Avatar } from '@/components/ui/Avatar'
import { useConfirm } from '@/components/data/useConfirm'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { formatUzShort } from '@/lib/format'
import { isInvalidRange } from '@/lib/dateRange'
import { CardComments } from './CardComments'
import { AssigneeStack, LabelChips, StatusPicker } from './TaskPickers'
import { PriorityPicker } from './Priority'
import { cardLabels, cardMembers, checklistProgress, dueTone, relativeDue } from './taskUtils'
import type { Card, ChecklistItem, Column, EmployeeBrief, Label, Priority, useBoardMutations } from './useBoard'

export interface TaskRights {
  board: boolean
  own: (c: Card) => boolean
  act: (c: Card) => boolean
}

/**
 * THE TASK, OPENED — two panes, the way ClickUp and Linear open an item.
 *
 * Left is the work itself: the title, the description, the steps (checklist),
 * the files and the discussion — things you READ and write. Right is the
 * record: status, priority, people, dates, labels — things you SET with one
 * click. Keeping them apart is what lets the left side grow (a long thread, ten
 * steps) without pushing the status out of sight.
 *
 * Every control mirrors the server's rule for it, so nothing is offered that
 * would answer 403: content (title, text, dates, priority, people, labels) is
 * the creator's; progress (done, steps, files, status) is the creator's or an
 * assignee's.
 */
export function TaskDetail({
  card,
  projectName,
  columns,
  projectMembers,
  projectLabels,
  rights,
  mut,
  onClose,
  onSave,
  onToggleDone,
  onReject,
  onMove,
  onPriority,
  onToggleMember,
  onToggleLabel,
  onDelete,
  onManageMembers,
}: {
  card: Card
  projectName: string
  columns: Column[]
  projectMembers: EmployeeBrief[]
  projectLabels: Label[]
  rights: TaskRights
  mut: ReturnType<typeof useBoardMutations>
  onClose: () => void
  onSave: (body: Record<string, unknown>) => Promise<unknown> | void
  onToggleDone: (c: Card) => void
  onReject: (c: Card) => void
  onMove: (c: Card, columnId: number) => void
  onPriority: (c: Card, p: Priority | null) => void
  onToggleMember: (c: Card, employeeId: number, on: boolean) => void
  onToggleLabel: (c: Card, labelId: number, on: boolean) => void
  onDelete: (c: Card) => void
  onManageMembers?: () => void
}) {
  const { t } = useTranslation()
  const own = rights.own(card)
  const act = rights.act(card)
  const column = columns.find((c) => c.id === card.column_id)

  const [title, setTitle] = useState(card.title ?? '')
  const [description, setDescription] = useState(card.description ?? '')
  const [seeded, setSeeded] = useState(card.id)
  // Re-seed only when ANOTHER card is opened: the refetch after every inline
  // edit must not overwrite what is being typed.
  if (seeded !== card.id) {
    setSeeded(card.id)
    setTitle(card.title ?? '')
    setDescription(card.description ?? '')
  }
  const dirty = title.trim() !== (card.title ?? '') || description !== (card.description ?? '')

  // DateInput reports a date once when it is fully typed and again on blur;
  // the card still shows the old date until the server answers, so the same
  // pair was PATCHed twice (09-25 sweep). Send each distinct pair once.
  const lastDates = useRef<string | null>(null)
  const saveDates = (start: string, end: string) => {
    if (isInvalidRange(start, end)) return
    const key = `${start}|${end}`
    if (key === lastDates.current || key === `${card.start_date ?? ''}|${card.end_date ?? ''}`) return
    lastDates.current = key
    // A failed save may be retried with the same dates.
    void Promise.resolve(onSave({ start_date: start || null, end_date: end || null })).catch(() => {
      lastDates.current = null
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="full"
      bodyFill
      title={
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-fg-muted">
          <span className="truncate">{projectName}</span>
          <span className="text-fg-subtle">/</span>
          <span className="inline-flex items-center gap-1.5 truncate">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column?.color || 'rgb(var(--brand))' }} />
            {column?.name ?? t('projects.noStatus')}
          </span>
        </span>
      }
    >
      <div className="flex min-h-0 w-full flex-col overflow-y-auto scroll-thin lg:flex-row lg:overflow-hidden">
        {/* ── the work ───────────────────────────────────────────────── */}
        <div className="scroll-thin min-w-0 flex-1 px-5 py-5 lg:overflow-y-auto sm:px-7">
          <div className="flex items-start gap-3">
            <DoneToggle card={card} onToggle={() => onToggleDone(card)} readOnly={!act} large />
            <Textarea
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
              disabled={!own}
              rows={1}
              aria-label={t('projects.colName')}
              className={cn(
                'min-h-0 resize-none border-transparent bg-transparent px-1 py-0.5 [field-sizing:content] text-[20px] sm:text-[22px] font-bold leading-snug tracking-[-0.02em] shadow-none focus:border-line',
                card.is_completed && 'text-fg-subtle line-through',
              )}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 pl-9">
            {card.is_completed && card.completed_at && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-success-soft px-2 py-0.5 text-[12px] font-medium text-success">
                <Check size={12} /> {t('projects.completedAt', { date: formatUzShort(card.completed_at) })}
              </span>
            )}
            {card.rejected_at && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-danger-soft px-2 py-0.5 text-[12px] font-medium text-danger">
                <X size={12} /> {t('projects.rejectedAt', { date: formatUzShort(card.rejected_at) })}
              </span>
            )}
          </div>

          <Section icon={<AlignLeft size={15} />} title={t('projects.description')}>
            <Textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!own}
              placeholder={own ? t('projects.descriptionPlaceholder') : undefined}
            />
          </Section>

          {dirty && own && (
            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setTitle(card.title ?? ''); setDescription(card.description ?? '') }}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                disabled={!title.trim()}
                onClick={() => onSave({ title: title.trim(), description: description.trim() || null })}
              >
                {t('common.save')}
              </Button>
            </div>
          )}

          <Checklist card={card} canEdit={act} mut={mut} />
          <Attachments card={card} canEdit={act} mut={mut} />

          {/* CardComments draws its own «Izohlar» heading. */}
          <div className="mt-6">
            <CardComments cardId={card.id} members={projectMembers} />
          </div>
        </div>

        {/* ── the record ─────────────────────────────────────────────── */}
        <aside className="shrink-0 border-t border-line bg-surface-2/40 px-5 py-5 lg:w-[320px] lg:overflow-y-auto lg:border-l lg:border-t-0 scroll-thin">
          <dl className="m-0 grid gap-1">
            <Prop icon={<CircleDot size={14} />} label={t('projects.colStatus')}>
              <StatusPicker columnId={card.column_id} columns={columns} onPick={(id) => onMove(card, id)} readOnly={!act} />
            </Prop>
            <Prop icon={<Flag size={14} />} label={t('projects.priority')}>
              <PriorityPicker value={card.priority} onPick={(p) => onPriority(card, p)} readOnly={!own} withLabel />
            </Prop>
            <Prop icon={<Users size={14} />} label={t('projects.colAssignee')}>
              <div className="flex flex-col gap-1.5">
                <AssigneeStack
                  members={cardMembers(card)}
                  candidates={projectMembers}
                  onToggle={(id, on) => onToggleMember(card, id, on)}
                  size={26}
                  readOnly={!own}
                  onManage={onManageMembers}
                />
                {cardMembers(card).length > 0 && (
                  <span className="text-[12px] leading-snug text-fg-muted">
                    {cardMembers(card).map((m) => m.legal_name).join(', ')}
                  </span>
                )}
              </div>
            </Prop>
            <Prop icon={<Calendar size={14} />} label={t('projects.startDate')}>
              <DateInput
                value={card.start_date ?? ''}
                onChange={(v) => saveDates(v, card.end_date ?? '')}
                disabled={!own}
                invalid={isInvalidRange(card.start_date ?? '', card.end_date ?? '')}
              />
            </Prop>
            <Prop icon={<CalendarClock size={14} />} label={t('projects.colDue')}>
              <div className="flex flex-col gap-1">
                <DateInput
                  value={card.end_date ?? ''}
                  onChange={(v) => saveDates(card.start_date ?? '', v)}
                  disabled={!own}
                  invalid={isInvalidRange(card.start_date ?? '', card.end_date ?? '')}
                />
                {card.end_date && !card.is_completed && (
                  <span className={cn('text-[12px] font-medium', dueTone(card))}>{relativeDue(card.end_date, t)}</span>
                )}
              </div>
            </Prop>
            <Prop icon={<Tag size={14} />} label={t('projects.colLabels')}>
              <LabelChips labels={cardLabels(card)} all={projectLabels} onToggle={(id, on) => onToggleLabel(card, id, on)} readOnly={!own} />
            </Prop>
            {card.created_by?.legal_name && (
              <Prop icon={<User size={14} />} label={t('projects.createdBy')}>
                <span className="flex items-center gap-2 text-[13px] text-fg">
                  <Avatar src={card.created_by.photo_thumb_path ?? undefined} name={card.created_by.legal_name} size={22} />
                  <span className="min-w-0 truncate">{card.created_by.legal_name}</span>
                </span>
              </Prop>
            )}
          </dl>

          <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
            {act && (
              <Button
                variant={card.is_completed ? 'secondary' : 'primary'}
                leftIcon={card.is_completed ? <Undo2 size={15} /> : <Check size={15} />}
                onClick={() => onToggleDone(card)}
              >
                {card.is_completed ? t('projects.markUndone') : t('projects.markDone')}
              </Button>
            )}
            {act && !card.is_completed && (
              <Button variant="ghost" className="text-danger" leftIcon={<X size={15} />} onClick={() => onReject(card)}>
                {t('projects.reject')}
              </Button>
            )}
            {own && (
              <Button variant="ghost" className="text-danger" leftIcon={<Trash2 size={15} />} onClick={() => onDelete(card)}>
                {t('projects.deleteCardTitle')}
              </Button>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  )
}

function Section({ icon, title, extra, children }: { icon: ReactNode; title: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2.5 flex items-center gap-2 text-[13.5px] font-semibold text-fg">
        <span className="text-fg-subtle">{icon}</span>
        {title}
        {extra && <span className="ml-auto">{extra}</span>}
      </h3>
      {children}
    </section>
  )
}

function Prop({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-2 rounded-lg px-1.5 py-2 hover:bg-surface/60">
      <dt className="flex items-center gap-1.5 pt-1 text-[12.5px] text-fg-muted">
        <span className="text-fg-subtle">{icon}</span>
        {label}
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  )
}

/** The completion circle: the one control that is always in the same place. */
export function DoneToggle({ card, onToggle, readOnly, large }: { card: Card; onToggle: () => void; readOnly?: boolean; large?: boolean }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      disabled={readOnly}
      aria-label={card.is_completed ? t('projects.markUndone') : t('projects.markDone')}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={cn(
        'tap-expand relative grid shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
        large ? 'mt-1.5 h-6 w-6' : 'h-[18px] w-[18px]',
        card.is_completed ? 'border-success bg-success text-fg-on-brand' : 'border-fg-subtle/60',
        !readOnly && !card.is_completed && 'hover:border-success hover:bg-success-soft',
        readOnly && 'cursor-default',
      )}
    >
      {card.is_completed && <Check size={large ? 14 : 11} strokeWidth={3} />}
    </button>
  )
}

/* ─────────────────────────────── checklist ─────────────────────────────── */

function Checklist({ card, canEdit, mut }: { card: Card; canEdit: boolean; mut: ReturnType<typeof useBoardMutations> }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const items: ChecklistItem[] = card.checklist ?? []
  const { done, total, pct } = checklistProgress(card)

  const run = async (p: Promise<unknown>) => {
    try {
      await p
      mut.invalidate()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }
  const add = async () => {
    const v = draft.trim()
    if (!v) return
    setDraft('')
    await run(mut.addChecklistItem.mutateAsync({ cardId: card.id, title: v }))
  }

  if (!canEdit && total === 0) return null
  return (
    <Section
      icon={<ListChecks size={15} />}
      title={t('projects.checklist')}
      extra={total > 0 && <span className="text-[12px] font-semibold tabular-nums text-fg-muted">{done}/{total}</span>}
    >
      {total > 0 && (
        <div className="mb-2 h-1.5 overflow-hidden rounded-pill bg-fg/[0.07]">
          <div
            className={cn('h-full rounded-pill transition-[width]', pct === 100 ? 'bg-success' : 'bg-brand')}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <ul className="flex flex-col">
        {items.map((it) => (
          <li key={it.id} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-surface-2/70">
            <button
              type="button"
              disabled={!canEdit}
              aria-pressed={!!it.is_done}
              aria-label={it.title ?? ''}
              onClick={() => run(mut.updateChecklistItem.mutateAsync({ id: it.id, body: { is_done: !it.is_done } }))}
              className={cn(
                'grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors',
                it.is_done ? 'border-brand bg-brand text-fg-on-brand' : 'border-fg-subtle/60 hover:border-brand',
                !canEdit && 'cursor-default',
              )}
            >
              {it.is_done && <Check size={11} strokeWidth={3} />}
            </button>
            <span className={cn('min-w-0 flex-1 text-[13.5px] text-fg', it.is_done && 'text-fg-subtle line-through')}>{it.title}</span>
            {canEdit && (
              <button
                type="button"
                aria-label={t('common.delete')}
                onClick={async () => {
                  if (await confirm({ kind: 'delete', subject: it.title ?? '' })) await run(mut.removeChecklistItem.mutateAsync(it.id))
                }}
                className="grid h-6 w-6 place-items-center rounded-md text-fg-subtle opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="mt-1 flex items-center gap-2 px-1.5">
          <Plus size={15} className="shrink-0 text-fg-subtle" />
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
            placeholder={t('projects.checklistAdd')}
            aria-label={t('projects.checklistAdd')}
            className="border-transparent bg-transparent shadow-none focus:border-line"
          />
        </div>
      )}
    </Section>
  )
}

/* ────────────────────────────── attachments ────────────────────────────── */

function Attachments({ card, canEdit, mut }: { card: Card; canEdit: boolean; mut: ReturnType<typeof useBoardMutations> }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const files = card.attachments ?? []
  if (!canEdit && files.length === 0) return null

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    try {
      for (const f of Array.from(list)) await mut.addAttachment.mutateAsync({ cardId: card.id, file: f })
      mut.invalidate()
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Section
      icon={<Paperclip size={15} />}
      title={t('projects.attachments')}
      extra={
        canEdit && (
          <>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
            <Button size="sm" variant="ghost" leftIcon={<Plus size={14} />} loading={busy} onClick={() => fileRef.current?.click()}>
              {t('projects.attach')}
            </Button>
          </>
        )
      }
    >
      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-[12.5px] text-fg-subtle">{t('projects.noAttachments')}</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
          {files.map((f) => {
            const img = f.content_type?.startsWith('image/') && f.attachment_path
            return (
              <li key={f.id} className="group relative overflow-hidden rounded-lg border border-line bg-surface">
                <a href={f.attachment_path ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
                  {img ? (
                    <img src={f.attachment_path!} alt={f.original_filename ?? ''} loading="lazy" className="h-24 w-full object-cover" />
                  ) : (
                    <span className="grid h-24 place-items-center bg-surface-2 text-fg-subtle"><Paperclip size={22} /></span>
                  )}
                  <span className="block truncate px-2 py-1.5 text-[12px] text-fg">{f.original_filename}</span>
                </a>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={t('common.delete')}
                    onClick={async () => {
                      if (!(await confirm({ kind: 'delete', subject: f.original_filename ?? '' }))) return
                      try {
                        await mut.removeAttachment.mutateAsync(f.id)
                        mut.invalidate()
                      } catch (e) {
                        toast.error(errorMessage(e, t('common.actionFailed')))
                      }
                    }}
                    className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-surface/90 text-fg-muted opacity-0 shadow-sm transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
