import { useTranslation } from 'react-i18next'
import { LogOut, MonitorSmartphone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { LoadError } from '@/components/data/LoadError'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { errorMessage } from '@/api/errorMessage'
import { inUtc } from '@/lib/format'
import { useUserMutations, useUserSessions, type UserAdminRow } from './useUserAdmin'

/**
 * TZ U2 789 «Принудительный выход — запускается администратором при
 * необходимости завершить сессию пользователя». Faol sessiyalar (qurilma,
 * IP, oxirgi faollik) va ularni yopish — bittasini yoki hammasini.
 */
export function UserSessionsModal({ target, onClose }: { target: UserAdminRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const sessions = useUserSessions(target?.id ?? null)
  const { revokeSessions } = useUserMutations()
  const rows = sessions.data ?? []

  const revoke = async (sessionId?: number) => {
    if (!target) return
    const ok = await confirm({
      kind: 'status',
      title: sessionId ? t('userAdmin.revokeOneTitle') : t('userAdmin.revokeAllTitle'),
      description: t('userAdmin.revokeConfirm', { name: target.full_name || target.username }),
      confirmLabel: t('userAdmin.revoke'),
    })
    if (!ok) return
    try {
      const res = await revokeSessions.mutateAsync({ id: target.id, sessionId })
      toast.ok(t('userAdmin.revoked', { count: res.revoked }))
    } catch (err) {
      toast.error(errorMessage(err, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="md"
      title={t('userAdmin.sessionsTitle', { name: target?.full_name || target?.username || '' })}
      description={t('userAdmin.sessionsHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            variant="danger"
            leftIcon={<LogOut size={15} />}
            disabled={!rows.length}
            loading={revokeSessions.isPending}
            onClick={() => void revoke()}
          >
            {t('userAdmin.revokeAll')}
          </Button>
        </>
      }
    >
      {sessions.isLoading ? (
        <CenteredSpinner />
      ) : sessions.error ? (
        <LoadError error={sessions.error} onRetry={() => void sessions.refetch()} />
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-fg-subtle">{t('userAdmin.sessionsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-line rounded-inner border border-line">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <MonitorSmartphone size={18} className="shrink-0 text-fg-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">
                  {s.device_name || s.user_agent || t('userAdmin.unknownDevice')}
                </p>
                <p className="truncate text-[11.5px] text-fg-subtle tabnum">
                  {[s.ip_address, s.last_active ? t('userAdmin.lastActive', { at: inUtc(s.last_active) }) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <IconButton size="sm" label={t('userAdmin.revokeOne')} onClick={() => void revoke(s.id)}>
                <LogOut size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
