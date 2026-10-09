import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Archive } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { Skeleton } from '@/components/ui/Skeleton'
import { errorMessage } from '@/api/errorMessage'
import { useEmployeeArchive, useEmployeeRelatedData } from './useEmployees'

/**
 * TAKING SOMEONE OFF THE ESTABLISHMENT.
 *
 * Two things made this worth its own dialog rather than a plain confirm. First,
 * the server ARCHIVES rather than deletes — the record and everything hanging
 * off it stay readable — and the wording has to say so, or personnel avoid the
 * button. Second, a reason is mandatory (the audit log records it), and the
 * dialog shows WHAT is attached to the person first, because "3 orders, 2
 * leave requests" is the thing that makes someone stop and check.
 */
export function ArchiveEmployeeModal({
  employeeId,
  employeeName,
  open,
  onClose,
  onDone,
}: {
  employeeId: number | null
  employeeName?: string | null
  open: boolean
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const archive = useEmployeeArchive()
  const { items, loading } = useEmployeeRelatedData(employeeId, open)

  const submit = async () => {
    if (reason.trim().length < 3) {
      setError(t('employees.archiveReasonRequired'))
      return
    }
    try {
      await archive.mutateAsync({ id: employeeId as number, reason: reason.trim() })
      setReason('')
      setError(null)
      onClose()
      onDone(t('employees.archived'))
    } catch (e) {
      setError(errorMessage(e, t('employees.archiveFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('employees.archiveTitle')}
      size="sm"
      description={employeeName ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={archive.isPending} leftIcon={<Archive size={15} />} onClick={submit}>
            {t('employees.archiveAction')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">{t('employees.archiveHint')}</p>

        {loading ? (
          <Skeleton className="h-16 w-full" />
        ) : items.length > 0 ? (
          <div className="rounded-lg border border-warning/30 bg-warning-soft p-3">
            <p className="mb-2 text-[13px] font-semibold text-warning">
              {t('employees.relatedTitle')}
            </p>
            <ul className="space-y-1 text-[13px] text-fg-muted">
              {items.map((r) => (
                <li key={r.key} className="flex justify-between gap-4">
                  <span>{r.label}</span>
                  <span className="tabular-nums font-semibold text-fg">{r.count}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Field label={t('employees.archiveReason')} required error={error ?? undefined}>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null) }}
          />
        </Field>
      </div>
    </Modal>
  )
}
