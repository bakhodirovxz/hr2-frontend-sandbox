import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { CheckCircle2, Lock, LockOpen, PauseCircle } from 'lucide-react'
import { Badge, Button, Field, Modal, Textarea, useToast } from '@/components/ui'
import { DateTimeInput } from '@/components/ui/DateTimeInput'
import { FormError } from '@/components/ui/FormError'
import { LoadError } from '@/components/data/LoadError'
import { useConfirm } from '@/components/data/useConfirm'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { inUtc } from '@/lib/format'
import { serviceLabel } from './serviceLabel'
import { useServiceAvailability, useSetServiceAvailability, type ServiceAvailability } from './useServices'

/**
 * XIZMATNI VAQTINCHA YOPISH — TZ I1 1610 «Услуга временно недоступна —
 * запускается при технических работах или ограничениях».
 *
 * Har xizmat turi alohida: yopish (sabab majburiy, muddat ixtiyoriy — muddat
 * o'tgach xizmat o'zi ochiladi) va qayta ochish. Yopiq xizmatga so'rov server
 * tomonida 503 `service_unavailable` bilan rad etiladi; katalog va yangi so'rov
 * formasi sababni ko'rsatadi. Darvoza — `services = full` (kadr, bosh admin).
 */
export function ServiceAvailabilityPanel() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { items, loading, error, refetch } = useServiceAvailability(true)
  const save = useSetServiceAvailability()
  const [closing, setClosing] = useState<ServiceAvailability | null>(null)

  const reopen = async (s: ServiceAvailability) => {
    const ok = await confirm({
      kind: 'action',
      title: t('sysOps.svcReopenTitle'),
      description: t('sysOps.svcReopenConfirm', { name: serviceLabel(s.type, s.label) }),
      confirmLabel: t('sysOps.svcReopen'),
    })
    if (!ok) return
    try {
      await save.mutateAsync({ type: s.type, body: { enabled: true } })
      toast.ok(t('sysOps.svcReopened'))
    } catch {
      /* global toast */
    }
  }

  if (loading) return <CenteredSpinner />
  if (error) return <LoadError error={error} onRetry={() => void refetch()} />

  return (
    <div className="p-4">
      <p className="mb-3 max-w-3xl text-[12.5px] text-fg-muted">{t('sysOps.svcAvailabilityHint')}</p>
      <ul className="divide-y divide-line/70 overflow-hidden rounded-inner border border-line">
        {items.map((s) => (
          <li key={s.type} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[13.5px] font-semibold text-fg">{serviceLabel(s.type, s.label)}</span>
                {s.enabled ? (
                  <Badge tone="success">
                    <CheckCircle2 size={12} className="mr-1 inline" aria-hidden />
                    {t('sysOps.svcOpen')}
                  </Badge>
                ) : (
                  <Badge tone="warning">
                    <PauseCircle size={12} className="mr-1 inline" aria-hidden />
                    {t('sysOps.svcClosed')}
                  </Badge>
                )}
              </span>
              {!s.enabled && (
                <span className="mt-1 block text-[12.5px] text-fg-muted">
                  {s.reason || '—'}
                  {s.until ? ` · ${t('sysOps.svcUntil', { date: inUtc(s.until) })}` : ` · ${t('sysOps.svcUntilReopen')}`}
                </span>
              )}
            </span>
            {s.enabled ? (
              <Button size="sm" variant="outline" leftIcon={<Lock size={14} />} onClick={() => setClosing(s)}>
                {t('sysOps.svcClose')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<LockOpen size={14} />}
                loading={save.isPending && save.variables?.type === s.type}
                onClick={() => void reopen(s)}
              >
                {t('sysOps.svcReopen')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <CloseServiceModal service={closing} onClose={() => setClosing(null)} />
    </div>
  )
}

function CloseServiceModal({ service, onClose }: { service: ServiceAvailability | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const save = useSetServiceAvailability()
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [openedFor, setOpenedFor] = useState<string | null>(null)

  // Har ochilishda bo'sh forma (render paytida — effekt bir kadr kech qoladi).
  if (service && openedFor !== service.type) {
    setOpenedFor(service.type)
    setReason('')
    setUntil('')
    setErrors({})
    setFormError(null)
  }
  if (!service && openedFor !== null) setOpenedFor(null)

  const submit = async () => {
    if (!service) return
    const next: Record<string, string> = {}
    if (!reason.trim()) next.reason = t('sysOps.svcReasonRequired')
    if (until && !until.includes('T')) next.until = t('sysOps.svcUntilTime')
    else if (until && dayjs(until).isBefore(dayjs())) next.until = t('sysOps.svcUntilPast')
    setErrors(next)
    if (Object.keys(next).length) return
    setFormError(null)
    try {
      await save.mutateAsync({
        type: service.type,
        body: {
          enabled: false,
          reason: reason.trim(),
          // Toshkent vaqti — server zonasiz qiymatni UTC deb o'qiydi.
          until: until ? `${until}:00+05:00` : null,
        },
      })
      toast.ok(t('sysOps.svcClosedOk'))
      onClose()
    } catch (e) {
      const fields = errorCode(e) === 'validation_error' ? errorParams(e).fields : null
      if (fields && typeof fields === 'object') setErrors(fields as Record<string, string>)
      setFormError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!service}
      onClose={onClose}
      size="sm"
      title={t('sysOps.svcCloseTitle', { name: service ? serviceLabel(service.type, service.label) : '' })}
      description={t('sysOps.svcCloseHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" loading={save.isPending} onClick={() => void submit()} leftIcon={<Lock size={14} />}>
            {t('sysOps.svcClose')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label={t('sysOps.svcReason')} required error={errors.reason}>
          <Textarea
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (errors.reason) setErrors((x) => ({ ...x, reason: '' }))
            }}
            placeholder={t('sysOps.svcReasonPh')}
          />
        </Field>
        <Field label={t('sysOps.svcUntilLabel')} hint={t('sysOps.svcUntilHint')} error={errors.until}>
          <DateTimeInput value={until} onChange={setUntil} invalid={!!errors.until} aria-label={t('sysOps.svcUntilLabel')} />
        </Field>
      </div>
      <FormError className="mt-3">{formError}</FormError>
    </Modal>
  )
}
