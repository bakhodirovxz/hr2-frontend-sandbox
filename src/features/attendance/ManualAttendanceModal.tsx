import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlertTriangle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { TimeInput } from '@/components/ui/TimeInput'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { ManualRecordsList } from './ManualRecordsList'
import { dmy, formatHm } from './period'
import {
  dayTypeNeedsBasis,
  diffMinutes,
  useManualMeta,
  useManualMutations,
  useManualRows,
  type ManualRow,
} from './useManualAttendance'

interface Props {
  employee: { id: number; legal_name?: string | null } | null
  /** Oyna ochilganda tanlanadigan sana (ro'yxatdagi davr boshi). */
  defaultDate?: string
  onClose: () => void
}

/**
 * DAVOMATNI QO'LDA TUZATISH — TZ I2 5–14 qadamlar: sana, kun turi (oltita),
 * ish kunida kelish/ketish vaqti (tizim soatni hisoblaydi), qolgan turlarda
 * yo'qlik asosi, izoh → «Saqlash»; tabel shu zahoti yangilanadi. Pastda shu
 * xodimga kiritilgan tuzatishlar — o'chirish turniket ma'lumotini qaytaradi.
 */
export function ManualAttendanceModal({ employee, defaultDate, onClose }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const open = !!employee
  const { dayTypes } = useManualMeta(open)
  const { rows } = useManualRows(employee?.id ?? null, undefined, open)
  const mut = useManualMutations()

  const [workDate, setWorkDate] = useState('')
  const [dayType, setDayType] = useState('present')
  const [checkIn, setCheckIn] = useState('09:00')
  const [checkOut, setCheckOut] = useState('18:00')
  const [basis, setBasis] = useState('')
  const [comment, setComment] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState('')

  useEffect(() => {
    if (!open) return
    setWorkDate(defaultDate || dayjs().format('YYYY-MM-DD'))
    setDayType('present')
    setCheckIn('09:00')
    setCheckOut('18:00')
    setBasis('')
    setComment('')
    setErrors({})
    setFormError('')
  }, [open, employee?.id, defaultDate])

  const isWork = dayType === 'present'
  const needsBasis = dayTypeNeedsBasis(dayType)
  const minutes = isWork ? diffMinutes(checkIn, checkOut) : null
  const timeInvalid = isWork && minutes != null && minutes < 0

  const validate = () => {
    const next: Record<string, string> = {}
    if (!workDate) next.date = t('davomat.dateRequired')
    if (isWork) {
      if (!checkIn) next.checkIn = t('davomat.checkInRequired')
      if (!checkOut) next.checkOut = t('davomat.checkOutRequired')
      else if (timeInvalid) next.checkOut = t('davomat.timeOrder')
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const save = async () => {
    setFormError('')
    if (!employee || !validate()) return
    try {
      await mut.save.mutateAsync({
        employee_id: employee.id,
        work_date: workDate,
        day_type: dayType,
        // Ish kuni bo'lmagan turda vaqt yuborilmaydi — aks holda server
        // hech kim ishlamagan kunga soat hisoblardi.
        check_in: isWork ? checkIn : null,
        check_out: isWork ? checkOut : null,
        absence_basis: needsBasis ? basis.trim() || null : null,
        comment: comment.trim() || null,
      })
      toast.ok(t('davomat.saved'))
      setBasis('')
      setComment('')
    } catch (e) {
      setFormError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const remove = async (row: ManualRow) => {
    const ok = await confirm({
      kind: 'delete',
      title: t('davomat.removeTitle'),
      description: t('davomat.removeConfirm', { date: dmy(row.work_date) }),
    })
    if (!ok) return
    try {
      await mut.remove.mutateAsync(row.id)
      toast.ok(t('davomat.removed'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('davomat.manualTitle')}
      description={employee?.legal_name ?? undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.save.isPending}>
            {t('common.close')}
          </Button>
          <Button onClick={save} loading={mut.save.isPending} disabled={timeInvalid}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-inner border border-warning/30 bg-warning-soft px-3 py-2.5">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
        <span className="text-[12px] text-fg-muted">{t('davomat.manualWarning')}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('davomat.fieldDate')} required error={errors.date}>
          <DateInput
            value={workDate}
            onChange={setWorkDate}
            max={dayjs().format('YYYY-MM-DD')}
            invalid={!!errors.date}
            aria-label={t('davomat.fieldDate')}
          />
        </Field>
        <Field label={t('davomat.fieldDayType')}>
          <Select
            value={dayType}
            onChange={(e) => {
              setDayType(e.target.value)
              setErrors({})
            }}
            options={dayTypes.map((d) => ({ value: d.value, label: t(`davomat.dt_${d.value}`) }))}
          />
        </Field>
        {isWork && (
          <>
            <Field label={t('davomat.fieldCheckIn')} required error={errors.checkIn}>
              <TimeInput value={checkIn} onChange={setCheckIn} invalid={!!errors.checkIn} aria-label={t('davomat.fieldCheckIn')} />
            </Field>
            <Field
              label={t('davomat.fieldCheckOut')}
              required
              error={errors.checkOut || (timeInvalid ? t('davomat.timeOrder') : undefined)}
            >
              <TimeInput
                value={checkOut}
                onChange={setCheckOut}
                invalid={!!errors.checkOut || timeInvalid}
                aria-label={t('davomat.fieldCheckOut')}
              />
            </Field>
            {minutes != null && !timeInvalid && (
              <div className="flex items-center gap-2 rounded-inner border border-brand/25 bg-brand-soft px-3 py-2 text-[12.5px] sm:col-span-2">
                <Clock size={13} className="text-brand" />
                <span className="text-fg-muted">{t('davomat.worked')}:</span>
                <span className="font-semibold text-fg">{formatHm(minutes, t)}</span>
              </div>
            )}
          </>
        )}
        {needsBasis && (
          <Field label={t('davomat.fieldBasis')} wide>
            <Input
              value={basis}
              maxLength={255}
              onChange={(e) => setBasis(e.target.value)}
              placeholder={t('davomat.basisPlaceholder')}
              aria-label={t('davomat.fieldBasis')}
            />
          </Field>
        )}
        <Field label={t('davomat.fieldComment')} wide>
          <Input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('davomat.commentPlaceholder')}
            aria-label={t('davomat.fieldComment')}
          />
        </Field>
      </div>

      <FormError className="mt-3 text-xs">{formError}</FormError>

      {rows.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('davomat.existing')}</p>
          <div className="scroll-thin max-h-64 overflow-y-auto">
            <ManualRecordsList rows={rows} onRemove={remove} />
          </div>
        </div>
      )}
    </Modal>
  )
}
