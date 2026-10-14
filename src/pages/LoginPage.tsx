import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Lock, MailCheck, QrCode, User as UserIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { inTashkent } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { LogoMark } from '@/components/layout/Logo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { BackgroundDecor } from '@/components/layout/BackgroundDecor'
import { isTwoFactor, useFinishLogin, useLogin, useLogin2fa, type TwoFactorChallenge } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { LABEL_CLS, control, CONTROL_PAD } from '@/components/ui/control'
import { cn } from '@/lib/cn'
import type { QrTokens } from '@/features/auth/QrLoginPanel'
import { clearLogoutReason, peekLogoutReason } from '@/features/auth/logoutReason'

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
import { siteText, useSiteInfo } from '@/features/site/useSiteInfo'
import { LowVisionPanel } from '@/a11y/LowVisionPanel'
import { publicClient } from '@/api/client'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import i18n from 'i18next'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Footer } from '@/components/layout/Footer'

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const { data: site } = useSiteInfo()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const finishLogin = useFinishLogin()
  const login = useLogin()
  const login2fa = useLogin2fa()
  /** TZ 4.2.3 — parol va QR ikkala yo'l ham beriladi. */
  const [mode, setMode] = useState<'password' | 'qr'>('password')

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [forgotOpen, setForgotOpen] = useState(false)
  /** 2FA yoqilgan hisob: parol to'g'ri bo'lsa server kod yuboradi. */
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null)
  const [code, setCode] = useState('')
  /** TZ U2 — harakatsizlik sababli chiqarilgan bo'lsa, bir marta aytiladi. */
  const [idleNotice] = useState(() => peekLogoutReason() === 'idle')
  useEffect(() => clearLogoutReason(), [])

  const from = (location.state as { from?: Location } | null)?.from
  const redirectTo = from ? `${from.pathname}${from.search || ''}` : '/'

  if (isAuthenticated) return <Navigate to={redirectTo} replace />

  const onQrSuccess = (tokens: QrTokens) => {
    // QR javobida foydalanuvchi obyekti yo'q — `auth/me` uni o'zi tortadi.
    finishLogin({ access_token: tokens.access_token, expires_in: tokens.expires_in })
    navigate(redirectTo, { replace: true })
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError(t('login.fillAllFields'))
      return
    }
    try {
      const res = await login.mutateAsync({ username, password })
      if (isTwoFactor(res)) {
        setChallenge(res)
        setCode('')
        return
      }
      navigate(redirectTo, { replace: true })
    } catch (err) {
      // TZ U1 · 772: hisob noto'g'ri urinishlardan keyin vaqtincha bloklangan —
      // qachongacha ekanini foydalanuvchining O'Z vaqtida ko'rsatamiz.
      if (errorCode(err) === 'account_locked') {
        const until = errorParams(err).until
        const when = typeof until === 'string' && dayjs(until).isValid() ? inTashkent(until).format('DD.MM.YYYY HH:mm') : null
        setError(when ? t('authx.lockedUntil', { time: when }) : t('authx.locked'))
        return
      }
      setError(errorMessage(err, t('login.wrongCredentials')))
    }
  }

  const onSubmitCode = async (e: FormEvent) => {
    e.preventDefault()
    if (!challenge) return
    const clean = code.replace(/\D/g, '')
    setError('')
    if (clean.length !== 6) {
      setError(t('login.codeHint'))
      return
    }
    try {
      await login2fa.mutateAsync({ challengeId: challenge.challenge_id, code: clean })
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const c = errorCode(err)
      // Muddati o'tgan yoki bloklangan chaqiriq — parol bosqichidan qaytadan.
      if (c === 'two_factor_expired' || c === 'two_factor_locked') {
        setChallenge(null)
        setCode('')
      }
      const left = errorParams(err).attempts_left
      setError(left != null ? t('login.codeWrongLeft', { n: Number(left) }) : errorMessage(err, t('login.codeWrong')))
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
            <span className="min-w-0">
              {/* TZ 291-292: the system is designated «HRM». */}
              <span
                className="block text-[17px] font-bold tracking-[-0.02em]"
                style={{ color: 'rgb(var(--housing-fg))' }}
              >
                HRM
              </span>
              <span className="block max-w-xs text-[12px] leading-snug" style={{ color: 'rgb(var(--housing-muted))' }}>
                {t('login.systemName')}
              </span>
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
            {/* Owner from the site settings in the reader's language (FX-GEN
                per-language fields); the dictionary text is the fallback. */}
            {site?.owner_name
              ? `© ${new Date().getFullYear()} ${siteText(i18n.language, site.owner_name, site.owner_name_ru)}`
              : t('login.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>

      {/* Form panel */}
      <div className="app-bg relative flex flex-col items-center justify-center px-5 pb-16 pt-10">
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
            <span className="mt-3 text-lg font-extrabold tracking-tight text-fg">HRM</span>
            <span className="mt-1 text-[12px] leading-snug text-fg-muted">{t('login.systemName')}</span>
          </div>

          <h2 className="text-2xl font-bold text-fg">{t('login.welcome')}</h2>
          <p className="mt-1.5 text-sm text-fg-muted">{t('login.subtitle')}</p>

          {/* Kirish yo'lini tanlash — TZ 4.2.3 QR ni TALAB qiladi, parol esa
              zaxira yo'l bo'lib qoladi (telefoni yo'q foydalanuvchi uchun). */}
          {!challenge && (
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
          )}

          {challenge ? (
            <form onSubmit={onSubmitCode} className="mt-6 space-y-4">
              <div className="flex items-start gap-2.5 rounded-inner border border-brand/25 bg-brand-soft px-3 py-3 text-[13px] text-fg">
                <MailCheck size={17} className="mt-0.5 shrink-0 text-brand" aria-hidden />
                <p>
                  {challenge.sent_to
                    ? t('login.codeSentTo', { email: challenge.sent_to })
                    : t('login.codeSentAccount')}
                </p>
              </div>
              <div>
                <label htmlFor="login-2fa-code" className={LABEL_CLS}>
                  {t('login.codeTitle')}
                </label>
                <div className={cn(control({ size: 'lg', focusWithin: true }), CONTROL_PAD.plain, 'flex items-center')}>
                  <input
                    id="login-2fa-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    placeholder="••••••"
                    className="tabnum min-w-0 flex-1 bg-transparent text-center text-[20px] tracking-[0.5em] text-fg outline-none placeholder:text-fg-subtle"
                  />
                </div>
              </div>
              {error && (
                <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}
              <Button type="submit" size="lg" className="w-full" loading={login2fa.isPending}>
                {t('login.codeConfirm')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                leftIcon={<ArrowLeft size={16} />}
                onClick={() => {
                  setChallenge(null)
                  setCode('')
                  setError('')
                }}
              >
                {t('login.codeBack')}
              </Button>
            </form>
          ) : mode === 'qr' ? (
            <div className="mt-6">
              <Suspense fallback={<div className="grid h-72 place-items-center"><Spinner /></div>}>
                <QrLoginPanel onSuccess={onQrSuccess} />
              </Suspense>
            </div>
          ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {idleNotice && !error && (
              <div role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-fg">
                {t('authx.idleLoggedOut')}
              </div>
            )}
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

            {error && (
              <div role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
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
              {t('authx.forgotLink')}
            </button>
          </div>

          {/* TZ 4.2.2 — «Система должна позволять пользователям
              самостоятельно пройти регистрацию». */}
          <p className="mt-3 text-center text-sm text-fg-muted">
            {t('login.noAccount')}{' '}
            <Link to="/register" className="font-semibold text-brand-strong hover:underline">
              {t('login.registerLink')}
            </Link>
          </p>
        </div>
      </div>
      <ForgotPasswordModal open={forgotOpen} onClose={() => setForgotOpen(false)} />
      {/* TZ 442: pastki panel login sahifasida ham — egasi, pochta, yordam telefoni. */}
      <Footer publicMode className="fixed inset-x-0 bottom-0 z-10 lg:left-1/2" />
    </div>
  )
}

/**
 * «Parolni unutdingizmi?» — TZ U3 (796–818). Login YOKI elektron pochta
 * qabul qilinadi (`POST /auth/forgot-password {identifier}`); havola hisobdagi
 * pochtaga yuboriladi. TZ 818 bo'yicha topilmagan hisob (404
 * `account_not_found`), pochtasiz hisob (422 `no_email_on_account`) va
 * cheklov (429) haqida server xabari ko'rsatiladi.
 */
function ForgotPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const [identifier, setIdentifier] = useState('')
  const [sent, setSent] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open) return
    setIdentifier('')
    setSent('')
    setErr('')
  }, [open])

  const submit = async () => {
    if (!identifier.trim()) return setErr(t('authx.forgotRequired'))
    setBusy(true)
    setErr('')
    try {
      const { data } = await publicClient.post<{ message?: string }>('auth/forgot-password', { identifier: identifier.trim() })
      setSent(i18nServerText(data?.message) || t('authx.forgotSent'))
    } catch (e) {
      const code = errorCode(e)
      setErr(
        code === 'account_not_found'
          ? t('authx.forgotNotFound')
          : code === 'no_email_on_account'
            ? t('authx.forgotNoEmail')
            : errorMessage(e, t('login.forgotFailed')),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('login.forgotTitle')}
      description={sent ? undefined : t('authx.forgotDesc')}
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
          <p className="text-[13px] text-fg">{sent}</p>
        </div>
      ) : (
        <Field label={t('authx.forgotIdentifier')} required>
          <Input
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={t('authx.forgotIdentifier')}
            autoComplete="username"
          />
        </Field>
      )}
      {err && <p role="alert" className="mt-3 text-xs text-danger">{err}</p>}
    </Modal>
  )
}

/** Server xabari o'zbekcha; boshqa tilda — o'zimizning tarjima. */
function i18nServerText(msg?: string): string {
  return i18n.language === 'uz' && msg ? msg : ''
}
