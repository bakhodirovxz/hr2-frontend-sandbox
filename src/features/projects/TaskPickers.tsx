import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Plus, Tag, UserPlus } from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { Avatar } from '@/components/ui/Avatar'
import { Input } from '@/components/ui/Input'
import { POPOVER } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import type { EmployeeBrief, Label } from './useBoard'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'

/**
 * Assignee and label pickers, shaped after the ones task managers put directly
 * on a row: an avatar stack you click, a searchable list, tick to toggle. The
 * row never leaves the screen — editing an assignee should not cost a modal.
 */

export function AssigneeStack({
  members,
  candidates,
  onToggle,
  size = 22,
  readOnly,
  onManage,
}: {
  members: EmployeeBrief[]
  candidates: EmployeeBrief[]
  onToggle: (employeeId: number, selected: boolean) => void
  size?: number
  readOnly?: boolean
  /** Candidates are the PROJECT's members; the owner can add more from here. */
  onManage?: () => void
}) {
  const lv = useLowVisionScale()
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const picked = new Set(members.map((m) => m.id))
  const shown = candidates.filter((c) => (c.legal_name ?? '').toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={readOnly}
        aria-label={t('projects.assignees')}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={cn(
          'tap-expand relative flex items-center rounded-full transition-opacity',
          readOnly ? 'cursor-default' : 'hover:opacity-80',
        )}
      >
        {members.length === 0 ? (
          <span
            className="grid place-items-center rounded-full border border-dashed border-line text-fg-subtle"
            style={{ width: size * lv, height: size * lv }}
          >
            <UserPlus size={Math.round(size * 0.5)} />
          </span>
        ) : (
          <span className="flex -space-x-1.5">
            {members.slice(0, 3).map((m) => (
              <Avatar
                key={m.id}
                src={m.photo_thumb_path ?? undefined}
                fallbackSrc={m.photo_path ?? undefined}
                name={m.legal_name ?? ''}
                size={size}
                className="ring-2 ring-surface"
              />
            ))}
            {members.length > 3 && (
              <span
                className="grid place-items-center rounded-full bg-surface-2 text-[10px] font-bold text-fg-muted ring-2 ring-surface"
                style={{ width: size * lv, height: size * lv }}
              >
                +{members.length - 3}
              </span>
            )}
          </span>
        )}
      </button>

      <AnchoredPanel
        anchorRef={ref}
        open={open}
        onClose={() => setOpen(false)}
        width={POPOVER.menuW}
        role="listbox"
        label={t('projects.assignees')}
      >
        <div className="p-1.5">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} autoFocus />
        </div>
        <ul className="scroll-thin max-h-64 overflow-y-auto p-1">
          {shown.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-fg-subtle">{t('common.noResults')}</li>}
          {shown.map((c) => {
            const on = picked.has(c.id)
            return (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onToggle(c.id, !on)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                >
                  <Avatar src={c.photo_thumb_path ?? undefined} fallbackSrc={c.photo_path ?? undefined} name={c.legal_name ?? ''} size={22} />
                  <span className="min-w-0 flex-1 truncate text-fg">{c.legal_name}</span>
                  {on && <Check size={14} className="text-brand-strong" />}
                </button>
              </li>
            )
          })}
        </ul>
        {onManage && (
          <div className="border-t border-line p-1">
            <button
              type="button"
              onClick={() => { setOpen(false); onManage() }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-brand-strong hover:bg-brand-soft"
            >
              <UserPlus size={14} /> {t('projects.addToProject')}
            </button>
          </div>
        )}
      </AnchoredPanel>
    </>
  )
}

/** Colours a label chip from its stored value, falling back to the brand tone. */
export const labelStyle = (color?: string | null) => {
  const c = color && /^#?[0-9a-f]{3,8}$/i.test(color) ? (color.startsWith('#') ? color : `#${color}`) : null
  return c
    ? { background: `${c}22`, border: `1px solid ${c}66`, color: c }
    : { background: 'rgb(var(--brand) / 0.14)', border: '1px solid rgb(var(--brand) / 0.35)', color: 'rgb(var(--brand-strong))' }
}

export function LabelChips({
  labels,
  all,
  onToggle,
  readOnly,
}: {
  labels: Label[]
  all: Label[]
  onToggle: (labelId: number, selected: boolean) => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const picked = new Set(labels.map((l) => l.id))

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={readOnly}
        aria-label={t('projects.labels')}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="tap-expand relative flex min-w-0 flex-wrap items-center gap-1"
      >
        {labels.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-1.5 py-0.5 text-[11px] text-fg-subtle">
            <Tag size={11} />
          </span>
        ) : (
          labels.slice(0, 2).map((l) => (
            <span key={l.id} className="truncate rounded-full px-2 py-0.5 text-[11px] font-medium" style={labelStyle(l.color)}>
              {l.name}
            </span>
          ))
        )}
        {labels.length > 2 && <span className="text-[11px] text-fg-subtle">+{labels.length - 2}</span>}
      </button>

      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={POPOVER.menuW} role="listbox" label={t('projects.labels')}>
        <ul className="scroll-thin max-h-64 overflow-y-auto p-1">
          {all.length === 0 && <li className="px-2 py-3 text-center text-[12px] text-fg-subtle">{t('projects.noLabels')}</li>}
          {all.map((l) => {
            const on = picked.has(l.id)
            return (
              <li key={l.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => onToggle(l.id, !on)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
                >
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={labelStyle(l.color)}>{l.name}</span>
                  <span className="flex-1" />
                  {on && <Check size={14} className="text-brand-strong" />}
                </button>
              </li>
            )
          })}
        </ul>
      </AnchoredPanel>
    </>
  )
}

/** Status = the board column. Moving a task is a two-click act, like everywhere else. */
export function StatusPicker({
  columnId,
  columns,
  onPick,
  readOnly,
}: {
  columnId: number | null | undefined
  columns: { id: number; name?: string | null; color?: string | null }[]
  onPick: (columnId: number) => void
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const current = columns.find((c) => c.id === columnId)

  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={readOnly}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={cn(
          'tap-expand relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-line px-2 py-0.5 text-[11.5px] font-medium text-fg-muted',
          !readOnly && 'hover:border-brand/40 hover:text-fg',
        )}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: current?.color || 'rgb(var(--brand))' }} />
        <span className="truncate">{current?.name ?? t('projects.noStatus')}</span>
      </button>

      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={POPOVER.menuW} role="listbox" label={t('projects.status')}>
        <ul className="scroll-thin max-h-64 overflow-y-auto p-1">
          {columns.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={c.id === columnId}
                onClick={() => { onPick(c.id); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color || 'rgb(var(--brand))' }} />
                <span className="min-w-0 flex-1 truncate text-fg">{c.name}</span>
                {c.id === columnId && <Check size={14} className="text-brand-strong" />}
              </button>
            </li>
          ))}
        </ul>
      </AnchoredPanel>
    </>
  )
}

/**
 * The inline "+ Add task" row every task manager ends a group with: it opens
 * into an input, Enter creates and KEEPS the input open for the next one, so a
 * plan can be typed straight down the page without touching a modal.
 */
export function QuickAdd({ onCreate, label }: { onCreate: (title: string) => Promise<unknown>; label?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const v = title.trim()
    if (!v || busy) return
    setBusy(true)
    try {
      await onCreate(v)
      setTitle('')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[12.5px] text-fg-subtle transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <Plus size={14} /> {label ?? t('projects.addTask')}
      </button>
    )
  }

  return (
    <div className="px-1 py-1">
      <Input
        autoFocus
        value={title}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void submit() }
          if (e.key === 'Escape') { setOpen(false); setTitle('') }
        }}
        onBlur={() => { if (!title.trim()) setOpen(false) }}
        placeholder={t('projects.quickAddHint')}
      />
    </div>
  )
}
