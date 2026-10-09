import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Download, FileText, X } from 'lucide-react'
import dayjs from 'dayjs'
import { inTashkent } from '@/lib/format'
import { Button, Modal, Textarea, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { FormError } from '@/components/ui/FormError'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { useConfirm } from '@/components/data/useConfirm'
import {
  STATUS_CHAIN,
  TRANSITIONS,
  canReviewServices,
  fetchServiceDocumentUrl,
  useServiceMutations,
  useServiceRequest,
  type ServiceStatus,
} from './useServices'

const TONE: Record<string, string> = {
  accepted: 'bg-fg/[0.06] text-fg-muted',
  in_review: 'bg-warning/[0.13] text-warning',
  in_progress: 'bg-info/[0.12] text-info',
  ready: 'bg-brand/[0.14] text-brand-strong',
  issued: 'bg-success/[0.12] text-success',
  rejected: 'bg-danger/[0.13] text-danger',
  cancelled: 'bg-fg/[0.06] text-fg-muted',
}

/**
 * One request, its history, and the moves still open on it — TZ 4.2.12 §2–4.
 *
 * The status RAIL at the top is the whole point of this view: a person asking
 * "where is my certificate" gets an answer without reading the log. The log is
 * still there underneath, because the rail cannot show a rejection reason.
 */
export function ServiceDetailModal({
  id,
  onClose,
}: {
  id: number | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const user = useAuthStore((s) => s.user)
  const canReview = canReviewServices(user)
  const { request, loading } = useServiceRequest(id)
  const { changeStatus, cancel, buildDocument } = useServiceMutations()
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const mine = request?.employee_id === user?.employee?.id
  const nextStates = request ? (TRANSITIONS[request.status] ?? []) : []
  const chainIndex = request ? STATUS_CHAIN.indexOf(request.status) : -1

  const run = async (key: string, fn: () => Promise<unknown>, okText: string) => {
    setBusy(key)
    try {
      await fn()
      setComment('')
      toast.ok(okText)
    } catch (e) {
      toast.error(errorMessage(e, t('services.actionFailed')))
    } finally {
      setBusy(null)
    }
  }

  const download = async () => {
    if (!request) return
    setBusy('download')
    try {
      const url = await fetchServiceDocumentUrl(request.id)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast.error(errorMessage(e, t('services.documentFailed')))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      title={request ? `${request.number}` : t('services.request')}
      description={
        request ? t(`services.type_${request.service_type}` as never) : undefined
      }
      footer={
        <Button variant="ghost" onClick={onClose}>
          {t('common.close')}
        </Button>
      }
    >
      {loading || !request ? (
        <CenteredSpinner />
      ) : (
        <div className="flex flex-col gap-5">
          {/* ── Holat zanjiri ──────────────────────────────────────────── */}
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_CHAIN.map((s, i) => {
                const done = chainIndex >= 0 && i <= chainIndex
                return (
                  <span key={s} className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'rounded-pill px-2.5 py-1 text-[11px] font-semibold',
                        done ? 'bg-brand text-fg-on-brand' : 'bg-fg/[0.06] text-fg-muted',
                      )}
                    >
                      {t(`services.status_${s}` as never)}
                    </span>
                    {i < STATUS_CHAIN.length - 1 && (
                      <span
                        className={cn(
                          'h-px w-4',
                          done && i < chainIndex ? 'bg-brand' : 'bg-line',
                        )}
                      />
                    )}
                  </span>
                )
              })}
            </div>
            {(request.status === 'rejected' || request.status === 'cancelled') && (
              <span
                className={cn(
                  'mt-2 inline-flex rounded-pill px-2.5 py-1 text-[11px] font-semibold',
                  TONE[request.status],
                )}
              >
                {t(`services.status_${request.status}` as never)}
              </span>
            )}
          </div>

          {/* ── So'rov ma'lumotlari ────────────────────────────────────── */}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label={t('services.applicant')} value={request.applicant_name ?? '—'} />
            <Row
              label={t('services.submittedAt')}
              value={
                request.submitted_at
                  ? inTashkent(request.submitted_at).format('DD.MM.YYYY HH:mm')
                  : '—'
              }
            />
            {request.assignee_name && (
              <Row label={t('services.assignee')} value={request.assignee_name} />
            )}
            {request.due_date && (
              <Row
                label={t('services.dueDate')}
                value={dayjs(request.due_date).format('DD.MM.YYYY')}
              />
            )}
          </dl>

          {request.purpose && (
            <div>
              <p className="text-[11.5px] text-fg-subtle">
                {t('services.purpose')}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{request.purpose}</p>
            </div>
          )}

          {request.payload && Object.values(request.payload).some(Boolean) && (
            <div className="rounded-inner bg-surface-2 p-3">
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {Object.entries(request.payload)
                  .filter(([, v]) => !!v)
                  .map(([k, v]) => (
                    <Row key={k} label={t(`services.field_${k}` as never)} value={String(v)} />
                  ))}
              </dl>
            </div>
          )}

          {/* ── Amallar ────────────────────────────────────────────────── */}
          {(canReview || mine) && (
            <div className="rounded-inner border border-line p-3.5">
              {canReview && nextStates.length > 0 && (
                <>
                  <Textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={2}
                    placeholder={t('services.commentPlaceholder')}
                    className={commentError ? 'mb-1' : 'mb-2.5'}
                    aria-invalid={commentError ? true : undefined}
                  />
                  {commentError && <FormError className="mb-2.5 text-xs">{commentError}</FormError>}
                  <div className="flex flex-wrap gap-2">
                    {nextStates.map((s: ServiceStatus) => (
                      <Button
                        key={s}
                        size="sm"
                        variant={s === 'rejected' ? 'danger' : 'secondary'}
                        loading={busy === s}
                        leftIcon={s === 'rejected' ? <X size={14} /> : <Check size={14} />}
                        onClick={async () => {
                          // The server refuses a rejection without a reason
                          // («Rad etish sababini yozing»); say so before the
                          // round-trip, next to the box that needs filling.
                          if (s === 'rejected' && !comment.trim()) {
                            setCommentError(t('services.rejectReasonRequired'))
                            return
                          }
                          setCommentError('')
                          const ok = await confirm({
                            kind: s === 'rejected' ? 'reject' : s === 'issued' ? 'approve' : 'status',
                            subject: request.number,
                            confirmLabel: t(`services.status_${s}` as never),
                          })
                          if (!ok) return
                          return run(
                            s,
                            () =>
                              changeStatus.mutateAsync({
                                id: request.id,
                                toStatus: s,
                                comment,
                              }),
                            t('services.statusChanged'),
                          )
                        }}
                      >
                        {t(`services.status_${s}` as never)}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-2.5 flex flex-wrap gap-2">
                {/* ⚠️ This button used to live inside the `nextStates.length > 0`
                    block, so it vanished at «Berildi» — the final state, where
                    `nextStates` is empty — although both this gate and the
                    server allow building there. A reviewer who marked the
                    request issued before generating the certificate could never
                    generate it again (measured 2026-09-22). */}
                {canReview &&
                  request.service_type !== 'job_application' &&
                  ['in_progress', 'ready', 'issued'].includes(request.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy === 'doc'}
                      leftIcon={<FileText size={14} />}
                      onClick={async () => {
                        if (!(await confirm({ kind: 'action', confirmLabel: t('services.buildDocument') }))) return
                        await run('doc', () => buildDocument.mutateAsync(request.id), t('services.documentBuilt'))
                      }}
                    >
                      {t('services.buildDocument')}
                    </Button>
                  )}
                {request.has_document && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={busy === 'download'}
                    leftIcon={<Download size={14} />}
                    onClick={download}
                  >
                    {t('services.downloadDocument')}
                  </Button>
                )}
                {mine && request.status === 'accepted' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === 'cancel'}
                    onClick={async () => {
                      if (!(await confirm({ kind: 'status', confirmLabel: t('services.cancelRequest') }))) return
                      await run(
                        'cancel',
                        () => cancel.mutateAsync({ id: request.id, comment }),
                        t('services.cancelled'),
                      )
                    }}
                  >
                    {t('services.cancelRequest')}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ── Tarix ──────────────────────────────────────────────────── */}
          {request.events.length > 0 && (
            <div>
              <p className="engrave mb-2 text-fg">{t('services.history')}</p>
              <ul className="space-y-1.5">
                {request.events.map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-baseline gap-x-2 rounded-inner bg-surface-2 px-3 py-2 text-xs text-fg-muted"
                  >
                    <span
                      className={cn(
                        'rounded-pill px-2 py-0.5 text-[10px] font-semibold',
                        TONE[e.to_status] ?? 'bg-fg/[0.06] text-fg-muted',
                      )}
                    >
                      {t(`services.status_${e.to_status}` as never)}
                    </span>
                    {e.comment && <span className="italic">«{e.comment}»</span>}
                    <span className="ml-auto whitespace-nowrap text-fg-subtle">
                      {e.actor_name ?? '—'}
                      {e.created_at ? ` · ${inTashkent(e.created_at).format('DD.MM.YYYY HH:mm')}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] text-fg">{value}</dd>
    </div>
  )
}
