import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { errorMessage } from '@/api/errorMessage'
import { useSecurityPolicy, type SecurityPolicy } from './useUserAdmin'

/**
 * Xavfsizlik siyosati — faqat bosh administrator:
 *   · TZ U1 772 «Блокировка учётной записи» — necha ketma-ket noto'g'ri
 *     urinishdan keyin va qancha vaqtga;
 *   · TZ U2 789 «Автоматический выход» — necha daqiqa harakatsizlikdan keyin
 *     sessiya yopiladi (0 — o'chirilgan).
 */
export function SecurityPolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { query, save } = useSecurityPolicy(open)
  const [form, setForm] = useState<SecurityPolicy | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && query.data) setForm(query.data)
    if (!open) setError('')
  }, [open, query.data])

  const set = (k: keyof SecurityPolicy) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => (f ? { ...f, [k]: Number(e.target.value) } : f))

  const submit = async () => {
    if (!form) return
    setError('')
    try {
      await save.mutateAsync(form)
      toast.ok(t('userAdmin.policySaved'))
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
      title={t('userAdmin.policyTitle')}
      description={t('userAdmin.policyHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!form}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {!form ? (
        <CenteredSpinner />
      ) : (
        <div className="space-y-4">
          <Field label={t('userAdmin.policyMaxFailures')} hint={t('userAdmin.policyMaxFailuresHint')} required>
            <Input type="number" min={3} max={20} value={form.lockout_max_failures} onChange={set('lockout_max_failures')} />
          </Field>
          <Field label={t('userAdmin.policyLockMinutes')} required>
            <Input type="number" min={1} max={1440} value={form.lockout_minutes} onChange={set('lockout_minutes')} />
          </Field>
          <Field label={t('userAdmin.policyIdleMinutes')} hint={t('userAdmin.policyIdleHint')} required>
            <Input type="number" min={0} max={1440} value={form.idle_timeout_minutes} onChange={set('idle_timeout_minutes')} />
          </Field>
          {error && (
            <p role="alert" className="text-[12.5px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
