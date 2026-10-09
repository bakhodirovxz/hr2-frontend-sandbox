import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { PasswordStrength } from '@/components/ui/PasswordStrength'
import { checkPassword } from '@/lib/passwordStrength'
import { Field } from '@/components/ui/Field'
import { LogoMark } from '@/components/layout/Logo'
import { BackgroundDecor } from '@/components/layout/BackgroundDecor'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { publicClient } from '@/api/client'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { CONTROL_PAD, control } from '@/components/ui/control'
import { cn } from '@/lib/cn'

/**
 * PASSWORD RESET — a public page; the link in the e-mail lands here with the
 * token in the query string:  /reset-password?token=…
 *
 * The token is single-use and expires, so the three failure modes (missing,
 * stale, already spent) are answered with the SAME sentence: telling them
 * apart would leak whether a token was ever valid.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!token) setError(t('reset.badLink'))
  }, [token, t])

  // The server sends people to /login itself once the password is set; the
  // delay is only so the confirmation is readable.
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => navigate('/login', { replace: true }), 2200)
    return () => clearTimeout(id)
  }, [done, navigate])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!token) return setError(t('reset.badLink'))
    if (checkPassword(password).failed.length) return setError(t('password.notStrongEnough'))
    if (password !== confirm) return setError(t('reset.mismatch'))
    setBusy(true)
    try {
      await publicClient.post('auth/reset-password', { token, new_password: password })
      setDone(true)
    } catch (err) {
      // Yaroqsiz / eskirgan / ishlatilgan havola → 400 `invalid_reset_token`;
      // parol siyosati (harf+raqam, login emas, eskisiga teng emas) → 400/422
      // o'z kodi bilan — server matni ko'rsatiladi.
      const status = (err as { response?: { status?: number } })?.response?.status
      const code = errorCode(err)
      if ((status === 400 && (!code || code === 'invalid_reset_token')) || status === 404) setError(t('reset.badLink'))
      else if (status === 400 || status === 422) setError(errorMessage(err, t('reset.failed')))
      else setError(t('reset.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-page py-10">
      <BackgroundDecor />
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md rounded-card border border-line bg-surface p-card shadow-lg">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark />
          <div>
            <h1 className="text-lg font-semibold text-fg">{t('reset.title')}</h1>
            <p className="mt-1 text-[13px] text-fg-muted">{t('reset.subtitle')}</p>
          </div>
        </div>

        {done ? (
          <div className="flex items-start gap-2.5 rounded-inner border border-success/30 bg-success-soft px-3 py-3">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            <p className="text-[13px] text-fg">{t('reset.done')}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('reset.newPassword')} required hint={t('reset.hint')}>
              <div className={cn(control(), CONTROL_PAD, 'flex items-center gap-2')}>
                <Lock size={17} className="shrink-0 text-fg-subtle" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="text-fg-subtle transition-colors hover:text-fg"
                  aria-label={show ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            <PasswordStrength value={password} className="-mt-2" />

            <Field label={t('reset.confirm')} required>
              <div className={cn(control(), CONTROL_PAD, 'flex items-center gap-2')}>
                <Lock size={17} className="shrink-0 text-fg-subtle" />
                <input
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
                />
              </div>
            </Field>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!token}>
              {t('reset.submit')}
            </Button>
          </form>
        )}
        <p className="mt-5 text-center text-sm">
          <Link to="/login" className="font-medium text-brand-strong hover:underline">
            {t('authx.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  )
}

