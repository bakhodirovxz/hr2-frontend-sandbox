import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Phone } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { telHref, useSendFeedback, useSiteInfo } from '@/features/site/useSiteInfo'

/**
 * «Qayta aloqa» (TZ 439: «кнопка обратной связи»). `POST /feedback` —
 * backend butun tizim administratorlariga va yuboruvchining filial
 * administratoriga bildirishnoma yozadi. Qaysi sahifadan yozilgani ham
 * ketadi, administrator muammoni shu yerdan qayta ko'ra olsin.
 */
export function FeedbackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const location = useLocation()
  const site = useSiteInfo().data
  const send = useSendFeedback()
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [touched, setTouched] = useState(false)

  const close = () => {
    setSubject('')
    setMessage('')
    setTouched(false)
    onClose()
  }

  const submit = async () => {
    setTouched(true)
    if (!message.trim()) return
    try {
      await send.mutateAsync({
        subject: subject.trim() || undefined,
        message: message.trim(),
        page: location.pathname + location.search,
      })
      toast.ok(t('site.sent'))
      close()
    } catch (e) {
      toast.error(errorMessage(e, t('site.sendFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('site.feedback')}
      description={t('site.feedbackHint')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={send.isPending}>
            {t('site.send')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {site?.support_phone && (
          <p className="flex items-center gap-2 text-[13px] text-fg-muted">
            <Phone size={14} aria-hidden />
            {t('site.feedbackUrgent')}{' '}
            <a href={telHref(site.support_phone)} className="font-semibold text-brand hover:underline">
              {site.support_phone}
            </a>
          </p>
        )}
        <Field label={t('site.subject')}>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder={t('site.subjectPh')}
          />
        </Field>
        <Field
          label={t('site.message')}
          required
          error={touched && !message.trim() ? t('site.messageRequired') : undefined}
        >
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={4000}
            placeholder={t('site.messagePh')}
            aria-invalid={touched && !message.trim()}
          />
        </Field>
      </div>
    </Modal>
  )
}
