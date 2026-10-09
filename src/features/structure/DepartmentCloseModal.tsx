import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { BasisFields, EMPTY_BASIS, isBasisComplete } from './BasisFields'
import { useDepartmentAdminMutations, type Basis, type DepartmentRow } from './useDepartmentAdmin'

/**
 * TZ 4.2.6 «Сокращение подразделений» (S1): bo'limni qisqartirish yoki qayta
 * tiklash — sabab (kamida 3 belgi) va asos buyrug'i (raqami, sanasi)
 * majburiy; ikkalasi ham bo'lim o'zgarishlar tarixiga yoziladi. Faol xodimi
 * yoki faol quyi bo'limi bor bo'lim qisqartirilmaydi — server 409
 * `department_not_empty` sanoqlari ko'rsatiladi.
 */
export function DepartmentCloseModal({
  dept,
  mode,
  onClose,
}: {
  dept: DepartmentRow | null
  mode: 'close' | 'reopen'
  onClose: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { setClosed } = useDepartmentAdminMutations()
  const [reason, setReason] = useState('')
  const [basis, setBasis] = useState<Basis>(EMPTY_BASIS)
  const [errors, setErrors] = useState<{ reason?: string; basis?: string; form?: string }>({})
  const [blocked, setBlocked] = useState<{ employees: number; children: number } | null>(null)
  const open = !!dept
  const reopen = mode === 'reopen'

  useEffect(() => {
    if (!open) return
    setReason('')
    setBasis(EMPTY_BASIS)
    setErrors({})
    setBlocked(null)
  }, [open])

  const submit = async () => {
    if (!dept) return
    const next: typeof errors = {}
    if (reason.trim().length < 3) next.reason = t('orgAdmin.reasonMin')
    if (!isBasisComplete(basis)) next.basis = t('orgAdmin.basisRequired')
    setErrors(next)
    setBlocked(null)
    if (next.reason || next.basis) return
    try {
      await setClosed.mutateAsync({ id: dept.id, mode, reason: reason.trim(), basis })
      toast.ok(reopen ? t('orgAdmin.deptReopened') : t('orgAdmin.deptClosed'))
      onClose()
    } catch (e) {
      if (errorCode(e) === 'department_not_empty') {
        const p = errorParams(e)
        setBlocked({ employees: Number(p.employees ?? 0), children: Number(p.children ?? 0) })
      } else {
        setErrors({ form: errorMessage(e, t('common.actionFailed')) })
      }
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={reopen ? t('orgAdmin.reopenTitle') : t('orgAdmin.closeTitle')}
      description={dept?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={setClosed.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant={reopen ? 'primary' : 'danger'} onClick={submit} loading={setClosed.isPending}>
            {reopen ? t('orgAdmin.reopen') : t('orgAdmin.close')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!reopen && <p className="text-[13px] leading-relaxed text-fg-muted">{t('orgAdmin.closeHint')}</p>}
        <Field label={t('orgAdmin.reason')} required error={errors.reason}>
          <Textarea
            rows={3}
            maxLength={1000}
            value={reason}
            invalid={!!errors.reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (errors.reason) setErrors((x) => ({ ...x, reason: undefined }))
            }}
          />
        </Field>
        <BasisFields
          value={basis}
          onChange={(b) => {
            setBasis(b)
            if (errors.basis) setErrors((x) => ({ ...x, basis: undefined }))
          }}
          title={t('orgAdmin.basisOrder')}
          error={errors.basis}
        />
        {blocked && (
          <div role="alert" className="flex gap-2.5 rounded-lg border border-danger/30 bg-danger-soft p-3 text-[13px] text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">{t('orgAdmin.notEmptyTitle')}</p>
              <p className="mt-1">
                {t('orgAdmin.notEmptyCounts', { employees: blocked.employees, children: blocked.children })}
              </p>
              <p className="mt-1 text-danger/80">{t('orgAdmin.notEmptyHint')}</p>
            </div>
          </div>
        )}
        {errors.form && (
          <p role="alert" className="text-xs text-danger">
            {errors.form}
          </p>
        )}
      </div>
    </Modal>
  )
}
