import axios from 'axios'
import dayjs from 'dayjs'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Clock, Globe, Monitor, QrCode, ShieldAlert, XCircle } from 'lucide-react'
import { PageContainer } from '@/components/layout/Page'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { publicClient } from '@/api/client'
import { apiPost } from '@/api/http'
import { getToken } from '@/api/tokenStorage'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { displayName } from '@/auth/permissions'
import { inTashkent } from '@/lib/format'
import { useAuthStore } from '@/store/authStore'

/**
 * QR orqali kirishni tasdiqlash (TZ 4.2.3 «Авторизация через QR Code»).
 *
 * Kompyuterdagi login sahifasi QR ichiga shu sahifa manzilini chizadi:
 * `/qr-approve?c=<kanal>&s=<skaner kaliti>`. Telefonda tizimga kirgan
 * foydalanuvchi QR ni ochadi (kirmagan bo'lsa — avval login, keyin shu yerga
 * qaytadi), qaysi brauzer kirmoqchi ekanini ko'radi va tasdiqlaydi yoki rad
 * etadi (`app/api/v1/qr_login.py`):
 *
 *   POST auth/qr/scan     {channel_id, qr_secret} → {state, browser:{ip, user_agent}}
 *   POST auth/qr/approve  {channel_id, qr_secret} → {state: approved}
 *   POST auth/qr/reject   {channel_id, qr_secret} → {state: rejected}
 *
 * Begona qurilmani tasdiqlab qo'ymaslik uchun IP va brauzer albatta
 * ko'rsatiladi. Mehmon hisobi tasdiqlay olmaydi (server 403).
 */

type Phase = 'loading' | 'ready' | 'approved' | 'rejected' | 'error'

interface ScanResult {
  state: string
  browser?: { ip?: string | null; user_agent?: string | null }
}

/**
 * ⚠️ NOT `apiPost` DIRECTLY. A wrong or tampered `s` makes the server answer
 * 401 `qr_invalid_secret`; the shared client treats every 401 as an expired
 * session — refresh, retry, and on the second 401 a forced LOGOUT. Scanning a
 * bad QR must not sign the person out, so the call goes through the bare
 * client with the current token, and only a 401 that is NOT a `qr_*` error
 * (the access token itself lapsed) is replayed through `apiPost`, which
 * refreshes the session first.
 */
async function qrCall<T>(path: string, body: { channel_id: string; qr_secret: string }): Promise<T> {
  try {
    const token = getToken()
    const res = await publicClient.post<T>(path, body, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
    return res.data
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401 && !String(errorCode(err) ?? '').startsWith('qr_')) {
      return apiPost<T>(path, body)
    }
    throw err
  }
}

function describeAgent(ua?: string | null): string | null {
  if (!ua) return null
  const browser = /Edg\//.test(ua)
    ? 'Microsoft Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /YaBrowser\//.test(ua)
        ? 'Yandex Browser'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Chrome\//.test(ua)
            ? 'Google Chrome'
            : /Safari\//.test(ua)
              ? 'Safari'
              : null
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS X/.test(ua) && !/Mobile/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /(iPhone|iPad)/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null
  return [browser, os].filter(Boolean).join(' · ') || null
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-line/60 py-2.5 last:border-b-0">
      <span className="mt-0.5 shrink-0 text-brand" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-fg-subtle">{label}</div>
        <div className="break-words text-[13.5px] text-fg">{children}</div>
      </div>
    </div>
  )
}

export function QrApprovePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const user = useAuthStore((s) => s.user)
  const channel = sp.get('c') ?? ''
  const secret = sp.get('s') ?? ''

  const [phase, setPhase] = useState<Phase>(channel && secret ? 'loading' : 'error')
  const [error, setError] = useState(channel && secret ? '' : t('qrApprove.badLink'))
  const [browser, setBrowser] = useState<ScanResult['browser']>({})
  const [scannedAt] = useState(() => new Date())
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  /** Server xatosi → foydalanuvchiga tushunarli matn. */
  const describe = (err: unknown, fallback: string): string => {
    const code = errorCode(err)
    const status = axios.isAxiosError(err) ? err.response?.status : undefined
    if (code === 'qr_expired' || status === 410) return t('qrApprove.expired')
    if (code === 'qr_invalid_secret') return t('qrApprove.badLink')
    if (code === 'qr_bad_state') return t('qrApprove.used')
    return errorMessage(err, fallback)
  }

  // Skan BIR MARTA (StrictMode effektni ikki marta ishga tushiradi).
  const scanned = useRef('')
  useEffect(() => {
    if (!channel || !secret) {
      setPhase('error')
      setError(t('qrApprove.badLink'))
      return
    }
    const key = `${channel}:${secret}`
    if (scanned.current === key) return
    scanned.current = key
    setPhase('loading')
    qrCall<ScanResult>('auth/qr/scan', { channel_id: channel, qr_secret: secret })
      .then((data) => {
        setBrowser(data.browser ?? {})
        if (data.state === 'approved') setPhase('approved')
        else if (data.state === 'rejected') setPhase('rejected')
        else if (data.state === 'expired') {
          setPhase('error')
          setError(t('qrApprove.expired'))
        } else setPhase('ready')
      })
      .catch((err) => {
        setPhase('error')
        setError(describe(err, t('qrApprove.scanFailed')))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, secret])

  const act = async (kind: 'approve' | 'reject') => {
    setBusy(kind)
    try {
      await qrCall<{ state: string }>(`auth/qr/${kind}`, { channel_id: channel, qr_secret: secret })
      setPhase(kind === 'approve' ? 'approved' : 'rejected')
    } catch (err) {
      setPhase('error')
      setError(describe(err, t('qrApprove.actionFailed')))
    } finally {
      setBusy(null)
    }
  }

  const agent = describeAgent(browser?.user_agent)

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-lg py-4">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-inner bg-brand-soft text-brand" aria-hidden>
              <QrCode size={22} />
            </span>
            <div className="min-w-0">
              <h1 className="text-[18px] font-bold leading-tight text-fg">{t('nav.qrApprove')}</h1>
              <p className="truncate text-[12.5px] text-fg-muted">{displayName(user)}</p>
            </div>
          </div>

          {phase === 'loading' && (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-[13px] text-fg-muted">
              <Spinner size={18} /> {t('qrApprove.checking')}
            </div>
          )}

          {phase === 'ready' && (
            <>
              <p className="mb-3 text-[13.5px] leading-relaxed text-fg-muted">{t('qrApprove.intro')}</p>
              <div className="mb-4 rounded-inner border border-line bg-surface-2 px-4">
                <Row icon={<Monitor size={16} />} label={t('qrApprove.browser')}>
                  {agent || t('qrApprove.unknown')}
                  {browser?.user_agent && (
                    <span className="mt-0.5 block break-all text-[11px] text-fg-subtle">{browser.user_agent}</span>
                  )}
                </Row>
                <Row icon={<Globe size={16} />} label={t('qrApprove.ip')}>
                  {browser?.ip || t('qrApprove.unknown')}
                </Row>
                <Row icon={<Clock size={16} />} label={t('qrApprove.time')}>
                  <span className="tabular-nums">{inTashkent(dayjs(scannedAt)).format('DD.MM.YYYY HH:mm:ss')}</span>
                </Row>
              </div>
              <div className="mb-4 flex items-start gap-2 rounded-inner border border-warning/30 bg-warning-soft p-3 text-[12.5px] text-warning">
                <ShieldAlert size={15} className="mt-px shrink-0" aria-hidden />
                <span>{t('qrApprove.warning')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="danger"
                  size="lg"
                  leftIcon={<XCircle size={16} />}
                  loading={busy === 'reject'}
                  disabled={!!busy}
                  onClick={() => act('reject')}
                >
                  {t('qrApprove.reject')}
                </Button>
                <Button
                  size="lg"
                  leftIcon={<CheckCircle2 size={16} />}
                  loading={busy === 'approve'}
                  disabled={!!busy}
                  onClick={() => act('approve')}
                >
                  {t('qrApprove.approve')}
                </Button>
              </div>
            </>
          )}

          {(phase === 'approved' || phase === 'rejected' || phase === 'error') && (
            <div role="status" className="flex flex-col items-center gap-3 py-5 text-center">
              {phase === 'approved' && <CheckCircle2 size={44} className="text-success" aria-hidden />}
              {phase === 'rejected' && <XCircle size={44} className="text-danger" aria-hidden />}
              {phase === 'error' && <ShieldAlert size={44} className="text-warning" aria-hidden />}
              <p className="text-[14px] text-fg">
                {phase === 'approved' ? t('qrApprove.approved') : phase === 'rejected' ? t('qrApprove.rejected') : error}
              </p>
              <Button variant="secondary" onClick={() => navigate('/')}>
                {t('qrApprove.home')}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </PageContainer>
  )
}
