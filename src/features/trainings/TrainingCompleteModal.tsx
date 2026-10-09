import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/api/errorMessage'
import { TRAINING_RESULTS, useTrainingMutations, type Training } from './useTrainings'

/**
 * TZ K4 «прикрепляет подтверждающие документы»: the certificate / diploma
 * scan. A hidden native input behind our own button — the browser's «Choose
 * File / No file chosen» is not translated.
 */
export function CertificateFileField({
  file,
  onChange,
  current,
  disabled,
}: {
  file: File | null
  onChange: (f: File | null) => void
  current?: Pick<Training, 'file_url' | 'file_original_name'> | null
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        ref={ref}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
        className="sr-only"
        tabIndex={-1}
        aria-label={t('trainings.fileField')}
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <div className="flex min-w-0 items-center gap-2.5">
        <Button size="sm" variant="secondary" leftIcon={<Paperclip size={13} />} disabled={disabled} onClick={() => ref.current?.click()}>
          {file ? t('trainings.fileOther') : t('trainings.filePick')}
        </Button>
        <span className="truncate text-[12.5px] text-fg-muted">{file ? file.name : t('trainings.fileNone')}</span>
        {file && (
          <button type="button" onClick={() => onChange(null)} aria-label={t('trainings.fileRemove')} title={t('trainings.fileRemove')} className="shrink-0 text-fg-subtle hover:text-danger">
            <X size={14} />
          </button>
        )}
      </div>
      {!file && current?.file_url && (
        <a href={current.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] text-brand hover:underline">
          <Paperclip size={12} /> {current.file_original_name || t('trainings.fileCurrent')}
        </a>
      )}
    </div>
  )
}

/**
 * «Yakunlash» — the result (passed / failed), the end date, the certificate
 * and its scan. A scan is added to the employee's T-2 documents by the server.
 */
export function TrainingCompleteModal({ row, onClose }: { row: Training | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const mut = useTrainingMutations()
  const [result, setResult] = useState('passed')
  const [endDate, setEndDate] = useState('')
  const [certNo, setCertNo] = useState('')
  const [expires, setExpires] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!row) return
    setResult(row.result || 'passed')
    setEndDate(row.end_date || dayjs().format('YYYY-MM-DD'))
    setCertNo(row.certificate_number ?? '')
    setExpires(row.certificate_expires_at ?? '')
    setFile(null)
    setError('')
  }, [row])

  const submit = async () => {
    if (!row) return
    if (!endDate || !result) return setError(t('trainings.completedNeeds'))
    setError('')
    try {
      await mut.update.mutateAsync({
        id: row.id,
        body: {
          status: 'completed',
          result,
          end_date: endDate,
          certificate_number: certNo.trim() || null,
          certificate_expires_at: expires || null,
        },
      })
    } catch (e) {
      return setError(errorMessage(e, t('common.actionFailed')))
    }
    if (file) {
      try {
        await mut.upload.mutateAsync({ id: row.id, file })
        toast.ok(t('trainings.completedWithFile'))
      } catch (e) {
        toast.error(`${t('trainings.completedFileFailed')}: ${errorMessage(e, t('common.actionFailed'))}`)
      }
    } else {
      toast.ok(t('trainings.completed'))
    }
    onClose()
  }

  return (
    <Modal
      open={!!row}
      onClose={onClose}
      title={t('trainings.completeTitle')}
      description={row ? `${row.employee_name ?? ''} · ${row.program_name}` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={submit} loading={mut.update.isPending || mut.upload.isPending}>{t('trainings.complete')}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('trainings.result')} required>
          <Combobox
            value={result}
            onChange={(v) => v && setResult(v)}
            options={TRAINING_RESULTS.map((x) => ({ value: x, label: t(`trainings.result_${x}`) }))}
            clearable={false}
          />
        </Field>
        <Field label={t('trainings.endDate')} required>
          <DateInput value={endDate} onChange={setEndDate} />
        </Field>
        <Field label={t('trainings.certificateNumber')}>
          <Input value={certNo} onChange={(e) => setCertNo(e.target.value)} />
        </Field>
        <Field label={t('trainings.expiresAt')}>
          <DateInput value={expires} onChange={setExpires} />
        </Field>
        <Field label={t('trainings.fileField')} wide>
          <CertificateFileField file={file} onChange={setFile} current={row} />
        </Field>
      </div>
      <FormError className="mt-3 text-xs">{error}</FormError>
    </Modal>
  )
}
