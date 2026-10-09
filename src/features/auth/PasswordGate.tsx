import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, KeyRound, ShieldAlert, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { useToast } from '@/components/ui/Toast'
import { apiPatch } from '@/api/http'
import { AUTH_ME_PASSWORD } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { checkPassword } from '@/lib/passwordStrength'
import { useAuthStore } from '@/store/authStore'
import { useLogout } from '@/hooks/useAuth'

/**
 * The password-rotation gate (2026-09-15).
 *
 * `/auth/me` says `password_must_change` when the password is older than
 * `security.password_max_age_days` (or is a temporary one while that switch
 * is on). From that moment the server answers every other route with 403
 * `password_expired`, so there is nothing else this shell could usefully
 * show: the dialog cannot be dismissed, the only exits are a new password or
 * logging out. A successful change revokes EVERY session (the server has
 * always done that), so the person is sent back to the login page to sign in
 * with the new one — better than letting the next request fail with a 401.
 *
 * Below the threshold (`password_days_left` ≤ 14) the same component draws a
 * one-line warning strip instead, dismissable for the session.
 */
export function PasswordGate() {
  const user = useAuthStore((s) => s.user)
  if (!user) return null
  if (user.password_must_change) return <ForcedChangeModal expired={!!user.password_expired} />
  if (typeof user.password_days_left === 'number' && user.password_days_left <= 14) {
    return <ExpiryStrip days={user.password_days_left} />
  }
  return null
}

const WARN_DISMISS_KEY = 'pw-expiry-strip-dismissed'

function ExpiryStrip({ days }: { days: number }) {
  const { t } = useTranslation()
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem(WARN_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (hidden) return null
  const dismiss = () => {
    setHidden(true)
    try {
      sessionStorage.setItem(WARN_DISMISS_KEY, '1')
    } catch {
      /* ignore */
    }
  }
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[60] flex items-center justify-center gap-3 border-t border-warning/40 bg-warning-soft px-4 py-2 text-[13px] text-fg sm:bottom-4 sm:left-1/2 sm:right-auto sm:w-auto sm:-translate-x-1/2 sm:rounded-xl sm:border sm:shadow-pop"
    >
      <ShieldAlert size={16} className="shrink-0 text-warning" />
      <span>{days > 0 ? t('password.expiresIn', { count: days }) : t('password.expiresToday')}</span>
      <Link to="/sozlamalar" className="font-semibold text-brand-strong hover:underline">
        {t('password.changeNow')}
      </Link>
      <button type="button" onClick={dismiss} aria-label={t('common.close')} className="grid h-6 w-6 place-items-center rounded text-fg-muted hover:bg-surface-2 hover:text-fg">
        <X size={14} />
      </button>
    </div>
  )
}

function ForcedChangeModal({ expired }: { expired: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const logout = useLogout()
  const username = useAuthStore((s) => s.user?.username)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPatch(AUTH_ME_PASSWORD, body),
    onSuccess: () => {
      toast.ok(t('password.changedRelogin'))
      // Every session is revoked server-side; a clean sign-in beats a 401.
      logout()
    },
    onError: (e) => setError(errorMessage(e, t('settings.passwordFailed'))),
  })

  const check = checkPassword(next, username)
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!current.trim()) return setError(t('profile.currentPasswordRequired'))
    if (check.failed.length) return setError(t('password.notStrongEnough'))
    if (next !== confirm) return setError(t('password.mismatch'))
    save.mutate({ password: next, current_password: current.trim(), password_change_warning: false })
  }

  return (
    <Modal
      open
      dismissable={false}
      onClose={() => {}}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <KeyRound size={16} className="text-brand" />
          {t('password.mustChangeTitle')}
        </span>
      }
      description={expired ? t('password.mustChangeExpired') : t('password.mustChangeTemporary')}
      footer={
        <>
          <Button variant="ghost" onClick={logout} disabled={save.isPending}>
            {t('header.logout')}
          </Button>
          <Button type="submit" form="forced-password-form" loading={save.isPending}>
            {t('settings.changePassword')}
          </Button>
        </>
      }
    >
      <form id="forced-password-form" onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label={t('settings.currentPassword')} required>
          <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </Field>
        <Field label={t('settings.newPassword')} required>
          <Input
            type={show ? 'text' : 'password'}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            rightSlot={
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? t('login.hidePassword') : t('login.showPassword')}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            }
          />
        </Field>
        <PasswordStrength value={next} username={username} className="-mt-2" />
        <Field label={t('password.confirm')} required error={confirm && confirm !== next ? t('password.mismatch') : undefined}>
          <Input type={show ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
        )}
      </form>
    </Modal>
  )
}
