import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { errorMessage, errorParams } from '@/api/errorMessage'
import { useConfirm } from '@/components/data/useConfirm'
import { EmployeeBasisFields } from './EmployeeBasisFields'
import { EMPTY_BASIS, isBasisComplete, type EditBasis } from './types'
import { useCodeOptions } from './t2/useT2'
import { useEmployeeMutations, useRelatedData } from './useEmployees'

type Blocker = { id: number; number?: string | null; kind_label?: string | null }

/** Reason that needs no basis document (an erroneously entered card). */
const NO_BASIS_REASONS = ['xato_kiritilgan']

/**
 * «Удалить» / «Arxivga o'tkazish» (TZ C4 1071–1080): related data is listed,
 * the reason is picked from «Ishdan bo'shatish sabablari» (`dismissal_reasons`),
 * the basis document (order № and date) is entered — not needed for «Xato
 * kiritilgan yozuv» — then `POST /employees/{pk}/archive`. An unfinished order
 * or a current business trip blocks archiving (409 `employee_has_open_orders`).
 * A card nothing else references (`can_hard_delete`, TZ 2148) also offers the
 * secondary «Butunlay o'chirish».
 */
export function ArchiveEmployeeModal({
  employee,
  onClose,
  onDone,
}: {
  employee: { id: number; legal_name?: string | null } | null
  onClose: () => void
  onDone?: (kind: 'archived' | 'deleted') => void
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const open = !!employee
  const related = useRelatedData(employee?.id ?? null, open)
  const reasons = useCodeOptions('dismissal_reasons', open)
  const { archive, remove } = useEmployeeMutations()
  const confirm = useConfirm()
  const [basis, setBasis] = useState<EditBasis>(EMPTY_BASIS)
  const [reasonCode, setReasonCode] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<Blocker[]>([])

  useEffect(() => {
    if (open) {
      setReasonCode('')
      setBasis(EMPTY_BASIS)
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
    const needsBasis = !NO_BASIS_REASONS.includes(reasonCode)
    if (needsBasis && !isBasisComplete(basis)) {
      setError(t('personnel.basis.required'))
      return
    }
    try {
      await archive.mutateAsync({ id: employee.id, reason_code: reasonCode, note: note.trim() || null, basis: needsBasis ? basis : null })
      toast.ok(t('personnel.archive.done'))
      onDone?.('archived')
      onClose()
    } catch (e) {
      const orders = errorParams(e).orders
      if (Array.isArray(orders)) setBlockers(orders as Blocker[])
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }

  const hardDelete = async () => {
    if (!employee) return
    const ok = await confirm({ kind: 'delete', title: t('personnel.card.deleteTitle'), description: t('personnel.card.deleteConfirm', { name: employee.legal_name ?? '' }) })
    if (!ok) return
    try {
      await remove.mutateAsync(employee.id)
      toast.ok(t('personnel.card.deleted'))
      onDone?.('deleted')
      onClose()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    }
  }
  const needsBasis = !!reasonCode && !NO_BASIS_REASONS.includes(reasonCode)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('personnel.archive.title')}
      description={employee?.legal_name ?? undefined}
      footer={
        <>
          {related.data?.can_hard_delete && (
            <Button variant="danger-ghost" leftIcon={<Trash2 size={14} />} className="mr-auto" onClick={() => void hardDelete()} loading={remove.isPending}>
              {t('personnel.archive.hardDelete')}
            </Button>
          )}
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
        {needsBasis && <EmployeeBasisFields value={basis} onChange={(b) => { setBasis(b); setError(null) }} error={error} />}
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
