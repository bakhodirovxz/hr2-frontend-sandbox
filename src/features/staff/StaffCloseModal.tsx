import { useEffect, useState } from 'react'
import { lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { Button, Field, Input, Modal, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { errorMessage } from '@/api/errorMessage'
import { useStaffMutations, type StaffPosition } from './useStaffPositions'

/**
 * Reduce («qisqartirish») or reopen a staff line — TZ V2 «Изменение статуса
 * ... с указанием причины». Not a delete: the line stays with its history and
 * simply leaves the vacancy list and the totals. The server refuses a reason
 * shorter than 3 characters (422 `reason_required`).
 */
export function StaffCloseModal({ row, onClose }: { row: StaffPosition | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { setClosed } = useStaffMutations()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const reopening = !!row?.is_closed

  useEffect(() => {
    if (!row) return
    setReason('')
    setError(null)
  }, [row])

  const submit = async () => {
    if (!row?.id) return
    if (reason.trim().length < 3) {
      setError(t('orgRef.reasonMin'))
      return
    }
    try {
      await setClosed.mutateAsync({ id: row.id, closed: !reopening, reason: reason.trim() })
      toast.ok(reopening ? t('staff.reopened') : t('orgRef.reducedOk'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('staff.saveFailed')))
    }
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      size="sm"
      title={reopening ? t('orgRef.reopenReasonTitle') : t('orgRef.reduceReasonTitle')}
      description={row ? `${lt(row.department_name)} · ${lt(row.job_position_name)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={setClosed.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant={reopening ? 'primary' : 'danger'} onClick={submit} loading={setClosed.isPending}>
            {reopening ? t('staff.reopen') : t('orgRef.reduce')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-fg-muted">{reopening ? t('staff.reopenConfirm') : t('staff.closeConfirm')}</p>
      <Field label={t('orgRef.reasonLabel')} required>
        <Input
          value={reason}
          autoFocus
          invalid={!!error}
          placeholder={t('orgRef.reasonPlaceholder')}
          onChange={(e) => {
            setReason(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
        />
      </Field>
      <FormError className="mt-2">{error}</FormError>
    </Modal>
  )
}
