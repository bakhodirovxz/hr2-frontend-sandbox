import { useTranslation } from 'react-i18next'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'

interface FilterToggleProps {
  open: boolean
  onToggle: () => void
  /** Number of filters currently applied — shown as a badge so a collapsed
   *  panel never hides the fact that the list is narrowed. */
  count: number
  className?: string
}

/**
 * The button that folds a filter block away.
 *
 * On the master–detail screens (orders, letters) the filter block sat
 * permanently above the list and ate roughly a third of the left column —
 * search, category, person, two dates and a status — before a single row was
 * visible. Search stays out because it is the one control used on every visit;
 * the rest lives behind this toggle.
 *
 * The count badge is the important part: a collapsed panel with three filters
 * active would otherwise look like an unfiltered list that is mysteriously
 * short. The panel also opens itself whenever a filter is active on arrival
 * (deep link, back navigation) — see the caller.
 */
export function FilterToggle({ open, onToggle, count, className }: FilterToggleProps) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant={count > 0 ? 'secondary' : 'ghost'}
      size="sm"
      onClick={onToggle}
      aria-expanded={open}
      leftIcon={<SlidersHorizontal size={14} />}
      rightIcon={
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      }
      className={className}
    >
      {t('list.filters')}
      {count > 0 && (
        <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-semibold leading-4 text-fg-on-brand">
          {count}
        </span>
      )}
    </Button>
  )
}
