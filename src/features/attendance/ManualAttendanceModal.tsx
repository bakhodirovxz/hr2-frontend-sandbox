import { useEffect, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Select } from '@/components/ui/Select'
import { TimeInput } from '@/components/ui/TimeInput'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { errorMessage } from '@/api/errorMessage'
import { formatAppDate } from '@/lib/format'
import { useManualMeta, useManualMutations, useManualRows, type ManualRow } from './useManualAttendance'

interface Props {
  employee: { id: number; legal_name?: string | null } | null
  onClose: () => void
}

/**
 * Correcting a day by hand: pick the date, the day type, the in/out times and a
 * note. The system recomputes the hours and the timesheet follows.
 *
 * The corrections already made are listed underneath, because the common case
 * is not "add one" but "check what was already fixed for this person".
 */
export function ManualAttendanceModal({ employee, onClose }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const open = !!employee
  const { dayTypes } = useManualMeta(open)
  const { rows } = useManualRows(employee?.id ?? null)
  const mut = useManualMutations()

  const [workDate, setWorkDate] = useState('')
  const [dayType, setDayType] = useState('present')
  const [checkIn, setCheckIn] = useState('09:00')
  const [checkOut, setCheckOut] = useState('18:00')
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<ManualRow | null>(null)

  useEffect(() => {
    if (!open) return
    setWorkDate(dayjs().format('YYYY-MM-DD'))
    setDayType('present')
    setCheckIn('09:00')
    setCheckOut('18:00')
    setComment('')
    setError('')
  }, [open, employee?.id])

  const isWork = dayType === 'present'

  const save = async () => {
    if (!workDate) return setError(t('manual.dateRequired'))
    try {
      await mut.save.mutateAsync({
        employee_id: employee!.id,
        work_date: workDate,
        day_type: dayType,
        // A non-working day type carries no clock times — sending them would
        // have the server compute hours for a day nobody worked.
        check_in: isWork ? checkIn : null,
        check_out: isWork ? checkOut : null,
        comment: comment.trim() || null,
      })
      toast.ok(t('manual.saved'))
      setComment('')
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const dayTypeLabel = (v?: string | null) => dayTypes.find((d) => d.value === v)?.label ?? v ?? '—'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('manual.title')}
      description={employee?.legal_name ?? undefined}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={mut.save.isPending}>
            {t('common.close')}
          </Button>
          <Button onClick={save} loading={mut.save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-inner border border-warning/30 bg-warning-soft px-3 py-2.5">
        <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
        <span className="text-[12px] text-fg-muted">{t('manual.warning')}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('manual.fieldDate')} required>
          <DateInput value={workDate} onChange={setWorkDate} aria-label={t('manual.fieldDate')} />
        </Field>
        <Field label={t('manual.fieldDayType')}>
          <Select
            value={dayType}
            onChange={(e) => setDayType(e.target.value)}
            options={dayTypes.map((d) => ({ value: d.value, label: d.label }))}
          />
        </Field>
        {isWork && (
          <>
            <Field label={t('manual.fieldCheckIn')} required>
              <TimeInput value={checkIn} onChange={setCheckIn} aria-label={t('manual.fieldCheckIn')} />
            </Field>
            <Field label={t('manual.fieldCheckOut')} required>
              <TimeInput value={checkOut} onChange={setCheckOut} aria-label={t('manual.fieldCheckOut')} />
            </Field>
          </>
        )}
        <Field label={t('manual.fieldComment')} wide>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('manual.commentPlaceholder')} />
        </Field>
      </div>

      <FormError className="mt-3 text-xs">{error}</FormError>

      <div className="mt-5">
        <p className="mb-2 text-[12px] font-semibold text-fg-subtle">{t('manual.existing')}</p>
        {rows.length === 0 ? (
          <p className="text-[12.5px] text-fg-subtle">{t('manual.noneYet')}</p>
        ) : (
          <ul className="divide-y divide-line/60 rounded-inner border border-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-24 shrink-0 text-[12.5px] tabular-nums text-fg">{formatAppDate(r.work_date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-fg">{dayTypeLabel(r.day_type)}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {[r.check_in, r.check_out].filter(Boolean).join(' — ') || '—'}
                    {r.comment ? ` · ${r.comment}` : ''}
                  </span>
                </span>
                <IconButton size="sm" label={t('common.delete')} onClick={() => setRemoving(r)}>
                  <Trash2 size={14} />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={!!removing}
        danger
        confirmLabel={t('common.delete')}
        title={t('manual.removeTitle')}
        description={t('manual.removeConfirm', { date: removing ? formatAppDate(removing.work_date) : '' })}
        loading={mut.remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await mut.remove.mutateAsync(removing.id)
            toast.ok(t('manual.removed'))
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          } finally {
            setRemoving(null)
          }
        }}
      />
    </Modal>
  )
}
