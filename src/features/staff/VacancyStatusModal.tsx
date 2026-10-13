import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { Button, Field, Input, Modal, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { errorMessage } from '@/api/errorMessage'
import { useStaffMutations, type StaffPosition } from './useStaffPositions'

/**
 * TZ V2 1304 «Изменение статуса вакансии — приостановить или закрыть
 * вакансию с указанием причины». «To'xtatib turish» (`paused`: off the
 * public list, applications refused) and «Davom ettirish» (back to `open`);
 * the server wants a reason of at least 3 characters for either.
 */
export function VacancyStatusModal({
  target,
  onClose,
}: {
  target: { row: StaffPosition; status: 'paused' | 'open' } | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { update } = useStaffMutations()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pausing = target?.status === 'paused'

  useEffect(() => {
    if (!target) return
    setReason('')
    setError(null)
  }, [target])

  const submit = async () => {
    if (!target?.row.id) return
    if (reason.trim().length < 3) {
      setError(t('orgRef.reasonMin'))
      return
    }
    try {
      await update.mutateAsync({ id: target.row.id, body: { vacancy_status: target.status, reason: reason.trim() } })
      toast.ok(pausing ? t('ordVac.pausedOk') : t('ordVac.resumedOk'))
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('staff.saveFailed')))
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="sm"
      title={pausing ? t('ordVac.pauseTitle') : t('ordVac.resumeTitle')}
      description={target ? `${target.row.department_name ?? ''} · ${target.row.job_position_name ?? ''}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={pausing ? 'secondary' : 'primary'}
            leftIcon={pausing ? <Pause size={15} /> : <Play size={15} />}
            onClick={submit}
            loading={update.isPending}
          >
            {pausing ? t('ordVac.pause') : t('ordVac.resume')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-[13px] text-fg-muted">{pausing ? t('ordVac.pauseHint') : t('ordVac.resumeHint')}</p>
      <Field label={t('orgRef.reasonLabel')} required>
        <Input
          value={reason}
          autoFocus
          invalid={!!error}
          maxLength={1000}
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
