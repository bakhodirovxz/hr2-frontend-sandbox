import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ban, Check, Download, FileText, MessageSquare, Pencil, RotateCcw, Save, X } from 'lucide-react'
import dayjs from 'dayjs'
import axios from 'axios'
import { Button, Field, Input, Modal, Select, Textarea, useToast } from '@/components/ui'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { FormError } from '@/components/ui/FormError'
import { LoadError } from '@/components/data/LoadError'
import { useConfirm } from '@/components/data/useConfirm'
import { cn } from '@/lib/cn'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import {
  DOCUMENT_STATUSES,
  EDITABLE_STATUS,
  JOB_APPLICATION,
  RESUBMIT_STATUSES,
  STATUS_CHAIN,
  TRANSITIONS,
  canReviewServices,
  fetchServiceDocumentUrl,
  isOwnRequest,
  useServiceMutations,
  useServiceRequest,
  useServiceReviewers,
  type ServiceRequestDetail,
  type ServiceStatus,
} from './useServices'
import { serviceLabel } from './serviceLabel'
import {
  CandidateResultBadge,
  CandidateResultEditor,
  PAYLOAD_KEYS,
  RESULT_KEYS,
  StatusBadge,
  fmtStamp,
  mergeCandidateResult,
  payloadLabel,
  type CandidateResultValue,
} from './serviceUi'
import { ServiceAttachmentsSection } from './ServiceAttachments'

/**
 * Bitta so'rov: holat zanjiri, ma'lumotlar, ilovalar, amallar va tarix —
 * TZ 4.2.12 §2–4, TZ I1 1597.
 *
 * Kim nima qiladi:
 *   • egasi — «Qabul qilindi» holatida tahrirlaydi, bekor qiladi, hujjat
 *     biriktiradi/olib tashlaydi;
 *   • ko'rib chiquvchi (kadr) — holatni oldinga suradi, rad etadi (sabab
 *     majburiy), arizaga nomzod natijasini yozadi, ma'lumotnoma/tavsifnomani
 *     shakllantiradi;
 *   • ikkalasi — ilovalarni va tayyor hujjatni ochadi.
 */
export function ServiceDetailModal({
  id,
  onClose,
  fromInbox,
  onResubmit,
}: {
  id: number | null
  onClose: () => void
  /** «Kiruvchi so'rovlar» dan ochilgan — kadr o'z so'rovini ham ko'rib chiqa oladi. */
  fromInbox?: boolean
  /** TZ I1 «Повторная подача»: yakunlangan o'z so'rovidan yangi so'rov formasi. */
  onResubmit?: (r: ServiceRequestDetail) => void
}) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const { request, loading, error, refetch } = useServiceRequest(id)

  const title = request
    ? `${request.number} · ${serviceLabel(request.service_type, request.service_type)}`
    : t('services.request')

  return (
    <Modal
      open={!!id}
      onClose={onClose}
      size="lg"
      placement="right"
      title={title}
      description={request?.applicant_name ?? undefined}
      footer={
        <>
          {onResubmit &&
            request &&
            !fromInbox &&
            isOwnRequest(user, request) &&
            RESUBMIT_STATUSES.includes(request.status) && (
              <Button variant="outline" leftIcon={<RotateCcw size={14} />} onClick={() => onResubmit(request)}>
                {t('sysOps.resubmit')}
              </Button>
            )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </>
      }
    >
      {error ? (
        axios.isAxiosError(error) && (error.response?.status === 404 || error.response?.status === 403) ? (
          <p className="py-8 text-center text-[13px] text-fg-muted">{t('svc.notFound')}</p>
        ) : (
          <LoadError error={error} onRetry={() => refetch()} />
        )
      ) : loading || !request ? (
        <CenteredSpinner />
      ) : (
        <DetailBody
          request={request}
          owner={isOwnRequest(user, request) && !fromInbox}
          reviewer={canReviewServices(user) && (!!fromInbox || !isOwnRequest(user, request))}
        />
      )}
    </Modal>
  )
}

function DetailBody({
  request,
  owner,
  reviewer,
}: {
  request: ServiceRequestDetail
  owner: boolean
  reviewer: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const { changeStatus, cancel, buildDocument, update, assign } = useServiceMutations()
  const reviewers = useServiceReviewers(request.id, reviewer)
  const [docNotes, setDocNotes] = useState(String(request.payload?.document_notes ?? ''))

  const isApplication = request.service_type === JOB_APPLICATION
  const editable = request.status === EDITABLE_STATUS
  const nextStates = reviewer ? (TRANSITIONS[request.status] ?? []) : []
  const chainIndex = STATUS_CHAIN.indexOf(request.status)

  const [busy, setBusy] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState('')
  const [result, setResult] = useState<CandidateResultValue>({ candidate_result: '', interview_at: '' })
  const [resultError, setResultError] = useState('')
  const [editing, setEditing] = useState(false)
  const [editPurpose, setEditPurpose] = useState('')
  const [editPayload, setEditPayload] = useState<Record<string, string>>({})
  const [editErrors, setEditErrors] = useState<Record<string, string>>({})
  const [editError, setEditError] = useState<string | null>(null)

  // Mavjud natija formaga oldindan yoziladi.
  useEffect(() => {
    const p = request.payload ?? {}
    const at = p.interview_at ? dayjs(String(p.interview_at)) : null
    setResult({
      candidate_result: String(p.candidate_result ?? ''),
      interview_at: at && at.isValid() ? at.format('YYYY-MM-DDTHH:mm') : '',
    })
    setResultError('')
  }, [request.id, request.payload])

  useEffect(() => {
    setEditing(false)
    setComment('')
    setCommentError('')
  }, [request.id])

  const run = async (key: string, fn: () => Promise<unknown>, okText: string) => {
    setBusy(key)
    try {
      await fn()
      setComment('')
      toast.ok(okText)
      return true
    } catch (e) {
      toast.error(errorMessage(e, t('services.actionFailed')))
      return false
    } finally {
      setBusy(null)
    }
  }

  /** Nomzod natijasini tekshiradi va payload qaytaradi (`false` — xato). */
  const resultPayload = (): Record<string, unknown> | null | false => {
    if (!isApplication || !result.candidate_result) return null
    if (result.candidate_result === 'interview') {
      if (!result.interview_at || !result.interview_at.includes('T')) {
        setResultError(t('svc.interviewRequired'))
        return false
      }
      const prev = request.payload?.interview_at ? dayjs(String(request.payload.interview_at)).format('YYYY-MM-DDTHH:mm') : ''
      if (result.interview_at !== prev && dayjs(result.interview_at).isBefore(dayjs())) {
        setResultError(t('svc.interviewPast'))
        return false
      }
    }
    setResultError('')
    return mergeCandidateResult(request.payload, result)
  }

  const move = async (s: ServiceStatus) => {
    if (s === 'rejected' && !comment.trim()) {
      setCommentError(t('services.rejectReasonRequired'))
      return
    }
    setCommentError('')
    const payload = resultPayload()
    if (payload === false) return
    const ok = await confirm({
      kind: s === 'rejected' ? 'reject' : 'status',
      subject: request.number,
      confirmLabel: t(`services.status_${s}` as never),
    })
    if (!ok) return
    await run(s, () => changeStatus.mutateAsync({ id: request.id, toStatus: s, comment, payload }), t('services.statusChanged'))
  }

  const saveResult = async () => {
    const payload = resultPayload()
    if (!payload) return
    await run(
      'result',
      () => changeStatus.mutateAsync({ id: request.id, toStatus: request.status, comment, payload }),
      t('svc.resultSaved'),
    )
  }

  const download = async () => {
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

  const startEdit = () => {
    const p = request.payload ?? {}
    setEditPurpose(request.purpose ?? '')
    setEditPayload(Object.fromEntries(PAYLOAD_KEYS.map((k) => [k, p[k] == null ? '' : String(p[k])])))
    setEditErrors({})
    setEditError(null)
    setEditing(true)
  }

  const saveEdit = async () => {
    const body: Record<string, unknown> = { purpose: editPurpose.trim() || null }
    if (isApplication) {
      const fullName = [editPayload.last_name, editPayload.first_name, editPayload.middle_name]
        .map((x) => (x ?? '').trim())
        .filter(Boolean)
        .join(' ')
      body.payload = { ...(request.payload ?? {}), ...editPayload, full_name: fullName || null }
    }
    setBusy('edit')
    setEditError(null)
    try {
      await update.mutateAsync({ id: request.id, body })
      toast.ok(t('common.saved'))
      setEditing(false)
    } catch (e) {
      const fields = errorCode(e) === 'validation_error' ? errorParams(e).fields : null
      if (fields && typeof fields === 'object') {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(fields as Record<string, unknown>)) out[k.replace(/^payload\./, '')] = String(v)
        setEditErrors(out)
        setEditError(t('svc.checkFields'))
      } else {
        setEditError(errorMessage(e, t('services.actionFailed')))
      }
    } finally {
      setBusy(null)
    }
  }

  const payloadEntries = Object.entries(request.payload ?? {}).filter(
    ([k, v]) =>
      v != null &&
      String(v).trim() !== '' &&
      !RESULT_KEYS.includes(k) &&
      // HR's document text is edited in the reviewer block, not listed as data.
      !(k === 'document_notes' && reviewer) &&
      !(k === 'full_name' && request.payload?.last_name),
  )

  const canBuild = reviewer && !isApplication && DOCUMENT_STATUSES.includes(request.status)

  return (
    <div className="flex flex-col gap-5">
      {/* ── Holat zanjiri ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <ol className="flex flex-wrap items-center gap-1.5" aria-label={t('svc.progress')}>
          {STATUS_CHAIN.map((s, i) => {
            const done = chainIndex >= 0 && i <= chainIndex
            return (
              <li key={s} className="flex items-center gap-1.5">
                <span
                  aria-current={i === chainIndex ? 'step' : undefined}
                  className={cn(
                    'rounded-pill px-2.5 py-1 text-[11px] font-semibold',
                    done ? 'bg-brand text-fg-on-brand' : 'bg-fg/[0.06] text-fg-muted',
                  )}
                >
                  {t(`services.status_${s}` as never)}
                </span>
                {i < STATUS_CHAIN.length - 1 && (
                  <span className={cn('h-px w-4', done && i < chainIndex ? 'bg-brand' : 'bg-line')} />
                )}
              </li>
            )
          })}
        </ol>
        {(request.status === 'rejected' || request.status === 'cancelled') && <StatusBadge status={request.status} />}
      </div>

      {/* ── Ma'lumotlar ──────────────────────────────────────────────── */}
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
        <Row
          label={t('services.submittedAt')}
          value={fmtStamp(request.submitted_at)}
        />
        {request.assignee_name && <Row label={t('services.assignee')} value={request.assignee_name} />}
        {request.due_date && <Row label={t('services.dueDate')} value={dayjs(request.due_date).format('DD.MM.YYYY')} />}
        {request.closed_at && (
          <Row label={t('svc.closedAt')} value={fmtStamp(request.closed_at)} />
        )}
      </dl>

      {isApplication && <CandidateResultBadge payload={request.payload} />}

      {request.resolution && (
        <div className="rounded-inner border border-line bg-surface-2 px-3 py-2.5">
          <p className="text-[11.5px] text-fg-subtle">{t('svc.resolution')}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-fg">{request.resolution}</p>
        </div>
      )}

      {editing ? (
        <div className="flex flex-col gap-3 rounded-inner border border-brand/30 bg-brand-soft p-3">
          {isApplication && (
            <div className="grid gap-3 sm:grid-cols-2">
              {PAYLOAD_KEYS.map((k) => (
                <Field
                  key={k}
                  label={payloadLabel(k)}
                  required={k === 'last_name' || k === 'first_name' || k === 'phone'}
                  error={editErrors[k] || (k === 'last_name' ? editErrors.full_name : '') || undefined}
                >
                  <Input
                    value={editPayload[k] ?? ''}
                    type={k === 'email' ? 'email' : 'text'}
                    onChange={(e) => setEditPayload((p) => ({ ...p, [k]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
          )}
          <Field
            label={isApplication ? t('svc.aboutYou') : t('svc.purposeLabel')}
            required={!isApplication}
            error={editErrors.purpose || undefined}
          >
            <Textarea rows={3} value={editPurpose} onChange={(e) => setEditPurpose(e.target.value)} />
          </Field>
          <FormError>{editError}</FormError>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy === 'edit'}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" leftIcon={<Save size={14} />} loading={busy === 'edit'} onClick={saveEdit}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {request.purpose && (
            <div>
              <p className="text-[11.5px] text-fg-subtle">{isApplication ? t('svc.aboutYou') : t('svc.purposeLabel')}</p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{request.purpose}</p>
            </div>
          )}
          {payloadEntries.length > 0 && (
            <dl className="grid gap-x-6 gap-y-2 rounded-inner bg-surface-2 p-3 sm:grid-cols-2">
              {payloadEntries.map(([k, v]) => (
                <Row key={k} label={payloadLabel(k)} value={String(v)} />
              ))}
            </dl>
          )}
        </>
      )}

      {/* ── Biriktirilgan hujjatlar (TZ I1 1597) ─────────────────────── */}
      <ServiceAttachmentsSection request={request} canEdit={owner && editable} />

      {/* ── Ko'rib chiquvchi amallari ────────────────────────────────── */}
      {reviewer && (nextStates.length > 0 || canBuild || (isApplication && request.status !== 'cancelled')) && (
        <div className="flex flex-col gap-2.5 rounded-inner border border-line p-3.5">
          {isApplication && request.status !== 'cancelled' && (
            <CandidateResultEditor
              value={result}
              onChange={(v) => {
                setResult(v)
                setResultError('')
              }}
              error={resultError}
            />
          )}
          {(nextStates.length > 0 || isApplication) && (
            <Field label={t('svc.comment')} error={commentError || undefined}>
              <Textarea
                value={comment}
                rows={2}
                placeholder={t('svc.commentPh')}
                onChange={(e) => {
                  setComment(e.target.value)
                  if (commentError) setCommentError('')
                }}
              />
            </Field>
          )}
          {/* TZ 4.2.12 · 2292 «Передача заявки … соответствующему специалисту». */}
          {request.status !== 'cancelled' && reviewers.length > 0 && (
            <Field label={t('services.assignee')}>
              <Select
                value={request.assignee_id ? String(request.assignee_id) : ''}
                disabled={!!busy}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (!v) return
                  void run(
                    'assign',
                    () => assign.mutateAsync({ id: request.id, status: request.status, assigneeId: v }),
                    t('svc.assigned'),
                  )
                }}
                options={[
                  { value: '', label: t('svc.assigneeNone') },
                  ...reviewers.map((r) => ({ value: String(r.id), label: r.is_me ? `${r.name} (${t('svc.me')})` : r.name })),
                ]}
              />
            </Field>
          )}
          {canBuild && (
            <Field label={t('svc.docNotes')} hint={t('svc.docNotesHint')}>
              <Textarea rows={3} value={docNotes} maxLength={4000} onChange={(e) => setDocNotes(e.target.value)} />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            {nextStates.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === 'rejected' ? 'danger' : 'secondary'}
                loading={busy === s}
                disabled={!!busy && busy !== s}
                leftIcon={s === 'rejected' ? <X size={14} /> : <Check size={14} />}
                onClick={() => move(s)}
              >
                {t(`services.status_${s}` as never)}
              </Button>
            ))}
            {isApplication && request.status !== 'cancelled' && result.candidate_result && (
              <Button size="sm" variant="outline" loading={busy === 'result'} disabled={!!busy && busy !== 'result'} onClick={saveResult}>
                {t('svc.saveResult')}
              </Button>
            )}
            {canBuild && (
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'doc'}
                disabled={!!busy && busy !== 'doc'}
                leftIcon={<FileText size={14} />}
                onClick={async () => {
                  if (!(await confirm({ kind: 'action', confirmLabel: t('services.buildDocument') }))) return
                  await run('doc', () => buildDocument.mutateAsync({ id: request.id, notes: docNotes }), t('services.documentBuilt'))
                }}
              >
                {t('services.buildDocument')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Hujjat va egasining amallari ─────────────────────────────── */}
      {(request.has_document || (owner && editable && !editing)) && (
        <div className="flex flex-wrap gap-2">
          {request.has_document && (
            <Button size="sm" variant="outline" loading={busy === 'download'} leftIcon={<Download size={14} />} onClick={download}>
              {t('services.downloadDocument')}
            </Button>
          )}
          {owner && editable && !editing && (
            <>
              <Button size="sm" variant="secondary" leftIcon={<Pencil size={14} />} disabled={!!busy} onClick={startEdit}>
                {t('svc.edit')}
              </Button>
              <Button
                size="sm"
                variant="danger-ghost"
                leftIcon={<Ban size={14} />}
                loading={busy === 'cancel'}
                disabled={!!busy && busy !== 'cancel'}
                onClick={async () => {
                  const ok = await confirm({
                    kind: 'reject',
                    title: t('services.cancelRequest'),
                    description: t('svc.cancelConfirm'),
                    confirmLabel: t('svc.cancelYes'),
                  })
                  if (!ok) return
                  await run('cancel', () => cancel.mutateAsync({ id: request.id }), t('services.cancelled'))
                }}
              >
                {t('services.cancelRequest')}
              </Button>
            </>
          )}
        </div>
      )}
      {owner && ['in_review', 'in_progress'].includes(request.status) && (
        <p className="text-[11.5px] text-fg-subtle">{t('svc.lockedHint')}</p>
      )}

      {/* ── Tarix ────────────────────────────────────────────────────── */}
      <section>
        <p className="engrave mb-2 flex items-center gap-1.5 text-fg">
          <MessageSquare size={13} /> {t('svc.history')}
        </p>
        {request.events.length === 0 ? (
          <p className="text-[12.5px] text-fg-subtle">—</p>
        ) : (
          <ul className="space-y-1.5">
            {request.events.map((e) => (
              <li key={e.id} className="rounded-inner bg-surface-2 px-3 py-2 text-xs text-fg-muted">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge status={e.to_status} />
                  <span className="ml-auto whitespace-nowrap text-fg-subtle">
                    {e.actor_name ?? '—'}
                    {e.created_at ? ` · ${fmtStamp(e.created_at)}` : ''}
                  </span>
                </div>
                {e.comment && <p className="mt-1.5 whitespace-pre-wrap text-fg">{e.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 break-words text-[13px] text-fg">{value}</dd>
    </div>
  )
}
