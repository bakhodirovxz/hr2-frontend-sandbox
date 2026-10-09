import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useBranches } from '@/hooks/useBranches'
import { useDepartmentOptions, useJobPositionOptions } from '@/hooks/useReferenceData'
import { EmployeeBasisFields } from './EmployeeBasisFields'
import { useEmployeeMutations } from './useEmployees'
import { EMPTY_BASIS, cleanBasis, isBasisComplete, type EditBasis, type EmployeeFull } from './types'

/** The employee's current (or last) branch. */
export function employeeBranchId(e?: EmployeeFull | null): number | null {
  return (
    e?.department?.organization_branch_id ||
    e?.job_position?.organization_branch_id ||
    e?.primary_organization_branch_id ||
    e?.organization_branches?.[0]?.id ||
    null
  )
}

/**
 * «Qayta ishga qabul qilish» (TZ 4.2.7 · 2155, `mode="rehire"`) and «Boshqa
 * tashkilotga o'tkazish» (2156, `mode="migrate"`):
 *   rehire:  POST /employees/{pk}/rehire  {hire_date, department_id, job_position_id, basis}
 *   migrate: POST /employees/{pk}/migrate {organization_branch_id, department_id, job_position_id, date, basis}
 */
export function PlacementModal({
  mode,
  employee,
  onClose,
  onDone,
}: {
  mode: 'rehire' | 'migrate' | null
  employee: EmployeeFull
  onClose: () => void
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const open = !!mode
  const isMigrate = mode === 'migrate'
  const current = employeeBranchId(employee)
  const { branches } = useBranches()
  const { rehire, migrate } = useEmployeeMutations()
  const [branch, setBranch] = useState('')
  const [dept, setDept] = useState('')
  const [pos, setPos] = useState('')
  const [date, setDate] = useState('')
  const [basis, setBasis] = useState<EditBasis>(EMPTY_BASIS)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setBranch(isMigrate ? '' : current ? String(current) : '')
    setDept('')
    setPos('')
    setDate('')
    setBasis(EMPTY_BASIS)
    setErrors({})
  }, [open, isMigrate, current])

  const branchId = branch ? Number(branch) : null
  const deptOptions = useDepartmentOptions(branchId)
  const posOptions = useJobPositionOptions(branchId)
  const branchOptions = useMemo(
    () =>
      branches
        .filter((b) => !isMigrate || Number(b.id) !== Number(current))
        .map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` })),
    [branches, isMigrate, current],
  )

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (!branch) errs.branch = t('personnel.place.pickOrg')
    if (!dept) errs.dept = t('personnel.place.pickDept')
    if (!pos) errs.pos = t('personnel.place.pickPos')
    if (!date) errs.date = t('personnel.place.pickDate')
    if (!isBasisComplete(basis)) errs.basis = t('personnel.basis.required')
    setErrors(errs)
    if (Object.keys(errs).length) return
    try {
      if (isMigrate) {
        await migrate.mutateAsync({
          id: employee.id,
          body: { organization_branch_id: Number(branch), department_id: Number(dept), job_position_id: Number(pos), date, basis: cleanBasis(basis) },
        })
        toast.ok(t('personnel.place.migrated'))
      } else {
        await rehire.mutateAsync({
          id: employee.id,
          body: { hire_date: date, department_id: Number(dept), job_position_id: Number(pos), basis: cleanBasis(basis) },
        })
        toast.ok(t('personnel.place.rehired'))
      }
      onDone?.()
      onClose()
    } catch (e) {
      setErrors({ form: errorMessage(e, t('common.actionFailed')) })
    }
  }

  const busy = rehire.isPending || migrate.isPending
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isMigrate ? t('personnel.actions.migrate') : t('personnel.actions.rehire')}
      description={employee.legal_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={busy}>
            {t('common.confirm')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label={isMigrate ? t('personnel.place.newOrg') : t('personnel.place.org')} required error={errors.branch}>
          <Combobox
            value={branch}
            onChange={(v) => {
              setBranch(v)
              setDept('')
              setPos('')
            }}
            options={branchOptions}
            placeholder={t('personnel.place.pickOrg')}
            invalid={!!errors.branch}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('personnel.f.department')} required error={errors.dept}>
            <Combobox
              value={dept}
              onChange={setDept}
              options={branchId ? deptOptions : []}
              disabled={!branchId}
              placeholder={branchId ? t('personnel.place.pickDept') : t('personnel.place.orgFirst')}
              invalid={!!errors.dept}
            />
          </Field>
          <Field label={t('personnel.f.position')} required error={errors.pos}>
            <Combobox
              value={pos}
              onChange={setPos}
              options={branchId ? posOptions : []}
              disabled={!branchId}
              placeholder={branchId ? t('personnel.place.pickPos') : t('personnel.place.orgFirst')}
              invalid={!!errors.pos}
            />
          </Field>
        </div>
        <Field label={isMigrate ? t('personnel.place.migrateDate') : t('personnel.f.hireDate')} required error={errors.date}>
          <DateInput value={date} onChange={setDate} invalid={!!errors.date} aria-label={t('personnel.f.hireDate')} />
        </Field>
        <EmployeeBasisFields value={basis} onChange={setBasis} error={errors.basis} />
        <FormError>{errors.form}</FormError>
      </div>
    </Modal>
  )
}
