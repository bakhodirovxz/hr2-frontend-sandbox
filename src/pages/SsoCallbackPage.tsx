import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Spinner } from '@/components/ui/Spinner'
import { BackgroundDecor } from '@/components/layout/BackgroundDecor'
import { useAuthStore } from '@/store/authStore'
import { resetAuthSession } from '@/api/client'

/**
 * Where OneID (YaIT) hands control back.
 *
 * The backend has already minted OUR session and put the tokens in the URL
 * FRAGMENT — `#access_token=…&refresh_token=…&expires_in=…` — because a
 * fragment is never sent to a server and never lands in an access log. They are
 * scrubbed from the address bar before anything else happens, so a token cannot
 * survive in history or be shared by copying the URL.
 */
const ERROR_KEYS: Record<string, string> = {
  oneid_not_configured: 'sso.errNotConfigured',
  missing_code: 'sso.errGeneric',
  invalid_state: 'sso.errState',
  user_not_validated: 'sso.errNotValidated',
  no_pin: 'sso.errNoPin',
  employee_not_found: 'sso.errNoEmployee',
  user_inactive: 'sso.errInactive',
  oneid_error: 'sso.errGeneric',
}

export function SsoCallbackPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setSession = useAuthStore((s) => s.setSession)
  // React 18 mounts effects twice in development; consuming the fragment twice
  // would throw the tokens away on the second pass.
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    window.history.replaceState(null, '', window.location.pathname)

    const fail = (key: string) => {
      navigate('/login', { replace: true, state: { ssoError: t(key as never) } })
    }

    const err = params.get('error')
    if (err) {
      fail(ERROR_KEYS[err] ?? 'sso.errGeneric')
      return
    }

    const accessToken = params.get('access_token')
    if (!accessToken) {
      fail('sso.errGeneric')
      return
    }

    const expiresIn = params.get('expires_in')
    resetAuthSession()
    setSession({ access_token: accessToken, expires_in: expiresIn ? Number(expiresIn) : undefined })
    navigate('/', { replace: true })
  }, [navigate, setSession, t])

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center gap-4">
      <BackgroundDecor />
      <Spinner />
      <p className="relative text-sm text-fg-muted">{t('sso.signingIn')}</p>
    </div>
  )
}

