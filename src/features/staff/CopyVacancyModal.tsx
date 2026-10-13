import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy } from 'lucide-react'
import { Button, Combobox, Field, Input, Modal, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { useDepartmentRecords, useJobPositionOptions } from '@/hooks/useReferenceData'
import { useStaffMutations, type StaffPosition } from './useStaffPositions'

/**
 * TZ V1 1277 «Копирование существующей вакансии — система заполняет форму
 * данными из выбранной вакансии». The new line (department × position) takes
 * the source's announcement — requirements, terms, contacts, recruiter — and
 * opens as «Ochiq»; the caller then shows it in the edit form.
 */
export function CopyVacancyModal({
  source,
  onClose,
  onCopied,
  allowedDepartmentIds = null,
}: {
  source: StaffPosition | null
  onClose: () => void
  onCopied: (row: StaffPosition) => void
  /** A department head copies into his own units only. */
  allowedDepartmentIds?: number[] | null
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { copyVacancy } = useStaffMutations()
  const allDepartments = useDepartmentRecords<{ id: number; name?: string | null; parent_id?: number | null }>(source?.organization_branch_id ?? null)
  const positions = useJobPositionOptions(source?.organization_branch_id ?? null)
  const departments = useMemo(() => {
    if (!allowedDepartmentIds) return allDepartments
    const allowed = new Set(allowedDepartmentIds)
    let grew = true
    while (grew) {
      grew = false
      for (const d of allDepartments) {
        if (d.parent_id != null && allowed.has(d.parent_id) && !allowed.has(d.id)) {
          allowed.add(d.id)
          grew = true
        }
      }
    }
    return allDepartments.filter((d) => allowed.has(d.id))
  }, [allDepartments, allowedDepartmentIds])
  const departmentOptions = useMemo(() => departments.map((d) => ({ value: String(d.id), label: d.name ?? `#${d.id}` })), [departments])

  const [form, setForm] = useState({ department_id: '', job_position_id: '', planned_units: '', reason: '' })
  const [errors, setErrors] = useState<{ department?: string; position?: string; units?: string }>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!source) return
    setForm({ department_id: String(source.department_id ?? ''), job_position_id: '', planned_units: '1', reason: '' })
    setErrors({})
    setError(null)
  }, [source])

  const set = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }))
    setError(null)
  }

  const submit = async () => {
    if (!source?.id) return
    const e: typeof errors = {}
    if (!form.department_id) e.department = t('staff.departmentRequired')
    if (!form.job_position_id) e.position = t('staff.positionRequired')
    const units = form.planned_units.trim() === '' ? undefined : Number(form.planned_units)
    if (units !== undefined && (!Number.isFinite(units) || units < 0)) e.units = t('staff.unitsInvalid')
    setErrors(e)
    if (Object.keys(e).length) return
    try {
      const row = await copyVacancy.mutateAsync({
        id: source.id,
        body: {
          department_id: Number(form.department_id),
          job_position_id: Number(form.job_position_id),
          planned_units: units,
          reason: form.reason.trim() || undefined,
        },
      })
      toast.ok(t('ordVac.copied'))
      onCopied(row)
    } catch (err) {
      setError(
        errorCode(err) === 'staff_position_duplicate' ? t('ordVac.copyDuplicate') : errorMessage(err, t('staff.saveFailed')),
      )
    }
  }

  return (
    <Modal
      open={!!source}
      onClose={onClose}
      size="md"
      title={t('ordVac.copyTitle')}
      description={source ? `${source.department_name ?? ''} · ${source.job_position_name ?? ''}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={copyVacancy.isPending}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Copy size={15} />} onClick={submit} loading={copyVacancy.isPending}>
            {t('ordVac.copy')}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-fg-muted">{t('ordVac.copyHint')}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('employees.colDepartment')} required error={errors.department}>
          <Combobox
            value={form.department_id}
            onChange={(v) => set('department_id', v)}
            options={departmentOptions}
            placeholder={t('common.choose')}
            invalid={!!errors.department}
          />
        </Field>
        <Field label={t('employees.colPosition')} required error={errors.position}>
          <Combobox
            value={form.job_position_id}
            onChange={(v) => set('job_position_id', v)}
            options={positions}
            placeholder={t('common.choose')}
            invalid={!!errors.position}
          />
        </Field>
        <Field label={t('staff.plannedUnits')} hint={t('staff.unitsHint')} error={errors.units}>
          <Input type="number" step="0.5" min="0" value={form.planned_units} invalid={!!errors.units} onChange={(e) => set('planned_units', e.target.value)} />
        </Field>
        <Field label={t('staff.reason')}>
          <Input value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder={t('ordVac.optional')} maxLength={1000} />
        </Field>
      </div>
      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
