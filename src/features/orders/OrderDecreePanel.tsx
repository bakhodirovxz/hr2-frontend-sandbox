import { useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { BookCheck, Check, Play, Send, Stamp, UserPlus, X, Pencil } from 'lucide-react'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST } from '@/api/endpoints'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { NumberTakenHint } from '@/components/ui/NumberTakenHint'
import { useDebounce } from '@/hooks/useDebounce'
import { Modal } from '@/components/ui/Modal'
import { useConfirm, type ConfirmOptions } from '@/components/data/useConfirm'
import { formatAppDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Page } from '@/features/employees/useEmployees'
import type { Employee } from '@/types'
import { useActNumberAvailability, useOrderMutations, type OrderAct } from './useOrders'
import { DateInput } from '@/components/ui/DateInput'
import { Textarea } from '@/components/ui/Textarea'
import { POPOVER_CLS } from '@/components/ui/control'
import { errorMessage } from '@/api/errorMessage'
import { todayIso } from '@/lib/today'
import { isInvalidRange } from '@/lib/dateRange'

// ⚠️ `toISOString()` formats the UTC date — yesterday before 05:00 here.
const today = todayIso

/**
 * The decree (buyruq) lifecycle beyond sign/reject: approve → leadership →
 * chancellery → register (stamp) → put into effect → assign readers, who then
 * acknowledge. Which buttons show follows the caller's role, mirroring the
 * backend's own guards.
 */
export function OrderDecreePanel({
  order,
  powers,
  canAcknowledge,
  removalAsked,
  onDone,
}: {
  order: OrderAct
  /** One flag per action — the chancellery may register and nothing else. */
  powers: {
    register: boolean
    approve: boolean
    route: boolean
    apply: boolean
    familiarizers: boolean
    /** Fix a wrong number/date after registration (devonxona / master-admin). */
    editStamp: boolean
    /** Author-only: push a `changes_requested` decree back into the flow. */
    resubmit: boolean
    /** The named submitter confirms they really entered it (pending_submitter). */
    confirmSubmission: boolean
  }
  canAcknowledge: boolean
  /** This viewer has been asked to step off the decree and must answer. */
  removalAsked: boolean
  onDone: (msg: string) => void
}) {
  const { t } = useTranslation()
  const mut = useOrderMutations()
  const confirm = useConfirm()

  const [registering, setRegistering] = useState(false)
  const [editingStamp, setEditingStamp] = useState(false)
  const [applying, setApplying] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [actNumber, setActNumber] = useState('')
  /* Both the stamp dialog and the register dialog edit this same field, so one
     debounced check covers both. `order.id` is excluded — re-saving a decree
     with its own number must not read as a clash. */
  const numberCheck = useActNumberAvailability(
    order.organization_branch_id ?? null,
    useDebounce(actNumber, 400).trim(),
    order.id,
  )
  const [actDate, setActDate] = useState(today())
  const [applyEmp, setApplyEmp] = useState<Employee | null>(null)
  const [empSearch, setEmpSearch] = useState('')
  const [fromDate, setFromDate] = useState(today())
  const [toDate, setToDate] = useState('')
  const [permanent, setPermanent] = useState(false)
  const [picked, setPicked] = useState<number[]>([])
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const { data, isError: searchFailed, error: searchError } = useQuery({
    queryKey: ['order-emp-search', empSearch],
    queryFn: () => apiGet<Page<Employee>>(EMPLOYEES_LIST, { search: empSearch || undefined, size: 20 }),
    enabled: empSearch.trim().length > 0,
  })
  const candidates = data?.items ?? []

  const familiarizers = order.familiarizers ?? []
  const isRegistered = !!order.is_stamped

  const run = async (p: Promise<unknown>, msg: string, close: () => void) => {
    setBusy(true)
    try {
      await p
      close()
      onDone(msg)
    } catch {
      onDone(t('orders.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  // One-click decree steps are asked first; the decree number names them.
  const confirmThen = async (o: ConfirmOptions, go: () => Promise<unknown>) => {
    if (await confirm({ subject: order.act_number ? `№${order.act_number}` : order.summary, ...o })) await go()
  }

  return (
    <>
      <Card className="mb-5 p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold text-fg">{t('orders.secDecree')}</h3>
          {isRegistered && (
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-medium text-success">
              {order.is_stamped && order.act_number
                ? t('orders.registeredInfo', {
                    number: order.act_number,
                    date: order.act_date ? formatAppDate(order.act_date) : '—',
                  })
                : t('orders.registered')}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {powers.approve && (
            <>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Check size={14} />}
                onClick={() => confirmThen({ kind: 'approve', confirmLabel: t('orders.decreeApprove') }, () => run(mut.approve.mutateAsync({ id: order.id }), t('orders.actionDone'), () => {}))}
              >
                {t('orders.decreeApprove')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                leftIcon={<X size={14} />}
                onClick={() => {
                  setReason('')
                  setError(null)
                  setRejecting(true)
                }}
              >
                {t('orders.decreeReject')}
              </Button>
            </>
          )}
          {/* A removal request is aimed at ONE person and blocks the decree
              until they answer, so it leads the row. */}
          {removalAsked && (
            <>
              <Button
                size="sm"
                variant="danger"
                leftIcon={<Check size={14} />}
                onClick={() =>
                  confirmThen({ kind: 'approve', confirmLabel: t('orders.confirmRemoval') }, () =>
                    run(mut.confirmRemoval.mutateAsync(order.id), t('orders.actionDone'), () => {}),
                  )
                }
              >
                {t('orders.confirmRemoval')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<X size={14} />}
                onClick={() =>
                  confirmThen({ kind: 'reject', confirmLabel: t('orders.rejectRemoval') }, () =>
                    run(mut.rejectRemoval.mutateAsync(order.id), t('orders.actionDone'), () => {}),
                  )
                }
              >
                {t('orders.rejectRemoval')}
              </Button>
            </>
          )}
          {powers.confirmSubmission && (
            <Button
              size="sm"
              leftIcon={<Check size={14} />}
              onClick={() =>
                confirmThen({ kind: 'approve', confirmLabel: t('orders.confirmSubmission') }, () =>
                  run(mut.confirmSubmission.mutateAsync(order.id), t('orders.actionDone'), () => {}),
                )
              }
            >
              {t('orders.confirmSubmission')}
            </Button>
          )}
          {powers.resubmit && (
            <Button
              size="sm"
              leftIcon={<Send size={14} />}
              onClick={() => confirmThen({ kind: 'send', confirmLabel: t('orders.decreeResubmit') }, () => run(mut.resubmit.mutateAsync(order.id), t('orders.actionDone'), () => {}))}
            >
              {t('orders.decreeResubmit')}
            </Button>
          )}
          {powers.route && (
            <>
              <Button
                size="sm"
                variant="secondary"
                leftIcon={<Send size={14} />}
                onClick={() =>
                  confirmThen({ kind: 'send', confirmLabel: t('orders.sendToLeadership') }, () =>
                    run(mut.sendToLeadership.mutateAsync(order.id), t('orders.actionDone'), () => {}),
                  )
                }
              >
                {t('orders.sendToLeadership')}
              </Button>
              {/* ⚠️ There is no second destination. `decree/send-to-chancellery`
                  is a LEGACY ALIAS that calls send-to-leadership on the server,
                  so the pair of buttons that used to sit here offered one act
                  under two different names. */}
            </>
          )}
          {powers.register && !isRegistered && (
            <Button
              size="sm"
              leftIcon={<Stamp size={14} />}
              onClick={() => {
                setActNumber('')
                setActDate(today())
                setRegistering(true)
              }}
            >
              {t('orders.decreeRegister')}
            </Button>
          )}
          {powers.editStamp && isRegistered && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Pencil size={14} />}
              onClick={() => {
                setActNumber(order.act_number ?? '')
                setActDate((order.act_date ?? today()).slice(0, 10))
                setEditingStamp(true)
              }}
            >
              {t('orders.stampEdit')}
            </Button>
          )}
          {powers.apply && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Play size={14} />}
              onClick={() => {
                setApplyEmp(null)
                setEmpSearch('')
                setFromDate(today())
                setToDate('')
                setPermanent(false)
                setApplying(true)
              }}
            >
              {t('orders.decreeApply')}
            </Button>
          )}
          {powers.familiarizers && (
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<UserPlus size={14} />}
              onClick={() => {
                setPicked(familiarizers.map((f) => f.employee_id!).filter(Boolean))
                setEmpSearch('')
                setAssigning(true)
              }}
            >
              {t('orders.assignFamiliarizers')}
            </Button>
          )}
          {canAcknowledge && (
            <Button
              size="sm"
              leftIcon={<BookCheck size={14} />}
              onClick={() => confirmThen({ kind: 'approve', confirmLabel: t('orders.acknowledge') }, () => run(mut.acknowledge.mutateAsync(order.id), t('orders.actionDone'), () => {}))}
            >
              {t('orders.acknowledge')}
            </Button>
          )}
        </div>
      </Card>

      {/* Familiarizers */}
      <Card className="mb-5 overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <h3 className="text-[15px] font-semibold text-fg">{t('orders.secFamiliarizers')}</h3>
        </div>
        {familiarizers.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-subtle">{t('orders.familiarizersEmpty')}</p>
        ) : (
          <ul>
            {familiarizers.map((f) => (
              <li key={f.id} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
                <Avatar src={f.employee?.photo_thumb_path} name={f.employee?.legal_name} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {f.employee?.legal_name ?? `#${f.employee_id}`}
                </span>
                <span
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    f.acknowledged ? 'bg-success-soft text-success' : 'bg-surface-2 text-fg-muted',
                  )}
                >
                  {f.acknowledged ? t('orders.acknowledged') : t('orders.notAcknowledged')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Fix an existing stamp — the number is drawn onto the document, so a
          typo can only be corrected here, not by re-registering. */}
      <Modal
        open={editingStamp}
        onClose={() => setEditingStamp(false)}
        title={t('orders.stampEdit')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditingStamp(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.updateStamp.mutateAsync({
                    id: order.id,
                    body: { act_number: actNumber || null, act_date: actDate || null },
                  }),
                  t('common.save'),
                  () => setEditingStamp(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('orders.actNumber')}</span>
            <Input value={actNumber} onChange={(e) => setActNumber(e.target.value)} />
            <NumberTakenHint
              available={numberCheck.available}
              suggested={numberCheck.suggested}
              onUse={setActNumber}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('orders.actDate')}</span>
            <DateInput value={actDate} onChange={setActDate} />
          </label>
        </div>
      </Modal>

      {/* Register */}
      <Modal
        open={registering}
        onClose={() => setRegistering(false)}
        title={t('orders.decreeRegister')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRegistering(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.register.mutateAsync({ id: order.id, act_number: actNumber, act_date: actDate }),
                  t('orders.registered'),
                  () => setRegistering(false),
                )
              }
            >
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('orders.actNumber')}</span>
            <Input value={actNumber} onChange={(e) => setActNumber(e.target.value)} />
            <NumberTakenHint
              available={numberCheck.available}
              suggested={numberCheck.suggested}
              onUse={setActNumber}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-fg-muted">{t('orders.actDate')}</span>
            <DateInput value={actDate} onChange={setActDate} />
          </label>
        </div>
      </Modal>

      {/* Put into effect */}
      <Modal
        open={applying}
        onClose={() => setApplying(false)}
        title={t('orders.decreeApply')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setApplying(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy || !applyEmp || (!permanent && isInvalidRange(fromDate, toDate))}
              onClick={() =>
                run(
                  mut.apply.mutateAsync({
                    id: order.id,
                    body: {
                      employee_id: applyEmp!.id,
                      start_date: fromDate,
                      end_date: permanent ? null : toDate || null,
                      is_permanent: permanent,
                    },
                  }),
                  t('orders.actionDone'),
                  () => setApplying(false),
                )
              }
            >
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="relative">
            <span className="mb-1.5 block text-sm text-fg-muted">{t('orders.applyEmployee')}</span>
            <Input
              value={applyEmp ? (applyEmp.legal_name ?? '') : empSearch}
              onChange={(e) => {
                setApplyEmp(null)
                setEmpSearch(e.target.value)
              }}
            />
            {!applyEmp && empSearch.trim() && candidates.length === 0 && searchFailed && (
              <p className="mt-1 text-xs text-danger">{errorMessage(searchError, t('list.loadFailed'))}</p>
            )}
            {!applyEmp && empSearch.trim() && candidates.length > 0 && (
              <div className={cn(POPOVER_CLS, 'absolute z-10 mt-1 max-h-56 w-full overflow-auto')}>
                {candidates.map((emp) => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => {
                      setApplyEmp(emp)
                      setEmpSearch('')
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                  >
                    <Avatar src={emp.photo_thumb_path} name={emp.legal_name} size={26} />
                    <span className="truncate text-fg">{emp.legal_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('orders.applyFrom')}</span>
              <DateInput value={fromDate} onChange={setFromDate} invalid={!permanent && isInvalidRange(fromDate, toDate)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-fg-muted">{t('orders.applyTo')}</span>
              <DateInput value={toDate} onChange={setToDate} min={fromDate || undefined} invalid={!permanent && isInvalidRange(fromDate, toDate)} />
            </label>
          </div>
          {!permanent && isInvalidRange(fromDate, toDate) && (
            <p role="alert" className="text-xs text-danger">{t('list.invalidRange')}</p>
          )}
          <Checkbox
            checked={permanent}
            onChange={(e) => setPermanent(e.target.checked)}
            label={t('orders.applyPermanent')}
          />
        </div>
      </Modal>

      {/* Assign familiarizers */}
      <Modal
        open={assigning}
        onClose={() => setAssigning(false)}
        title={t('orders.assignFamiliarizers')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssigning(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                run(
                  mut.assignFamiliarizers.mutateAsync({ id: order.id, employee_ids: picked }),
                  t('orders.actionDone'),
                  () => setAssigning(false),
                )
              }
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {picked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {picked.map((id) => {
                const name =
                  familiarizers.find((f) => f.employee_id === id)?.employee?.legal_name ??
                  candidates.find((c) => c.id === id)?.legal_name ??
                  `#${id}`
                return (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand"
                  >
                    {name}
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                    >
                      <X size={12} />
                    </button>
                  </span>
                )
              })}
            </div>
          )}
          <Input
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            placeholder={t('orders.applyEmployee')}
          />
          {empSearch.trim() && candidates.length === 0 && searchFailed && (
            <p className="mt-1 text-xs text-danger">{errorMessage(searchError, t('list.loadFailed'))}</p>
          )}
          {empSearch.trim() && candidates.length > 0 && (
            <div className="max-h-56 overflow-auto rounded-lg border border-line">
              {candidates.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() =>
                    setPicked((p) => (p.includes(emp.id) ? p : [...p, emp.id]))
                  }
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                >
                  <Avatar src={emp.photo_thumb_path} name={emp.legal_name} size={26} />
                  <span className="truncate text-fg">{emp.legal_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Decree reject */}
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={t('orders.decreeReject')}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!reason.trim()) return setError(t('orders.rejectReasonRequired'))
                void run(
                  mut.decreeReject.mutateAsync({ id: order.id, comment: reason.trim() }),
                  t('orders.actionDone'),
                  () => setRejecting(false),
                )
              }}
            >
              {t('common.confirm')}
            </Button>
          </div>
        }
      >
        <label className="flex flex-col gap-1.5">
          {/* The reason is REQUIRED (the confirm stays blocked without it), so
              the label must not say «ixtiyoriy» (09-25 sweep). */}
          <span className="text-sm text-fg-muted">{t('orders.rejectReason')} <span className="text-danger">*</span></span>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setError(null)
            }}
      
          />
        </label>
        <FormError className="mt-2 text-xs">{error}</FormError>
      </Modal>
    </>
  )
}
