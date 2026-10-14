import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Check, ChevronDown, ChevronRight, Copy, CornerDownRight, Plus, Send, Undo2 } from 'lucide-react'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Modal } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { useEmployeeSearch } from '@/features/employees/useEmployeeSearch'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { isInvalidRange } from '@/lib/dateRange'
import { formatRange } from '@/lib/format'
import { cn } from '@/lib/cn'
import type { Employee } from '@/types'
import { MAX_TASK_DEPTH, useWorkPlanChildren, useWorkPlanMutations, type ApprovalStatus, type WorkPlan } from './useWorkPlan'

/*
 * Ish rejasi — K2 · 1385 «Возможные расширения»: decomposition (subtasks,
 * three levels), approval by the superior manager and copying the previous
 * period's plan.
 */

const APPROVAL_TONE: Record<ApprovalStatus, BadgeTone> = { draft: 'neutral', submitted: 'info', approved: 'success', returned: 'danger' }

export const approvalOf = (r?: Pick<WorkPlan, 'approval_status'> | null): ApprovalStatus => (r?.approval_status as ApprovalStatus) || 'draft'

export function ApprovalBadge({ row }: { row: WorkPlan }) {
  const { t } = useTranslation()
  const a = approvalOf(row)
  const tip = [row.approver_name ? `${t('kpiExt.approver')}: ${row.approver_name}` : '', row.approval_comment ?? ''].filter(Boolean).join('\n')
  return (
    <span title={tip || undefined}>
      <Badge tone={APPROVAL_TONE[a] ?? 'neutral'}>{t(`kpiExt.approval_${a}` as never)}</Badge>
    </span>
  )
}

/** Who may do what with a plan's approval. */
export function useApprovalRights() {
  const user = useAuthStore((s) => s.user)
  const me = user?.employee?.id ?? null
  const master = isSiteMasterAdmin(user)
  return {
    /** Only the root task is sent — its subtasks go with it. */
    canSubmit: (r: WorkPlan, canWrite: boolean) => canWrite && !r.parent_id && ['draft', 'returned'].includes(approvalOf(r)),
    canDecide: (r: WorkPlan) => approvalOf(r) === 'submitted' && !r.parent_id && (master || (me != null && Number(r.approver_employee_id) === Number(me))),
  }
}

const APPROVAL_ERRORS: Record<string, string> = {
  work_plan_approval_state: 'kpiExt.errApprovalState',
  approver_is_self: 'kpiExt.errApproverSelf',
  work_plan_submit_root: 'kpiExt.errSubmitRoot',
  not_plan_approver: 'kpiExt.errNotApprover',
  approver_required: 'kpiExt.errApproverRequired',
  comment_required: 'kpiExt.errCommentRequired',
  work_plan_nothing_to_submit: 'kpiExt.errNothingToSubmit',
  work_plan_nothing_to_decide: 'kpiExt.errNothingToDecide',
}
export const approvalError = (e: unknown, t: (k: never) => string, fallback: string) => {
  const key = APPROVAL_ERRORS[errorCode(e) ?? '']
  return key ? t(key as never) : errorMessage(e, fallback)
}

export type ApprovalAction = { row: WorkPlan; mode: 'submit' | 'approve' | 'return' }

/**
 * Send for approval (an approver may be picked — by default the server
 * takes the owner's supervisor / the head above), approve, or return with
 * a reason.
 */
export function ApprovalModal({ value, onClose }: { value: ApprovalAction | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useWorkPlanMutations()
  const [approver, setApprover] = useState<Employee | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    setApprover(null)
    setComment('')
    setError('')
  }, [value])

  const mode = value?.mode
  const submit = async () => {
    if (!value) return
    setError('')
    if (mode === 'return' && comment.trim().length < 3) return setError(t('kpiExt.errCommentRequired'))
    try {
      if (mode === 'submit') {
        await mut.submit.mutateAsync({ id: value.row.id, approver_employee_id: approver?.id ?? null, comment: comment.trim() || null })
        toast.ok(t('kpiExt.submitted'))
      } else {
        await mut.decide.mutateAsync({ id: value.row.id, approve: mode === 'approve', comment: comment.trim() || null })
        toast.ok(mode === 'approve' ? t('kpiExt.approved') : t('kpiExt.returned'))
      }
      onClose()
    } catch (e) {
      setError(approvalError(e, t as never, t('common.actionFailed')))
    }
  }

  const title = mode === 'submit' ? t('kpiExt.submitTitle') : mode === 'approve' ? t('kpiExt.approveTitle') : t('kpiExt.returnTitle')
  return (
    <Modal
      open={!!value}
      onClose={onClose}
      size="md"
      title={title}
      description={value ? `«${value.row.title ?? ''}» · ${formatRange(value.row.start_date, value.row.end_date)}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={mode === 'return' ? 'danger' : 'primary'}
            leftIcon={mode === 'submit' ? <Send size={14} /> : mode === 'approve' ? <Check size={14} /> : <Undo2 size={14} />}
            loading={mut.submit.isPending || mut.decide.isPending}
            onClick={submit}
          >
            {mode === 'submit' ? t('kpiExt.submitAction') : mode === 'approve' ? t('kpiExt.approveAction') : t('kpiExt.returnAction')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mode === 'submit' && (
          <>
            <p className="text-[12.5px] text-fg-muted">{t('kpiExt.submitHint')}</p>
            <Field label={t('kpiExt.approver')} hint={t('kpiExt.approverHint')}>
              <EmployeePicker value={approver} onChange={setApprover} allBranches placeholder={t('kpiExt.approverAuto')} />
            </Field>
          </>
        )}
        {mode !== 'submit' && value?.row.approval_comment && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-fg-muted">
            {t('kpiExt.senderComment')}: {value.row.approval_comment}
          </p>
        )}
        <Field label={mode === 'return' ? t('kpiExt.returnReason') : t('kpiExt.comment')} required={mode === 'return'}>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} invalid={!!error && mode === 'return'} />
        </Field>
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}

/**
 * «Копирование плана предыдущего периода»: the tasks that START in the
 * chosen period move to the new one (dates shift, status «planned»,
 * approval «draft», the hierarchy kept); an identical task is skipped.
 */
export function CopyPlanModal({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults: { emp?: string; dept?: string } }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useWorkPlanMutations()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const departments = useDepartmentOptions(branchId)
  const [empQuery, setEmpQuery] = useState('')
  const empSearch = useEmployeeSearch(branchId, open, empQuery)
  const prev = dayjs().subtract(1, 'month')
  const [f, setF] = useState({ from: '', to: '', target: '', emp: '', dept: '' })
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ created: number; skipped: { title?: string | null; reason: string }[] } | null>(null)

  useEffect(() => {
    if (!open) return
    setF({
      from: prev.startOf('month').format('YYYY-MM-DD'),
      to: prev.endOf('month').format('YYYY-MM-DD'),
      target: dayjs().startOf('month').format('YYYY-MM-DD'),
      emp: defaults.emp ?? '',
      dept: defaults.emp ? '' : defaults.dept ?? '',
    })
    setError('')
    setResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const run = async () => {
    setError('')
    if (!f.from || !f.to || !f.target) return setError(t('kpiExt.copyDatesRequired'))
    if (isInvalidRange(f.from, f.to)) return setError(t('list.invalidRange'))
    if (f.target === f.from) return setError(t('kpiExt.copySameStart'))
    try {
      const r = await mut.copy.mutateAsync({
        from_start: f.from,
        from_end: f.to,
        to_start: f.target,
        ...(f.emp ? { employee_id: Number(f.emp) } : {}),
        ...(f.dept ? { department_id: Number(f.dept) } : {}),
      })
      setResult({ created: r.created, skipped: r.skipped ?? [] })
      toast.ok(t('kpiExt.copyDone', { count: r.created }))
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('kpiExt.copyTitle')}
      description={t('kpiExt.copyHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          {!result && (
            <Button leftIcon={<Copy size={14} />} loading={mut.copy.isPending} onClick={run}>
              {t('kpiExt.copyRun')}
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <div className="flex flex-col gap-3 text-[13px]">
          <p className="text-fg">{t('kpiExt.copyDone', { count: result.created })}</p>
          {result.skipped.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-fg-muted">{t('kpiExt.copySkipped', { count: result.skipped.length })}</p>
              <ul className="scroll-thin max-h-48 overflow-auto text-[12.5px] text-fg-muted">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    «{s.title ?? '—'}» — {s.reason === 'exists' ? t('kpiExt.copySkipExists') : t('kpiExt.copySkipScope')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('kpiExt.copyFrom')} required>
            <DateInput value={f.from} onChange={(v) => setF((p) => ({ ...p, from: v }))} invalid={isInvalidRange(f.from, f.to)} />
          </Field>
          <Field label={t('kpiExt.copyFromEnd')} required>
            <DateInput value={f.to} onChange={(v) => setF((p) => ({ ...p, to: v }))} min={f.from || undefined} invalid={isInvalidRange(f.from, f.to)} />
          </Field>
          <Field label={t('kpiExt.copyTo')} hint={t('kpiExt.copyToHint')} required wide>
            <DateInput value={f.target} onChange={(v) => setF((p) => ({ ...p, target: v }))} />
          </Field>
          <Field label={t('workPlan.colEmployee')}>
            <Combobox
              value={f.emp}
              onChange={(v) => setF((p) => ({ ...p, emp: v, dept: v ? '' : p.dept }))}
              options={empSearch.options}
              onSearchChange={setEmpQuery}
              loading={empSearch.loading}
              hasMore={empSearch.hasMore}
              onLoadMore={empSearch.loadMore}
              placeholder={t('workPlan.allEmployees')}
            />
          </Field>
          <Field label={t('workPlan.orDepartment')}>
            <Combobox
              value={f.dept}
              onChange={(v) => setF((p) => ({ ...p, dept: v, emp: v ? '' : p.emp }))}
              options={departments}
              placeholder={t('workPlan.allDepartments')}
            />
          </Field>
          <FormError className="text-xs sm:col-span-2">{error}</FormError>
        </div>
      )}
    </Modal>
  )
}

/**
 * The subtasks of a task in its card — loaded level by level, each one
 * opens in the same card; «Kichik vazifa qo'shish» while the tree is not
 * three levels deep.
 */
export function SubtaskTree({
  parent,
  canWrite,
  statusLabel,
  onOpen,
  onAdd,
}: {
  parent: WorkPlan
  canWrite: boolean
  statusLabel: (v: string) => string
  onOpen: (r: WorkPlan) => void
  onAdd: (parent: WorkPlan) => void
}) {
  const { t } = useTranslation()
  const depth = parent.depth ?? 1
  const canAdd = canWrite && depth < MAX_TASK_DEPTH && parent.status !== 'cancelled'
  if (!(parent.children_count ?? 0) && !canAdd) return null
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-3 sm:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-[13px] font-semibold text-fg">{t('kpiExt.subtasks')}</h4>
        {(parent.children_count ?? 0) > 0 && <Badge tone="neutral">{parent.children_count}</Badge>}
        {canAdd && (
          <Button size="sm" variant="ghost" className="ml-auto" leftIcon={<Plus size={14} />} onClick={() => onAdd(parent)}>
            {t('kpiExt.addSubtask')}
          </Button>
        )}
      </div>
      {(parent.children_count ?? 0) > 0 ? (
        <SubtaskLevel parentId={parent.id} level={0} statusLabel={statusLabel} onOpen={onOpen} />
      ) : (
        <p className="text-[12px] text-fg-subtle">{t('kpiExt.noSubtasks')}</p>
      )}
      {(parent.children_count ?? 0) > 0 && <p className="text-[11.5px] text-fg-subtle">{t('kpiExt.statusDerived')}</p>}
    </section>
  )
}

function SubtaskLevel({ parentId, level, statusLabel, onOpen }: { parentId: number; level: number; statusLabel: (v: string) => string; onOpen: (r: WorkPlan) => void }) {
  const { rows, loading } = useWorkPlanChildren(parentId)
  if (loading) return <Skeleton className="h-8 w-full" />
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r) => (
        <SubtaskNode key={r.id} row={r} level={level} statusLabel={statusLabel} onOpen={onOpen} />
      ))}
    </ul>
  )
}

const STATUS_TONE: Record<string, BadgeTone> = { planned: 'neutral', in_progress: 'warning', done: 'success', cancelled: 'danger' }

function SubtaskNode({ row, level, statusLabel, onOpen }: { row: WorkPlan; level: number; statusLabel: (v: string) => string; onOpen: (r: WorkPlan) => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(true)
  const kids = row.children_count ?? 0
  return (
    <li>
      <div className="flex items-center gap-1.5 rounded-lg px-1 py-1 hover:bg-surface" style={{ paddingLeft: level * 18 + 4 }}>
        {kids > 0 ? (
          <IconButton size="sm" label={open ? t('kpiExt.collapse') : t('kpiExt.expand')} onClick={() => setOpen((v) => !v)}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </IconButton>
        ) : (
          <CornerDownRight size={13} className="mx-1.5 shrink-0 text-fg-subtle" aria-hidden />
        )}
        <button type="button" onClick={() => onOpen(row)} className="min-w-0 flex-1 truncate text-left text-[13px] text-fg hover:text-brand">
          {row.title || '—'}
        </button>
        <span className="hidden whitespace-nowrap text-[11.5px] tabular-nums text-fg-subtle sm:inline">{formatRange(row.start_date, row.end_date)}</span>
        <Badge tone={STATUS_TONE[row.status ?? ''] ?? 'neutral'}>{row.status ? statusLabel(row.status) : '—'}</Badge>
      </div>
      {kids > 0 && open && <SubtaskLevel parentId={row.id} level={level + 1} statusLabel={statusLabel} onOpen={onOpen} />}
    </li>
  )
}

/** Tree helpers for the list: `rows` (one period) → visible rows with their level. */
export function buildTree(rows: WorkPlan[]) {
  const ids = new Set(rows.map((r) => r.id))
  const kids = new Map<number, WorkPlan[]>()
  const roots: WorkPlan[] = []
  for (const r of rows) {
    if (r.parent_id && ids.has(r.parent_id)) {
      const list = kids.get(r.parent_id) ?? []
      list.push(r)
      kids.set(r.parent_id, list)
    } else roots.push(r)
  }
  return { roots, kids }
}

export function flattenTree(
  roots: WorkPlan[],
  kids: Map<number, WorkPlan[]>,
  collapsed: Set<number>,
  sortFn?: (a: WorkPlan, b: WorkPlan) => number,
): { row: WorkPlan; level: number; hasKids: boolean }[] {
  const out: { row: WorkPlan; level: number; hasKids: boolean }[] = []
  const walk = (list: WorkPlan[], level: number) => {
    const sorted = sortFn ? [...list].sort(sortFn) : list
    for (const r of sorted) {
      const ch = kids.get(r.id) ?? []
      out.push({ row: r, level, hasKids: ch.length > 0 })
      if (ch.length && !collapsed.has(r.id)) walk(ch, level + 1)
    }
  }
  walk(roots, 0)
  return out
}

export function TreeToggle({ open, onToggle, className }: { open: boolean; onToggle: () => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <IconButton
      size="sm"
      className={cn('shrink-0', className)}
      label={open ? t('kpiExt.collapse') : t('kpiExt.expand')}
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
    >
      {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </IconButton>
  )
}

/**
 * TZ K2 1385 «Согласование плана»: the WHOLE plan of one employee (or one
 * department) for a period — every top task with its sub-tasks — is sent to
 * the superior, or approved / returned by him, in one step.
 */
export function WholePlanModal({
  mode,
  onClose,
  defaults,
}: {
  mode: 'submit' | 'approve' | 'return' | null
  onClose: () => void
  defaults: { emp?: string; dept?: string; from?: string; to?: string }
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useWorkPlanMutations()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const departments = useDepartmentOptions(branchId)
  const [empQuery, setEmpQuery] = useState('')
  const empSearch = useEmployeeSearch(branchId, !!mode, empQuery)
  const [f, setF] = useState({ from: '', to: '', emp: '', dept: '' })
  const [approver, setApprover] = useState<Employee | null>(null)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!mode) return
    setF({
      from: defaults.from || dayjs().startOf('month').format('YYYY-MM-DD'),
      to: defaults.to || dayjs().endOf('month').format('YYYY-MM-DD'),
      emp: defaults.emp ?? '',
      dept: defaults.emp ? '' : defaults.dept ?? '',
    })
    setApprover(null)
    setComment('')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const run = async () => {
    if (!mode) return
    setError('')
    if (!f.emp && !f.dept) return setError(t('kpiExt.planOwnerRequired'))
    if (!f.from || !f.to) return setError(t('kpiExt.copyDatesRequired'))
    if (isInvalidRange(f.from, f.to)) return setError(t('list.invalidRange'))
    if (mode === 'return' && comment.trim().length < 3) return setError(t('kpiExt.errCommentRequired'))
    try {
      const r = await mut.plan.mutateAsync({
        action: mode,
        employee_id: f.emp ? Number(f.emp) : null,
        department_id: f.emp ? null : f.dept ? Number(f.dept) : null,
        period_start: f.from,
        period_end: f.to,
        approver_employee_id: mode === 'submit' ? approver?.id ?? null : null,
        comment: comment.trim() || null,
      })
      const n = r.submitted ?? r.decided ?? 0
      toast.ok(mode === 'submit' ? t('kpiExt.planSubmitted', { count: n }) : mode === 'approve' ? t('kpiExt.planApproved', { count: n }) : t('kpiExt.planReturned', { count: n }))
      onClose()
    } catch (e) {
      setError(approvalError(e, t as never, t('common.actionFailed')))
    }
  }

  const title = mode === 'submit' ? t('kpiExt.planSubmitTitle') : mode === 'approve' ? t('kpiExt.planApproveTitle') : t('kpiExt.planReturnTitle')
  return (
    <Modal
      open={!!mode}
      onClose={onClose}
      size="md"
      title={title}
      description={t('kpiExt.planHint')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={mode === 'return' ? 'danger' : 'primary'}
            leftIcon={mode === 'submit' ? <Send size={14} /> : mode === 'approve' ? <Check size={14} /> : <Undo2 size={14} />}
            loading={mut.plan.isPending}
            onClick={run}
          >
            {mode === 'submit' ? t('kpiExt.submitAction') : mode === 'approve' ? t('kpiExt.approveAction') : t('kpiExt.returnAction')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('workPlan.colEmployee')}>
          <Combobox
            value={f.emp}
            onChange={(v) => setF((p) => ({ ...p, emp: v, dept: v ? '' : p.dept }))}
            options={empSearch.options}
            onSearchChange={setEmpQuery}
            loading={empSearch.loading}
            hasMore={empSearch.hasMore}
            onLoadMore={empSearch.loadMore}
            placeholder={t('workPlan.allEmployees')}
          />
        </Field>
        <Field label={t('workPlan.orDepartment')}>
          <Combobox
            value={f.dept}
            onChange={(v) => setF((p) => ({ ...p, dept: v, emp: v ? '' : p.emp }))}
            options={departments}
            placeholder={t('workPlan.allDepartments')}
          />
        </Field>
        <Field label={t('kpiExt.planFrom')} required>
          <DateInput value={f.from} onChange={(v) => setF((p) => ({ ...p, from: v }))} invalid={isInvalidRange(f.from, f.to)} />
        </Field>
        <Field label={t('kpiExt.planTo')} required>
          <DateInput value={f.to} onChange={(v) => setF((p) => ({ ...p, to: v }))} min={f.from || undefined} invalid={isInvalidRange(f.from, f.to)} />
        </Field>
        {mode === 'submit' && (
          <Field label={t('kpiExt.approver')} hint={t('kpiExt.approverHint')} wide>
            <EmployeePicker value={approver} onChange={setApprover} allBranches placeholder={t('kpiExt.approverAuto')} />
          </Field>
        )}
        <Field label={mode === 'return' ? t('kpiExt.returnReason') : t('kpiExt.comment')} required={mode === 'return'} wide>
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <FormError className="text-xs sm:col-span-2">{error}</FormError>
      </div>
    </Modal>
  )
}
