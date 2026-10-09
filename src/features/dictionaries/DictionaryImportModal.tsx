import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, FileSpreadsheet } from 'lucide-react'
import { Button, Checkbox, Modal, Segmented, Textarea, useToast } from '@/components/ui'
import { FormError } from '@/components/ui/FormError'
import { errorMessage } from '@/api/errorMessage'
import type { DictionaryImportResult, DictionaryImportRow, DictionaryType } from './useDictionaries'
import { localizedName, useDictionaryMutations } from './useDictionaries'

/** Excel copies columns as TAB-separated text; `;` and `|` are accepted too. */
const SEPARATORS = /\t|;|\|/

/*
 * B-D16: a copy of an EXPORTED table pastes back too — when a header row
 * («Kod», «Nomi», «Nomi (rus)», «Tegishli», «Holat»…; uz / ўз / ru) is found in
 * the first 15 lines the columns are taken BY NAME and everything above it is
 * dropped. Without a header: by position (Nomi, Nomi (rus), Kod / Tegishli).
 */
const HEADER_ALIASES: Record<string, string[]> = {
  code: ['code', 'kod', 'код'],
  name: ['name', 'nomi', 'nom', 'номи', 'название', 'наименование'],
  name_ru: ['name_ru', 'nomi (rus)', 'nomi (ruscha)', 'номи (рус)', 'название (рус)', 'наименование (рус)'],
  parent_code: ['parent_code', 'ota kodi', 'tegishli', 'тегишли', 'родитель', 'относится к'],
  description: ['description', 'izoh', 'изоҳ', 'изох', 'примечание', 'описание'],
  sort_order: ['sort_order', 'tartib', 'тартиб', 'порядок'],
  is_active: ['is_active', 'holat', 'ҳолат', 'холат', 'статус', 'состояние'],
}
const norm = (h: string) =>
  String(h || '')
    .replace(/[’ʻʼ‘]/g, "'")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
const headerKey = (h: string) => Object.keys(HEADER_ALIASES).find((k) => HEADER_ALIASES[k].includes(norm(h))) ?? null
const ACTIVE_FALSE = ['faolsiz', 'фаолсиз', 'неактивен', 'неактивный', 'false', '0', "yo'q", 'нет']

export function parseRows(text: string, hierarchical: boolean) {
  const rows: DictionaryImportRow[] = []
  const errors: number[] = []
  // Lines are NOT trimmed: an empty first column (a leading TAB) would shift
  // every other column left.
  const lines = (text || '').split(/\r?\n/)
  let map: Record<string, number> | null = null
  let startAt = 0
  for (let i = 0; i < Math.min(lines.length, 15); i += 1) {
    const keys = lines[i].split(SEPARATORS).map(headerKey)
    if (keys.includes('name')) {
      map = {}
      keys.forEach((k, idx) => {
        if (k && map![k] === undefined) map![k] = idx
      })
      startAt = i + 1
      break
    }
  }
  lines.slice(startAt).forEach((raw, j) => {
    const lineNo = startAt + j + 1
    const cols = raw.split(SEPARATORS).map((c) => c.trim())
    if (!cols.some(Boolean)) return
    const get = (k: string, pos?: number) =>
      (map ? (map[k] !== undefined ? cols[map[k]] : '') : pos !== undefined ? cols[pos] : '') || ''
    const name = get('name', 0)
    if (!name) {
      errors.push(lineNo)
      return
    }
    const row: DictionaryImportRow = { name }
    const nameRu = get('name_ru', 1)
    if (nameRu) row.name_ru = nameRu
    if (map) {
      if (get('code')) row.code = get('code')
      if (hierarchical && get('parent_code')) row.parent_code = get('parent_code')
      if (get('description')) row.description = get('description')
      const so = get('sort_order')
      if (/^\d+$/.test(so)) row.sort_order = Number(so)
      const st = get('is_active')
      if (st) row.is_active = !ACTIVE_FALSE.includes(norm(st))
    } else if (hierarchical) {
      if (cols[2]) row.parent_code = cols[2]
    } else if (cols[2]) {
      row.code = cols[2]
    }
    rows.push(row)
  })
  return { rows, errors }
}

/**
 * TZ D1 «Импорт справочника» — pasted text (copied from Excel, a header row
 * is recognised) OR an .xlsx file (`code, name, name_ru, parent_code,
 * sort_order, is_active`).
 */
export function DictionaryImportModal({ open, onClose, type }: { open: boolean; onClose: () => void; type: DictionaryType }) {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { importRows } = useDictionaryMutations()
  const [mode, setMode] = useState<'text' | 'file'>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [updateExisting, setUpdateExisting] = useState(true)
  const [result, setResult] = useState<DictionaryImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setMode('text')
    setText('')
    setFile(null)
    setResult(null)
    setError(null)
    setUpdateExisting(true)
  }, [open])

  const parsed = useMemo(() => parseRows(text, type.is_hierarchical), [text, type.is_hierarchical])

  const submit = async () => {
    setError(null)
    try {
      const res =
        mode === 'file'
          ? await importRows.mutateAsync({ code: type.code, file: file!, updateExisting })
          : await importRows.mutateAsync({ code: type.code, rows: parsed.rows, updateExisting })
      setResult(res)
      toast.ok(t('dictionaries.importDone', { created: res.created, updated: res.updated }))
    } catch (e) {
      setError(errorMessage(e, mode === 'file' ? t('orgRef.importFileFailed') : t('dictionaries.importFailed')))
    }
  }

  const ready = mode === 'file' ? !!file : parsed.rows.length > 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('orgRef.bulkFill')}
      description={localizedName(type, i18n.language)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={importRows.isPending}>
            {t('common.close')}
          </Button>
          <Button onClick={submit} loading={importRows.isPending} disabled={!ready}>
            {t('dictionaries.upload')}
          </Button>
        </>
      }
    >
      <Segmented
        size="sm"
        className="mb-3"
        value={mode}
        onChange={(v) => {
          setMode(v)
          setResult(null)
          setError(null)
        }}
        options={[
          { value: 'text', label: t('orgRef.pasteText') },
          { value: 'file', label: t('orgRef.excelFile') },
        ]}
      />
      {mode === 'text' ? (
        <>
          <p className="mb-2 text-xs text-fg-muted">
            {type.is_hierarchical ? t('dictionaries.importHintHierarchical') : t('dictionaries.importHint')}{' '}
            {t('orgRef.importHeaderHint')}
          </p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder={type.is_hierarchical ? 'Buxoro tumani\tБухарский район\tbuxoro' : 'Ingliz tili\tАнглийский язык'}
            className="font-mono text-[13px]"
          />
        </>
      ) : (
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-fg-muted">
            {t('orgRef.importFileHint')} <code className="text-fg">code, name, name_ru, parent_code, sort_order, is_active</code>
          </p>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-inner border border-dashed border-brand/40 bg-brand-soft/40 p-4 hover:bg-brand-soft">
            <FileSpreadsheet size={20} className="text-brand-strong" aria-hidden />
            <span className="truncate text-[13px] text-fg">{file ? file.name : t('orgRef.pickXlsx')}</span>
            <input
              type="file"
              className="hidden"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setResult(null)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <Checkbox checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} label={t('dictionaries.updateExisting')} />
        {mode === 'text' && <span className="text-xs text-fg-muted">{t('dictionaries.rowsReady', { count: parsed.rows.length })}</span>}
      </div>

      {mode === 'text' && parsed.errors.length > 0 && (
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
            <ul className="scroll-thin mt-2 max-h-[120px] list-disc overflow-y-auto pl-4 text-xs text-danger">
              {result.errors.map((e, i) => (
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
