import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Power, X } from 'lucide-react'
import { apiGet } from '@/api/http'
import { cn } from '@/lib/cn'
import { OPS, type OpsNotice } from './systemOps'

/**
 * TZ E2 1685 / 1694 «Система отправляет уведомления активным пользователям»
 * and E3 1721 «уведомления о восстановлении работы» — a banner on every page:
 *
 *   shutdown_pending → countdown until the gate closes («save your work»);
 *   maintenance      → the system is stopped / in recovery;
 *   resumed          → the system is back (10 minutes, dismissible).
 *
 * Polls `GET /system/ops/notice` every 15 s (cheap, cached on the server),
 * so a user sees a pending shutdown well inside the grace period.
 */
export function MaintenanceBanner() {
  const { t } = useTranslation()
  const q = useQuery({
    queryKey: ['sysops', 'notice'],
    queryFn: () => apiGet<OpsNotice>(OPS.notice),
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
    retry: false,
    meta: { silent: true },
  })
  const notice = q.data?.notice
  const [now, setNow] = useState(() => Date.now())
  const [dismissed, setDismissed] = useState<string | null>(null)
  const pending = notice?.kind === 'shutdown_pending' && !!notice.deadline
  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [pending])

  if (!notice || !notice.kind || notice.kind === 'backup') return null
  if (notice.kind === 'resumed' && dismissed === notice.at) return null

  const left = pending ? Math.max(0, Math.round((new Date(notice.deadline as string).getTime() - now) / 1000)) : 0
  const tone =
    notice.kind === 'resumed'
      ? 'border-success/30 bg-success-soft text-success'
      : notice.kind === 'shutdown_pending'
        ? 'border-danger/35 bg-danger-soft text-danger'
        : 'border-warning/30 bg-warning-soft text-warning'
  const Icon = notice.kind === 'resumed' ? CheckCircle2 : notice.kind === 'shutdown_pending' ? Power : AlertTriangle
  const text =
    notice.kind === 'shutdown_pending'
      ? t('sysHealth.bannerPending', { n: left })
      : notice.kind === 'resumed'
        ? t('sysHealth.bannerResumed')
        : t('sysHealth.bannerMaintenance')

  return (
    <div role={notice.kind === 'shutdown_pending' ? 'alert' : 'status'} className={cn('mx-4 mt-3 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm', tone)}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <b className="font-semibold">{text}</b>
        {notice.reason && notice.kind !== 'resumed' && (
          <span className="block text-[12.5px] text-fg-muted">
            {t('sysHealth.bannerReason')}: {notice.reason}
          </span>
        )}
      </span>
      {notice.kind === 'resumed' && (
        <button
          type="button"
          onClick={() => setDismissed(notice.at ?? '')}
          className="text-fg-subtle hover:text-fg"
          aria-label={t('common.close')}
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
