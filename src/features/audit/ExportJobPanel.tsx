import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, Loader2, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { downloadJobFile, jobRunning, useBackgroundJob } from './useAuditExport'

/**
 * TZ A4 919 — the background export of a big journal selection: progress
 * while the worker builds the file, then «Yuklab olish». The job id lives in
 * the URL (`?job=`), so the `background_job` notification lands here too.
 */
export function ExportJobPanel({ jobId, onClose }: { jobId: number; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const q = useBackgroundJob(jobId)
  const job = q.data ?? null
  const running = jobRunning(job)
  const [downloading, setDownloading] = useState(false)

  // Say it once when the worker finishes while the page is open.
  const wasRunning = useRef<boolean | null>(null)
  useEffect(() => {
    if (!job) return
    if (wasRunning.current && !running) {
      if (job.status === 'done') toast.ok(t('auditJob.readyToast'))
      else toast.error(t('auditJob.failedToast'))
    }
    wasRunning.current = running
  }, [job, running, t, toast])

  const download = async () => {
    if (!job) return
    setDownloading(true)
    try {
      await downloadJobFile(job)
    } catch (e) {
      toast.error(errorMessage(e, t('audit.exportFailed')))
    } finally {
      setDownloading(false)
    }
  }

  const progress = Math.max(0, Math.min(100, job?.progress ?? 0))
  const statusText = !job
    ? t('common.loading')
    : job.status === 'done'
      ? t('auditJob.done')
      : job.status === 'failed'
        ? t('auditJob.failed')
        : job.status === 'running'
          ? t('auditJob.running')
          : t('auditJob.queued')

  return (
    <section
      aria-live="polite"
      aria-label={t('auditJob.title')}
      className={cn(
        'mb-4 flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center',
        job?.status === 'failed'
          ? 'border-danger/30 bg-danger-soft/50'
          : job?.status === 'done'
            ? 'border-success/30 bg-success-soft/50'
            : 'border-brand/25 bg-brand-soft/40',
      )}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-inner bg-surface">
        {q.isError ? (
          <XCircle size={18} className="text-danger" aria-hidden="true" />
        ) : running ? (
          <Loader2 size={18} className="animate-spin text-brand" aria-hidden="true" />
        ) : job?.status === 'done' ? (
          <CheckCircle2 size={18} className="text-success" aria-hidden="true" />
        ) : (
          <XCircle size={18} className="text-danger" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="m-0 text-sm font-semibold text-fg">
          {t('auditJob.title')} <span className="font-mono text-fg-subtle">#{jobId}</span>
        </p>
        {q.isError ? (
          <p className="m-0 mt-0.5 text-xs text-danger">{errorMessage(q.error, t('list.loadFailed'))}</p>
        ) : (
          <>
            <p className="m-0 mt-0.5 text-xs text-fg-muted">
              {statusText}
              {job?.row_count != null && ` · ${t('auditJob.rows', { count: job.row_count })}`}
            </p>
            {running && (
              <div
                className="mt-2 h-1.5 w-full max-w-md overflow-hidden rounded-pill bg-surface-2"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-label={t('auditJob.title')}
              >
                <div className="h-full rounded-pill bg-brand transition-[width] duration-500" style={{ width: `${Math.max(progress, 4)}%` }} />
              </div>
            )}
            {running && <p className="m-0 mt-1.5 text-xs text-fg-subtle">{t('auditJob.notifyHint')}</p>}
            {job?.status === 'failed' && job.error && (
              <p className="m-0 mt-1 break-words text-xs text-danger">{job.error}</p>
            )}
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {job?.status === 'done' && job.has_file !== false && (
          <Button size="sm" leftIcon={<Download size={14} />} loading={downloading} onClick={() => void download()}>
            {t('auditJob.download')}
          </Button>
        )}
        <IconButton size="sm" label={t('common.close')} onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
    </section>
  )
}
