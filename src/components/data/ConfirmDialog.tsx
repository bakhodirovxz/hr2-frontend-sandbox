import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description?: ReactNode
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}

/** Confirmation step for destructive or irreversible bulk actions. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  danger = false,
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      {description && <p className="text-sm leading-relaxed text-fg-muted">{description}</p>}
    </Modal>
  )
}
