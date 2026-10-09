import { useTranslation } from 'react-i18next'
import { isAxiosError } from 'axios'
import { FileDown, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useOrder, useOrderPdf } from './useOrders'

/**
 * The decree as a document (TZ O1/O3 «Печать»): the PDF the backend renders
 * from the decree .docx (`/order-acts/{id}/download-pdf`) plus a link to the
 * .docx itself. v1 `OrderDocumentViewer`.
 */
export function OrderDocumentViewer({ id, title, onClose }: { id: number | null; title: string; onClose: () => void }) {
  const { t } = useTranslation()
  const open = id != null
  const { order } = useOrder(id)
  const pdf = useOrderPdf(id, open)
  const docx = order?.document?.file_path ?? null
  const status = isAxiosError(pdf.error) ? pdf.error.response?.status : undefined

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="full"
      bodyFill
      title={title || t('orders.document')}
      footer={
        <>
          {docx && (
            <Button
              variant="secondary"
              leftIcon={<FileDown size={15} />}
              onClick={() => window.open(docx, '_blank', 'noopener,noreferrer')}
            >
              {t('orders.downloadDocx')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      <div className="flex h-[min(78vh,900px)] w-full items-center justify-center bg-surface-2/40">
        {pdf.loading ? (
          <Spinner />
        ) : pdf.url ? (
          <iframe title={title || t('orders.document')} src={pdf.url} className="h-full w-full border-0 bg-white" />
        ) : (
          <EmptyState
            icon={<FileText size={22} />}
            title={status === 500 ? t('orders.pdfNotReady') : pdf.error ? t('orders.pdfFailed') : t('orders.documentMissing')}
          />
        )}
      </div>
    </Modal>
  )
}
