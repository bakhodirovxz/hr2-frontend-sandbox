import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'

/** «Rad etish» with a required reason (the decree's `comment`). */
export function RejectReasonModal({
  open,
  loading,
  onClose,
  onSubmit,
}: {
  open: boolean
  loading: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    if (open) {
      setReason('')
      setError('')
    }
  }, [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('orders.rejectTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            loading={loading}
            onClick={() => (reason.trim() ? onSubmit(reason.trim()) : setError(t('orders.rejectReasonRequired')))}
          >
            {t('orders.reject')}
          </Button>
        </>
      }
    >
      <Field label={t('orders.rejectReason')} required error={error}>
        <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} invalid={!!error} autoFocus />
      </Field>
    </Modal>
  )
}
