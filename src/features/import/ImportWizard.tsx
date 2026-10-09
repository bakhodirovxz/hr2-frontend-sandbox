import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { downloadFile } from '@/lib/download'
import { apiGet, apiPost } from '@/api/http'
import { errorMessage } from '@/api/errorMessage'
import { Button, Combobox, Field, Modal } from '@/components/ui'
import { Checkbox } from '@/components/ui/Checkbox'
import { Input } from '@/components/ui/Input'
import { useBranchStore } from '@/store/branchStore'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/cn'

export type ImportEntity = 'employees' | 'staff_positions' | 'tasks_overdue'

const TITLE: Record<ImportEntity, string> = {
  employees: 'import.titleEmployees',
  staff_positions: 'import.titleStaff',
  tasks_overdue: 'import.titleIjro',
}
/** The two columns the preview table shows for a row. */
const PREVIEW_KEYS: Record<ImportEntity, [string, string]> = {
  employees: ['legal_name', 'department'],
  staff_positions: ['department', 'job_position'],
  tasks_overdue: ['task_index', 'employee'],
}

interface FieldSpec { key: string; label: string; required: boolean }
interface SheetInfo { name: string; total_rows: number; rows: unknown[][]; header_row: number; mapping: Record<string, number> }
interface PreviewRow { row: number; values: Record<string, unknown>; errors: string[] }
interface Preview { rows: PreviewRow[]; total: number; ok: number; with_errors: number }
interface CommitResult { created: number; failed: { row: number; error: string }[]; skipped_with_errors: number }

const colName = (i: number) => {
  let s = ''
  let n = i + 1
  while (n > 0) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

/**
 * Excel import with column mapping (Verifix had it for employees and jobs).
 * Upload → pick sheet, header row and which column is which (guessed from
 * the headers) → preview every row with its problems → import the clean ones.
 * The server re-checks the file on import; the preview is never trusted.
 */
export function ImportWizard({
  entity, open, onClose, onDone,
}: { entity: ImportEntity; open: boolean; onClose: () => void; onDone?: () => void }) {
  const { t } = useTranslation()
  const selectedBranch = useBranchStore((s) => s.selectedBranchId)
  const branches = useBranchStore((s) => s.branches)
  const ownBranch = useAuthStore((s) => s.user?.employee?.department?.organization_branch_id) ?? null
  const [branchId, setBranchId] = useState<string>('')
  const [step, setStep] = useState<'file' | 'map' | 'preview' | 'done'>('file')
  const [file, setFile] = useState<File | null>(null)
  const [fields, setFields] = useState<FieldSpec[]>([])
  const [sheets, setSheets] = useState<SheetInfo[]>([])
  const [sheet, setSheet] = useState('')
  const [headerRow, setHeaderRow] = useState(1)
  const [mapping, setMapping] = useState<Record<string, number>>({})
  const [preview, setPreview] = useState<Preview | null>(null)
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [result, setResult] = useState<CommitResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  /** Branches the SERVER lets this person import into (`all` = every one). */
  const [allowed, setAllowed] = useState<{ all: boolean; ids: number[] } | null>(null)

  useEffect(() => {
    if (!open) return
    setStep('file'); setFile(null); setSheets([]); setPreview(null); setResult(null); setError(''); setOnlyErrors(false)
    setBranchId(String(selectedBranch ?? ownBranch ?? ''))
    apiGet<FieldSpec[]>(`imports/${entity}/fields`).then(setFields).catch((e) => setError(errorMessage(e, t('common.actionFailed'))))
    /* The picker offered EVERY branch, so an ijro officer of one branch could
       pick another and meet a 403 only on upload (2026-09-28). */
    apiGet<{ all: boolean; ids: number[] }>(`imports/${entity}/branches`)
      .then((a) => {
        setAllowed(a)
        if (!a.all) {
          const pre = selectedBranch ?? ownBranch
          setBranchId(String(pre != null && a.ids.includes(Number(pre)) ? pre : a.ids[0] ?? ''))
        }
      })
      .catch(() => setAllowed(null))
  }, [open, entity, selectedBranch, ownBranch, t])

  const branchOptions = (allowed && !allowed.all
    ? branches.filter((b) => allowed.ids.includes(Number(b.id)))
    : branches
  ).map((b) => ({ value: String(b.id), label: b.name ?? `#${b.id}` }))

  const current = sheets.find((s) => s.name === sheet)
  const header = (current?.rows[headerRow - 1] ?? []) as unknown[]
  const columnOptions = useMemo(
    () => [
      { value: '', label: t('import.notMapped') },
      ...header.map((h, i) => ({ value: String(i), label: `${colName(i)}: ${h == null || h === '' ? '—' : String(h)}` })),
    ],
    [header, t],
  )

  const form = () => {
    const fd = new FormData()
    fd.append('file', file!)
    fd.append('sheet', sheet)
    fd.append('header_row', String(headerRow - 1))
    fd.append('mapping', JSON.stringify(mapping))
    fd.append('branch_id', branchId)
    return fd
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e, t('common.actionFailed')))
    } finally {
      setBusy(false)
    }
  }

  const inspect = (f: File) =>
    run(async () => {
      setFile(f)
      const fd = new FormData()
      fd.append('file', f)
      const r = await apiPost<{ sheets: SheetInfo[] }>(`imports/${entity}/inspect`, fd)
      setSheets(r.sheets)
      const first = r.sheets[0]
      if (first) {
        setSheet(first.name)
        setHeaderRow(first.header_row + 1)
        setMapping(first.mapping)
      }
      setStep('map')
    })

  const missing = fields.filter((f) => f.required && mapping[f.key] == null).map((f) => f.label)
  const shown = (preview?.rows ?? []).filter((r) => !onlyErrors || r.errors.length > 0)
  const [nameKey, secondKey] = PREVIEW_KEYS[entity]

  /** The ready-to-fill workbook — columns, example rows, a notes sheet. */
  const downloadTemplate = () =>
    run(() =>
      downloadFile({
        url: `imports/${entity}/template`,
        // The branch makes the executor column a drop-down of its staff.
        params: { branch_id: branchId || undefined },
        filename: `${t(TITLE[entity] as never)}.xlsx`,
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    )

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t(TITLE[entity] as never)}
      description={t('import.subtitle')}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-[12px] text-fg-subtle">
            {step === 'preview' && preview ? t('import.summary', { ok: preview.ok, bad: preview.with_errors }) : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{step === 'done' ? t('common.close') : t('common.cancel')}</Button>
            {step === 'map' && (
              <Button
                loading={busy}
                disabled={missing.length > 0 || !branchId}
                onClick={() => run(async () => {
                  setPreview(await apiPost<Preview>(`imports/${entity}/preview`, form()))
                  setStep('preview')
                })}
              >
                {t('import.check')}
              </Button>
            )}
            {step === 'preview' && (
              <>
                <Button variant="ghost" onClick={() => setStep('map')}>{t('import.back')}</Button>
                <Button
                  loading={busy}
                  disabled={!preview?.ok}
                  onClick={() => run(async () => {
                    setResult(await apiPost<CommitResult>(`imports/${entity}/commit`, form()))
                    setStep('done')
                    onDone?.()
                  })}
                >
                  {t('import.commit', { count: preview?.ok ?? 0 })}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      {error && <p className="mb-3 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>}

      {step === 'file' && (
        <div className="space-y-4">
          {branchOptions.length > 1 && (
            <Field label={t('import.branch')} required>
              <Combobox value={branchId} onChange={setBranchId} options={branchOptions} />
            </Field>
          )}
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[var(--r-md)] border-2 border-dashed border-line px-6 py-10 text-center hover:border-brand/50">
            <FileSpreadsheet size={28} className="text-brand" />
            <span className="text-[14px] font-semibold text-fg">{t('import.pickFile')}</span>
            <span className="text-[12px] text-fg-subtle">{t('import.pickHint')}</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) inspect(f) }}
            />
            {busy && <span className="text-[12px] text-fg-muted">{t('import.reading')}</span>}
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-inner bg-surface-2/60 px-3 py-2.5">
            <span className="text-[12.5px] text-fg-muted">{t('import.templateHint')}</span>
            <Button size="sm" variant="secondary" leftIcon={<Download size={14} />} disabled={busy} onClick={downloadTemplate}>
              {t('import.downloadTemplate')}
            </Button>
          </div>
        </div>
      )}

      {step === 'map' && current && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label={t('import.sheet')}>
              <Combobox
                value={sheet}
                onChange={(v) => {
                  const s = sheets.find((x) => x.name === v)
                  setSheet(v)
                  if (s) { setHeaderRow(s.header_row + 1); setMapping(s.mapping) }
                }}
                options={sheets.map((s) => ({ value: s.name, label: `${s.name} (${s.total_rows})` }))}
              />
            </Field>
            <Field label={t('import.headerRow')} hint={t('import.headerRowHint')}>
              <Input type="number" min={1} max={Math.max(current.rows.length, 1)} value={headerRow}
                onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))} />
            </Field>
            <p className="self-end text-[12px] text-fg-subtle">{file?.name}</p>
          </div>
          <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            {fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                <Combobox
                  value={mapping[f.key] == null ? '' : String(mapping[f.key])}
                  onChange={(v) => setMapping((m) => {
                    const next = { ...m }
                    if (v === '') delete next[f.key]
                    else next[f.key] = Number(v)
                    return next
                  })}
                  options={columnOptions}
                />
              </Field>
            ))}
          </div>
          {missing.length > 0 && (
            <p className="text-[12px] text-warning">{t('import.missingRequired', { fields: missing.join(', ') })}</p>
          )}
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="space-y-3">
          <Checkbox label={t('import.onlyErrors')} checked={onlyErrors} onChange={(e) => setOnlyErrors(e.target.checked)} />
          <div className="max-h-[50vh] overflow-auto rounded-[var(--r-sm)] border border-line">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="sticky top-0 bg-surface-2 text-[11px] text-fg-muted">
                <tr>
                  <th className="px-3 py-2">{t('import.row')}</th>
                  <th className="px-3 py-2">{fields.find((f) => f.key === nameKey)?.label}</th>
                  <th className="px-3 py-2">{fields.find((f) => f.key === secondKey)?.label}</th>
                  <th className="px-3 py-2">{t('import.result')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.row} className="border-t border-line align-top">
                    <td className="px-3 py-2 tabular-nums text-fg-subtle">{r.row}</td>
                    <td className="px-3 py-2 text-fg">{String(r.values[nameKey] ?? '—')}</td>
                    <td className="px-3 py-2 text-fg-muted">
                      {String(r.values[secondKey] ?? '—')}
                      {/* The name the server matched it to — shown so a near
                          match («bo'lim» vs «bo'limi») is seen, not assumed. */}
                      {r.values[`${secondKey}_matched`] != null &&
                        r.values[`${secondKey}_matched`] !== r.values[secondKey] && (
                          <span className="block text-[11px] text-brand">→ {String(r.values[`${secondKey}_matched`])}</span>
                        )}
                    </td>
                    <td className={cn('px-3 py-2', r.errors.length ? 'text-danger' : 'text-success')}>
                      {r.errors.length ? (
                        <span className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{r.errors.join('; ')}</span>
                      ) : (
                        <span className="flex items-center gap-1.5"><CheckCircle2 size={14} />{t('import.ready')}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-3 text-[14px]">
          <p className="flex items-center gap-2 font-semibold text-success">
            <Upload size={16} />{t('import.done', { count: result.created })}
          </p>
          {result.skipped_with_errors > 0 && (
            <p className="text-fg-muted">{t('import.skipped', { count: result.skipped_with_errors })}</p>
          )}
          {result.failed.length > 0 && (
            <ul className="space-y-1 text-[13px] text-danger">
              {result.failed.map((f) => <li key={f.row}>{t('import.row')} {f.row}: {f.error}</li>)}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}
