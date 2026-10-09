import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { CheckCircle2, RefreshCw, Smartphone, XCircle } from 'lucide-react'
import axios from 'axios'
import { Button } from '@/components/ui/Button'
import { publicClient } from '@/api/client'
import { QR_CLAIM, QR_START, QR_STATUS } from '@/api/endpoints'

/**
 * QR orqali kirish paneli — TZ 4.2.3
 * («Авторизация в Системе должна осуществляться через QR Code»).
 *
 * Brauzer kanal ochadi, QR chizadi va holatni SO'RAB TURADI. Tizimga kirgan
 * qurilma (mobil ilova yoki telefondagi ochiq sessiya) QR ni skanerlab
 * tasdiqlaydi — shundan keyingina brauzer token oladi.
 *
 * ⚠️ QR ICHIDA TOKEN YO'Q — faqat kanal identifikatori va skaner kaliti.
 * Token ayni `claim` chaqiruvida, BIR MARTAGINA beriladi.
 *
 * ⚠️ Holat so'rash (poll) tanlangan, WebSocket EMAS: kirish sahifasida hali
 * sessiya yo'q, WS esa token talab qiladi.
 *
 * ⚠️ `status` va `claim` — POST: `poll_secret` so'rov TANASIDA ketadi. GET
 * bo'lsa u URL ga tushib brauzer tarixi, proksi va access-loglarga yozilardi.
 *
 * ⚠️ `publicClient` ishlatiladi, `apiClient` EMAS: oxirgisi har so'rovga
 * `Authorization` qo'shadi va 401 da tokenni yangilashga urinadi — kirish
 * sahifasida birinchisi keraksiz, ikkinchisi zararli.
 */

const POLL_MS = 2000

interface QrChannel {
  channel_id: string
  poll_secret: string
  qr_payload: string
  expires_in: number
}

export interface QrTokens {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number
}

type PanelState =
  | 'loading'
  | 'pending'
  | 'scanned'
  | 'approving'
  | 'expired'
  | 'rejected'
  | 'error'

export function QrLoginPanel({ onSuccess }: { onSuccess: (tokens: QrTokens) => void }) {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<QrChannel | null>(null)
  const [state, setState] = useState<PanelState>('loading')
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const claimedRef = useRef(false)

  const start = useCallback(async () => {
    setError('')
    setState('loading')
    claimedRef.current = false
    try {
      const { data } = await publicClient.post<QrChannel>(QR_START)
      setChannel(data)
      setSecondsLeft(data.expires_in || 120)
      setState('pending')
    } catch (err) {
      setState('error')
      setError(
        axios.isAxiosError(err) && err.response?.status === 429
          ? t('qr.tooMany')
          : t('qr.startFailed'),
      )
    }
  }, [t])

  useEffect(() => {
    void start()
  }, [start])

  // Muddat hisoblagichi
  useEffect(() => {
    if (state !== 'pending' && state !== 'scanned') return
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setState('expired')
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [state])

  // Holatni so'rab turish
  useEffect(() => {
    if (!channel || (state !== 'pending' && state !== 'scanned')) return

    let stopped = false
    const tick = async () => {
      try {
        const { data } = await publicClient.post<{ state: string }>(QR_STATUS, {
          channel_id: channel.channel_id,
          poll_secret: channel.poll_secret,
        })
        if (stopped) return

        if (data.state === 'scanned') {
          setState('scanned')
        } else if (data.state === 'approved') {
          if (claimedRef.current) return
          claimedRef.current = true
          setState('approving')
          const res = await publicClient.post<QrTokens>(QR_CLAIM, {
            channel_id: channel.channel_id,
            poll_secret: channel.poll_secret,
          })
          if (!stopped) onSuccess(res.data)
        } else if (data.state === 'expired' || data.state === 'rejected') {
          setState(data.state)
        }
      } catch {
        // Bitta muvaffaqiyatsiz so'rov panelni O'LDIRMASIN — keyingi urinishda
        // tiklanadi (muddat tugasa hisoblagich «expired» ga o'tkazadi).
      }
    }

    const id = setInterval(() => void tick(), POLL_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [channel, state, onSuccess])

  const mm = Math.floor(secondsLeft / 60)
  const ss = String(secondsLeft % 60).padStart(2, '0')
  const failed = state === 'expired' || state === 'rejected' || state === 'error'

  return (
    <div className="flex w-full flex-col items-center gap-3.5 py-1.5">
      {/* QR MAJBURAN OQ FONDA: skaner kontrastga tayanadi, tungi rejimdagi
          to'q fonda kod o'qilmaydi. */}
      <div
        className="relative grid h-[208px] w-[208px] place-items-center rounded-xl bg-white p-3"
        data-lv-keep
      >
        {channel && (state === 'pending' || state === 'scanned') ? (
          <QRCodeSVG value={channel.qr_payload} size={184} level="M" />
        ) : (
          <div className="flex flex-col items-center gap-2.5 px-3 text-center">
            {state === 'approving' && (
              <>
                <CheckCircle2 size={34} className="text-on-white-success" />
                <span className="text-[13px] text-on-white">{t('qr.signingIn')}</span>
              </>
            )}
            {failed && (
              <>
                <XCircle size={34} className="text-on-white-danger" />
                <span className="text-[13px] text-on-white">
                  {state === 'rejected' ? t('qr.rejected') : t('qr.expired')}
                </span>
              </>
            )}
            {state === 'loading' && (
              <span className="text-[13px] text-on-white">{t('common.loading')}</span>
            )}
          </div>
        )}
      </div>

      {state === 'scanned' ? (
        <div className="flex items-center gap-2">
          <Smartphone size={16} className="text-brand-strong" />
          <span className="text-[13px] text-brand-strong">{t('qr.confirmOnPhone')}</span>
        </div>
      ) : (
        <p className="text-center text-xs leading-relaxed text-fg-muted">
          {t('qr.hint')}
          {state === 'pending' && (
            <>
              <br />
              <span className="text-fg-subtle">
                {t('qr.validFor', { time: `${mm}:${ss}` })}
              </span>
            </>
          )}
        </p>
      )}

      {error && <span className="text-xs text-danger">{error}</span>}

      {failed && (
        <Button variant="outline" size="sm" onClick={start} leftIcon={<RefreshCw size={14} />}>
          {t('qr.refresh')}
        </Button>
      )}
    </div>
  )
}
