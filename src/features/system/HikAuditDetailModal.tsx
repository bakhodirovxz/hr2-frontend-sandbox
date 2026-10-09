import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime } from '@/lib/format'
import type { HikAuditRow } from './useDevices'

/**
 * ONE LINE OF THE HIKCENTRAL AUDIT LOG, OPENED UP.
 *
 * The list can only show the shape of a failure; the reason usually lives in
 * `message` or in the raw `details` blob the integration stored. Both are shown
 * verbatim — this screen is for diagnosing why a person never reached a
 * terminal, and a prettified summary would be the wrong thing to reason from.
 *
 * `personal_identification_number` and `details` arrive already masked or
 * dropped according to the viewer's PII level (the panel is open to helpdesk
 * accounts that may not read personal ids). They are rendered exactly as
 * received — nothing here tries to recover a value the server withheld.
 */
export function HikAuditDetailModal({ row, onClose }: { row: HikAuditRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const ok = row?.result === 'ok'

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={t('hik.auditDetailTitle')}
      description={row ? formatDateTime(row.created_at) : ''}
      footer={<Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
    >
      {row && (
        <div className="space-y-3">
          <div className="grid gap-x-4 sm:grid-cols-2">
            <DetailRow label={t('hik.colOperation')} value={row.operation} />
            <DetailRow
              label={t('hik.colResult')}
              value={<Badge tone={ok ? 'success' : 'danger'}>{row.result || '—'}</Badge>}
            />
            <DetailRow label={t('hik.colEmployee')} value={row.employee_name} />
            <DetailRow label={t('hik.colPinfl')} value={row.personal_identification_number} />
            <DetailRow label={t('turnstiles.fieldBranch')} value={row.branch_name} />
            <DetailRow label={t('hik.colDevice')} value={row.turnstile_name} />
            <DetailRow label={t('hik.colAttempts')} value={row.attempts != null ? String(row.attempts) : null} />
            <DetailRow label="ID" value={String(row.id)} />
          </div>
          <DetailRow label={t('hik.colMessage')} value={row.message} />
          {row.details != null && (
            <div>
              <p className="mb-1 text-[12px] text-fg-muted">{t('hik.auditDetails')}</p>
              <pre className="scroll-thin max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 font-mono text-[11.5px] text-fg">
                {JSON.stringify(row.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="border-b border-line py-2 last:border-b-0">
      <p className="text-[12px] text-fg-muted">{label}</p>
      <div className="break-words text-[13px] text-fg">{value || '—'}</div>
    </div>
  )
}
