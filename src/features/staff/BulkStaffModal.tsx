import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { useStaffBulkUpsert, fmtUnits, type StaffPosition } from './useStaffPositions'

/**
 * Edit one department's planned units as a block and save them in ONE request.
 *
 * WHY a bulk route rather than N PATCHes: a department is planned as a whole —
 * moving two units from one position to another is a single decision, and the
 * server records ONE history entry carrying the shared reason for it. Saving
 * row by row would scatter that decision across N entries and could leave the
 * table half-applied if a later row failed.
 *
 * Only genuinely changed rows are sent (web v1 ShtatPage behaves the same), so
 * pressing save after touching nothing is a no-op instead of writing a bogus
 * history line onto every position in the department.
 */
export function BulkStaffModal({
  open, onClose, departmentName, rows,
}: {
  open: boolean
  onClose: () => void
  departmentName: string
  rows: StaffPosition[]
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const bulk = useStaffBulkUpsert()

  const [values, setValues] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')

  const keyOf = (r: StaffPosition) => `${r.department_id}-${r.job_position_id}`

  useEffect(() => {
    if (!open) return
    setValues(Object.fromEntries(rows.map((r) => [keyOf(r), fmtUnits(r.planned_units)])))
    setReason('')
  }, [open, rows])

  const changed = useMemo(
    () =>
      rows.filter((r) => {
        const raw = values[keyOf(r)]
        if (raw === undefined) return false
        const next = Number(raw)
        return Number.isFinite(next) && next !== Number(r.planned_units)
      }),
    [rows, values],
  )

  const invalid = useMemo(
    () =>
      rows.some((r) => {
        const raw = values[keyOf(r)]
        if (raw === undefined) return false
        const n = Number(raw)
        return !Number.isFinite(n) || n < 0
      }),
    [rows, values],
  )

  const submit = async () => {
    if (invalid) { toast.error(t('staff.bulkInvalidUnits')); return }
    if (!changed.length) { toast.info(t('staff.bulkNothingChanged')); onClose(); return }
    try {
      await bulk.mutateAsync({
        rows: changed.map((r) => ({
          department_id: r.department_id,
          job_position_id: r.job_position_id,
          planned_units: Number(values[keyOf(r)]),
        })),
        reason: reason.trim() || undefined,
      })
      toast.ok(t('staff.bulkSaved'))
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, t('staff.bulkSaveError')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`${t('staff.bulkEditTitle')} — ${departmentName}`}
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="text-xs text-muted">
            {changed.length > 0 ? `${changed.length}` : ''}
          </span>
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button onClick={submit} disabled={bulk.isPending || invalid}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-xs text-muted">{t('staff.bulkEditHint')}</p>

      <div className="mb-3 flex flex-col gap-2">
        {rows.map((r) => (
          <div key={keyOf(r)} className="flex items-center gap-3">
            <span className="flex-1 truncate text-sm text-secondary" title={r.job_position_name ?? ''}>
              {r.job_position_name ?? `#${r.job_position_id}`}
            </span>
            <Input
              type="number"
              min={0}
              step="0.5"
              className="w-24"
              value={values[keyOf(r)] ?? ''}
              onChange={(e) => setValues((p) => ({ ...p, [keyOf(r)]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <Field label={t('staff.bulkReason')}>
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('staff.bulkReasonPlaceholder')}
        />
      </Field>
    </Modal>
  )
}
