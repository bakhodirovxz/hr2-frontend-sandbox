import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { Segmented } from '@/components/ui/Segmented'
import type { ScopeDef } from './scopes'

/**
 * "Whose documents am I looking at" — the row above the type tabs.
 *
 * Visually distinct from the type tabs below it (pill-shaped, on a tinted
 * track) because the two answer different questions: this one is the audience,
 * the one under it is the document kind. Two identical tab strips stacked would
 * read as one confusing double row.
 */
export function ScopeTabs<T extends string>({
  scopes,
  value,
  onChange,
  className,
}: {
  scopes: ScopeDef<T>[]
  value: T
  onChange: (scope: T) => void
  className?: string
}) {
  const { t } = useTranslation()
  // One option is not a choice — hide the strip entirely rather than show a
  // single dead pill.
  if (scopes.length < 2) return null

  return (
    <Segmented
      variant="brand"
      aria-label={t('documents.scopeLabel')}
      // Phone: one swipeable row — wrapped, six scopes took three lines above the list.
      className={cn('sm:flex-wrap', className)}
      value={value}
      onChange={onChange}
      options={scopes.map((s) => ({
        value: s.key,
        label: t(`documents.scope.${String(s.label)}` as 'documents.scopeLabel'),
      }))}
    />
  )
}
