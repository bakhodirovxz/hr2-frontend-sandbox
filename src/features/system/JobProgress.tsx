import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { BackgroundJob } from './useJob'

/** Fon vazifasi bosqichi (`result.stage`) → lug'at. `copied:<jadval>` — jadval nomi bilan. */
export function jobStageLabel(t: TFunction, stage?: string | null): string {
  if (!stage) return t('sysOps.stage_queued')
  if (stage.startsWith('copied:')) return t('sysOps.stage_copied', { table: stage.slice(7) })
  return t(`sysOps.stage_${stage}` as never, { defaultValue: stage }) as string
}

/** Progress chizig'i + joriy bosqich (zaxiradan tiklash, tizimni tiklash). */
export function JobProgress({ job, label }: { job?: BackgroundJob<object> | null; label?: string }) {
  const { t } = useTranslation()
  const status = job?.status ?? 'queued'
  const pct = status === 'done' ? 100 : Math.max(0, Math.min(100, Number(job?.progress ?? 0)))
  const failed = status === 'failed'
  const done = status === 'done'
  return (
    <div className="grid gap-2" aria-live="polite">
      <div className="flex items-center justify-between gap-3 text-[13px]">
        <span className="inline-flex items-center gap-2 font-medium text-fg">
          {done ? (
            <CheckCircle2 size={15} className="text-success" aria-hidden />
          ) : failed ? (
            <XCircle size={15} className="text-danger" aria-hidden />
          ) : (
            <Loader2 size={15} className="animate-spin text-brand" aria-hidden />
          )}
          {label ?? (done ? t('sysOps.jobDone') : failed ? t('sysOps.jobFailed') : jobStageLabel(t, job?.result?.stage))}
        </span>
        <span className="tabular-nums text-fg-muted">{pct}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('sysOps.progress')}
      >
        <div
          className={cn('h-full transition-all duration-500', failed ? 'bg-danger' : done ? 'bg-success' : 'bg-brand')}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  )
}
