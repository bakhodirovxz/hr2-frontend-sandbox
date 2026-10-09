import { useEffect, useMemo, useRef, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { Paperclip, UserSearch, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/api/http'
import { useDepartmentRecords } from '@/hooks/useReferenceData'
import type { Department } from '@/features/structure/useStructure'
import { ORDER_ACT_CATEGORIES, ORDER_ACTS } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { ComboRows, RowList } from '@/components/ui/RowList'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import * as roles from '@/auth/roles'
import { NumberTakenHint } from '@/components/ui/NumberTakenHint'
import { useDebounce } from '@/hooks/useDebounce'
import { useEmployeeOptions } from '@/features/employees/useEmployeeOptions'
import { useLeadershipOptions } from '@/features/employees/useLeadershipOptions'
import { cn } from '@/lib/cn'
import { useActNumberAvailability, useOrderMutations, type OrderAct } from './useOrders'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'


/** `POST /order-acts/detect-employees` javobi (TZ 4.2.9). */
interface MentionHit {
  employee_id: number
  full_name: string
  confidence: 'high' | 'medium' | 'low'
}

interface ApproverRow {
  employeeId: string
  can_edit_document: boolean
}

/**
 * Create OR edit. v2 had no edit path at all — `useOrders` carried no PATCH —
 * so once an order existed its approvers, its familiarizer departments, its
 * submitter and its text were frozen. An order sent back with
 * `changes_requested` could be re-submitted but not actually CHANGED.
 *
 * The two modes share one form because they are the same form: the server's
 * `OrderActUpdate` takes the same fields as `OrderActCreate` minus the ones it
 * refuses to move by PATCH (status, is_stamped, act_number/date, branch — all
 * set by the decree_* steps, see `update_order_act`).
 */
export function CreateOrderModal({
  open,
  onClose,
  onCreated,
  order = null,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: number) => void
  /** null = create. */
  order?: OrderAct | null
}) {
  const isEdit = !!order?.id
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const branchId = selectedBranchId ?? user?.employee?.organization_branch_id ?? null
  const mut = useOrderMutations()
  // Familiarizer departments: every one of them. This used to read the
  // structure screen's paged query and offered only 25.
  const departments = useDepartmentRecords<Department>()

  // The stream is decided by WHO creates it: HR writes "Kadr buyrug'i"
  // categories, everyone else "Xodim buyrug'i". HR categories have no
  // chancellery step, so the number and date are entered up front (v1 parity).
  const creatorRole: 'hr' | 'employee' = roles.isHR(user) ? 'hr' : 'employee'
  const isHrDecree = creatorRole === 'hr'

  const { data: categories, error: categoriesError } = useQuery({
    queryKey: ['order-act-categories', creatorRole],
    // Without creator_role an employee sees HR categories too, and creating one
    // fails server-side with act_number_required.
    queryFn: () =>
      apiGet<{ id: number; name?: string }[]>(ORDER_ACT_CATEGORIES, { creator_role: creatorRole }),
    enabled: open,
  })

  const { options: employeeOptions } = useEmployeeOptions(branchId, open)
  const { options: leadershipOptions } = useLeadershipOptions(branchId, open)

  const [categoryId, setCategoryId] = useState('')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [submitterId, setSubmitterId] = useState('')
  const [leadershipId, setLeadershipId] = useState('')
  const [familiarizerDeptIds, setFamiliarizerDeptIds] = useState<string[]>([])
  const [approvers, setApprovers] = useState<ApproverRow[]>([])
  const [mentions, setMentions] = useState<MentionHit[] | null>(null)
  const [detecting, setDetecting] = useState(false)

  const detectMentions = async () => {
    setDetecting(true)
    try {
      const hits = await apiPost<MentionHit[]>(`${ORDER_ACTS}/detect-employees`, {
        text: description,
        organization_branch_id: branchId || undefined,
      })
      setMentions(Array.isArray(hits) ? hits : [])
    } finally {
      setDetecting(false)
    }
  }

  /** Taklif qilingan xodimni kelishuvchilar ro'yxatiga qo'shadi (dublikatsiz). */
  const addMentionAsApprover = (employeeId: number) => {
    const v = String(employeeId)
    setApprovers((prev) =>
      prev.some((a) => a.employeeId === v)
        ? prev
        : [...prev.filter((a) => a.employeeId), { employeeId: v, can_edit_document: false }],
    )
  }
  const [actNumber, setActNumber] = useState('')
  // Debounced so the check follows the typist rather than every keystroke.
  const debouncedActNumber = useDebounce(actNumber, 400)
  const actNumberCheck = useActNumberAvailability(branchId, debouncedActNumber.trim(), order?.id)
  const [actDate, setActDate] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const signers = order?.assigned_signers ?? []
    setCategoryId(order?.category_id ? String(order.category_id) : '')
    setSummary(order?.summary ?? '')
    setDescription(order?.description ?? '')
    setSubmitterId(order?.submitter_id ? String(order.submitter_id) : '')
    setLeadershipId(
      String(signers.find((a) => a.signer_type === 'leadership')?.employee_id ?? ''),
    )
    setFamiliarizerDeptIds(
      (order?.familiarizer_departments ?? []).map((d) => String(d.id)),
    )
    setApprovers(
      signers
        .filter((a) => a.signer_type === 'approver')
        .map((a) => ({
          employeeId: String(a.employee_id ?? ''),
          can_edit_document: !!a.can_edit_document,
        })),
    )
    setActNumber(order?.act_number ?? '')
    setActDate(order?.act_date?.slice(0, 10) ?? '')
    // Files already on the order are managed from the detail panel; this input
    // only ever ADDS.
    setFiles([])
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }, [open, order])

  const departmentOptions = useMemo(
    () =>
      departments
        .slice()
        // Familiarizers are read in department index order in the document.
        .sort((a, b) => {
          const ai = a.index ?? Number.POSITIVE_INFINITY
          const bi = b.index ?? Number.POSITIVE_INFINITY
          if (ai !== bi) return ai - bi
          return String(a.name ?? '').localeCompare(String(b.name ?? ''))
        })
        .map((d) => ({ value: String(d.id), label: d.name ?? '' })),
    [departments],
  )

  const submit = async () => {
    setError('')
    const picked = approvers.filter((a) => a.employeeId)

    if (!categoryId) return setError(t('orders.categoryRequired'))
    if (!summary.trim()) return setError(t('orders.summaryRequired'))
    // `description` is a REQUIRED string server-side — sending null returned a
    // 422 that the form used to swallow, closing silently with nothing created.
    if (!description.trim()) return setError(t('orders.descriptionRequired'))
    if (!leadershipId) return setError(t('orders.leadershipRequired'))
    if (picked.length === 0) return setError(t('orders.approverRequired'))
    // The backend rejects this too (submitter_cannot_be_approver); catch it here
    // so the user does not lose the form.
    if (submitterId && picked.some((a) => a.employeeId === submitterId)) {
      return setError(t('orders.submitterNotApprover'))
    }
    // Only on create: PATCH refuses to move the number/date anyway (they belong
    // to the register), so an edit must not demand them.
    if (!isEdit && isHrDecree && !actNumber.trim()) return setError(t('orders.actNumberRequired'))

    const payload: Record<string, unknown> = {
      category_id: Number(categoryId),
      summary: summary.trim(),
      description: description.trim(),
      submitter_id: submitterId ? Number(submitterId) : null,
      familiarizer_department_ids: familiarizerDeptIds.filter(Boolean).map(Number),
      // Leadership travels INSIDE assigned_signers — there is no leadership_id
      // field on OrderActCreate, so a top-level one is silently dropped.
      assigned_signers: [
        ...picked.map((a) => ({
          employee_id: Number(a.employeeId),
          signer_type: 'approver',
          can_edit_document: a.can_edit_document,
        })),
        { employee_id: Number(leadershipId), signer_type: 'leadership', can_edit_document: false },
      ],
      // ⚠️ Branch, number and date are CREATE-only: `update_order_act` strips
      // them from the PATCH body on purpose (changing the branch would mean
      // taking a number out of another branch's sequence).
      ...(isEdit
        ? {}
        : {
            organization_branch_id: branchId,
            ...(isHrDecree ? { act_number: actNumber.trim(), act_date: actDate || null } : {}),
          }),
    }

    setBusy(true)
    try {
      const res = isEdit
        ? ((await mut.update.mutateAsync({ id: order!.id, body: payload })) as OrderAct)
        : ((await mut.create.mutateAsync(payload)) as OrderAct)
      // Documents ride on a separate multipart call (the field is `files`).
      if (res?.id && files.length > 0) {
        const fd = new FormData()
        files.forEach((f) => fd.append('files', f))
        await apiPost(`${ORDER_ACTS}/${res.id}/documents`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      }
      mut.invalidate()
      onCreated(res?.id ?? order!.id)
    } catch (err) {
      setError(errorMessage(err, t('orders.actionFailed')))
    } finally {
      setBusy(false)
    }
  }

  const setApproverAt = (i: number, patch: Partial<ApproverRow>) =>
    setApprovers((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        isEdit
          ? t('orders.editTitle')
          : isHrDecree
            ? t('orders.createTitleHr')
            : t('orders.createTitle')
      }
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('orders.fieldCategory')} required>
          <Combobox
            className="w-full"
            value={categoryId}
            onChange={setCategoryId}
            placeholder={t('orders.categoryPick')}
            options={(categories ?? []).map((c) => ({ value: String(c.id), label: c.name ?? '' }))}
            /* Category is required. When the list failed to load the box was
             * simply empty and the form could not be submitted, with nothing
             * on screen saying why. `Combobox` renders this in the danger
             * tone instead of the "nothing found" hint. */
            error={categoriesError}
          />
        </Field>

        {isHrDecree && !isEdit && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('orders.actNumber')} required hint={t('orders.hrNumberHint')}>
              <Input value={actNumber} onChange={(e) => setActNumber(e.target.value)} />
              <NumberTakenHint
                available={actNumberCheck.available}
                suggested={actNumberCheck.suggested}
                onUse={setActNumber}
              />
            </Field>
            <Field label={t('orders.actDate')}>
              <DateInput value={actDate} onChange={setActDate} />
            </Field>
          </div>
        )}

        <Field label={t('orders.fieldSummary')} required>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>

        <Field label={t('orders.fieldDescription')} required>
          <Textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {/* TZ 4.2.9: «Автоматическое определение упоминаний сотрудников в
              тексте приказа». Xizmat FAQAT TAKLIF qiladi — buyruq huquqiy
              hujjat va o'xshash familiya sabab avtomatik bog'lash xato
              xodimga yozib qo'yishi mumkin (backenddagi izoh ham shunday).
              v1 da bu bor edi, v2 ga o'tmagandi. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<UserSearch size={14} />}
              loading={detecting}
              disabled={description.trim().length < 8}
              onClick={detectMentions}
            >
              {t('orders.detectMentions')}
            </Button>
            {mentions?.length === 0 && (
              <span className="text-xs text-fg-subtle">{t('orders.mentionsNone')}</span>
            )}
          </div>
          {!!mentions?.length && (
            <div className="mt-2 rounded-inner border border-line bg-surface-2/60 p-2.5">
              <p className="mb-1.5 text-[11.5px] text-fg-muted">{t('orders.mentionsHint')}</p>
              <div className="flex flex-wrap gap-1.5">
                {mentions.map((m) => (
                  <button
                    key={m.employee_id}
                    type="button"
                    onClick={() => addMentionAsApprover(m.employee_id)}
                    title={t('orders.addApprover')}
                    className="inline-flex h-control-sm items-center gap-1.5 rounded-pill bg-fg/[0.06] px-2.5 text-[12px] text-fg transition-colors hover:bg-brand-soft hover:text-brand-strong"
                  >
                    <span>{m.full_name}</span>
                    <span
                      className={cn(
                        'text-[11.5px]',
                        m.confidence === 'high'
                          ? 'text-success'
                          : m.confidence === 'medium'
                            ? 'text-warning'
                            : 'text-fg-subtle',
                      )}
                    >
                      {t(`orders.mentionConfidence_${m.confidence}` as never)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Field>

        <Field label={t('orders.fieldLeadership')} required>
          <Combobox
            className="w-full"
            value={leadershipId}
            onChange={setLeadershipId}
            placeholder={t('orders.leadershipPick')}
            options={leadershipOptions}
          />
        </Field>

        <Field label={t('orders.fieldSubmitter')}>
          <Combobox
            className="w-full"
            value={submitterId}
            onChange={setSubmitterId}
            placeholder={t('orders.submitterPick')}
            options={employeeOptions}
          />
        </Field>

        <Field label={t('orders.fieldApprovers')} required hint={t('orders.approversHint')}>
          <RowList
            count={approvers.length}
            addLabel={t('orders.addApprover')}
            emptyHint={t('orders.approversEmpty')}
            onAdd={() => setApprovers((prev) => [...prev, { employeeId: '', can_edit_document: false }])}
            onRemove={(i) => setApprovers((prev) => prev.filter((_, idx) => idx !== i))}
            renderRow={(i) => (
              <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-2/60 p-2">
                <Combobox
                  className="w-full"
                  value={approvers[i]?.employeeId ?? ''}
                  onChange={(v) => setApproverAt(i, { employeeId: v })}
                  placeholder={t('orders.approverPick')}
                  options={employeeOptions.filter(
                    (o) =>
                      o.value === approvers[i]?.employeeId ||
                      !approvers.some((a) => a.employeeId === o.value),
                  )}
                />
                <Checkbox
                  checked={approvers[i]?.can_edit_document ?? false}
                  onChange={(e) => setApproverAt(i, { can_edit_document: e.target.checked })}
                  label={t('orders.approverCanEdit')}
                />
              </div>
            )}
          />
        </Field>

        <Field label={t('orders.fieldFamiliarizerDepts')} hint={t('orders.familiarizerHint')}>
          <ComboRows
            value={familiarizerDeptIds}
            onChange={setFamiliarizerDeptIds}
            options={departmentOptions}
            addLabel={t('orders.addFamiliarizer')}
            placeholder={t('orders.familiarizerPick')}
            emptyHint={t('orders.familiarizerEmpty')}
          />
        </Field>

        <Field label={t('orders.fieldFiles')}>
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []))
              // Lets the same file be re-picked after removing it from the list.
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={cn(
              'flex min-h-[44px] w-full items-center gap-2 rounded-lg border-2 border-dashed px-3 text-left transition-colors',
              files.length ? 'border-brand/30 bg-brand-soft' : 'border-line bg-surface-2 hover:border-brand/40',
            )}
          >
            <Paperclip size={15} className="shrink-0 text-fg-subtle" />
            <span className="truncate text-sm text-fg-muted">
              {files.length ? files.map((f) => f.name).join(', ') : t('orders.filesPick')}
            </span>
            {files.length > 0 && (
              <span
                role="button"
                tabIndex={0}
                aria-label={t('common.clearValue')}
                className="ml-auto rounded p-1 text-danger"
                onClick={(e) => {
                  e.stopPropagation()
                  setFiles([])
                  if (fileRef.current) fileRef.current.value = ''
                }}
              >
                <X size={14} />
              </span>
            )}
          </button>
        </Field>

        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}
