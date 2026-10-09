import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { tipProps } from './boardDrill'

type StatTone = 'brand' | 'success' | 'warning' | 'danger' | 'info'

/**
 * Gradient pairs per tone — «B · Aurora» (2026-09-24). The icon sits on a
 * gradient tile with a glow of its own colour and the figure is painted with
 * the same pair, so the tile reads as one object. Hex ATAYLAB: these are
 * decorative gradients, the text-safe semantic tokens stay for body text; the
 * dark theme gets a lighter pair so the figure keeps its contrast.
 */
const TONE: Record<StatTone, { tile: string; num: string; bar: string }> = {
  brand: {
    tile: 'from-[#8B5CF6] to-[#6D28D9] shadow-[0_8px_20px_-8px_rgba(124,58,237,0.8)]',
    num: 'from-[#7C3AED] to-[#C026D3] dark:from-[#C4B5FD] dark:to-[#F0ABFC]',
    bar: 'from-[#7C3AED] to-[#C026D3]',
  },
  success: {
    tile: 'from-[#34D399] to-[#059669] shadow-[0_8px_20px_-8px_rgba(16,185,129,0.8)]',
    num: 'from-[#059669] to-[#10B981] dark:from-[#6EE7B7] dark:to-[#A7F3D0]',
    bar: 'from-[#059669] to-[#10B981]',
  },
  warning: {
    tile: 'from-[#FCD34D] to-[#F59E0B] shadow-[0_8px_20px_-8px_rgba(245,158,11,0.8)]',
    num: 'from-[#D97706] to-[#F59E0B] dark:from-[#FCD34D] dark:to-[#FDE68A]',
    bar: 'from-[#D97706] to-[#F59E0B]',
  },
  danger: {
    tile: 'from-[#FB7185] to-[#E11D48] shadow-[0_8px_20px_-8px_rgba(225,29,72,0.8)]',
    num: 'from-[#E11D48] to-[#F43F5E] dark:from-[#FDA4AF] dark:to-[#FECDD3]',
    bar: 'from-[#E11D48] to-[#F43F5E]',
  },
  info: {
    tile: 'from-[#38BDF8] to-[#0284C7] shadow-[0_8px_20px_-8px_rgba(14,165,233,0.8)]',
    num: 'from-[#0284C7] to-[#0EA5E9] dark:from-[#7DD3FC] dark:to-[#BAE6FD]',
    bar: 'from-[#0284C7] to-[#0EA5E9]',
  },
}

/**
 * One reading off the board.
 *
 * The value is the loudest thing in the tile because it is the answer; the
 * qualifier under it ("69% davomat") is muted, because the reader needs it only
 * after the number has landed. A thin bar at the foot shows the same share as
 * a length, so four tiles can be compared at a glance.
 *
 * A tile becomes a BUTTON when `onClick` is given — a number on this board is
 * never a dead end: pressing it opens the list of people behind it.
 */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone,
  onClick,
  active,
  loading,
  progress,
  tip,
}: {
  label: string
  value: string | number
  sub?: string
  icon: LucideIcon
  tone: StatTone
  onClick?: () => void
  active?: boolean
  loading?: boolean
  /** 0–100: the share drawn as the bar at the tile's foot. */
  progress?: number
  /** Hover tip: a title and value rows. */
  tip?: { title: string; rows?: [string, string | number][] }
}) {
  const c = TONE[tone]
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick, 'aria-pressed': !!active } : {})}
      {...(tip ? tipProps(tip.title, tip.rows) : {})}
      className={cn(
        'group relative flex flex-1 items-center gap-2.5 overflow-hidden rounded-card border border-border bg-surface px-3 pb-5 pt-4 text-left shadow-sm sm:gap-3.5 sm:px-4 transition-[transform,box-shadow] duration-200',
        onClick && 'hover:-translate-y-0.5 hover:shadow-md',
        active && 'ring-1 ring-brand',
      )}
    >
      <span
        className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[13px] bg-gradient-to-br text-white sm:h-11 sm:w-11 sm:rounded-[15px]', c.tile)}
      >
        <Icon size={19} />
      </span>
      <span className="flex min-w-0 flex-col gap-px leading-tight">
        <span className="line-clamp-2 text-[12.5px] font-semibold leading-tight text-fg-muted">{label}</span>
        <span
          className={cn(
            'bg-gradient-to-r bg-clip-text text-[26px] sm:text-[32px] font-extrabold leading-[1.1] tracking-[-0.03em] text-transparent [font-variant-numeric:tabular-nums]',
            c.num,
            loading && 'opacity-40',
          )}
        >
          {value}
        </span>
        {sub && <span className="truncate text-[11.5px] text-fg-subtle">{sub}</span>}
      </span>
      {onClick && (
        <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-[9px] bg-surface-2 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <ChevronRight size={14} />
        </span>
      )}
      {progress != null && (
        <span className="absolute inset-x-4 bottom-2.5 h-1 overflow-hidden rounded-pill bg-fg/[0.07]">
          <span
            className={cn('block h-full rounded-pill bg-gradient-to-r', c.bar)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </span>
      )}
    </Tag>
  )
}
