import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Flag, X } from 'lucide-react'
import { AnchoredPanel } from '@/components/ui/AnchoredPanel'
import { POPOVER } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import type { Priority } from './useBoard'

/**
 * PRIORITY — the four flags of a task manager (ClickUp's scale: urgent, high,
 * normal, low). The flag is the one mark on a row that is read before the
 * title, so each level owns a colour and nothing else on the board uses it:
 * red is «drop everything», amber «next», blue «in the plan», grey «someday».
 * An unset priority draws an empty outlined flag — «not decided» must not look
 * like «low».
 */
export const PRIORITIES: { value: Priority; key: 'prioUrgent' | 'prioHigh' | 'prioNormal' | 'prioLow'; cls: string; fill: string }[] = [
  // Hex, not the text tokens: `--warning` / `--info` are darkened for TEXT
  // contrast and made the flags read brown and navy. A flag is a filled
  // shape, so it takes the bright signal colour in both themes.
  { value: 1, key: 'prioUrgent', cls: 'text-[#E5484D]', fill: '#E5484D' },
  { value: 2, key: 'prioHigh', cls: 'text-[#F5A524]', fill: '#F5A524' },
  { value: 3, key: 'prioNormal', cls: 'text-[#3E8BFF]', fill: '#3E8BFF' },
  { value: 4, key: 'prioLow', cls: 'text-[#94A3B8]', fill: '#94A3B8' },
]

export const priorityMeta = (p?: Priority | null) => PRIORITIES.find((x) => x.value === p) ?? null

export function PriorityFlag({ value, size = 14, withLabel }: { value?: Priority | null; size?: number; withLabel?: boolean }) {
  const { t } = useTranslation()
  const m = priorityMeta(value)
  return (
    <span className={cn('inline-flex items-center gap-1.5', m ? m.cls : 'text-fg-subtle/70')}>
      <Flag size={size} fill={m ? m.fill : 'none'} strokeWidth={m ? 2 : 1.75} />
      {withLabel && <span className="text-[12.5px] font-medium">{m ? t(`projects.${m.key}`) : t('projects.prioNone')}</span>}
    </span>
  )
}

/** The flag on a row / in the panel; a click opens the four levels + «clear». */
export function PriorityPicker({
  value,
  onPick,
  readOnly,
  withLabel,
}: {
  value?: Priority | null
  onPick: (p: Priority | null) => void
  readOnly?: boolean
  withLabel?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const m = priorityMeta(value)
  return (
    <>
      <button
        ref={ref}
        type="button"
        disabled={readOnly}
        aria-label={`${t('projects.priority')}: ${m ? t(`projects.${m.key}`) : t('projects.prioNone')}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className={cn(
          'tap-expand relative inline-flex items-center rounded-md px-1 py-0.5 transition-colors',
          readOnly ? 'cursor-default' : 'hover:bg-surface-2',
        )}
      >
        <PriorityFlag value={value} withLabel={withLabel} />
      </button>
      <AnchoredPanel anchorRef={ref} open={open} onClose={() => setOpen(false)} width={POPOVER.menuW} role="listbox" label={t('projects.priority')}>
        <ul className="p-1">
          {PRIORITIES.map((p) => (
            <li key={p.value}>
              <button
                type="button"
                role="option"
                aria-selected={p.value === value}
                onClick={() => { onPick(p.value); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2"
              >
                <PriorityFlag value={p.value} />
                <span className="min-w-0 flex-1 text-fg">{t(`projects.${p.key}`)}</span>
                {p.value === value && <Check size={14} className="text-brand-strong" />}
              </button>
            </li>
          ))}
          {value != null && (
            <li className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => { onPick(null); setOpen(false) }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-fg-muted hover:bg-surface-2"
              >
                <X size={14} /> {t('projects.prioClear')}
              </button>
            </li>
          )}
        </ul>
      </AnchoredPanel>
    </>
  )
}
