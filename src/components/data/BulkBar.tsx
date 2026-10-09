import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import type { BulkProgress } from '@/hooks/useBulkAction'

interface BulkBarProps {
  count: number
  onClear: () => void
  progress?: BulkProgress
  children: ReactNode
  /** Rows matching the filter across ALL pages. With `onSelectAll`, the bar
   *  offers «select all N» while fewer are ticked. */
  total?: number
  onSelectAll?: () => void
  selectingAll?: boolean
}

/** Floating action bar shown while rows are selected. Actions are passed in by
 *  the page, so each screen can offer whatever bulk operations make sense. */
export function BulkBar({ count, onClear, progress, children, total, onSelectAll, selectingAll }: BulkBarProps) {
  const { t } = useTranslation()
  if (count === 0) return null

  const busy = progress?.running

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div
        role="region"
        aria-label={t('list.bulkActions')}
        className="pointer-events-auto flex w-full max-w-3xl animate-slide-up items-center gap-3 rounded-xl border border-line bg-elevated px-3 py-2.5 shadow-pop"
      >
        <span className="flex items-center gap-2 text-[13px] font-semibold text-fg" aria-live="polite">
          <span className="grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold tabular-nums text-fg-on-brand">
            {count}
          </span>
          <span className="hidden sm:inline">{t('list.selectedCount', { count })}</span>
        </span>
        {onSelectAll && total != null && total > count && !busy && (
          <button
            type="button"
            onClick={onSelectAll}
            disabled={selectingAll}
            className="rounded-pill bg-brand-soft px-3 py-1 text-[12.5px] font-semibold text-brand-strong transition-colors hover:bg-brand/20 disabled:opacity-60"
          >
            {selectingAll ? t('common.loading') : t('list.selectAllMatching', { count: total })}
          </button>
        )}
        {total != null && count >= total && total > 0 && (
          <span className="hidden text-[12px] text-fg-subtle md:inline">{t('list.allMatchingSelected')}</span>
        )}

        {busy ? (
          <span className="ml-auto text-[13px] tabular-nums text-fg-muted" aria-live="polite">
            {t('list.bulkProgress', { done: progress!.done, total: progress!.total })}
            {progress!.failed > 0 && (
              <span className="ml-2 text-danger">
                {t('list.bulkFailedCount', { count: progress!.failed })}
              </span>
            )}
          </span>
        ) : (
          <div className="ml-auto flex items-center gap-2">{children}</div>
        )}

        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          aria-label={t('list.clearSelection')}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
