import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { canRunHikSync, useHikAccessLists, useHikSync } from './useDevices'

/**
 * THE HIKCENTRAL APPLIANCE, AS A WHOLE.
 *
 * Everything here is organisation-wide by nature: the sync re-reads the entire
 * appliance and rewrites every branch's devices, doors and privilege groups.
 * That is why the action is behind a global-administrator check while the
 * privilege-group LIST beside it is not — a branch helpdesk still needs to see
 * which access groups exist in order to place their own branch in one.
 *
 * The groups are shown next to the button on purpose: they are the visible
 * result of the last sync, so an operator can tell whether the appliance
 * actually answered without hunting through the audit log.
 */
export function HikSyncModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const canSync = canRunHikSync(user)
  const { accessLists, loading, refetch } = useHikAccessLists(open)
  const sync = useHikSync()

  const run = async () => {
    if (!(await confirm({ kind: 'action', confirmLabel: t('turnstiles.syncRun') }))) return
    try {
      await sync.mutateAsync()
      await refetch()
      toast.ok(t('turnstiles.syncDone'))
    } catch (e) {
      toast.error(errorMessage(e, t('turnstiles.syncFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('turnstiles.syncTitle')}
      description={t('turnstiles.syncHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sync.isPending}>{t('common.close')}</Button>
          {canSync && (
            <Button leftIcon={<RefreshCw size={14} />} loading={sync.isPending} onClick={run}>
              {t('turnstiles.syncRun')}
            </Button>
          )}
        </>
      }
    >
      {!canSync && (
        <p className="mb-3 rounded-lg bg-warning-soft px-3 py-2 text-[12px] text-fg">{t('turnstiles.syncGlobalOnly')}</p>
      )}

      <p className="mb-2 text-[13px] font-semibold text-fg">{t('turnstiles.accessLists')}</p>
      {loading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : accessLists.length === 0 ? (
        <EmptyState title={t('turnstiles.accessListsEmpty')} description={t('turnstiles.accessListsEmptyHint')} />
      ) : (
        <ul className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
          {accessLists.map((g) => (
            <li key={g.id} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{g.privilege_group_name || `#${g.id}`}</span>
              <Badge tone="neutral">{g.privilege_group_id || '—'}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
