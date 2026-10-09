import { useEffect, useMemo, useState } from 'react'
import { FormError } from '@/components/ui/FormError'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { Button, Checkbox, Modal, Textarea, useToast } from '@/components/ui'
import { errorMessage } from '@/api/errorMessage'
import type { DictionaryImportResult, DictionaryImportRow, DictionaryType } from './useDictionaries'
import { useDictionaryMutations } from './useDictionaries'

/** Excel copies columns as TAB-separated text; `;` and `|` are accepted too. */
const SEPARATORS = /\t|;|\|/

/**
 * Bulk-fill a dictionary by PASTING, not by uploading a file.
 *
 * Reading .xlsx in the browser means a parser, a sheet picker and a header-row
 * guess, and every one of those is a way for the import to fail on a file the
 * administrator cannot inspect. A paste box fails visibly instead: what you
 * see in the preview line is exactly what will be sent.
 */
function parseRows(text: string, hierarchical: boolean) {
  const rows: DictionaryImportRow[] = []
  const errors: string[] = []
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim()
    if (!line) return
    const cols = line.split(SEPARATORS).map((c) => c.trim())
    const name = cols[0]
    if (!name) {
      errors.push(`${i + 1}`)
      return
    }
    const row: DictionaryImportRow = { name }
    if (cols[1]) row.name_ru = cols[1]
    if (hierarchical) {
      if (cols[2]) row.parent_code = cols[2]
    } else if (cols[2]) {
      row.code = cols[2]
    }
    rows.push(row)
  })
  return { rows, errors }
}

export function DictionaryImportModal({
  open,
  onClose,
  type,
}: {
  open: boolean
  onClose: () => void
  type: DictionaryType
}) {
  const { t } = useTranslation()
  const toast = useToast()
  const { importRows } = useDictionaryMutations()
  const [text, setText] = useState('')
  const [updateExisting, setUpdateExisting] = useState(true)
  const [result, setResult] = useState<DictionaryImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setText('')
    setResult(null)
    setError(null)
    setUpdateExisting(true)
  }, [open])

  const parsed = useMemo(() => parseRows(text, type.is_hierarchical), [text, type.is_hierarchical])

  const submit = async () => {
    if (!parsed.rows.length) return
    setError(null)
    try {
      const res = await importRows.mutateAsync({
        code: type.code,
        rows: parsed.rows,
        updateExisting,
      })
      setResult(res)
      toast.ok(t('dictionaries.importDone', { created: res.created, updated: res.updated }))
    } catch (e) {
      setError(errorMessage(e, t('dictionaries.importFailed')))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dictionaries.import')}
      description={type.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={importRows.isPending}>
            {result ? t('common.close') : t('common.cancel')}
          </Button>
          <Button
            onClick={submit}
            loading={importRows.isPending}
            disabled={!parsed.rows.length}
          >
            {t('dictionaries.upload')}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-fg-muted">
        {type.is_hierarchical
          ? t('dictionaries.importHintHierarchical')
          : t('dictionaries.importHint')}
      </p>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        placeholder={
          type.is_hierarchical
            ? "Toshkent shahri\tг. Ташкент\ttoshkent_viloyati"
            : "Oliy\tВысшее\toliy"
        }
        className="font-mono text-[13px]"
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Checkbox
          checked={updateExisting}
          onChange={(e) => setUpdateExisting(e.target.checked)}
          label={t('dictionaries.updateExisting')}
        />
        <span className="text-xs text-fg-muted">
          {t('dictionaries.rowsReady', { count: parsed.rows.length })}
        </span>
      </div>

      {parsed.errors.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-inner bg-warning-soft px-3 py-2 text-xs text-warning">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>{t('dictionaries.importRowErrors', { lines: parsed.errors.slice(0, 8).join(', ') })}</span>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-inner bg-surface-2 px-3 py-2.5 text-[13px] text-fg-muted">
          <div className="flex flex-wrap gap-4">
            <span>
              {t('dictionaries.created_')}: <b className="text-success">{result.created}</b>
            </span>
            <span>
              {t('dictionaries.updated_')}: <b className="text-fg">{result.updated}</b>
            </span>
            <span>
              {t('dictionaries.skipped_')}: <b className="text-fg-subtle">{result.skipped}</b>
            </span>
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc pl-4 text-xs text-danger">
              {result.errors.slice(0, 6).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <FormError className="mt-3">{error}</FormError>
    </Modal>
  )
}
