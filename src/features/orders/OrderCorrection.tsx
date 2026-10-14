import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FilePen, Lock, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'

/**
 * TZ O2 1224 «Приказ утверждён — система блокирует редактирование и
 * предлагает создать корректирующий приказ». Shown when an edit / delete
 * comes back 409 `order_locked`; «Tuzatuvchi buyruq» opens the create form
 * filled from `GET /order-acts/{pk}/corrective-draft`.
 */
export function OrderLockedDialog({
  open,
  number,
  canCorrect,
  onClose,
  onCorrect,
}: {
  open: boolean
  number?: string | number | null
  canCorrect: boolean
  onClose: () => void
  onCorrect: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('ordVac.lockedTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {canCorrect ? t('common.cancel') : t('common.close')}
          </Button>
          {canCorrect && (
            <Button leftIcon={<FilePen size={15} />} onClick={onCorrect}>
              {t('ordVac.createCorrective')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-pill bg-warning-soft text-warning">
          <Lock size={17} />
        </span>
        <div className="space-y-1.5 text-[13.5px]">
          <p className="font-semibold text-fg">{t('ordVac.lockedText', { n: number ?? '—' })}</p>
          <p className="text-fg-muted">{canCorrect ? t('ordVac.lockedHint') : t('ordVac.lockedHintNoRight')}</p>
        </div>
      </div>
    </Modal>
  )
}

/**
 * TZ O2 1224 «Приказ на согласовании — предлагает отозвать приказ с
 * согласования»: back to draft, signatures cleared; the reason is optional and
 * goes to the history and to the approvers' notification.
 */
export function WithdrawOrderModal({
  open,
  number,
  loading,
  onClose,
  onSubmit,
  forEdit = false,
}: {
  open: boolean
  number?: string | number | null
  loading: boolean
  /** Opened by «Tahrirlash» on an order out for approval (TZ O2 1224). */
  forEdit?: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  useEffect(() => {
    if (open) setReason('')
  }, [open])
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('ordVac.withdrawTitle')}
      description={number ? t('orders.orderNo', { n: number }) : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="secondary" leftIcon={<Undo2 size={15} />} loading={loading} onClick={() => onSubmit(reason.trim())}>
            {t('ordVac.withdraw')}
          </Button>
        </>
      }
    >
      {forEdit && (
        <p role="alert" className="mb-3 rounded-inner border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] text-warning">
          {t('ordVac.inApprovalText')}
        </p>
      )}
      <p className="mb-3 text-[13px] text-fg-muted">{t('ordVac.withdrawHint')}</p>
      <Field label={t('ordVac.withdrawReason')}>
        <Textarea rows={3} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder={t('ordVac.optional')} />
      </Field>
    </Modal>
  )
}
