import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff } from 'lucide-react'
import { apiPatch } from '@/api/http'
import { AUTH_ME_PASSWORD } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { useToast } from '@/components/ui/Toast'
import { useLogout } from '@/hooks/useAuth'
import { checkPassword } from '@/lib/passwordStrength'
import { useAuthStore } from '@/store/authStore'

/**
 * «Parolni o'zgartirish» (TZ 4.2.4 · 1934): joriy parol + yangi parol ikki
 * marta → `PATCH /auth/me/password`. Kartasi bo'lmagan hisoblar (administrator,
 * mehmon) ham shu yo'ldan foydalanadi. Server muvaffaqiyatdan so'ng BARCHA
 * sessiyalarni (joriysini ham) bekor qiladi — shu bois foydalanuvchi kirish
 * sahifasiga qaytariladi va yangi parol bilan kiradi.
 */
export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const logout = useLogout()
  const username = useAuthStore((s) => s.user?.username)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Har ochilishda toza boshlanadi — oldingi kiritilgan parol formada qolmasin.
  useEffect(() => {
    if (!open) return
    setCurrent('')
    setNext('')
    setConfirm('')
    setError('')
  }, [open])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    if (!current || !next || !confirm) return setError(t('account.pwFillAll'))
    if (checkPassword(next, username).failed.length) return setError(t('password.notStrongEnough'))
    if (next !== confirm) return setError(t('password.mismatch'))
    setError('')
    setSaving(true)
    try {
      await apiPatch(AUTH_ME_PASSWORD, { current_password: current, password: next, password_change_warning: false })
      toast.ok(t('password.changedRelogin'))
      onClose()
      logout()
    } catch (err) {
      setError(errorMessage(err, t('account.pwFailed')))
    } finally {
      setSaving(false)
    }
  }

  const eye = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
      className="text-fg-subtle hover:text-fg"
    >
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t('account.pwTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="change-password-form" loading={saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="change-password-form" onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('account.currentPassword')} required>
          <Input
            type={show ? 'text' : 'password'}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder={t('account.pwCurrentPlaceholder')}
            autoComplete="current-password"
            rightSlot={eye}
          />
        </Field>
        <Field label={t('account.pwNew')} required>
          <Input
            type={show ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder={t('account.pwNewPlaceholder')}
            autoComplete="new-password"
          />
        </Field>
        <PasswordStrength value={next} username={username} className="-mt-2" />
        <Field label={t('account.pwConfirm')} required error={confirm && confirm !== next ? t('password.mismatch') : undefined}>
          <Input
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={t('account.pwConfirmPlaceholder')}
            autoComplete="new-password"
          />
        </Field>
        <p className="text-xs text-fg-subtle">{t('account.pwNote')}</p>
        <FormError>{error}</FormError>
      </form>
    </Modal>
  )
}
