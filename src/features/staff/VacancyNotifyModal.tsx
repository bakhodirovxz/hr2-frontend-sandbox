import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { Button, Checkbox, Field, Input, Modal, Select, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { errorMessage, errorParams } from '@/api/errorMessage'
import { EmployeePicker } from '@/features/employees/EmployeePicker'
import { useServerText } from '@/features/statistics/serverText'
import { inWallClock } from '@/lib/format'
import { useSaveVacancyNotifySettings, useVacancyNotifySettings } from './useStaffPositions'

const ORG_WIDE = 'org'

type Errors = Partial<Record<'day_of_week' | 'day_of_month' | 'hour' | 'recipient_ids', string>>

/**
 * TZ 4.2.10 «настройка регулярности уведомлений и получения отчетов о
 * вакантных местах» (QA D-D3). Per organisation: a branch HR edits his own
 * one, central HR any branch or the organisation-wide default. Frequency
 * (off / daily / weekly + weekday / monthly + day) and hour, the recipients
 * (empty = the branch's HR staff) and the «tell at once about a new vacancy»
 * switch.
 */
export function VacancyNotifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const st = useServerText()
  const toast = useToast()
  // '' = let the server pick the caller's own branch on the first read.
  const [branch, setBranch] = useState('')
  const q = useVacancyNotifySettings(branch, open)
  const save = useSaveVacancyNotifySettings()
  const data = q.data

  const [frequency, setFrequency] = useState('off')
  const [dayOfWeek, setDayOfWeek] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState('')
  const [hour, setHour] = useState('9')
  const [notifyNew, setNotifyNew] = useState(true)
  const [recipients, setRecipients] = useState<{ id: number; name: string }[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) setBranch('')
  }, [open])

  // Re-seed whenever another organisation's setting arrives.
  useEffect(() => {
    if (!open || !data) return
    setFrequency(data.frequency || 'off')
    setDayOfWeek(data.day_of_week != null ? String(data.day_of_week) : '')
    setDayOfMonth(data.day_of_month != null ? String(data.day_of_month) : '')
    setHour(String(data.hour ?? 9))
    setNotifyNew(data.notify_new !== false)
    const names = new Map((data.recipients ?? []).map((r) => [r.id, r.legal_name ?? `#${r.id}`]))
    setRecipients((data.recipient_ids ?? []).map((id) => ({ id, name: names.get(id) ?? `#${id}` })))
    setErrors({})
    setFormError(null)
    if (!branch) {
      const rb = data.requested_branch_id
      setBranch(rb != null ? String(rb) : data.can_org_wide ? ORG_WIDE : '')
    }
    // `branch` deliberately left out: switching it refetches, and the new data re-seeds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data])

  const branchOptions = useMemo(
    () => [
      ...(data?.can_org_wide ? [{ value: ORG_WIDE, label: t('orgRef.orgWide') }] : []),
      ...(data?.branches ?? []).map((b) => ({ value: String(b.id), label: b.name })),
    ],
    [data, t],
  )

  const submit = async () => {
    const fe: Errors = {}
    if (frequency === 'weekly' && dayOfWeek === '') fe.day_of_week = t('orgRef.pickWeekday')
    if (frequency === 'monthly' && !dayOfMonth) fe.day_of_month = t('orgRef.pickMonthDay')
    const h = Number(hour)
    if (hour === '' || !Number.isInteger(h) || h < 0 || h > 23) fe.hour = t('orgRef.hourRange')
    if (Object.keys(fe).length) {
      setErrors(fe)
      return
    }
    setFormError(null)
    try {
      await save.mutateAsync({
        organization_branch_id: branch && branch !== ORG_WIDE ? Number(branch) : null,
        frequency,
        day_of_week: frequency === 'weekly' ? Number(dayOfWeek) : null,
        day_of_month: frequency === 'monthly' ? Number(dayOfMonth) : null,
        hour: h,
        recipient_ids: recipients.map((r) => r.id),
        notify_new: notifyNew,
      })
      toast.ok(t('staff.notifySaved'))
      onClose()
    } catch (e) {
      const fields = errorParams(e).fields
      if (fields && typeof fields === 'object') {
        setErrors(Object.fromEntries(Object.entries(fields as Record<string, unknown>).map(([k, v]) => [k, st(String(v))])))
      }
      setFormError(errorMessage(e, t('staff.notifySaveError')))
    }
  }

  const lastSent = data?.last_sent_at
    ? inWallClock(String(data.last_sent_at).length === 13 ? `${data.last_sent_at}:00` : data.last_sent_at).format('DD.MM.YYYY HH:mm')
    : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('staff.notifyTitle')}
      description={t('staff.notifyHint')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={q.isLoading || !data}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      {q.isLoading || !data ? (
        <p className="text-sm text-fg-muted">{t('common.loading')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Field
            label={t('orgRef.organization')}
            hint={!data.is_own && branch !== ORG_WIDE ? t('orgRef.inheritedHint') : undefined}
          >
            <Select
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              options={branchOptions}
              disabled={branchOptions.length <= 1}
            />
          </Field>

          <Checkbox checked={notifyNew} onChange={(e) => setNotifyNew(e.target.checked)} label={t('orgRef.notifyNew')} />

          <Field label={t('orgRef.periodicReport')}>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('orgRef.periodicReport')}>
              {(data.frequencies ?? []).map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  role="radio"
                  aria-checked={frequency === f.value}
                  variant={frequency === f.value ? 'primary' : 'outline'}
                  onClick={() => setFrequency(f.value)}
                >
                  {st(f.label)}
                </Button>
              ))}
            </div>
          </Field>

          {frequency !== 'off' && (
            <div className="grid gap-4 sm:grid-cols-2">
              {frequency === 'weekly' && (
                <Field label={t('staff.notifyDayOfWeek')} error={errors.day_of_week}>
                  <Select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(e.target.value)}
                    placeholder={t('common.choose')}
                    invalid={!!errors.day_of_week}
                    options={(data.weekdays ?? []).map((d) => ({ value: String(d.value), label: st(d.label) }))}
                  />
                </Field>
              )}
              {frequency === 'monthly' && (
                <Field label={t('staff.notifyDayOfMonth')} error={errors.day_of_month}>
                  <Select
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                    placeholder={t('common.choose')}
                    invalid={!!errors.day_of_month}
                    options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
                  />
                </Field>
              )}
              <Field label={t('staff.notifyHour')} error={errors.hour}>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={hour}
                  invalid={!!errors.hour}
                  onChange={(e) => setHour(e.target.value)}
                />
              </Field>
            </div>
          )}

          <Field label={t('orgRef.recipients')} hint={t('orgRef.recipientsHint')} error={errors.recipient_ids}>
            <div className="flex flex-col gap-2">
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {recipients.map((r) => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1 rounded-pill bg-brand-soft px-2.5 py-1 text-xs text-brand-strong"
                    >
                      {r.name}
                      <button
                        type="button"
                        aria-label={t('orgRef.removeRow')}
                        onClick={() => setRecipients((p) => p.filter((x) => x.id !== r.id))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <EmployeePicker
                value={null}
                allBranches
                placeholder={t('staff.notifyRecipientsPlaceholder')}
                onChange={(emp) => {
                  if (emp && !recipients.some((r) => r.id === emp.id))
                    setRecipients((p) => [...p, { id: emp.id, name: emp.legal_name ?? `#${emp.id}` }])
                }}
              />
            </div>
          </Field>

          {lastSent && (
            <p className="text-xs text-fg-muted">
              {t('staff.notifyLastSent')}: {lastSent}
            </p>
          )}
          <FormError>{formError}</FormError>
        </div>
      )}
    </Modal>
  )
}
