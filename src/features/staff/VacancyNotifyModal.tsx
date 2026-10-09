import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Select } from '@/components/ui/Select'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import type { Employee } from '@/types'
import { useVacancyNotifySettings, useSaveVacancyNotifySettings } from './useStaffPositions'

/**
 * «Получение отчетов о вакантных местах» (TZ 4.2.10) — who is told about open
 * positions, how often, and at what hour.
 *
 * WHY the day field switches instead of showing both: the schedule is one of
 * three shapes and only one of them carries meaning at a time — a weekly digest
 * has a weekday, a monthly one has a day-of-month, a daily one neither.
 * Rendering all three invites a saved combination the server ignores, which
 * reads to the user as "my setting did not stick".
 *
 * WHY recipients are added one at a time: v2 has no multi-employee control, and
 * the pattern already used on the responsibles screen (pick one, it joins a
 * chip list) keeps the search behaviour identical everywhere.
 *
 * The recipient list comes back EMPTY for a caller whose org-structure scope is
 * DENY — the server hides it rather than refusing the request — so for such a
 * caller the dialog is read-only instead of looking like the recipients were
 * lost.
 */
export function VacancyNotifyModal({
  open, onClose, branchId, canManage,
}: {
  open: boolean
  onClose: () => void
  branchId: number | null
  canManage: boolean
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { data, isLoading } = useVacancyNotifySettings(branchId, open)
  const save = useSaveVacancyNotifySettings()

  const [frequency, setFrequency] = useState('')
  const [hour, setHour] = useState('9')
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [dayOfMonth, setDayOfMonth] = useState('1')
  const [recipients, setRecipients] = useState<Employee[]>([])
  const [picked, setPicked] = useState<Employee | null>(null)

  // Seed once per opened dialog: a later refetch must not overwrite an edit in
  // progress.
  const [seeded, setSeeded] = useState(false)
  useEffect(() => {
    if (!open) { setSeeded(false); return }
    if (seeded || !data) return
    setFrequency(data.frequency ?? '')
    setHour(String(data.hour ?? 9))
    setDayOfWeek(String(data.day_of_week ?? 1))
    setDayOfMonth(String(data.day_of_month ?? 1))
    setSeeded(true)
  }, [open, data, seeded])

  const freqOptions = useMemo(
    () => (data?.frequencies ?? []).map((f) => ({ value: f.value, label: f.label })),
    [data],
  )

  const submit = async () => {
    try {
      await save.mutateAsync({
        organization_branch_id: branchId || undefined,
        frequency: frequency || undefined,
        hour: Number(hour),
        // Only the field this frequency actually uses is sent; see the note above.
        day_of_week: frequency === 'weekly' ? Number(dayOfWeek) : undefined,
        day_of_month: frequency === 'monthly' ? Number(dayOfMonth) : undefined,
        recipient_ids: recipients.map((r) => r.id),
      })
      toast.ok(t('staff.notifySaved'))
      onClose()
    } catch (e) {
      toast.error(errorMessage(e, t('staff.notifySaveError')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('staff.notifyTitle')}
      size="md"
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          {canManage && (
            <Button onClick={submit} disabled={save.isPending || isLoading}>
              {t('common.save')}
            </Button>
          )}
        </div>
      }
    >
      <p className="mb-3 text-xs text-muted">
        {canManage ? t('staff.notifyHint') : t('staff.notifyReadOnly')}
      </p>

      <Field label={t('staff.notifyFrequency')}>
        <Select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value)}
          disabled={!canManage}
          options={freqOptions}
          placeholder={t('staff.notifyFrequencyPlaceholder')}
        />
      </Field>

      {frequency === 'weekly' && (
        <Field label={t('staff.notifyDayOfWeek')}>
          <Select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            disabled={!canManage}
            options={[1, 2, 3, 4, 5, 6, 7].map((d) => ({
              value: String(d),
              label: t(`staff.weekday${d}` as 'staff.weekday1'),
            }))}
          />
        </Field>
      )}

      {frequency === 'monthly' && (
        <Field label={t('staff.notifyDayOfMonth')}>
          <Input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            disabled={!canManage}
            onChange={(e) => setDayOfMonth(e.target.value)}
          />
        </Field>
      )}

      <Field label={t('staff.notifyHour')}>
        <Input
          type="number"
          min={0}
          max={23}
          value={hour}
          disabled={!canManage}
          onChange={(e) => setHour(e.target.value)}
        />
      </Field>

      <Field label={t('staff.notifyRecipients')}>
        <div>
          {recipients.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {recipients.map((r) => (
                <span
                  key={r.id}
                  className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-1 text-xs text-secondary"
                >
                  {r.legal_name}
                  {canManage && (
                    <button
                      type="button"
                      aria-label={t('common.delete')}
                      onClick={() => setRecipients((p) => p.filter((x) => x.id !== r.id))}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          <EmployeePicker
            value={picked}
            allBranches
            disabled={!canManage}
            placeholder={t('staff.notifyRecipientsPlaceholder')}
            onChange={(emp) => {
              setPicked(null)
              if (emp && !recipients.some((r) => r.id === emp.id)) {
                setRecipients((p) => [...p, emp])
              }
            }}
          />
        </div>
      </Field>

      {!!data?.last_sent_at && (
        <p className="mt-2 text-xs text-muted">
          {t('staff.notifyLastSent')}: {data.last_sent_at}
        </p>
      )}
    </Modal>
  )
}
