import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { CheckCircle2, Eye, EyeOff, KeyRound, Lock, QrCode, RefreshCw, ShieldCheck, User as UserIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { LogoMark } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { BackgroundDecor } from '@/components/layout/BackgroundDecor'
import { useLogin } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import type { AxiosError } from 'axios'
import { LABEL_CLS, control, CONTROL_PAD } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import type { QrTokens } from '@/features/auth/QrLoginPanel'

/**
 * ⚠️ LAZY. `LoginPage` is the one page kept EAGER in the entry chunk (it is the
 * cold-entry screen), so everything it imports statically is paid by every
 * visitor on every first load — and this panel drags in `qrcode.react`. QR is
 * the secondary tab: the reader has to choose it.
 */
const QrLoginPanel = lazy(() =>
  import('@/features/auth/QrLoginPanel').then((m) => ({ default: m.QrLoginPanel })),
)
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { LowVisionPanel } from '@/a11y/LowVisionPanel'
import { joinApiUrl, publicClient, resetAuthSession } from '@/api/client'
import { errorMessage } from '@/api/errorMessage'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { queryClient } from '@/api/queryClient'
import { AUTH_CAPTCHA } from '@/api/endpoints'

export function LoginPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setSession = useAuthStore((s) => s.setSession)
  const login = useLogin()
  /** TZ 4.2.3 — parol va QR ikkala yo'l ham beriladi. */
  const [mode, setMode] = useState<'password' | 'qr'>('password')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  /**
   * Adaptive CAPTCHA (self-hosted, `core/captcha.py`). Nobody sees it on a
   * clean login; after a few wrong passwords the server answers 401 with
   * `params.captcha_required` (or the code `captcha_required`), and from then
   * on every attempt carries a solved image. Each image is single-use, so a
   * failed attempt always fetches a fresh one.
   */
  const [captcha, setCaptcha] = useState<{ id: string; image: string } | null>(null)
  const [captchaAnswer, setCaptchaAnswer] = useState('')
  const [captchaBusy, setCaptchaBusy] = useState(false)
  /** Honeypot — a field the form never shows. Bots that fill every input fill it. */
  const [website, setWebsite] = useState('')

  const loadCaptcha = async () => {
    setCaptchaBusy(true)
    setCaptchaAnswer('')
    try {
      const { data } = await publicClient.get<{ captcha_id: string; image: string }>(`/${AUTH_CAPTCHA}`)
      setCaptcha({ id: data.captcha_id, image: data.image })
    } catch {
      setCaptcha(null)
    } finally {
      setCaptchaBusy(false)
    }
  }

  // The SSO callback cannot show its own error (it redirects here), so it hands
  // one over in the navigation state. Cleared immediately so a back/refresh
  // does not resurrect a stale message.
  const ssoError = (location.state as { ssoError?: string } | null)?.ssoError
  useEffect(() => {
    if (!ssoError) return
    setError(ssoError)
    navigate(location.pathname, { replace: true, state: {} })
  }, [ssoError, navigate, location.pathname])

  /**
   * OneID (YaIT single sign-on). A FULL-PAGE navigation, not fetch: the
   * backend answers with a 302 to the national identity provider, and an XHR
   * cannot follow that across origins.
   */
  const oneIdLogin = () => {
    window.location.href = joinApiUrl('sso/login')
  }

  const from = (location.state as { from?: Location } | null)?.from
  const redirectTo = from ? `${from.pathname}${from.search || ''}` : '/'

  if (isAuthenticated) return <Navigate to={redirectTo} replace />

  const onQrSuccess = (tokens: QrTokens) => {
    resetAuthSession()
    // QR javobida foydalanuvchi obyekti yo'q — `auth/me` uni o'zi tortadi.
    setSession({ access_token: tokens.access_token, expires_in: tokens.expires_in })
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    navigate(redirectTo, { replace: true })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError(t('login.fillAllFields'))
      return
    }
    if (captcha && !captchaAnswer.trim()) {
      setError(t('login.captchaRequired'))
      return
    }
    try {
      await login.mutateAsync({
        username,
        password,
        website,
        captchaId: captcha?.id,
        captchaAnswer: captcha ? captchaAnswer : undefined,
      })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const data = (err as AxiosError<{ detail?: string; code?: string; params?: { captcha_required?: boolean } }>)?.response?.data
      const code = data?.code
      if (code === 'captcha_required' || code === 'captcha_invalid' || data?.params?.captcha_required) {
        // A fresh image either way: the previous one was consumed by this attempt.
        void loadCaptcha()
      }
      if (code === 'captcha_required') setError(t('login.captchaRequired'))
      else if (code === 'captcha_invalid') setError(t('login.captchaInvalid'))
      else setError(errorMessage(err, t('login.wrongCredentials')))
    }
  }

  return (
    <div className="grid h-full w-full lg:grid-cols-2">
      {/* The housing (desktop).
          PROPUSK world: signing in happens AT THE GATE, so the left half is the
          machined housing and the right half is the sheet you fill in. The old
          world's indigo gradient, its two blurred colour blobs and its hydro
          line-art went with it — a photograph of a dam behind a login form is
          decoration, and this panel now carries the same metal the sidebar is
          made of, ruled like the register it opens into. */}
      <div
        className="relative hidden overflow-hidden lg:block"
        style={{ background: 'rgb(var(--housing))' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(180deg, rgb(var(--housing-rule)) 0 1px, transparent 1px 34px)',
            maskImage: 'linear-gradient(200deg, rgb(0 0 0 / 0.85), transparent 72%)',
            WebkitMaskImage: 'linear-gradient(200deg, rgb(0 0 0 / 0.85), transparent 72%)',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <LogoMark size={34} />
            <span
              className="text-[17px] font-bold tracking-[-0.02em]"
              style={{ color: 'rgb(var(--housing-fg))' }}
            >
              UGE<span style={{ color: 'rgb(var(--housing-muted))' }}>HR</span>
            </span>
          </div>
          <div className="max-w-md">
            <h1
              className="text-[38px] font-bold leading-[1.12] tracking-[-0.03em]"
              style={{ color: 'rgb(var(--housing-fg))' }}
            >
              {t('login.tagline')}
            </h1>
            <p
              className="mt-4 text-[15px] leading-relaxed"
              style={{ color: 'rgb(var(--housing-muted))' }}
            >
              {t('login.taglineSub')}
            </p>
          </div>
          <p className="engrave" style={{ color: 'rgb(var(--housing-muted))' }}>
            {t('login.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="app-bg relative flex items-center justify-center px-5 py-10">
        <BackgroundDecor variant="panel" />
        {/* TZ 4.1.7: til va kam ko'ruvchilar rejimi KIRISHDAN OLDIN ham
            kerak — foydalanuvchi o'qiy olmasa formani to'ldira olmaydi. */}
        <div className="absolute right-4 top-4 flex items-center gap-1">
          <LowVisionPanel />
          <LanguageSwitcher />
          <ThemeToggle />
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <LogoMark size={44} />
            <span className="mt-3 text-lg font-extrabold tracking-tight text-fg">
              UGE<span className="text-brand">HR</span>
            </span>
          </div>

          <h2 className="text-2xl font-bold text-fg">{t('login.welcome')}</h2>
          <p className="mt-1.5 text-sm text-fg-muted">{t('login.subtitle')}</p>

          {/* Kirish yo'lini tanlash — TZ 4.2.3 QR ni TALAB qiladi, parol esa
              zaxira yo'l bo'lib qoladi (telefoni yo'q foydalanuvchi uchun). */}
          <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1">
            {([
              { id: 'password' as const, icon: <KeyRound size={15} />, label: t('login.byPassword') },
              { id: 'qr' as const, icon: <QrCode size={15} />, label: t('login.byQr') },
            ]).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors',
                  mode === m.id ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
                )}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'qr' ? (
            <div className="mt-6">
              <Suspense fallback={<div className="grid h-72 place-items-center"><Spinner /></div>}>
                <QrLoginPanel onSuccess={onQrSuccess} />
              </Suspense>
            </div>
          ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className={LABEL_CLS}>{t('login.loginLabel')}</label>
              <div className={cn(control({ size: 'lg', focusWithin: true }), CONTROL_PAD.plain, 'flex items-center gap-2')}>
                <UserIcon size={17} className="text-fg-subtle" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('login.loginPlaceholder')}
                  autoComplete="username"
                  className="min-w-0 flex-1 bg-transparent text-control text-fg outline-none placeholder:text-fg-subtle"
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>{t('login.passwordLabel')}</label>
              <div className={cn(control({ size: 'lg', focusWithin: true }), CONTROL_PAD.plain, 'flex items-center gap-2')}>
                <Lock size={17} className="text-fg-subtle" />
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
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
            </div>

            {/* Honeypot. Off-screen rather than display:none — the cruder
                form-fillers skip hidden inputs but not invisible ones. Never
                focusable, never autofilled, never announced. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
              <label htmlFor="login-website">Website</label>
              <input
                id="login-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            {captcha && (
              <div>
                <label className={LABEL_CLS}>{t('login.captchaLabel')}</label>
                <div className="flex items-center gap-2">
                  <img
                    src={captcha.image}
                    alt={t('login.captchaAlt')}
                    width={168}
                    height={56}
                    className="h-14 shrink-0 rounded-lg border border-line bg-white"
                  />
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    disabled={captchaBusy}
                    aria-label={t('login.captchaRefresh')}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={cn(captchaBusy && 'animate-spin')} />
                  </button>
                  <div className={cn(control({ size: 'lg', focusWithin: true }), CONTROL_PAD.plain, 'flex min-w-0 flex-1 items-center')}>
                    <input
                      value={captchaAnswer}
                      onChange={(e) => setCaptchaAnswer(e.target.value)}
                      placeholder={t('login.captchaPlaceholder')}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      maxLength={8}
                      inputMode="text"
                      className="min-w-0 flex-1 bg-transparent text-sm uppercase tracking-[0.2em] text-fg outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-fg-subtle"
                    />
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-fg-subtle">{t('login.captchaHint')}</p>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
              {t('login.submit')}
            </Button>
          </form>
          )}

          {/* Was a dead line of text telling people to phone HR — the reset
              flow exists on the server and now has a way in. */}
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="text-xs font-medium text-brand-strong hover:underline"
            >
              {t('login.forgotLink')}
            </button>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11.5px] text-fg-subtle">{t('login.or')}</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <Button variant="outline" size="lg" className="mt-4 w-full" onClick={oneIdLogin} leftIcon={<ShieldCheck size={17} />}>
            {t('login.oneId')}
          </Button>

          {/* TZ 4.2.2 — «Система должна позволять пользователям
              самостоятельно пройти регистрацию». */}
          <p className="mt-3 text-center text-sm text-fg-muted">
            {t('login.noAccount')}{' '}
            <Link to="/royxatdan-otish" className="font-semibold text-brand-strong hover:underline">
              {t('login.registerLink')}
            </Link>
          </p>
        </div>
      </div>
      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </div>
  )
}

/**
 * "I forgot my password" — the address is all the server is given, and the
 * answer is deliberately the same whether the account exists or not, so this
 * screen can never be used to find out who has an account.
 */
function ForgotPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setEmail('')
    setSent(false)
    setErr('')
  }, [open])

  const submit = async () => {
    if (!email.trim()) return setErr(t('login.forgotEmailRequired'))
    setBusy(true)
    setErr('')
    try {
      await publicClient.post('auth/forgot-password', { email: email.trim() })
      setSent(true)
    } catch (e) {
      setErr(errorMessage(e, t('login.forgotFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('login.forgotTitle')}
      description={sent ? undefined : t('login.forgotDesc')}
      size="sm"
      footer={
        sent ? (
          <Button onClick={onClose}>{t('common.close')}</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
            <Button onClick={submit} loading={busy}>{t('login.forgotSend')}</Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex items-start gap-2.5 rounded-inner border border-success/30 bg-success-soft px-3 py-3">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
          <p className="text-[13px] text-fg">{t('login.forgotSent')}</p>
        </div>
      ) : (
        <Field label={t('login.email')} required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="email@uzgidro.uz"
            autoComplete="email"
          />
        </Field>
      )}
      {err && <p className="mt-3 text-xs text-danger">{err}</p>}
    </Modal>
  )
}
