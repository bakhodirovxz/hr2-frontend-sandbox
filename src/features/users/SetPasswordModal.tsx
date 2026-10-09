import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { FormError } from '@/components/ui/FormError'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordStrength'
import { useUserMutations, type UserAdminRow } from './useUserAdmin'

/**
 * Administrator parol o'rnatadi (TZ A3). Parol vaqtinchalik — egasi keyingi
 * kirishda almashtiradi; backend uning faol sessiyalarini yopadi.
 */
export function SetPasswordModal({ target, onClose }: { target: UserAdminRow | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const { setPassword } = useUserMutations()
  const [password, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setPw('')
    setConfirm('')
    setShow(false)
    setError('')
  }, [target])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!target) return
    if (password.length < PASSWORD_MIN_LENGTH) return setError(t('userAdmin.errPasswordShort'))
    if (password !== confirm) return setError(t('userAdmin.errPasswordMismatch'))
    setError('')
    try {
      await setPassword.mutateAsync({ id: target.id, password })
      toast.ok(t('userAdmin.passwordSet'))
      onClose()
    } catch (err) {
      setError(errorMessage(err, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      size="sm"
      title={t('userAdmin.setPassword')}
      description={target?.full_name || target?.username}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={setPassword.isPending}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<KeyRound size={15} />} loading={setPassword.isPending} onClick={() => void submit()}>
            {t('userAdmin.setPasswordDo')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <Field label={t('userAdmin.newPassword')} required>
          <Input
            type={show ? 'text' : 'password'}
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPw(e.target.value)}
            rightSlot={
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        </Field>
        <PasswordStrength value={password} username={target?.username} className="-mt-2" />
        <Field label={t('userAdmin.repeatPassword')} required>
          <Input
            type={show ? 'text' : 'password'}
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <FormError className="text-sm">{error}</FormError>
        <p className="m-0 text-xs text-fg-muted">{t('userAdmin.passwordSessionsHint')}</p>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}
