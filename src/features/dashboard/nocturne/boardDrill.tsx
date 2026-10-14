import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Search, type LucideIcon } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Avatar } from '@/components/ui/Avatar'
import { cn } from '@/lib/cn'
import { useLowVisionScale } from '@/a11y/useLowVisionScale'
import { control } from '@/components/ui/control'

/* ════════════════════════════════════════════════════════════════════════════
 * BOARD TOOLTIP
 *
 * One floating tip for the whole board, fed by a `data-board-tip` attribute on
 * any element (a donut arc, a bar, a tile, a chip). One host instead of a
 * <Tooltip> wrapper per mark because the marks are SVG arcs and table-like
 * rows: wrapping each would add a DOM node and a listener per arc, and the
 * wrapper would break the SVG. The payload is JSON — a title and value rows —
 * so the tip can show a small table, not just a sentence.
 * ══════════════════════════════════════════════════════════════════════════ */

type TipRow = [string, string | number]
export function tipProps(title: string, rows: TipRow[] = []) {
  return { 'data-board-tip': JSON.stringify({ t: title, r: rows }) }
}

export function BoardTipHost() {
  const [tip, setTip] = useState<{ t: string; r: TipRow[] } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const el = useRef<Element | null>(null)

  useEffect(() => {
    const over = (e: PointerEvent) => {
      const t = (e.target as Element | null)?.closest?.('[data-board-tip]') ?? null
      if (t === el.current) return
      el.current = t
      if (!t) return setTip(null)
      try {
        setTip(JSON.parse(t.getAttribute('data-board-tip') || ''))
      } catch {
        setTip(null)
      }
    }
    const move = (e: PointerEvent) => {
      const box = ref.current
      if (!box || !el.current) return
      const r = box.getBoundingClientRect()
      let x = e.clientX + 14
      let y = e.clientY + 16
      if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14
      if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14
      box.style.transform = `translate(${x}px, ${y}px)`
    }
    // A click opens a popup over the mark — the tip must not linger on top of it.
    const hide = () => {
      el.current = null
      setTip(null)
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerdown', hide)
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerdown', hide)
    }
  }, [])

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={cn(
        'pointer-events-none fixed left-0 top-0 z-[120] min-w-[120px] max-w-[300px] rounded-[12px] border border-white/10 px-3 py-2 text-[12px] leading-snug text-white shadow-lg transition-opacity duration-100',
        'bg-[#17122B] dark:bg-[#2A2450]',
        tip ? 'opacity-100' : 'opacity-0',
      )}
    >
      {tip && (
        <>
          <b className="mb-0.5 block text-[12.5px] font-bold">{tip.t}</b>
          {tip.r.map(([k, v]) => (
            <span key={k} className="flex items-center gap-3 text-white/70">
              {k}
              <em className="ml-auto not-italic font-bold tabular-nums text-white">{v}</em>
            </span>
          ))}
        </>
      )}
    </div>,
    document.body,
  )
}

/* ════════════════════════════════════════════════════════════════════════════
 * DRILL MODAL — "who is behind this number"
 * ══════════════════════════════════════════════════════════════════════════ */

export type DrillTone = 'brand' | 'success' | 'warning' | 'danger'
const TONE_TILE: Record<DrillTone, string> = {
  brand: 'from-[#0B7CD8] to-[#0967B4] shadow-[0_8px_20px_-8px_rgba(10,112,194,0.7)]',
  success: 'from-[#34D399] to-[#059669] shadow-[0_8px_20px_-8px_rgba(16,185,129,0.8)]',
  warning: 'from-[#FCD34D] to-[#F59E0B] shadow-[0_8px_20px_-8px_rgba(245,158,11,0.8)]',
  danger: 'from-[#FB7185] to-[#E11D48] shadow-[0_8px_20px_-8px_rgba(225,29,72,0.8)]',
}
/** The gradient icon tile used by the board's tiles, carousel heads and popups. */
export function ToneTile({ icon: Icon, tone = 'brand', size = 44 }: { icon: LucideIcon; tone?: DrillTone; size?: number }) {
  const lv = useLowVisionScale()
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-[14px] bg-gradient-to-br text-white', TONE_TILE[tone])}
      style={{ width: size * lv, height: size * lv }}
    >
      <Icon size={Math.round(size * 0.42)} />
    </span>
  )
}

export interface DrillTab {
  key: string
  label: string
  count?: number
  /** A tab that lists missing / suspect data reads in the danger colour. */
  warn?: boolean
}

export function DrillModal({
  open,
  onClose,
  icon,
  tone = 'brand',
  title,
  subtitle,
  tabs,
  active,
  onTab,
  search = true,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  icon: LucideIcon
  tone?: DrillTone
  title: string
  subtitle?: string
  tabs?: DrillTab[]
  active?: string
  onTab?: (key: string) => void
  search?: boolean
  footer?: ReactNode
  /** Render prop: the list, given the search needle (lower-cased). */
  children: (needle: string) => ReactNode
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  useEffect(() => setQ(''), [active, open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      bodyFill
      title={
        <span className="flex items-center gap-3">
          <ToneTile icon={icon} tone={tone} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate">{title}</span>
            {subtitle && <span className="truncate text-[12.5px] font-normal text-fg-subtle">{subtitle}</span>}
          </span>
        </span>
      }
      footer={footer ? <p className="m-0 w-full text-[11.5px] leading-relaxed text-fg-subtle">{footer}</p> : undefined}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 px-5 pb-3 pt-4">
        {tabs && tabs.length > 1 && (
          <div className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto pb-0.5" role="tablist">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                role="tab"
                aria-selected={tb.key === active}
                onClick={() => onTab?.(tb.key)}
                className={cn(
                  'flex h-[34px] shrink-0 items-center gap-2 rounded-[11px] px-3 text-[12.5px] font-semibold transition-colors',
                  tb.key === active
                    ? 'bg-gradient-to-br from-[#0B7CD8] to-[#0A70C2] text-white'
                    : cn('bg-surface-2 hover:bg-fg/[0.08]', tb.warn ? 'text-danger' : 'text-fg-muted'),
                )}
              >
                {tb.label}
                {tb.count != null && (
                  <i
                    className={cn(
                      'rounded-[8px] px-1.5 py-px text-[11.5px] not-italic tabular-nums',
                      tb.key === active ? 'bg-white/20' : 'bg-surface',
                    )}
                  >
                    {tb.count}
                  </i>
                )}
              </button>
            ))}
          </div>
        )}
        {search && (
          <label className={control({ focusWithin: true, className: 'flex shrink-0 items-center gap-2.5 px-3 text-fg-subtle' })}>
            <Search size={16} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('dashboard.drill.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
            />
          </label>
        )}
        <div className="scroll-thin -mx-2 min-h-[200px] flex-1 overflow-y-auto px-2">{children(q.trim().toLowerCase())}</div>
      </div>
    </Modal>
  )
}

/** One person in a drill list. `onClick` opens their card / profile. */
export function PersonRow({
  name,
  meta,
  photo,
  right,
  onClick,
  children,
}: {
  name: string
  meta?: string
  photo?: string | null
  right?: ReactNode
  onClick?: () => void
  children?: ReactNode
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex w-full items-start gap-3 rounded-[14px] px-2 py-2.5 text-left transition-colors',
        onClick && 'hover:bg-surface-2',
      )}
    >
      <Avatar src={photo} name={name} size={38} />
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="truncate text-[13.5px] font-semibold text-fg">{name}</span>
        {meta && <span className="truncate text-[11.5px] text-fg-subtle">{meta}</span>}
        {children}
      </span>
      {right && <span className="flex shrink-0 flex-col items-end gap-1 self-center text-right">{right}</span>}
    </Tag>
  )
}

export function DrillPill({ tone = 'neutral', children }: { tone?: 'neutral' | 'danger' | 'warning' | 'success'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-block whitespace-nowrap rounded-pill px-2.5 py-0.5 text-[11px] font-bold',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'warning' && 'bg-warning-soft text-warning',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'neutral' && 'bg-surface-2 text-fg-muted',
      )}
    >
      {children}
    </span>
  )
}

export function DrillEmpty({ text }: { text: string }) {
  return <div className="grid min-h-[160px] place-items-center text-center text-[13px] text-fg-subtle">{text}</div>
}

/** Filters any list of people by the modal's search needle. */
export function matchNeedle(needle: string, ...fields: (string | null | undefined)[]) {
  if (!needle) return true
  return fields.some((f) => (f ?? '').toLowerCase().includes(needle))
}

/* ════════════════════════════════════════════════════════════════════════════
 * DATA — the two drill endpoints (backend services/dashboard_drill.py)
 * ══════════════════════════════════════════════════════════════════════════ */

export interface RosterSummary {
  total: number
  no_birth_date: number
  no_position: number
  acceptance_import_day: number
  acceptance_missing: number
  acceptance_set: number
  seniority: Record<'<1' | '1-3' | '3-5' | '5-10' | '10+', number>
}
export interface RosterRow {
  id: number
  legal_name: string | null
  job_position_name: string | null
  department_name: string | null
  photo_thumb_path: string | null
  gender: 0 | 1 | 2
  is_archived: boolean
  birth_date: string | null
  age: number | null
  age_bin: string | null
  nationality: string
  job_acceptance_date: string | null
  acceptance_state: 'import_day' | 'missing' | 'set'
}
export type RosterGroup = 'gender' | 'age' | 'nationality' | 'position' | 'acceptance'

/**
 * Bosh sahifa diagrammasidan odamlar ro'yxatiga o'tish (`roster-composition`)
 * hr-backend-sandbox'da yo'q va TZ bosh sahifadan buni talab qilmaydi (TZ R2
 * drill-down — statistika dashboardida). Hook'lar so'rov yubormaydi: panel
 * diagrammalari ishlaydi, bosiladigan joylar o'chiq (`failed` → `canDrill`).
 */
export function useRosterSummary(_enabled = true) {
  void _enabled
  return { summary: null as RosterSummary | null, failed: true }
}

export function useRosterRows(_group: RosterGroup | null, _key: string | null) {
  void _group
  void _key
  return { rows: [] as RosterRow[], loading: false, failed: true }
}

