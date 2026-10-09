import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, errorParams } from '@/api/errorMessage'
import { useCodeOptions } from './t2/useT2'
import { useEmployeeMutations, useRelatedData } from './useEmployees'

type Blocker = { id: number; number?: string | null; kind_label?: string | null }

/**
 * «Arxivga o'tkazish» (TZ C4): related data is listed, the reason is picked
 * from «Ishdan bo'shatish sabablari» (`dismissal_reasons`) + optional note →
 * `POST /employees/{pk}/archive {reason_code, note}`. An unfinished order or a
 * current business trip blocks archiving (409 `employee_has_open_orders`).
 * The record is not deleted — it moves to the archive.
 */
export function ArchiveEmployeeModal({
  employee,
  onClose,
  onDone,
}: {
  employee: { id: number; legal_name?: string | null } | null
  onClose: () => void
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const open = !!employee
  const related = useRelatedData(employee?.id ?? null, open)
  const reasons = useCodeOptions('dismissal_reasons', open)
  const { archive } = useEmployeeMutations()
  const [reasonCode, setReasonCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<Blocker[]>([])

  useEffect(() => {
    if (open) {
      setReasonCode('')
      setNote('')
      setError(null)
      setBlockers([])
    }
  }, [open, employee?.id])
  useEffect(() => {
    if (related.data?.blocking_orders) setBlockers(related.data.blocking_orders)
  }, [related.data])

  const items = (related.data?.items ?? []).filter((i) => Number(i.count) > 0)

  const submit = async () => {
    if (!employee) return
    if (!reasonCode) {
      setError(t('personnel.archive.reasonRequired'))
      return
    }
    try {
      await archive.mutateAsync({ id: employee.id, reason_code: reasonCode, note: note.trim() || null })
      toast.ok(t('personnel.archive.done'))
      onDone?.()
      onClose()
    } catch (e) {
      const orders = errorParams(e).orders
      if (Array.isArray(orders)) setBlockers(orders as Blocker[])
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('personnel.archive.title')}
      description={employee?.legal_name ?? undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={archive.isPending}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void submit()} loading={archive.isPending} disabled={blockers.length > 0}>
            {t('personnel.archive.title')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        {items.length > 0 && (
          <div className="rounded-inner border border-warning/30 bg-warning-soft p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-warning">
              <AlertTriangle size={14} aria-hidden /> {t('personnel.archive.related')}
            </p>
            <ul className="list-disc pl-5 text-[12.5px] text-fg-muted">
              {items.map((i) => (
                <li key={i.key}>
                  {i.label}: <b className="text-fg">{i.count}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
        {blockers.length > 0 && (
          <div role="alert" className="rounded-inner border border-danger/40 bg-danger-soft p-3">
            <p className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-danger">
              <AlertTriangle size={14} aria-hidden /> {t('personnel.archive.blocked')}
            </p>
            <ul className="list-disc pl-5 text-[12.5px] text-fg-muted">
              {blockers.map((b) => (
                <li key={b.id}>
                  {b.kind_label}: <b className="text-fg">№{b.number || b.id}</b>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[12.5px] leading-relaxed text-fg-muted">{t('personnel.archive.explain')}</p>
        <Field label={t('personnel.archive.reason')} required>
          <Combobox
            value={reasonCode}
            onChange={(v) => {
              setReasonCode(v)
              setError(null)
            }}
            options={reasons}
            placeholder={t('personnel.archive.reasonPh')}
            invalid={!!error && !reasonCode}
          />
        </Field>
        <Field label={t('personnel.archive.note')}>
          <Textarea
            value={note}
            rows={3}
            maxLength={1000}
            placeholder={t('personnel.archive.notePh')}
            onChange={(e) => {
              setNote(e.target.value)
              setError(null)
            }}
          />
        </Field>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}
