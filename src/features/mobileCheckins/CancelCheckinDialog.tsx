import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'

/** Server `MobileCheckinCancel.reason` bilan bir xil: kamida 3 belgi. */
const MIN_REASON = 3

/**
 * Telefon belgisini bekor qilish — sabab so'raladi (xodimga bildirishnoma
 * bilan boradi). Bitta belgi (lenta, ro'yxat qatori) va bir nechta belgi
 * (ro'yxatdagi tanlov) uchun bir xil oyna.
 */
export function CancelCheckinDialog({
  open,
  count = 1,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  count?: number
  loading?: boolean
  error?: string
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  const short = reason.trim().length < MIN_REASON
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={count > 1 ? t('mobileCheckins.cancelManyTitle', { count }) : t('mobileCheckins.cancelTitle')}
      description={t('mobileCheckins.cancelHint')}
      footer={
        <>
          {/* «Yopish», not «Bekor qilish»: the action itself IS «bekor qilish», and
              two buttons with the same word made the safe one unreadable. */}
          <Button variant="ghost" onClick={onClose} disabled={loading}>{t('common.close')}</Button>
          <Button variant="danger" loading={loading} disabled={short} onClick={() => onSubmit(reason.trim())}>
            {t('mobileCheckins.cancelConfirm')}
          </Button>
        </>
      }
    >
      <Field label={t('mobileCheckins.cancelReason')} required hint={t('mobileCheckins.cancelReasonHint')}>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
      </Field>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </Modal>
  )
}
