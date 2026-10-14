import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ln, lt } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Link } from 'react-router-dom'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  FilePen,
  FileText,
  History,
  Paperclip,
  Pencil,
  Printer,
  Trash2,
  PlayCircle,
  Send,
  Undo2,
  Users,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { DateInput } from '@/components/ui/DateInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { fmtDate, fmtDateTime } from './format'
import { cn } from '@/lib/cn'
import { useAuthStore } from '@/store/authStore'
import { wordDiff } from './wordDiff'
import { RejectReasonModal } from './RejectReasonModal'
import { useDismissalReasonOptions } from './OrderTypeFields'
import { OrderStatusBadge, decreeStatusLabel } from './OrderStatusBadge'
import { canCorrectOrder, canWithdrawOrder, hasEmployeeSigned, isDecreeOrder, isKnownDecreeStatus, orderPowers } from './orderFlow'
import { WithdrawOrderModal } from './OrderCorrection'
import {
  ALL_DETAIL_KEYS,
  DATE_KEYS,
  TYPE_DETAIL_KEYS,
  detailLabel,
  orderTypeLabel,
  orderTypeOfCategory,
  type OrderTypeCode,
} from './orderTypes'
import { useOrder, useOrderHistory, useOrderMutations, type OrderAct, type OrderHistoryRow } from './useOrders'
import { numberLocale } from '@/lib/format'

/** Categories whose apply takes only a start date (+ «Doimiy»): v1 SPECIAL_APPLY_TYPES. */
const SPECIAL_APPLY_TYPES = [7, 8, 9, 11, 13]
const TEXT_FIELDS = new Set(['description', 'summary'])
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
/** Same words, whatever apostrophe either side was typed with. */
const sameText = (a?: string | null, b?: string | null) =>
  (a ?? '').replace(/[‘’ʻʼ`´']/g, "'").trim().toLowerCase() === (b ?? '').replace(/[‘’ʻʼ`´']/g, "'").trim().toLowerCase()

function historyFieldLabel(t: TFunction, field?: string | null): string {
  switch (field) {
    case 'description': return t('orders.fText')
    case 'document': return t('orders.document')
    case 'summary': return t('orders.fSummary')
    case 'act_number': return t('orders.colNumberFull')
    case 'act_date': return t('orders.colDateFull')
    case 'category_id': return t('orders.colTypeFull')
    case 'details': return t('orders.h_details')
    case 'employee_ids': return t('orders.fEmployees')
    case 'change_reason': return t('orders.fChangeReason')
    case 'status': return t('orders.colStatus')
    case 'employee_id': return t('orders.h_employee')
    case 'created_by_id': return t('orders.fAuthor')
    case 'submitter_id': return t('orders.fSubmitter')
    case 'department_id': return t('orders.h_department')
    case 'effective_start_date': return t('orders.h_effectiveStart')
    case 'effective_end_date': return t('orders.h_effectiveEnd')
    case 'assigned_signers': return t('orders.h_signers')
    case 'corrects_order_act_id': return t('ordVac.h_corrects')
    case 'corrected_by_order_act_id': return t('ordVac.h_correctedBy')
    case 'withdrawn': return t('ordVac.h_withdrawn')
    default: return field || t('orders.document')
  }
}

const isoToDmy = (v: unknown) => (ISO_DATE.test(String(v ?? '')) ? fmtDate(String(v).slice(0, 10)) : String(v ?? ''))

function historyValue(t: TFunction, h: OrderHistoryRow, which: 'old' | 'new', type: OrderTypeCode | null): string {
  const raw = which === 'old' ? h.old_text : h.new_text
  const disp = which === 'old' ? h.old_display : h.new_display
  if (raw == null && disp == null) return '—'
  if (h.field === 'status' || h.field === 'withdrawn') return isKnownDecreeStatus(raw) ? decreeStatusLabel(t, raw) : raw || '—'
  if (disp && typeof disp === 'object' && !Array.isArray(disp)) {
    const parts = Object.entries(disp as Record<string, unknown>).map(([k, v]) => `${detailLabel(t, k, type)}: ${isoToDmy(v)}`)
    return parts.length ? parts.join('; ') : '—'
  }
  if (disp != null && disp !== '') return String(disp)
  return isoToDmy(raw) || '—'
}

/**
 * «Buyruq tafsilotlari» (TZ O3: number, date, type, employees, status,
 * attachments) with the decree workflow (O1 «На согласование», 2154 apply),
 * the edit history with a word-level diff (O2) — v1 `OrderDetailModal`.
 */
export function OrderDetailDrawer({
  id,
  onClose,
  onOpenDocument,
  readOnly = false,
  onOpenOrder,
  onCorrective,
  onEdit,
  onDelete,
  onPrint,
}: {
  id: number | null
  onClose: () => void
  onOpenDocument: (o: OrderAct) => void
  /** Follow a corrective-order link (TZ O2 1224) inside the same drawer. */
  onOpenOrder?: (id: number) => void
  /** «Tuzatuvchi buyruq» — open the create form filled from this locked order. */
  onCorrective?: (id: number) => void
  /** «Sana bo'yicha holat» — the list is a past snapshot: no workflow buttons. */
  readOnly?: boolean
  /** TZ O2 «Редактировать» on the order card. */
  onEdit?: (o: OrderAct) => void
  /** TZ 2197 «Удаление приказов» on the order card. */
  onDelete?: (o: OrderAct) => void
  /** TZ O1/O3 «Печать» — the printable decree. */
  onPrint?: (o: OrderAct) => void
}) {
  const { t } = useTranslation()
  const { order, loading, error } = useOrder(id)
  // Asked only once the order itself opened — a 403 order has no history to show.
  const history = useOrderHistory(order && order.id === id ? id : null)
  const user = useAuthStore((s) => s.user)
  const mut = useOrderMutations()
  const confirm = useConfirm()
  const toast = useToast()
  const [historyOpen, setHistoryOpen] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)

  useEffect(() => {
    setHistoryOpen(false)
    setApplyOpen(false)
    setWithdrawing(false)
  }, [id])

  const decree = isDecreeOrder(order)
  const powers = order && !readOnly ? orderPowers(order, user) : null
  const orderType = orderTypeOfCategory(order?.category_rel)
  const busy =
    mut.submit.isPending ||
    mut.confirmSubmission.isPending ||
    mut.approve.isPending ||
    mut.decreeReject.isPending ||
    mut.resubmit.isPending ||
    mut.sendToLeadership.isPending ||
    mut.sign.isPending ||
    mut.reject.isPending

  const run = async (p: () => Promise<unknown>, done: string) => {
    try {
      await p()
    } catch {
      return false
    }
    mut.invalidate()
    toast.ok(done)
    return true
  }

  const title = order
    ? `${order.act_number ? t('orders.orderNo', { n: order.act_number }) : t('orders.noNumber')} — ${ln(order.category_rel) || t('orders.order')}`
    : t('orders.detailTitle')

  const approve = async () => {
    if (!order) return
    const ok = await confirm({ kind: 'approve', title: t('orders.agreeTitle'), description: t('orders.agreeConfirm'), confirmLabel: t('orders.agreeYes') })
    if (!ok) return
    if (decree) await run(() => mut.approve.mutateAsync(order.id), t('orders.agreed'))
    else await run(() => mut.sign.mutateAsync(order.id), t('orders.signedDone'))
  }

  const actions: ReactNode[] = []
  if (order && powers) {
    if (powers.approveReject || powers.signLegacy) {
      actions.push(
        <Button key="rej" variant="danger" leftIcon={<XCircle size={15} />} disabled={busy} onClick={() => setRejecting(true)}>
          {t('orders.reject')}
        </Button>,
        <Button key="ok" leftIcon={<CheckCircle2 size={15} />} disabled={busy} onClick={approve}>
          {decree ? t('orders.agree') : t('orders.sign')}
        </Button>,
      )
    }
    if (powers.submit)
      actions.push(
        <Button key="submit" leftIcon={<Send size={15} />} disabled={busy} onClick={() => run(() => mut.submit.mutateAsync(order.id), t('orders.submitted'))}>
          {submitLabel(t, order)}
        </Button>,
      )
    if (powers.confirmSubmission)
      actions.push(
        <Button key="confirm" leftIcon={<CheckCircle2 size={15} />} disabled={busy} title={t('orders.confirmAsSubmitter')} onClick={() => run(() => mut.confirmSubmission.mutateAsync(order.id), t('orders.confirmedDone'))}>
          {t('orders.confirmSubmission')}
        </Button>,
      )
    if (powers.sendToLeadership)
      actions.push(
        <Button key="lead" leftIcon={<Send size={15} />} disabled={busy} onClick={() => run(() => mut.sendToLeadership.mutateAsync(order.id), t('orders.sentToLeadership'))}>
          {t('orders.sendToLeadership')}
        </Button>,
      )
    if (powers.resubmit)
      actions.push(
        <Button key="resubmit" leftIcon={<Send size={15} />} disabled={busy} onClick={() => run(() => mut.resubmit.mutateAsync(order.id), t('orders.resubmitted'))}>
          {t('orders.resubmit')}
        </Button>,
      )
    if (canWithdrawOrder(order, user))
      actions.push(
        <Button key="withdraw" variant="outline" leftIcon={<Undo2 size={15} />} disabled={busy} onClick={() => setWithdrawing(true)}>
          {t('ordVac.withdraw')}
        </Button>,
      )
    if (onCorrective && canCorrectOrder(order, user))
      actions.push(
        <Button key="corrective" variant="secondary" leftIcon={<FilePen size={15} />} onClick={() => onCorrective(order.id)}>
          {t('ordVac.corrective')}
        </Button>,
      )
    if (powers.apply && !applyOpen)
      actions.push(
        <Button key="apply" variant="secondary" leftIcon={<PlayCircle size={15} />} onClick={() => setApplyOpen(true)}>
          {t('orders.apply')}
        </Button>,
      )
    if (powers.delete && onDelete)
      actions.unshift(
        <Button key="delete" variant="outline" className="text-danger" leftIcon={<Trash2 size={15} />} disabled={busy} onClick={() => onDelete(order)}>
          {t('common.delete')}
        </Button>,
      )
    if (powers.edit && onEdit)
      actions.unshift(
        <Button key="edit" variant="outline" leftIcon={<Pencil size={15} />} disabled={busy} onClick={() => onEdit(order)}>
          {t('common.edit')}
        </Button>,
      )
  }
  const errStatus = isAxiosError(error) ? error.response?.status : undefined

  return (
    <Modal
      open={id != null}
      onClose={onClose}
      placement="right"
      size="lg"
      title={title}
      footer={
        <>
          {order && (
            <div className="mr-auto flex gap-1">
              <Button variant="ghost" leftIcon={<FileText size={15} />} onClick={() => onOpenDocument(order)}>
                {t('orders.openDocument')}
              </Button>
              {onPrint && (
                <Button variant="ghost" leftIcon={<Printer size={15} />} onClick={() => onPrint(order)}>
                  {t('ordVac.print')}
                </Button>
              )}
            </div>
          )}
          {actions.length ? actions : <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>}
        </>
      }
    >
      {error ? (
        errStatus === 403 ? (
          // TZ O3 1248 «Нет доступа к приказу — «Доступ запрещён»».
          <EmptyState icon={<FileText size={22} />} title={t('ordVac.accessDenied')} description={t('ordVac.accessDeniedHint')} />
        ) : errStatus === 404 ? (
          <EmptyState icon={<FileText size={22} />} title={t('orders.notFound')} description={t('orders.notFoundHint')} />
        ) : (
          <EmptyState icon={<FileText size={22} />} title={t('orders.notFound')} description={errorMessage(error, t('orders.notFoundHint'))} />
        )
      ) : loading || !order ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {readOnly && (
            <p className="flex items-center gap-2 rounded-inner border border-warning/30 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              <History size={14} className="shrink-0" /> {t('orders.detailCurrentHint')}
            </p>
          )}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Meta label={t('orders.colNumberFull')}>{order.act_number || '—'}</Meta>
            <Meta label={t('orders.colDateFull')}>{fmtDate(order.act_date)}</Meta>
            <Meta label={t('orders.colTypeFull')}>
              {ln(order.category_rel) || '—'}
              {orderType && !sameText(orderTypeLabel(t, orderType), ln(order.category_rel)) && (
                <Badge tone="brand" className="ml-2">{orderTypeLabel(t, orderType)}</Badge>
              )}
            </Meta>
            <Meta label={t('orders.colStatus')}><OrderStatusBadge order={order} /></Meta>
            {(order.department_name || order.department_id) && (
              <Meta label={t('orders.fDepartment')}>{lt(order.department_name) || <DepartmentName id={order.department_id} branchId={order.organization_branch_id} />}</Meta>
            )}
            {(order.created_by?.legal_name || order.employee?.legal_name) && (
              <Meta label={t('orders.fAuthor')}>{order.created_by?.legal_name || order.employee?.legal_name}</Meta>
            )}
            {decree && order.submitter?.legal_name && <Meta label={t('orders.fSubmitter')}>{order.submitter.legal_name}</Meta>}
          </dl>

          <CorrectionLinks order={order} onOpenOrder={onOpenOrder} />

          {order.summary && (
            <section>
              <h3 className="mb-1 text-[12px] font-semibold text-fg-subtle">{t('orders.fSummary')}</h3>
              <p className="whitespace-pre-wrap text-[13.5px] text-fg">{order.summary}</p>
            </section>
          )}
          {order.description && (
            <section>
              <h3 className="mb-1 text-[12px] font-semibold text-fg-subtle">{t('orders.fText')}</h3>
              <p className="whitespace-pre-wrap rounded-panel border border-line bg-surface-2/40 p-3 text-[13.5px] leading-relaxed text-fg">
                {order.description}
              </p>
            </section>
          )}

          <DetailsBlock order={order} type={orderType} />
          <EmployeesBlock order={order} />
          <MentionedBlock order={order} />

          {order.rejection_reason && (
            <div className="rounded-panel border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px]">
              <p className="text-[11.5px] font-semibold text-danger">{t('orders.rejectionReason')}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-fg">{order.rejection_reason}</p>
              {order.rejected_by?.legal_name && (
                <p className="mt-1 text-[12px] text-fg-muted">{t('orders.rejectedBy', { name: order.rejected_by.legal_name })}</p>
              )}
            </div>
          )}

          <Attachments order={order} />
          <Signers order={order} />

          {powers?.apply && applyOpen && (
            <ApplyPanel order={order} type={orderType} onClose={() => setApplyOpen(false)} />
          )}

          {history.rows.length > 0 && (
            <section className="rounded-panel border border-line">
              <button
                type="button"
                onClick={() => setHistoryOpen((o) => !o)}
                aria-expanded={historyOpen}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
              >
                <span className="flex items-center gap-2 text-[13.5px] font-semibold text-fg">
                  <History size={15} className="text-brand" /> {t('orders.historyTitle', { n: history.rows.length })}
                </span>
                <ChevronDown size={16} className={cn('text-fg-subtle transition-transform', historyOpen && 'rotate-180')} />
              </button>
              {historyOpen && (
                <ul className="space-y-2 border-t border-line p-3">
                  {history.rows.map((h) => (
                    <HistoryItem key={h.id} h={h} type={orderType} onOpenOrder={onOpenOrder} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      <WithdrawOrderModal
        open={withdrawing}
        number={order?.act_number || order?.id}
        loading={mut.withdraw.isPending}
        onClose={() => setWithdrawing(false)}
        onSubmit={async (reason) => {
          if (!order) return
          const ok = await run(() => mut.withdraw.mutateAsync({ id: order.id, reason }), t('ordVac.withdrawn'))
          if (ok) setWithdrawing(false)
        }}
      />

      <RejectReasonModal
        open={rejecting}
        loading={mut.decreeReject.isPending || mut.reject.isPending}
        onClose={() => setRejecting(false)}
        onSubmit={async (reason) => {
          if (!order) return
          const ok = decree
            ? await run(() => mut.decreeReject.mutateAsync({ id: order.id, comment: reason }), t('orders.rejectedDone'))
            : await run(() => mut.reject.mutateAsync(order.id), t('orders.rejectedDone'))
          if (ok) setRejecting(false)
        }}
      />
    </Modal>
  )
}

export function submitLabel(t: TFunction, o: OrderAct): string {
  const submitter = o.submitter_id ?? o.submitter?.id
  const creator = o.created_by_id ?? o.created_by?.id
  return submitter && creator && Number(submitter) !== Number(creator) ? t('orders.submitToSubmitter') : t('orders.submitToApprovers')
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center text-[13.5px] font-medium text-fg">{children}</dd>
    </div>
  )
}

/**
 * TZ O2 1224 — the two directions of a correction: «Nº X buyruqni tuzatadi»
 * (this order corrects X) and «Nº Y buyruq bilan tuzatilgan» (Y corrects it).
 */
function CorrectionLinks({ order, onOpenOrder }: { order: OrderAct; onOpenOrder?: (id: number) => void }) {
  const { t } = useTranslation()
  const { order: corrected } = useOrder(order.corrects_order_act_id ?? null)
  const correctors = order.corrective_orders ?? []
  if (!order.corrects_order_act_id && !correctors.length) return null
  const link = (id: number, text: string) =>
    onOpenOrder ? (
      <button type="button" onClick={() => onOpenOrder(id)} className="font-semibold text-brand hover:underline">
        {text}
      </button>
    ) : (
      <span className="font-semibold text-fg">{text}</span>
    )
  const num = (n?: string | null, id?: number) => (n ? `№${n}` : `#${id}`)
  return (
    <section className="space-y-1.5 rounded-panel border border-brand/25 bg-brand-soft/50 px-3 py-2.5 text-[13px]">
      {order.corrects_order_act_id && (
        <p className="flex flex-wrap items-center gap-1.5 text-fg-muted">
          <FilePen size={14} className="shrink-0 text-brand" />
          {link(order.corrects_order_act_id, t('ordVac.correctsLink', { n: num(corrected?.act_number, order.corrects_order_act_id) }))}
        </p>
      )}
      {correctors.map((c) => (
        <p key={c.id} className="flex flex-wrap items-center gap-1.5 text-fg-muted">
          <FilePen size={14} className="shrink-0 text-warning" />
          {link(c.id, t('ordVac.correctedByLink', { n: num(c.act_number, c.id) }))}
          {isKnownDecreeStatus(c.status) && <span className="text-[11.5px] text-fg-subtle">· {decreeStatusLabel(t, c.status)}</span>}
        </p>
      ))}
    </section>
  )
}

function DepartmentName({ id, branchId }: { id?: number | null; branchId?: number | null }) {
  const options = useDepartmentOptions(branchId)
  return <>{options.find((o) => o.value === String(id))?.label ?? `#${id}`}</>
}

function DetailsBlock({ order, type }: { order: OrderAct; type: OrderTypeCode | null }) {
  const { t } = useTranslation()
  const details = (order.details && typeof order.details === 'object' ? order.details : {}) as Record<string, unknown>
  const keys = (type ? TYPE_DETAIL_KEYS[type] : ALL_DETAIL_KEYS).filter((k) => details[k] != null && details[k] !== '')
  const positions = useJobPositionOptions(order.organization_branch_id)
  const departments = useDepartmentOptions(order.organization_branch_id)
  const reasons = useDismissalReasonOptions(keys.includes('dismissal_reason_code'))
  const transferDate = type === 'transfer' ? order.effective_start_date : null
  if (!keys.length && !transferDate) return null
  const value = (k: string) => {
    const v = details[k]
    if (DATE_KEYS.has(k)) return isoToDmy(v)
    if (k === 'salary') {
      const n = Number(v)
      return Number.isFinite(n) ? `${n.toLocaleString(numberLocale())} ${t('orders.sum')}` : String(v)
    }
    if (k === 'position_id') return positions.find((o) => o.value === String(v))?.label ?? `#${v}`
    if (k === 'department_id') return departments.find((o) => o.value === String(v))?.label ?? `#${v}`
    if (k === 'dismissal_reason_code') return reasons.options.find((o) => o.value === String(v))?.label ?? String(v)
    return String(v)
  }
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-brand-strong">
        {type ? t('orders.typeBlock', { type: orderTypeLabel(t, type) }) : t('orders.h_details')}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-panel border border-line p-3 sm:grid-cols-2">
        {transferDate && <Meta label={t('orders.d_transferDate')}>{fmtDate(transferDate)}</Meta>}
        {keys.map((k) => (
          <Meta key={k} label={detailLabel(t, k, type)}>{value(k)}</Meta>
        ))}
      </dl>
    </section>
  )
}

function EmployeesBlock({ order }: { order: OrderAct }) {
  const { t } = useTranslation()
  const names = new Map((order.employees ?? []).map((e) => [e.id, e.full_name]))
  const ids = (order.employee_ids ?? []).length ? (order.employee_ids ?? []) : [...names.keys()]
  if (!ids.length) return null
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-brand-strong">
        <Users size={14} /> {t('orders.employeesCount', { n: ids.length })}
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {ids.map((eid) => (
          <li key={eid}>
            <Link
              to={`/employees/${eid}`}
              className="inline-flex rounded-pill border border-line bg-surface px-2.5 py-1 text-[12.5px] text-brand transition-colors hover:bg-brand-soft"
            >
              {names.get(eid) || `#${eid}`}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** TZ 2173/2204: employees named in the text, linked to their cards on save. */
function MentionedBlock({ order }: { order: OrderAct }) {
  const { t } = useTranslation()
  const people = order.mentioned_employees ?? []
  if (!people.length) return null
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-brand-strong">
        <Users size={14} /> {t('ordVac.mentionedCount', { n: people.length })}
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <li key={p.id}>
            <Link
              to={`/employees/${p.id}`}
              className="inline-flex rounded-pill border border-dashed border-line bg-surface px-2.5 py-1 text-[12.5px] text-brand transition-colors hover:bg-brand-soft"
            >
              {p.full_name || `#${p.id}`}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Attachments({ order }: { order: OrderAct }) {
  const { t } = useTranslation()
  const files = (order.documents ?? []).filter((d) => !(d.document_objectname ?? '').startsWith('decree_'))
  if (!files.length) return null
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('orders.attachments')}</h3>
      <ul className="space-y-1.5">
        {files.map((d) => (
          <li key={d.id}>
            <a
              href={d.file_path ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-inner border border-line px-3 py-2 text-[13px] text-brand transition-colors hover:bg-brand-soft"
            >
              <Paperclip size={14} className="shrink-0" />
              <span className="truncate">{d.file_name || d.document_objectname || t('orders.file')}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

function SignerStateBadge({ state, leadership }: { state: 'signed' | 'rejected' | 'waiting'; leadership?: boolean }) {
  const { t } = useTranslation()
  if (state === 'signed') return <Badge tone="success">{leadership ? t('orders.signedMark') : t('orders.agreedMark')}</Badge>
  if (state === 'rejected') return <Badge tone="danger">{t('orders.rejectedMark')}</Badge>
  return <Badge tone="warning">{t('orders.waiting')}</Badge>
}

function Signers({ order }: { order: OrderAct }) {
  const { t } = useTranslation()
  const signers = order.assigned_signers ?? []
  const state = (empId?: number | null): 'signed' | 'rejected' | 'waiting' =>
    hasEmployeeSigned(order, empId) ? 'signed' : order.rejected_by?.id != null && Number(order.rejected_by.id) === Number(empId) ? 'rejected' : 'waiting'
  const row = (key: string | number, name: string, badge: ReactNode, sub?: string) => (
    <li key={key} className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-[13px] text-fg">{name}</span>
        {sub && <span className="block truncate text-[11.5px] text-fg-subtle">{sub}</span>}
      </span>
      {badge}
    </li>
  )

  if (isDecreeOrder(order)) {
    const approvers = signers.filter((s) => s.signer_type === 'approver')
    const leaders = signers.filter((s) => s.signer_type === 'leadership')
    if (!approvers.length && !leaders.length) return null
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {approvers.length > 0 && (
          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('orders.approversList')}</h3>
            <ul className="divide-y divide-line rounded-panel border border-line">
              {approvers.map((s, i) => row(s.id ?? i, s.employee?.legal_name || t('orders.unknown'), <SignerStateBadge state={state(s.employee_id)} />))}
            </ul>
          </section>
        )}
        {leaders.length > 0 && (
          <section>
            <h3 className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('orders.signerTitle')}</h3>
            <ul className="divide-y divide-line rounded-panel border border-line">
              {leaders.map((s, i) => row(s.id ?? i, s.employee?.legal_name || t('orders.unknown'), <SignerStateBadge state={state(s.employee_id)} leadership />))}
            </ul>
          </section>
        )}
      </div>
    )
  }

  // Legacy act: the author, then everyone assigned to sign, in order.
  return (
    <section>
      <h3 className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('orders.chronology')}</h3>
      <ol className="divide-y divide-line rounded-panel border border-line">
        {row('creator', order.created_by?.legal_name || order.employee?.legal_name || t('orders.unknown'), <Badge tone="success">{t('orders.author')}</Badge>)}
        {signers.map((s, i) => row(s.id ?? i, s.employee?.legal_name || t('orders.unknown'), <SignerStateBadge state={state(s.employee_id)} leadership={s.signer_type === 'main'} />))}
      </ol>
    </section>
  )
}

function HistoryItem({ h, type, onOpenOrder }: { h: OrderHistoryRow; type: OrderTypeCode | null; onOpenOrder?: (id: number) => void }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const isReason = h.field === 'change_reason'
  const reason = isReason ? h.new_text || h.change_reason : h.change_reason
  const isText = TEXT_FIELDS.has(h.field ?? '') || !h.field
  const oldText = h.old_text ?? ''
  const newText = h.new_text
  const long = oldText.length > 160 || (newText ?? '').length > 160
  const parts = useMemo(() => (isText && newText != null ? wordDiff(oldText, newText) : null), [isText, oldText, newText])

  return (
    <li className="rounded-inner border border-line bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-fg">{h.editor?.legal_name || h.editor_name || t('orders.system')}</span>
        <span className="text-[11.5px] tabular-nums text-fg-subtle">{h.created_at ? fmtDateTime(h.created_at) : ''}</span>
      </div>
      <p className={cn('mt-0.5 text-[12px]', isReason ? 'text-warning' : 'text-brand-strong')}>
        {isReason ? historyFieldLabel(t, h.field) : t('orders.fieldChanged', { field: historyFieldLabel(t, h.field) })}
      </p>
      {reason && (
        <p className="mt-1 text-[12.5px] text-fg">
          {!isReason && <span className="text-fg-subtle">{t('orders.reasonPrefix')} </span>}
          {reason}
        </p>
      )}
      {isReason ? null : (h.field === 'corrects_order_act_id' || h.field === 'corrected_by_order_act_id') && /^\d+$/.test(h.new_text ?? '') ? (
        <p className="mt-1 text-[12.5px]">
          {onOpenOrder ? (
            <button type="button" onClick={() => onOpenOrder(Number(h.new_text))} className="font-semibold text-brand hover:underline">
              {historyValue(t, h, 'new', type)}
            </button>
          ) : (
            <span className="text-success">{historyValue(t, h, 'new', type)}</span>
          )}
        </p>
      ) : !isText ? (
        <p className="mt-1 text-[12.5px]">
          <span className="text-danger">{historyValue(t, h, 'old', type)}</span>
          <span className="text-fg-subtle"> → </span>
          <span className="text-success">{historyValue(t, h, 'new', type)}</span>
        </p>
      ) : parts ? (
        <>
          <div className="mt-1.5 flex gap-3 text-[11px] text-fg-subtle">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-pill bg-danger" /> {t('orders.diffRemoved')}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-pill bg-success" /> {t('orders.diffAdded')}</span>
          </div>
          <p className={cn('mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg', !expanded && long && 'line-clamp-4')}>
            {parts.map((p, i) =>
              p.kind === 'del' ? (
                <span key={i} className="bg-danger-soft text-danger line-through">{p.text}</span>
              ) : p.kind === 'add' ? (
                <span key={i} className="bg-success-soft text-success">{p.text}</span>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
          </p>
          {long && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-[12px] text-brand hover:underline">
              {expanded ? t('orders.collapse') : t('orders.showFull')}
            </button>
          )}
        </>
      ) : oldText ? (
        <>
          <p className={cn('mt-1 whitespace-pre-wrap text-[12.5px] text-fg-muted', !expanded && long && 'line-clamp-4')}>{oldText}</p>
          {long && (
            <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-[12px] text-brand hover:underline">
              {expanded ? t('orders.collapse') : t('orders.showFull')}
            </button>
          )}
        </>
      ) : null}
    </li>
  )
}

/** TZ 2154 / 2126 — put a confirmed decree into effect for its employees. */
function ApplyPanel({ order, type, onClose }: { order: OrderAct; type: OrderTypeCode | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useOrderMutations()
  const candidates = useMemo(() => {
    const out: { value: string; label: string }[] = []
    const seen = new Set<number>()
    const push = (id: number | null | undefined, name?: string | null) => {
      if (id == null || seen.has(Number(id))) return
      seen.add(Number(id))
      out.push({ value: String(id), label: name || `#${id}` })
    }
    ;(order.employees ?? []).forEach((e) => push(e.id, e.full_name))
    ;(order.employee_ids ?? []).forEach((id) => push(id))
    return out
  }, [order])
  const d = (order.details ?? {}) as Record<string, unknown>
  const startDefault = String(d.dismissal_date || d.hire_date || d.leave_from || d.trip_from || order.effective_start_date || order.act_date || '').slice(0, 10)
  const endDefault = String(d.leave_to || d.trip_to || order.effective_end_date || '').slice(0, 10)
  const [ids, setIds] = useState<string[]>(() => candidates.map((c) => c.value))
  const [start, setStart] = useState(startDefault)
  const [end, setEnd] = useState(endDefault)
  const [permanent, setPermanent] = useState(false)
  const catType = order.category_rel?.type
  const special = catType != null && SPECIAL_APPLY_TYPES.includes(Number(catType))
  const needsEnd = !special && (type === 'vacation' || type === 'business_trip' || catType != null) && !['dismissal', 'hire', 'transfer'].includes(type ?? '')
  const effect =
    type === 'dismissal'
      ? t('orders.applyEffectDismissal', { n: order.act_number || '—' })
      : type === 'vacation' || type === 'business_trip'
        ? t('orders.applyEffectPeriod')
        : type === 'hire' || type === 'transfer'
          ? t('orders.applyEffectPosition')
          : t('orders.applyEffectDefault')

  const submit = async () => {
    if (!ids.length || !start) return toast.error(t('orders.applyNeedEmployeeStart'))
    if (needsEnd && !end && !permanent) return toast.error(t('orders.applyNeedEnd'))
    if (end && end < start) return toast.error(t('orders.errEndBeforeStart'))
    try {
      await mut.apply.mutateAsync({
        id: order.id,
        body: {
          employee_ids: ids.map(Number),
          employee_id: Number(ids[0]),
          start_date: start,
          end_date: end || undefined,
          is_permanent: permanent,
        },
      })
    } catch {
      return
    }
    mut.invalidate()
    toast.ok(t('orders.applied'))
    onClose()
  }

  return (
    <section className="space-y-3 rounded-panel border border-success/30 bg-success-soft/40 p-4">
      <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-success">
        <PlayCircle size={15} /> {t('orders.applyTitle')}
      </h3>
      <p className="flex items-start gap-2 text-[12.5px] text-fg-muted">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" /> {effect}
      </p>
      {candidates.length > 0 ? (
        <fieldset>
          <legend className="mb-1.5 text-[12px] font-semibold text-fg-muted">
            {t('orders.applyEmployees')} <span className="text-danger">*</span>{' '}
            <span className="font-normal text-fg-subtle">({ids.length}/{candidates.length})</span>
          </legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {candidates.map((c) => (
              <Checkbox
                key={c.value}
                label={c.label}
                checked={ids.includes(c.value)}
                onChange={() => setIds((cur) => (cur.includes(c.value) ? cur.filter((x) => x !== c.value) : [...cur, c.value]))}
              />
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-[12.5px] text-danger">{t('orders.applyNoEmployees')}</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('orders.applyStart')} required>
          <DateInput value={start} onChange={setStart} />
        </Field>
        <Field label={t('orders.applyEnd')} required={needsEnd && !permanent}>
          <DateInput value={end} onChange={setEnd} />
        </Field>
      </div>
      {(special || Number(catType) === 12) && type !== 'dismissal' && (
        <Checkbox label={t('orders.applyPermanent')} checked={permanent} onChange={(e) => setPermanent(e.target.checked)} />
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button leftIcon={<CheckCircle2 size={15} />} loading={mut.apply.isPending} disabled={!ids.length} onClick={submit}>
          {t('orders.apply')}
        </Button>
      </div>
    </section>
  )
}
