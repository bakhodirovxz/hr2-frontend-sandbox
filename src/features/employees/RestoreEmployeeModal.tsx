import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArchiveRestore, CalendarClock, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FormError } from '@/components/ui/FormError'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { inUtc } from '@/lib/format'
import { EmployeeBasisFields } from './EmployeeBasisFields'
import { useEmployeeMutations } from './useEmployees'
import { EMPTY_BASIS, cleanBasis, isBasisComplete, type EditBasis } from './types'

export interface RestoreTarget {
  id: number
  legal_name?: string | null
  restore_until?: string | null
}

/** Is restoring still possible (`restore_until` in the future)? */
export function canRestoreUntil(until: string | null | undefined): boolean {
  if (!until) return false
  const iso = /(?:[+-]\d{2}:?\d{2}|Z)$/.test(until) ? until : `${until}Z`
  const ts = Date.parse(iso)
  return Number.isFinite(ts) && ts > Date.now()
}

/**
 * TZ C4 1087 «Восстановление из архива — Система позволяет восстановить
 * запись из архива в течение установленного срока»:
 * `POST /employees/{pk}/restore {basis?}` returns the card to its
 * pre-archive department and position. The server refuses with 409
 * `restore_period_expired` (the term is over) or `position_occupied` (the
 * position is taken / the department was closed / gone) — both carry
 * `rehire=true`, and the dialog then offers «Qayta ishga qabul qilish».
 */
export function RestoreEmployeeModal({
  target,
  onClose,
  onRehire,
  onRestored,
}: {
  target: RestoreTarget | null
  onClose: () => void
  /** Opens the rehire flow (new department / position). */
  onRehire?: () => void
  onRestored?: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { restore } = useEmployeeMutations()
  const [basis, setBasis] = useState<EditBasis>(EMPTY_BASIS)
  const [error, setError] = useState('')
  const [rehire, setRehire] = useState<string | null>(null)
  const open = !!target

  useEffect(() => {
    if (!open) return
    setBasis(EMPTY_BASIS)
    setError('')
    setRehire(null)
  }, [open])

  const partial = !!(basis.number.trim() || basis.date) && !isBasisComplete(basis)

  const submit = async () => {
    if (!target) return
    setError('')
    setRehire(null)
    if (partial) {
      setError(t('personnel.basis.required'))
      return
    }
    try {
      await restore.mutateAsync({ id: target.id, basis: isBasisComplete(basis) ? cleanBasis(basis) : null })
      toast.ok(t('hrExt.restore.done'))
      onRestored?.()
      onClose()
    } catch (e) {
      const code = errorCode(e)
      const p = errorParams(e)
      if (code === 'restore_period_expired') {
        setRehire(t('hrExt.restore.expired', { days: Number(p.restore_days ?? 0) }))
      } else if (code === 'position_occupied') {
        const reason = String(p.reason ?? '')
        setRehire(
          reason === 'department_closed'
            ? t('hrExt.restore.deptClosed')
            : reason === 'position_missing'
              ? t('hrExt.restore.positionMissing')
              : t('hrExt.restore.occupied', { planned: Number(p.planned ?? 0), occupied: Number(p.occupied ?? 0) }),
        )
      } else if (code === 'employee_not_archived') {
        toast.info(t('hrExt.restore.notArchived'))
        onRestored?.()
        onClose()
      } else {
        setError(errorMessage(e, t('common.actionFailed')))
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('hrExt.restore.title')}
      description={target?.legal_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={restore.isPending}>
            {t('common.cancel')}
          </Button>
          {rehire && onRehire ? (
            <Button
              leftIcon={<UserCheck size={15} />}
              onClick={() => {
                onClose()
                onRehire()
              }}
            >
              {t('personnel.actions.rehire')}
            </Button>
          ) : (
            <Button leftIcon={<ArchiveRestore size={15} />} onClick={() => void submit()} loading={restore.isPending} disabled={!!rehire}>
              {t('hrExt.restore.submit')}
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <p className="text-[13px] leading-relaxed text-fg-muted">{t('hrExt.restore.hint')}</p>
        {target?.restore_until && (
          <p className="flex items-center gap-2 text-[13px] text-fg">
            <CalendarClock size={15} className="text-brand" aria-hidden />
            {t('hrExt.restore.until', { date: inUtc(target.restore_until) })}
          </p>
        )}
        <EmployeeBasisFields value={basis} onChange={setBasis} required={false} title={t('hrExt.restore.basisOptional')} error={partial && error ? error : undefined} />
        {rehire && (
          <div role="alert" className="flex gap-2.5 rounded-lg border border-warning/35 bg-warning-soft p-3 text-[13px] text-warning">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{rehire}</p>
              <p className="mt-1 text-fg-muted">{t('hrExt.restore.rehireHint')}</p>
            </div>
          </div>
        )}
        {!partial && <FormError>{error}</FormError>}
      </div>
    </Modal>
  )
}
