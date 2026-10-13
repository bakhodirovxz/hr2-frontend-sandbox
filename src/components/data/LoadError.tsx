import { useTranslation } from 'react-i18next'
import { AlertTriangle, Lock } from 'lucide-react'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { errorMessage, isModuleBlocked } from '@/api/errorMessage'

/**
 * "The request failed" — as distinct from "there is nothing here".
 *
 * `DataTable` already draws this, and every one of its call sites passes
 * `error`/`onRetry`. But roughly twenty panels are plain `<ul>`s, cards or
 * pickers, and they all fall back to their EMPTY state when a query fails —
 * so a 403 or a timeout reads as a fact about the data.
 *
 * That is at its worst on screens whose whole purpose is to report a problem:
 * the HR data-quality page drew a green tick and "no issues found" when its
 * request errored. A person acts on that.
 *
 * Render this INSTEAD of the empty state whenever `error` is set. It repeats
 * `DataTable`'s wording so the two never drift apart.
 */
export function LoadError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  // TZ E3 1729: bloklangan modul — «yuklab bo'lmadi» emas, alohida holat.
  const blocked = isModuleBlocked(error)
  return (
    <EmptyState
      icon={blocked ? <Lock size={22} className="text-warning" /> : <AlertTriangle size={22} className="text-danger" />}
      title={blocked ? t('sysOps.moduleBlockedTitle') : t('list.loadFailed')}
      description={errorMessage(error, t('list.loadFailedHint'))}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : undefined
      }
    />
  )
}
