import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EMPTY_BASIS, isBasisComplete, type BasisDocType, type EditBasis } from './types'

const DOC_TYPES: BasisDocType[] = ['order', 'application', 'other']

/**
 * «Asos hujjati» (TZ C3: «Пользователь указывает основание для изменения
 * (приказ, заявление)») — `{doc_type, number, date}`, the `basis` object of
 * every write on an existing employee card.
 */
export function EmployeeBasisFields({
  value,
  onChange,
  error,
  title,
  required = true,
}: {
  value: EditBasis
  onChange: (next: EditBasis) => void
  error?: string | null
  title?: string
  /** `false` — an optional basis (TZ C4 restore): no asterisks. */
  required?: boolean
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="rounded-lg border border-brand/30 bg-brand-soft/40 p-3">
      <legend className="px-1.5 text-[13px] font-semibold text-fg">
        {title ?? t('personnel.basis.title')}
        {required && <span className="text-danger"> *</span>}
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t('personnel.basis.docType')} required={required}>
          <Combobox
            value={value.doc_type}
            onChange={(v) => onChange({ ...value, doc_type: (v || 'order') as BasisDocType })}
            options={DOC_TYPES.map((d) => ({ value: d, label: t(`personnel.basis.type_${d}`) }))}
            hidePlaceholderOption
            clearable={false}
          />
        </Field>
        <Field label={t('personnel.basis.number')} required={required}>
          <Input
            value={value.number}
            maxLength={64}
            invalid={!!error && !value.number.trim()}
            onChange={(e) => onChange({ ...value, number: e.target.value })}
          />
        </Field>
        <Field label={t('personnel.basis.date')} required={required}>
          <DateInput
            value={value.date}
            invalid={!!error && !value.date}
            onChange={(v) => onChange({ ...value, date: v })}
            aria-label={t('personnel.basis.date')}
          />
        </Field>
      </div>
      <FormError className="mt-2 text-xs">{error}</FormError>
    </fieldset>
  )
}

/**
 * Ask for the basis document before adding or removing a record row
 * (education, work experience) on an existing card.
 */
export function BasisModal({
  open,
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  busy?: boolean
  onClose: () => void
  onConfirm: (basis: EditBasis) => void
}) {
  const { t } = useTranslation()
  const [basis, setBasis] = useState<EditBasis>(EMPTY_BASIS)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setBasis(EMPTY_BASIS)
      setError(null)
    }
  }, [open])

  const submit = () => {
    if (!isBasisComplete(basis)) {
      setError(t('personnel.basis.required'))
      return
    }
    onConfirm(basis)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={submit} loading={busy}>
            {confirmLabel ?? t('common.save')}
          </Button>
        </>
      }
    >
      {message && <p className="mb-3 text-[13px] text-fg-muted">{message}</p>}
      <EmployeeBasisFields value={basis} onChange={(b) => { setBasis(b); setError(null) }} error={error} />
    </Modal>
  )
}
