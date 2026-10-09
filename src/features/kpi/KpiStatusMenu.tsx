import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ChevronDown, Lock, PlayCircle, RotateCcw, Undo2 } from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { isDoneStatus, statusActions, type StatusAction } from './api'

/*
 * Status chip of an entry or a scorecard (N → I → D). With `onAction` and at
 * least one allowed move it opens a menu of the lifecycle's next steps (v1
 * `KpiStatusMenu`); without it it is a plain label. The label is the same on
 * every screen (TZ expertise C29: «Yangi» for HR, «Qoralama» for the employee).
 */

const STATUS_KEY: Record<string, string> = {
  N: 'kpi.statusN',
  draft: 'kpi.statusN',
  I: 'kpi.statusI',
  D: 'kpi.statusD',
  locked: 'kpi.statusD',
}

const STATUS_CLS: Record<string, string> = {
  N: 'bg-surface-2 text-fg-muted ring-line',
  draft: 'bg-surface-2 text-fg-muted ring-line',
  I: 'bg-warning-soft text-warning ring-warning/25',
  D: 'bg-success-soft text-success ring-success/25',
  locked: 'bg-success-soft text-success ring-success/25',
}

export const ACTION_KEY: Record<StatusAction, string> = {
  set_in_progress: 'kpi.actInProgress',
  set_done: 'kpi.actDone',
  clear_done: 'kpi.actClearDone',
  clear_in_progress: 'kpi.actClearInProgress',
}

const ACTION_ICON: Record<StatusAction, typeof PlayCircle> = {
  set_in_progress: PlayCircle,
  set_done: CheckCircle2,
  clear_done: Undo2,
  clear_in_progress: RotateCcw,
}

export function useStatusLabel() {
  const { t } = useTranslation()
  return (s?: string | null) => (s ? t((STATUS_KEY[s] ?? 'kpi.statusN') as never) : '—')
}

export function KpiStatusMenu({
  status,
  onAction,
  allowed,
}: {
  status?: string | null
  /** Omit for a read-only chip. */
  onAction?: (action: StatusAction) => Promise<unknown>
  /** Grant filter — moves the caller may make. */
  allowed?: (action: StatusAction) => boolean
}) {
  const label = useStatusLabel()
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const s = status ?? 'N'
  const actions = onAction ? statusActions(s).filter((a) => !allowed || allowed(a)) : []
  const cls = cn(
    'inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-pill px-2 text-[11.5px] font-semibold ring-1 ring-inset',
    STATUS_CLS[s] ?? STATUS_CLS.N,
  )

  if (!actions.length) {
    return (
      <span className={cls}>
        {isDoneStatus(s) && <Lock size={10} aria-hidden />}
        {label(s)}
      </span>
    )
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={cn(cls, 'cursor-pointer hover:brightness-95')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        {busy ? <Spinner size={10} /> : isDoneStatus(s) ? <Lock size={10} aria-hidden /> : null}
        {label(s)}
        <ChevronDown size={12} className="opacity-70" aria-hidden />
      </button>
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={220} label={t('kpi.colStatus')} align="end">
        <div className="p-1" role="menu" onClick={(e) => e.stopPropagation()}>
          {actions.map((a) => {
            const Icon = ACTION_ICON[a]
            return (
              <button
                key={a}
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] font-medium text-fg hover:bg-surface-2"
                onClick={async () => {
                  setOpen(false)
                  setBusy(true)
                  try {
                    await onAction!(a)
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <Icon size={15} className="text-fg-muted" aria-hidden />
                {t(ACTION_KEY[a] as never)}
              </button>
            )
          })}
        </div>
      </AnchoredPanel>
    </>
  )
}
