import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Users } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { apiPost } from '@/api/http'
import { fetchAllPages } from '@/api/fetchAll'
import { DEPARTMENTS_LIST } from '@/api/endpoints'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { useBranches } from '@/hooks/useBranches'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { EmployeeBasisFields } from '@/features/employees/EmployeeBasisFields'
import { invalidateEmployees } from '@/features/employees/useEmployees'
import { EMPTY_BASIS, cleanBasis, isBasisComplete, type EditBasis } from '@/features/employees/types'
import { DEPT_ADMIN_KEY, type DepartmentRow } from './useDepartmentAdmin'

interface DeptEmployee {
  id: number
  legal_name?: string | null
  job_position_id?: number | null
  job_position?: { id: number; name?: string | null } | null
}

interface TransferResult {
  moved_count: number
  remaining_employee_count: number
}

/** Why the transfer was offered: the refused action and the server's counts. */
export interface TransferContext {
  dept: DepartmentRow
  action: 'delete' | 'close'
  employeeCount: number
  archivedCount: number
}

/**
 * TZ S1 1116 «Удаление подразделения с сотрудниками — Система блокирует
 * удаление и предлагает перевести сотрудников»:
 * `POST /departments/{pk}/transfer-employees {target_department_id,
 * job_position_map?, employee_ids?, include_archived?, basis}`.
 *
 * Opened when deleting / closing a department was refused because of its
 * employees. The target may be in another organisation — then the server
 * answers 422 `job_position_map_required` with the positions that need a new
 * position there, and the dialog asks for them. After a successful transfer
 * `onDone` repeats the refused action.
 */
export function TransferEmployeesModal({
  ctx,
  onClose,
  onDone,
}: {
  ctx: TransferContext | null
  onClose: () => void
  onDone?: (result: TransferResult) => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const open = !!ctx
  const sourceBranch = ctx?.dept.organization_branch_id ?? null
  const { branches } = useBranches()
  const [branch, setBranch] = useState('')
  const [target, setTarget] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [includeArchived, setIncludeArchived] = useState(false)
  const [basis, setBasis] = useState<EditBasis>(EMPTY_BASIS)
  const [missing, setMissing] = useState<{ job_position_id: number; name?: string | null }[]>([])
  const [posMap, setPosMap] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const staff = useQuery({
    queryKey: ['employees', 'department', ctx?.dept.id],
    queryFn: () => fetchAllPages<DeptEmployee>('employees', { department_id: ctx!.dept.id, _no_branch_inject: true }),
    enabled: open,
  })
  const rows = useMemo(() => staff.data ?? [], [staff.data])

  useEffect(() => {
    if (!open) return
    setBranch(sourceBranch ? String(sourceBranch) : '')
    setTarget('')
    setIncludeArchived(ctx?.action === 'delete' && (ctx?.archivedCount ?? 0) > 0)
    setBasis(EMPTY_BASIS)
    setMissing([])
    setPosMap({})
    setErrors({})
  }, [open, sourceBranch, ctx?.action, ctx?.archivedCount])

  // Default: every active employee of the department.
  useEffect(() => {
    if (open) setSelected(new Set(rows.map((r) => r.id)))
  }, [open, rows])

  const branchId = branch ? Number(branch) : null
  const deptOptions = useDepartmentOptions(branchId)
  const targetOptions = useMemo(() => deptOptions.filter((o) => Number(o.value) !== ctx?.dept.id), [deptOptions, ctx?.dept.id])
  const posOptions = useJobPositionOptions(branchId)
  const branchOptions = useMemo(() => branches.map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })), [branches])

  const allSelected = rows.length > 0 && selected.size === rows.length
  // Nobody deselected (or no active staff at all) — the whole department moves.
  const everyone = rows.length === 0 || allSelected
  const toggle = (id: number) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const transfer = useMutation({
    meta: { silent: true },
    mutationFn: (body: Record<string, unknown>) => apiPost<TransferResult>(`${DEPARTMENTS_LIST}/${ctx!.dept.id}/transfer-employees`, body),
    onSuccess: () => {
      invalidateEmployees(qc)
      void qc.invalidateQueries({ queryKey: [DEPT_ADMIN_KEY] })
      void qc.invalidateQueries({ queryKey: ['structure-departments'] })
      void qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })

  const submit = async () => {
    if (!ctx) return
    const errs: Record<string, string> = {}
    if (!target) errs.target = t('hrExt.transfer.pickTarget')
    if (!includeArchived && selected.size === 0) errs.staff = t('hrExt.transfer.pickStaff')
    if (!isBasisComplete(basis)) errs.basis = t('personnel.basis.required')
    if (missing.some((m) => !posMap[String(m.job_position_id)])) errs.map = t('hrExt.transfer.mapRequired')
    setErrors(errs)
    if (Object.keys(errs).length) return
    const map = Object.fromEntries(Object.entries(posMap).filter(([, v]) => v).map(([k, v]) => [k, Number(v)]))
    try {
      const res = await transfer.mutateAsync({
        target_department_id: Number(target),
        job_position_map: Object.keys(map).length ? map : undefined,
        // Everyone (and, on request, the archive) — or the picked ones only.
        employee_ids: everyone ? undefined : [...selected],
        include_archived: everyone && includeArchived ? true : undefined,
        basis: cleanBasis(basis),
      })
      toast.ok(t('hrExt.transfer.done', { count: res.moved_count }))
      onClose()
      onDone?.(res)
    } catch (e) {
      const code = errorCode(e)
      const p = errorParams(e)
      if (code === 'job_position_map_required' && Array.isArray(p.missing)) {
        setMissing(p.missing as { job_position_id: number; name?: string | null }[])
        setErrors({ map: t('hrExt.transfer.mapHint') })
      } else if (code === 'same_department') {
        setErrors({ target: t('hrExt.transfer.same') })
      } else if (code === 'nothing_to_transfer') {
        setErrors({ form: t('hrExt.transfer.nothing') })
      } else if (code === 'employee_not_in_department') {
        void staff.refetch()
        setErrors({ form: t('hrExt.transfer.notInDept') })
      } else {
        setErrors({ form: errorMessage(e, t('common.actionFailed')) })
      }
    }
  }

  const blocked =
    ctx?.action === 'delete'
      ? t('hrExt.transfer.blockedDelete', { name: ctx.dept.name ?? '', count: ctx.employeeCount, archived: ctx.archivedCount })
      : ctx
        ? t('hrExt.transfer.blockedClose', { name: ctx.dept.name ?? '', count: ctx.employeeCount })
        : ''

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('hrExt.transfer.title')}
      description={ctx?.dept.name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={transfer.isPending}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<ArrowRight size={15} />} onClick={() => void submit()} loading={transfer.isPending}>
            {ctx?.action === 'delete' ? t('hrExt.transfer.submitDelete') : t('hrExt.transfer.submitClose')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="status" className="flex gap-2.5 rounded-lg border border-warning/35 bg-warning-soft p-3 text-[13px] text-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <p>{blocked}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hrExt.transfer.org')} required>
            <Combobox
              value={branch}
              onChange={(v) => {
                setBranch(v)
                setTarget('')
                setMissing([])
                setPosMap({})
              }}
              options={branchOptions}
              placeholder={t('personnel.place.pickOrg')}
            />
          </Field>
          <Field label={t('hrExt.transfer.target')} required error={errors.target}>
            <Combobox
              value={target}
              onChange={(v) => {
                setTarget(v)
                setErrors((x) => ({ ...x, target: '' }))
              }}
              options={branchId ? targetOptions : []}
              disabled={!branchId}
              placeholder={t('hrExt.transfer.pickTarget')}
              invalid={!!errors.target}
            />
          </Field>
        </div>

        {missing.length > 0 && (
          <fieldset className="rounded-lg border border-line p-3">
            <legend className="px-1.5 text-[13px] font-semibold text-fg">{t('hrExt.transfer.mapTitle')}</legend>
            <p className="mb-2.5 text-[12.5px] text-fg-muted">{t('hrExt.transfer.mapHint')}</p>
            <div className="flex flex-col gap-2.5">
              {missing.map((m) => (
                <div key={m.job_position_id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <span className="truncate text-[13px] text-fg">{m.name || `#${m.job_position_id}`}</span>
                  <ArrowRight size={14} className="hidden text-fg-subtle sm:block" aria-hidden />
                  <Combobox
                    value={posMap[String(m.job_position_id)] ?? ''}
                    onChange={(v) => setPosMap((x) => ({ ...x, [String(m.job_position_id)]: v }))}
                    options={posOptions}
                    placeholder={t('personnel.place.pickPos')}
                    aria-label={m.name ?? String(m.job_position_id)}
                  />
                </div>
              ))}
            </div>
            <FormError className="mt-2 text-xs">{errors.map && missing.some((m) => !posMap[String(m.job_position_id)]) ? errors.map : ''}</FormError>
          </fieldset>
        )}

        <fieldset className="rounded-lg border border-line p-3">
          <legend className="flex items-center gap-1.5 px-1.5 text-[13px] font-semibold text-fg">
            <Users size={14} className="text-brand" aria-hidden /> {t('hrExt.transfer.staff', { selected: selected.size, total: rows.length })}
          </legend>
          {staff.isLoading ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <p className="text-[12.5px] text-fg-muted">{t('hrExt.transfer.noActive')}</p>
          ) : (
            <>
              <Checkbox
                label={t('hrExt.transfer.all')}
                checked={allSelected}
                indeterminate={selected.size > 0 && !allSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
              />
              <ul className="mt-2 grid max-h-56 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                {rows.map((r) => (
                  <li key={r.id} className="min-w-0">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2 rounded-inner px-1.5 py-1 hover:bg-surface-2">
                      <Checkbox inLabel checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-fg">{r.legal_name || `#${r.id}`}</span>
                        <span className="block truncate text-[11px] text-fg-muted">{r.job_position?.name || '—'}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-2.5 border-t border-line pt-2.5">
            <Checkbox
              label={t('hrExt.transfer.includeArchived', { count: ctx?.archivedCount ?? 0 })}
              checked={includeArchived}
              disabled={!everyone}
              onChange={(e) => setIncludeArchived(e.target.checked)}
            />
            <p className="mt-1 text-[11.5px] text-fg-subtle">{t('hrExt.transfer.includeArchivedHint')}</p>
          </div>
          <FormError className="mt-2 text-xs">{errors.staff}</FormError>
        </fieldset>

        <EmployeeBasisFields value={basis} onChange={setBasis} error={errors.basis} />
        <FormError>{errors.form}</FormError>
      </div>
    </Modal>
  )
}
