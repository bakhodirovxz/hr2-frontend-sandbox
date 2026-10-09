import { useTranslation } from 'react-i18next'
import { FilterX } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface FilterResetProps {
  /** Active filter count — usually `activeFilterCount` from `useListParams`. */
  count: number
  onReset: () => void
  className?: string
}

/**
 * "Clear filters (N)" — the one escape hatch every filtered list needs.
 * Renders nothing while no filter is active so the toolbar stays quiet.
 */
export function FilterReset({ count, onReset, className }: FilterResetProps) {
  const { t } = useTranslation()
  if (count === 0) return null
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onReset}
      leftIcon={<FilterX size={14} />}
      className={className}
    >
      {t('list.clearFilters')} ({count})
    </Button>
  )
}
