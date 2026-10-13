import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useArchiveSettings } from './useEmployees'

/**
 * TZ C4 1087 «…восстановить запись из архива в течение установленного срока»
 * — the term itself: `/system/settings/archive {restore_days}` (0 — restoring
 * is off). Site master administrator only, like the security policy.
 */
export function ArchiveSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { query, save } = useArchiveSettings(open)
  const [days, setDays] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && query.data) setDays(String(query.data.restore_days))
    if (!open) setError('')
  }, [open, query.data])

  const submit = async () => {
    const n = Number(days)
    if (days.trim() === '' || !Number.isInteger(n) || n < 0 || n > 3650) {
      setError(t('hrExt.archiveSettings.invalid'))
      return
    }
    setError('')
    try {
      await save.mutateAsync({ restore_days: n })
      toast.ok(t('hrExt.archiveSettings.saved'))
      onClose()
    } catch (err) {
      setError(errorMessage(err, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('hrExt.archiveSettings.title')}
      description={t('hrExt.archiveSettings.hint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending} disabled={!query.data}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {query.isLoading ? (
        <CenteredSpinner />
      ) : query.error ? (
        <p role="alert" className="text-[12.5px] text-danger">
          {errorMessage(query.error, t('common.actionFailed'))}
        </p>
      ) : (
        <Field label={t('hrExt.archiveSettings.days')} hint={t('hrExt.archiveSettings.daysHint')} required error={error || undefined}>
          <Input type="number" min={0} max={3650} value={days} invalid={!!error} onChange={(e) => setDays(e.target.value)} />
        </Field>
      )}
    </Modal>
  )
}
