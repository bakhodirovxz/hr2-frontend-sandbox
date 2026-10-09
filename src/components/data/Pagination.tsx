import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { PAGE_SIZE_OPTIONS } from '@/hooks/useListParams'
import { Select } from '@/components/ui/Select'

interface PaginationProps {
  page: number
  size: number
  total: number
  pages: number
  onPage: (p: number) => void
  onSize: (s: number) => void
  loading?: boolean
}

/** Page numbers with ellipses: always show first, last and a window around the
 *  current page. Returns `null` entries where a gap should be rendered. */
function pageList(page: number, pages: number): (number | null)[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const out: (number | null)[] = [1]
  const from = Math.max(2, page - 1)
  const to = Math.min(pages - 1, page + 1)
  if (from > 2) out.push(null)
  for (let i = from; i <= to; i++) out.push(i)
  if (to < pages - 1) out.push(null)
  out.push(pages)
  return out
}

export function Pagination({ page, size, total, pages, onPage, onSize, loading }: PaginationProps) {
  const { t } = useTranslation()
  const from = total === 0 ? 0 : (page - 1) * size + 1
  const to = Math.min(page * size, total)

  return (
    <div className="flex flex-col gap-3 border-t border-line px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 text-xs text-fg-muted">
        <span aria-live="polite">
          {t('list.showingRange', { from, to, total })}
        </span>
        <label className="flex items-center gap-1.5">
          <span className="hidden sm:inline">{t('list.perPage')}</span>
          {/* ⚠️ Xom `<select>` EMAS — chrome `ui/Select` dan keladi, aks holda
              bu tanlagich mavzu tokenlaridan chetda qolardi. */}
          <Select
            value={String(size)}
            onChange={(e) => onSize(Number(e.target.value))}
            aria-label={t('list.perPage')}
            options={PAGE_SIZE_OPTIONS.map((s) => ({ value: String(s), label: String(s) }))}
            className="h-control-sm !px-2 !pr-7 text-xs"
            wrapperClassName="w-[72px]"
          />
        </label>
      </div>

      <nav aria-label={t('list.pagination')} className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1 || loading}
          aria-label={t('list.prevPage')}
          className="grid h-8 w-8 place-items-center rounded-md border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>

        {pageList(page, Math.max(1, pages)).map((p, i) =>
          p === null ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-fg-subtle">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-label={t('list.goToPage', { page: p })}
              aria-current={p === page ? 'page' : undefined}
              className={cn(
                'h-8 min-w-8 rounded-md px-2 text-[13px] font-medium tabular-nums transition-colors',
                p === page
                  ? 'bg-brand text-fg-on-brand'
                  : 'border border-line text-fg-muted hover:bg-surface-2 hover:text-fg',
              )}
            >
              {p}
            </button>
          ),
        )}

        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages || loading}
          aria-label={t('list.nextPage')}
          className="grid h-8 w-8 place-items-center rounded-md border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </nav>
    </div>
  )
}
