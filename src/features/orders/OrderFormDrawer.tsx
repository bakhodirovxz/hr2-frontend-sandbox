import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Paperclip, ScanSearch, Trash2, UserPlus, Wand2, X } from 'lucide-react'
import { apiGet } from '@/api/http'
import { EMPLOYEES_LIST, ORDER_ACT_CATEGORIES, ORGANIZATION_BRANCH_LEADERS } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import type { SelectOption } from '@/components/ui/Select'
import { Skeleton } from '@/components/ui/Skeleton'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { ERROR_CLS, LABEL_CLS } from '@/components/ui/control'
import { useDepartmentOptions } from '@/hooks/useReferenceData'
import { isSiteMasterAdmin } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { cn } from '@/lib/cn'
import { toItems, type Employee, type ListResponse } from '@/types'
import { employeeOption } from '@/features/employees/subLabel'
import { EmployeeMultiPicker, type PickedPerson } from '@/features/employees/EmployeeMultiPicker'
import { EmployeeSelect } from './EmployeeSelect'
import { OrderTypeFields } from './OrderTypeFields'
import { isOrdersHr } from './orderFlow'
import {
  buildDetailsPayload,
  orderTypeOfCategory,
  pickDetails,
  validateOrderDetails,
  type OrderDetails,
} from './orderTypes'
import {
  detectEmployees,
  suggestActNumber,
  useActNumberCheck,
  useOrder,
  useOrderMutations,
  type DetectedMention,
  type OrderCategory,
  type OrderPerson,
} from './useOrders'

interface Approver {
  employee_id: string
  can_edit_document: boolean
}

interface FormState {
  category_id: string
  summary: string
  description: string
  submitter_id: string
  leadership_id: string
  approvers: Approver[]
  act_number: string
  act_date: string
  employees: PickedPerson[]
  details: OrderDetails
  effective_start_date: string
  change_reason: string
  department_id: string
  created_by_id: string
}

const EMPTY: FormState = {
  category_id: '',
  summary: '',
  description: '',
  submitter_id: '',
  leadership_id: '',
  approvers: [],
  act_number: '',
  act_date: '',
  employees: [],
  details: {},
  effective_start_date: '',
  change_reason: '',
  department_id: '',
  created_by_id: '',
}

const ATTACH_ACCEPT =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rar,.zip,.7z,.jpg,.jpeg,.png,.gif,.txt,.rtf,.odt'

const personOption = (p?: OrderPerson | null): SelectOption | null =>
  p?.id ? employeeOption(p as Employee) : null

interface LeaderRow {
  employee?: Employee | null
  leadership_role?: string | null
}

/**
 * «Rahbariyat» candidates (v1 AddOrderDrawer): the branch's leaders pinned in
 * Tabel settings (director / deputy) — or, when none are pinned, staff whose
 * position reads «raisi» — plus the organisation's chairman and deputies
 * (multi-org ministr / deputy). The server accepts exactly these.
 */
function useLeadershipCandidates(branchId: number | null, enabled: boolean) {
  const leaders = useQuery({
    queryKey: ['orders', 'branch-leaders', branchId],
    queryFn: () => apiGet<LeaderRow[]>(ORGANIZATION_BRANCH_LEADERS(branchId!)),
    enabled: enabled && !!branchId,
  })
  const pinned = (leaders.data ?? [])
    .filter((l) => l.employee && ['director', 'deputy'].includes(l.leadership_role ?? ''))
    .map((l) => l.employee as Employee)
  const byPosition = useQuery({
    queryKey: ['orders', 'leadership-raisi', branchId],
    queryFn: async () =>
      toItems(
        await apiGet<ListResponse<Employee>>(EMPLOYEES_LIST, {
          job_position_name_search: 'raisi',
          size: 50,
          organization_branch_id: branchId || undefined,
        }),
      ),
    enabled: enabled && !leaders.isLoading && pinned.length === 0,
  })
  const management = useQuery({
    queryKey: ['orders', 'leadership-management'],
    queryFn: async () =>
      toItems(
        await apiGet<ListResponse<Employee>>(EMPLOYEES_LIST, {
          multi_org_employee_role: ['ministr', 'deputy'],
          size: 30,
          organization_branch_id: null,
        }),
      ),
    enabled,
  })
  const options = useMemo(() => {
    const base =
      pinned.length > 0
        ? pinned
        : (byPosition.data ?? []).filter((e) => {
            const pos = (typeof e.job_position === 'object' ? e.job_position?.name : e.job_position) ?? ''
            return !String(pos).toLowerCase().includes('maslahatch')
          })
    const seen = new Set<number>()
    const out: SelectOption[] = []
    for (const e of [...base, ...(management.data ?? [])]) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      out.push(employeeOption(e))
    }
    return out
  }, [pinned, byPosition.data, management.data])
  return { options, loading: leaders.isLoading || byPosition.isLoading || management.isLoading }
}

/**
 * Create / edit an order (TZ O1, O2, 2167, 2196) — v1 `AddOrderDrawer`.
 *
 * Edit sends only what changed for number / date / author / department, and
 * always the reason (`change_reason`, 422 without it). A new order opens as a
 * draft; the caller then shows it so «Yuborish» is one click away.
 */
export function OrderFormDrawer({
  open,
  editId,
  onClose,
  onSaved,
}: {
  open: boolean
  editId: number | null
  onClose: () => void
  onSaved: (createdId: number | null) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const mut = useOrderMutations()
  const { order: detail, loading: detailLoading } = useOrder(open && editId ? editId : null)

  const [form, setForm] = useState<FormState>(EMPTY)
  const [original, setOriginal] = useState<Partial<FormState> & { organization_branch_id?: number | null }>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [known, setKnown] = useState<SelectOption[]>([])
  const [newFiles, setNewFiles] = useState<File[]>([])
  const [mentions, setMentions] = useState<DetectedMention[] | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editRole, setEditRole] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const loadedFor = useRef<number | null>(null)

  const emp = user?.employee
  const effectiveBranchId =
    selectedBranchId ||
    emp?.organization_branch_id ||
    emp?.organization_branches?.[0]?.id ||
    emp?.department?.organization_branch_id ||
    null
  const branchId = original.organization_branch_id || effectiveBranchId || null

  // The category stream: the order's own on edit; HR (and the site admin)
  // author HR decrees, everyone else employee ones.
  const creatorRole = editId && editRole ? editRole : isOrdersHr(user) || isSiteMasterAdmin(user) ? 'hr' : 'employee'
  const numberFieldShown = !!editId || creatorRole === 'hr'

  const categoriesQ = useQuery({
    queryKey: ['orders', 'categories', creatorRole],
    queryFn: () => apiGet<OrderCategory[]>(ORDER_ACT_CATEGORIES, { creator_role: creatorRole, organization_branch_id: null }),
    enabled: open,
  })
  const categories = categoriesQ.data ?? []
  const categoryOptions = categories.map((c) => ({ value: String(c.id), label: c.name ?? `#${c.id}` }))
  const category = categories.find((c) => String(c.id) === form.category_id) ?? (detail?.category_rel && String(detail.category_rel.id) === form.category_id ? detail.category_rel : null)
  const orderType = orderTypeOfCategory(category)

  const departments = useDepartmentOptions(branchId)
  const leadership = useLeadershipCandidates(branchId, open)

  const numberChanged = form.act_number.trim() !== String(original.act_number ?? '').trim()
  const numberCheck = useActNumberCheck(branchId, form.act_number, editId ?? undefined, open && numberFieldShown && numberChanged)

  // Reset on open; load the saved order on edit.
  useEffect(() => {
    if (!open) {
      loadedFor.current = null
      return
    }
    if (!editId) {
      setForm(EMPTY)
      setOriginal({})
      setKnown([])
      setEditRole(null)
    }
    setErrors({})
    setNewFiles([])
    setMentions(null)
  }, [open, editId])

  useEffect(() => {
    if (!open || !editId || !detail || loadedFor.current === editId) return
    loadedFor.current = editId
    const signers = detail.assigned_signers ?? []
    const approvers = signers.filter((s) => s.signer_type === 'approver')
    const leader = signers.find((s) => s.signer_type === 'leadership')
    const names = new Map((detail.employees ?? []).map((e) => [e.id, e.full_name ?? null]))
    const ids = (detail.employee_ids ?? []).map(Number).filter(Number.isFinite)
    setEditRole(detail.category_rel?.creator_role ?? null)
    const next: FormState = {
      category_id: detail.category_id ? String(detail.category_id) : '',
      summary: detail.summary ?? '',
      description: detail.description ?? '',
      submitter_id: detail.submitter_id ? String(detail.submitter_id) : '',
      leadership_id: leader?.employee_id ? String(leader.employee_id) : '',
      approvers: approvers.map((s) => ({ employee_id: String(s.employee_id ?? s.employee?.id ?? ''), can_edit_document: !!s.can_edit_document })),
      act_number: detail.act_number ?? '',
      act_date: detail.act_date ?? '',
      employees: (ids.length ? ids : [...names.keys()]).map((id) => ({ id, legal_name: names.get(id) ?? null })),
      details: pickDetails(detail.details),
      effective_start_date: detail.effective_start_date ?? '',
      change_reason: '',
      department_id: detail.department_id ? String(detail.department_id) : '',
      created_by_id: detail.created_by_id ? String(detail.created_by_id) : '',
    }
    setForm(next)
    setOriginal({ ...next, organization_branch_id: detail.organization_branch_id ?? null })
    setKnown(
      [detail.submitter, detail.created_by, ...signers.map((s) => s.employee)]
        .map(personOption)
        .filter((o): o is SelectOption => !!o),
    )
  }, [open, editId, detail])

  // A single leadership candidate is picked for the user on create.
  useEffect(() => {
    if (!open || editId || form.leadership_id || leadership.options.length !== 1) return
    setForm((f) => (f.leadership_id ? f : { ...f, leadership_id: leadership.options[0].value }))
  }, [open, editId, form.leadership_id, leadership.options])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key as string]) setErrors(({ [key as string]: _drop, ...rest }) => rest)
  }
  const remember = (o: SelectOption | null) => {
    if (o) setKnown((k) => (k.some((x) => x.value === o.value) ? k : [...k, o]))
  }

  const attachments = (detail?.documents ?? []).filter((d) => !(d.document_objectname ?? '').startsWith('decree_'))

  const detect = async () => {
    setDetecting(true)
    try {
      const rows = await detectEmployees(form.description, branchId)
      setMentions(Array.isArray(rows) ? rows : [])
    } catch {
      setMentions([])
    } finally {
      setDetecting(false)
    }
  }
  const addMentionAsEmployee = (m: DetectedMention) => {
    if (form.employees.some((p) => p.id === m.employee_id)) return
    set('employees', [...form.employees, { id: m.employee_id, legal_name: m.full_name ?? null }])
  }
  const addMentionAsApprover = (m: DetectedMention) => {
    if (form.approvers.some((a) => a.employee_id === String(m.employee_id))) return
    remember({ value: String(m.employee_id), label: m.full_name ?? `#${m.employee_id}`, photo: null })
    set('approvers', [...form.approvers, { employee_id: String(m.employee_id), can_edit_document: false }])
  }

  const suggest = async () => {
    setSuggesting(true)
    try {
      const res = await suggestActNumber(form.category_id ? Number(form.category_id) : null, branchId)
      if (res?.suggested) set('act_number', String(res.suggested))
      else toast.info(t('orders.suggestNone'))
    } catch {
      toast.error(t('orders.suggestFailed'))
    } finally {
      setSuggesting(false)
    }
  }

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!form.category_id) e.category_id = t('orders.errCategory')
    if (!form.description.trim()) e.description = t('orders.errText')
    if (!form.leadership_id) e.leadership_id = t('orders.errLeadership')
    if (numberFieldShown && form.act_number.trim() && numberCheck.taken) e.act_number = t('orders.numberTaken')
    const approvers = form.approvers.filter((a) => a.employee_id)
    if (approvers.length === 0) e.approvers = t('orders.errApprovers')
    else if (form.submitter_id && approvers.some((a) => a.employee_id === form.submitter_id))
      e.approvers = t('orders.errSubmitterApprover')
    if (orderType) Object.assign(e, validateOrderDetails(t, orderType, form.details, form.effective_start_date))
    if (editId && !form.change_reason.trim()) e.change_reason = t('orders.errReasonRequired')
    setErrors(e)
    if (Object.keys(e).length) return
    if (!editId && !effectiveBranchId) {
      toast.error(t('orders.pickBranchFirst'))
      return
    }

    const body: Record<string, unknown> = {
      category_id: Number(form.category_id),
      summary: form.summary.trim() || null,
      description: form.description,
      submitter_id: form.submitter_id ? Number(form.submitter_id) : null,
      assigned_signers: [
        ...approvers.map((a) => ({ employee_id: Number(a.employee_id), signer_type: 'approver', can_edit_document: a.can_edit_document })),
        { employee_id: Number(form.leadership_id), signer_type: 'leadership', can_edit_document: false },
      ],
      employee_ids: form.employees.map((p) => p.id),
    }
    if (orderType) body.details = buildDetailsPayload(orderType, form.details)
    if (orderType === 'transfer') body.effective_start_date = form.effective_start_date || null
    if (editId) {
      body.change_reason = form.change_reason.trim()
      if (form.department_id !== (original.department_id ?? ''))
        body.department_id = form.department_id ? Number(form.department_id) : null
      if (numberChanged) body.act_number = form.act_number.trim() || null
      if (form.act_date !== (original.act_date ?? '')) body.act_date = form.act_date || null
      if (form.created_by_id && form.created_by_id !== (original.created_by_id ?? ''))
        body.created_by_id = Number(form.created_by_id)
    } else {
      body.organization_branch_id = effectiveBranchId
      if (form.department_id) body.department_id = Number(form.department_id)
      if (creatorRole === 'hr') {
        body.act_number = form.act_number.trim() || null
        body.act_date = form.act_date || null
      }
    }

    setSaving(true)
    try {
      const saved = editId
        ? await mut.update.mutateAsync({ id: editId, body })
        : await mut.create.mutateAsync(body)
      const id = editId ?? saved?.id ?? null
      if (id && newFiles.length) {
        try {
          await mut.uploadDocuments.mutateAsync({ id, files: newFiles })
        } catch {
          toast.error(t('orders.filesPartly'))
        }
      }
      mut.invalidate()
      toast.ok(editId ? t('orders.saved') : t('orders.created'))
      onSaved(editId ? null : id)
    } catch {
      // The mutation cache already showed the server's reason; keep the form.
    } finally {
      setSaving(false)
    }
  }

  const removeAttachment = async (docId: number) => {
    if (!editId) return
    try {
      await mut.removeDocument.mutateAsync({ id: editId, docId })
      mut.invalidate()
    } catch {
      /* toast shown by the mutation cache */
    }
  }

  const loading = !!editId && (detailLoading || !detail)

  return (
    <Modal
      open={open}
      onClose={onClose}
      placement="right"
      size="lg"
      title={editId ? t('orders.editTitle') : t('orders.createTitle')}
      description={creatorRole === 'hr' ? t('orders.hrOrder') : t('orders.employeeOrder')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={submit}
            loading={saving}
            disabled={loading || numberCheck.taken || (!!editId && !form.change_reason.trim())}
          >
            {editId ? t('common.save') : t('orders.create')}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t('orders.fCategory')} required error={errors.category_id} wide>
            <Combobox
              value={form.category_id}
              onChange={(v) => set('category_id', v)}
              options={categoryOptions}
              loading={categoriesQ.isLoading}
              placeholder={t('orders.pick')}
              invalid={!!errors.category_id}
              clearable={false}
            />
          </Field>

          {orderType && (
            <div className="sm:col-span-2">
              <OrderTypeFields
                type={orderType}
                details={form.details}
                onChange={(d) => {
                  setForm((f) => ({ ...f, details: d }))
                  setErrors((er) => Object.fromEntries(Object.entries(er).filter(([k]) => d[k] === form.details[k])))
                }}
                effectiveStartDate={form.effective_start_date}
                onEffectiveStartDate={(v) => set('effective_start_date', v)}
                errors={errors}
                branchId={branchId}
              />
            </div>
          )}

          {numberFieldShown && (
            <>
              <Field label={t('orders.fNumber')} error={errors.act_number} wide>
                <div className="flex gap-2">
                  <Input
                    value={form.act_number}
                    onChange={(e) => set('act_number', e.target.value)}
                    placeholder={t('orders.numberPlaceholder')}
                    invalid={!!errors.act_number || numberCheck.taken}
                    wrapperClassName="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    leftIcon={<Wand2 size={14} />}
                    loading={suggesting}
                    onClick={suggest}
                    title={t('orders.suggestHint')}
                  >
                    {t('orders.suggest')}
                  </Button>
                </div>
                {!errors.act_number && form.act_number.trim() !== '' && numberChanged && (
                  <p
                    className={cn(
                      'mt-1 text-[12px]',
                      numberCheck.taken ? 'text-danger' : numberCheck.checking ? 'text-fg-subtle' : 'text-success',
                    )}
                    aria-live="polite"
                  >
                    {numberCheck.taken ? t('orders.numberTaken') : numberCheck.checking ? t('orders.numberChecking') : numberCheck.checked ? t('orders.numberFree') : ''}
                  </p>
                )}
              </Field>
              <Field label={t('orders.fDate')} hint={t('orders.dateLaterHint')}>
                <DateInput value={form.act_date} onChange={(v) => set('act_date', v)} />
              </Field>
            </>
          )}

          <Field label={t('orders.fDepartment')} wide>
            <Combobox
              value={form.department_id}
              onChange={(v) => set('department_id', v)}
              options={departments}
              placeholder={t('orders.pick')}
            />
          </Field>

          {!!editId && (
            <Field label={t('orders.fAuthor')} wide>
              <EmployeeSelect
                value={form.created_by_id}
                onChange={(v, o) => {
                  remember(o)
                  set('created_by_id', v)
                }}
                branchId={branchId}
                known={known}
                placeholder={t('orders.pick')}
                clearable={false}
              />
            </Field>
          )}

          <Field label={t('orders.fSummary')} wide>
            <Textarea
              rows={3}
              value={form.summary}
              onChange={(e) => set('summary', e.target.value)}
              placeholder={t('orders.summaryPlaceholder')}
            />
          </Field>

          <Field label={t('orders.fText')} required error={errors.description} wide>
            <Textarea
              rows={6}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder={t('orders.textPlaceholder')}
              invalid={!!errors.description}
            />
          </Field>

          {/* TZ 4.2.9: employees named in the text — suggested, linked only on a click. */}
          <div className="-mt-2 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              leftIcon={<ScanSearch size={14} />}
              loading={detecting}
              disabled={!form.description.trim()}
              onClick={detect}
            >
              {t('orders.detect')}
            </Button>
            {mentions !== null &&
              (mentions.length ? (
                <div className="mt-2 rounded-panel border border-line bg-surface-2/40 p-3">
                  <p className="mb-2 text-[12px] text-fg-muted">{t('orders.mentionsHint')}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mentions.map((m) => (
                      <span key={m.employee_id} className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => addMentionAsEmployee(m)}
                          title={t('orders.addToEmployees')}
                          className="inline-flex items-center gap-1.5 rounded-l-pill border border-line bg-surface px-2.5 py-1 text-[12.5px] text-fg transition-colors hover:border-brand/40 hover:bg-brand-soft"
                        >
                          <span>{m.full_name}</span>
                          <span
                            className={cn(
                              'text-[10.5px] font-semibold uppercase',
                              m.confidence === 'high' ? 'text-success' : m.confidence === 'medium' ? 'text-warning' : 'text-fg-subtle',
                            )}
                          >
                            {m.confidence === 'high' ? t('orders.confHigh') : m.confidence === 'medium' ? t('orders.confMedium') : t('orders.confLow')}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addMentionAsApprover(m)}
                          title={t('orders.addToApprovers')}
                          aria-label={t('orders.addToApprovers')}
                          className="inline-flex items-center rounded-r-pill border border-l-0 border-line bg-surface px-2 py-1.5 text-fg-muted transition-colors hover:bg-brand-soft hover:text-brand"
                        >
                          <UserPlus size={13} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[12px] text-fg-subtle">{t('orders.mentionsNone')}</p>
              ))}
          </div>

          <Field label={t('orders.fEmployees')} wide>
            <EmployeeMultiPicker
              value={form.employees}
              onChange={(v) => set('employees', v)}
              branchId={branchId}
              placeholder={t('orders.employeesPlaceholder')}
            />
          </Field>

          <Field label={t('orders.fLeadership')} required error={errors.leadership_id}>
            <Combobox
              value={form.leadership_id}
              onChange={(v) => set('leadership_id', v)}
              options={leadership.options}
              loading={leadership.loading}
              placeholder={t('orders.pickLeader')}
              invalid={!!errors.leadership_id}
            />
          </Field>

          <Field label={t('orders.fSubmitter')}>
            <EmployeeSelect
              value={form.submitter_id}
              onChange={(v, o) => {
                remember(o)
                set('submitter_id', v)
              }}
              branchId={branchId}
              known={known}
              placeholder={t('orders.pick')}
            />
          </Field>

          {/* Attachments (TZ O1 «ilova»): uploaded after the order is saved. */}
          <div className="sm:col-span-2">
            <span className={LABEL_CLS}>{t('orders.fAttachments')}</span>
            <ul className="space-y-1.5">
              {attachments.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-inner border border-line bg-surface-2/40 px-3 py-2">
                  <Paperclip size={14} className="shrink-0 text-fg-subtle" />
                  {d.file_path ? (
                    <a href={d.file_path} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-[13px] text-brand hover:underline">
                      {d.file_name || d.document_objectname || t('orders.file')}
                    </a>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{d.file_name || d.document_objectname}</span>
                  )}
                  <IconButton size="sm" label={t('common.delete')} onClick={() => removeAttachment(d.id)}>
                    <Trash2 size={14} className="text-danger" />
                  </IconButton>
                </li>
              ))}
              {newFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-inner border border-dashed border-line px-3 py-2">
                  <Paperclip size={14} className="shrink-0 text-fg-subtle" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-fg">{f.name}</span>
                  <IconButton size="sm" label={t('common.delete')} onClick={() => setNewFiles((l) => l.filter((_, j) => j !== i))}>
                    <X size={14} />
                  </IconButton>
                </li>
              ))}
            </ul>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ATTACH_ACCEPT}
              className="hidden"
              aria-label={t('orders.addFile')}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? [])
                if (picked.length) setNewFiles((l) => [...l, ...picked])
                e.target.value = ''
              }}
            />
            <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={() => fileRef.current?.click()}>
              {t('orders.addFile')}
            </Button>
          </div>

          {/* Approvers (kelishuvchilar) — at least one; listed by rank. */}
          <div className="sm:col-span-2">
            <span className={LABEL_CLS}>
              {t('orders.fApprovers')}
              <span className="ml-0.5 text-danger">*</span>
            </span>
            <div className="space-y-2">
              {form.approvers.map((a, i) => (
                <div key={i} className="rounded-panel border border-line bg-surface-2/40 p-2.5">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <EmployeeSelect
                        value={a.employee_id}
                        onChange={(v, o) => {
                          remember(o)
                          set('approvers', form.approvers.map((x, j) => (j === i ? { ...x, employee_id: v } : x)))
                        }}
                        branchId={branchId}
                        known={known}
                        placeholder={t('orders.approverPlaceholder')}
                      />
                    </div>
                    <IconButton
                      size="sm"
                      label={t('common.delete')}
                      onClick={() => set('approvers', form.approvers.filter((_, j) => j !== i))}
                    >
                      <X size={15} />
                    </IconButton>
                  </div>
                  <Checkbox
                    className="mt-2"
                    label={t('orders.canEditDocument')}
                    checked={a.can_edit_document}
                    onChange={(e) =>
                      set('approvers', form.approvers.map((x, j) => (j === i ? { ...x, can_edit_document: e.target.checked } : x)))
                    }
                  />
                </div>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-1.5"
             
              onClick={() => set('approvers', [...form.approvers, { employee_id: '', can_edit_document: false }])}
            >
              {t('orders.addApprover')}
            </Button>
            {errors.approvers && <p className={ERROR_CLS}>{errors.approvers}</p>}
          </div>

          {!!editId && (
            <Field label={t('orders.fChangeReason')} required error={errors.change_reason} wide>
              <Textarea
                rows={3}
                maxLength={1000}
                value={form.change_reason}
                onChange={(e) => set('change_reason', e.target.value)}
                placeholder={t('orders.changeReasonPlaceholder')}
                invalid={!!errors.change_reason}
              />
            </Field>
          )}
        </div>
      )}
    </Modal>
  )
}
