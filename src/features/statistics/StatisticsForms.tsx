import { useEffect, useMemo, useRef, useState } from 'react'
import { lt, ln } from '@/i18n/display'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Copy, Download, FileText, FileUp, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { apiClient } from '@/api/client'
import { apiDelete, apiGet } from '@/api/http'
import { errorCode, errorMessage, errorParams } from '@/api/errorMessage'
import { canWrite } from '@/auth/permissions'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import { useBranches } from '@/hooks/useBranches'
import { DataTable, type Column } from '@/components/data/DataTable'
import { SearchInput } from '@/components/data/SearchInput'
import { useConfirm } from '@/components/data/useConfirm'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Combobox } from '@/components/ui/Combobox'
import { DateInput } from '@/components/ui/DateInput'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { downloadFile, PDF_MIME } from '@/lib/download'
import { inUtc } from '@/lib/format'
import { searchFold } from '@/lib/searchFold'
import { useServerText } from './serverText'

/*
 * DAVLAT VA IDORAVIY HISOBOT SHAKLLARI — TZ 4.2.7 · 2139 «Подготовка учетных
 * документов, государственной и ведомственной отчетности».
 *
 * The customer uploads the .docx template of a form; its `{{…}}`
 * placeholders are bound to the statistics aggregates (the report catalogue),
 * and «Shakllantirish» fills it for an organisation and a date as DOCX / PDF:
 *   GET    statistics/forms                 — forms + placeholder catalogue
 *   POST   statistics/forms                 — multipart {code, name, description, file}
 *   PUT    statistics/forms/{code}          — multipart {name, description, file?}
 *   DELETE statistics/forms/{code}
 *   GET    statistics/forms/{code}/template — the uploaded .docx
 *   POST   statistics/forms/{code}/render?branch_id&date&date_from&date_to&format
 * An unknown placeholder is refused on upload (422 `template_unknown_placeholder`).
 */

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const CODE_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/
const KEY = ['statistics-forms'] as const

export interface StatForm {
  code: string
  name: string
  description?: string | null
  file_name?: string | null
  placeholders?: string[] | null
  created_by?: string | null
  created_at?: string | null
  updated_by?: string | null
  updated_at?: string | null
  /** System form (TZ 2139): rendered like an uploaded one, never edited. */
  builtin?: boolean
}

interface PlaceholderCatalog {
  context: { key: string; label: string }[]
  reports: { code: string; label: string; examples: string[] }[]
  syntax: string[]
}

interface FormsResponse {
  items: StatForm[]
  placeholders: PlaceholderCatalog
}

/** Errors of `responseType: 'blob'` requests arrive as a Blob — read them as the JSON they are. */
async function unblobError(e: unknown): Promise<unknown> {
  if (axios.isAxiosError(e) && e.response?.data instanceof Blob) {
    try {
      e.response.data = JSON.parse(await e.response.data.text())
    } catch {
      /* not JSON — keep the original */
    }
  }
  return e
}

function useStatForms() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<FormsResponse>('statistics/forms', { _no_branch_inject: true }),
    retry: false,
  })
}

/** «Hisobot shakllari» tab of the Statistics page. */
export function StatisticsForms() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const canEdit = canWrite(user, 'statistics', 'edit')
  const q = useStatForms()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ form: StatForm | null } | null>(null)
  const [rendering, setRendering] = useState<StatForm | null>(null)
  const [busy, setBusy] = useState('')

  // DataTable keys rows by a numeric `id`; forms are keyed by `code`.
  const rows = useMemo(() => {
    const all = (q.data?.items ?? []).map((f, i) => ({ ...f, id: i + 1 }))
    const s = searchFold(search.trim())
    return s ? all.filter((f) => searchFold(`${f.code} ${f.name} ${f.description ?? ''}`).includes(s)) : all
  }, [q.data, search])

  const remove = useMutation({
    meta: { silent: true },
    mutationFn: (code: string) => apiDelete(`statistics/forms/${encodeURIComponent(code)}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  })

  const downloadTemplate = async (f: StatForm) => {
    setBusy(`tpl:${f.code}`)
    try {
      await downloadFile({ url: `statistics/forms/${encodeURIComponent(f.code)}/template`, filename: f.file_name || `${f.code}.docx`, mime: DOCX_MIME, params: { _no_branch_inject: true } })
    } catch (e) {
      toast.error(errorMessage(await unblobError(e), t('hrExt.forms.downloadFailed')))
    } finally {
      setBusy('')
    }
  }

  const doDelete = async (f: StatForm) => {
    if (!(await confirm({ kind: 'delete', subject: f.name, description: t('hrExt.forms.deleteConfirm', { name: f.name }) }))) return
    try {
      await remove.mutateAsync(f.code)
      toast.ok(t('hrExt.forms.deleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const columns: Column<StatForm & { id: number }>[] = [
    {
      key: 'name',
      header: t('hrExt.forms.colName'),
      skeleton: 'w-56',
      cell: (f) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-fg">{lt(f.name)}</span>
          {f.description && <span className="truncate text-[11.5px] text-fg-muted">{lt(f.description)}</span>}
        </span>
      ),
    },
    { key: 'code', header: t('hrExt.forms.colCode'), className: 'whitespace-nowrap', cell: (f) => <code className="text-[12px] text-brand-strong">{f.code}</code> },
    {
      key: 'placeholders',
      header: t('hrExt.forms.colPlaceholders'),
      className: 'text-fg-muted tabular-nums',
      cell: (f) => <span title={(f.placeholders ?? []).map((p) => `{{${p}}}`).join('\n')}>{(f.placeholders ?? []).length}</span>,
    },
    {
      key: 'updated',
      header: t('hrExt.forms.colUpdated'),
      className: 'whitespace-nowrap text-fg-muted',
      cell: (f) => (
        <span className="flex flex-col">
          <span className="tabular-nums">{f.builtin ? t('hrExt.forms.builtin') : inUtc(f.updated_at || f.created_at)}</span>
          <span className="truncate text-[11px]">{f.builtin ? '' : f.updated_by || f.created_by || '—'}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      cell: (f) => (
        <span className="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" leftIcon={<Play size={13} />} onClick={() => setRendering(f)}>
            {t('hrExt.forms.render')}
          </Button>
          <IconButton size="sm" label={t('hrExt.forms.downloadTemplate')} onClick={() => void downloadTemplate(f)} disabled={busy === `tpl:${f.code}`}>
            <Download size={15} />
          </IconButton>
          {canEdit && !f.builtin && (
            <>
              <IconButton size="sm" label={t('hrExt.forms.replace')} onClick={() => setEditing({ form: f })}>
                <Pencil size={15} />
              </IconButton>
              <IconButton size="sm" label={t('common.delete')} onClick={() => void doDelete(f)}>
                <Trash2 size={15} />
              </IconButton>
            </>
          )}
        </span>
      ),
    },
  ]

  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex flex-col gap-2.5 border-b border-line p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 sm:mr-auto">
          <h2 className="text-[14px] font-semibold text-fg">{t('hrExt.forms.title')}</h2>
        </div>
        <SearchInput value={search} onChange={setSearch} placeholder={t('hrExt.forms.search')} className="sm:w-64" />
        {canEdit && (
          <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => setEditing({ form: null })}>
            {t('hrExt.forms.add')}
          </Button>
        )}
      </div>
      <DataTable
        tableId="statistics-forms"
        rows={rows}
        columns={columns}
        loading={q.isLoading}
        error={q.error}
        onRetry={() => void q.refetch()}
        onRowClick={(f) => setRendering(f)}
        emptyTitle={t('hrExt.forms.empty')}
        emptyDescription={canEdit ? t('hrExt.forms.emptyHint') : t('hrExt.forms.emptyHintRead')}
        filtered={!!search}
        minWidth={860}
      />
      <FormUploadModal state={editing} catalog={q.data?.placeholders ?? null} onClose={() => setEditing(null)} />
      <RenderModal form={rendering} onClose={() => setRendering(null)} />
    </Card>
  )
}

/** Upload a new form or replace the name / description / template of one. */
function FormUploadModal({ state, catalog, onClose }: { state: { form: StatForm | null } | null; catalog: PlaceholderCatalog | null; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const qc = useQueryClient()
  const open = !!state
  const form = state?.form ?? null
  const isNew = !form
  const fileRef = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    setCode(form?.code ?? '')
    setName(form?.name ?? '')
    setDescription(form?.description ?? '')
    setFile(null)
    setErrors({})
  }, [open, form])

  const save = useMutation({
    meta: { silent: true },
    mutationFn: async () => {
      const fd = new FormData()
      if (isNew) fd.append('code', code.trim())
      fd.append('name', name.trim())
      fd.append('description', description.trim())
      if (file) fd.append('file', file)
      const url = isNew ? 'statistics/forms' : `statistics/forms/${encodeURIComponent(form!.code)}`
      const res = isNew
        ? await apiClient.post<StatForm>(url, fd, { params: { _no_branch_inject: true }, timeout: 120_000 })
        : await apiClient.put<StatForm>(url, fd, { params: { _no_branch_inject: true }, timeout: 120_000 })
      return res.data
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  })

  const submit = async () => {
    const errs: Record<string, string> = {}
    if (isNew && !CODE_RE.test(code.trim())) errs.code = t('hrExt.forms.codeInvalid')
    if (!name.trim()) errs.name = t('hrExt.forms.nameRequired')
    if (isNew && !file) errs.file = t('hrExt.forms.fileRequired')
    if (file && !/\.docx$/i.test(file.name)) errs.file = t('hrExt.forms.fileDocx')
    if (file && file.size > 10 * 1024 * 1024) errs.file = t('hrExt.forms.fileTooBig')
    setErrors(errs)
    if (Object.keys(errs).length) return
    try {
      await save.mutateAsync()
      toast.ok(isNew ? t('hrExt.forms.created') : t('hrExt.forms.updated'))
      onClose()
    } catch (e) {
      const c = errorCode(e)
      const p = errorParams(e)
      if (c === 'template_unknown_placeholder') {
        const list = Array.isArray(p.placeholders) ? (p.placeholders as string[]).map((x) => `{{${x}}}`).join(', ') : ''
        setErrors({ file: t('hrExt.forms.unknownPlaceholder', { list }) })
      } else if (c === 'statistics_form_exists') setErrors({ code: t('hrExt.forms.codeTaken') })
      else if (c === 'statistics_form_code_invalid') setErrors({ code: t('hrExt.forms.codeInvalid') })
      else if (c === 'form_template_invalid' || c === 'form_template_too_large') setErrors({ file: errorMessage(e, t('hrExt.forms.fileDocx')) })
      else setErrors({ form: errorMessage(e, t('common.actionFailed')) })
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      placement="right"
      title={isNew ? t('hrExt.forms.add') : t('hrExt.forms.replace')}
      description={form?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={save.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hrExt.forms.colCode')} required={isNew} hint={isNew ? t('hrExt.forms.codeHint') : undefined} error={errors.code}>
            <Input value={code} onChange={(e) => setCode(e.target.value.toLowerCase())} disabled={!isNew} maxLength={64} invalid={!!errors.code} spellCheck={false} />
          </Field>
          <Field label={t('hrExt.forms.colName')} required error={errors.name}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} invalid={!!errors.name} />
          </Field>
        </div>
        <Field label={t('hrExt.forms.description')}>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
        </Field>
        <Field label={t('hrExt.forms.file')} required={isNew} hint={isNew ? t('hrExt.forms.fileHint') : t('hrExt.forms.fileReplaceHint')} error={errors.file}>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" leftIcon={<FileUp size={14} />} onClick={() => fileRef.current?.click()}>
              {t('hrExt.forms.pickFile')}
            </Button>
            <span className="min-w-0 truncate text-[12.5px] text-fg-muted">{file?.name ?? form?.file_name ?? t('hrExt.forms.noFile')}</span>
            <input
              ref={fileRef}
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                e.target.value = ''
                setFile(f)
                setErrors((x) => ({ ...x, file: '' }))
              }}
            />
          </div>
        </Field>
        <FormError>{errors.form}</FormError>
        <PlaceholderCheatSheet catalog={catalog} />
      </div>
    </Modal>
  )
}

/** The placeholders a template may use — built from the server's catalogue. */
function PlaceholderCheatSheet({ catalog }: { catalog: PlaceholderCatalog | null }) {
  const { t } = useTranslation()
  const st = useServerText()
  const toast = useToast()
  if (!catalog) return null
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.ok(t('hrExt.forms.copied', { text })),
      () => undefined,
    )
  }
  const chip = (text: string) => (
    <button
      key={text}
      type="button"
      onClick={() => copy(text)}
      title={t('hrExt.forms.copy')}
      className="inline-flex items-center gap-1 rounded-inner border border-line bg-surface px-1.5 py-0.5 font-mono text-[11.5px] text-brand-strong hover:border-brand/50 hover:bg-brand-soft/50"
    >
      {text}
      <Copy size={11} className="text-fg-subtle" aria-hidden />
    </button>
  )
  return (
    <section className="rounded-lg border border-brand/25 bg-brand-soft/30 p-3">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
        <FileText size={14} className="text-brand" aria-hidden /> {t('hrExt.forms.cheatTitle')}
      </h3>
      <p className="mt-1 text-[12px] leading-relaxed text-fg-muted">{t('hrExt.forms.cheatHint')}</p>

      <h4 className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{t('hrExt.forms.cheatContext')}</h4>
      <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
        {catalog.context.map((c) => (
          <li key={c.key} className="flex min-w-0 items-center gap-2 text-[12px] text-fg-muted">
            {chip(`{{${c.key}}}`)}
            <span className="truncate">{st(c.label)}</span>
          </li>
        ))}
      </ul>

      <h4 className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{t('hrExt.forms.cheatSyntax')}</h4>
      <ul className="mt-1.5 flex flex-col gap-1 text-[12px] text-fg-muted">
        <li>{chip('{{<hisobot>.total}}')} — {t('hrExt.forms.synTotal')}</li>
        <li>{chip('{{<hisobot>.total.<ustun>}}')} — {t('hrExt.forms.synTotalCol')}</li>
        <li>{chip('{{<hisobot>.<qator>}}')} — {t('hrExt.forms.synRow')}</li>
        <li>{chip('{{<hisobot>.<qator>.<ustun>}}')} — {t('hrExt.forms.synRowCol')}</li>
        <li>{chip('{{table:<hisobot>}}')} — {t('hrExt.forms.synTable')}</li>
      </ul>

      <h4 className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-fg-subtle">{t('hrExt.forms.cheatReports')}</h4>
      <ul className="mt-1.5 flex flex-col gap-2">
        {catalog.reports.map((r) => (
          <li key={r.code} className="text-[12px]">
            <span className="font-medium text-fg">{st(r.label)}</span>
            <span className="mt-1 flex flex-wrap gap-1">{r.examples.filter((x) => !x.includes('<')).map(chip)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Fill a form for an organisation and a date — DOCX or PDF. */
function RenderModal({ form, onClose }: { form: StatForm | null; onClose: () => void }) {
  const { t } = useTranslation()
  const selected = useBranchStore((s) => s.selectedBranchId)
  const { branches } = useBranches()
  const open = !!form
  const [branch, setBranch] = useState('')
  const [date, setDate] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [format, setFormat] = useState<'docx' | 'pdf'>('docx')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBranch(selected ? String(selected) : '')
    setDate('')
    setFrom('')
    setTo('')
    setError('')
  }, [open, selected])

  const branchOptions = useMemo(() => branches.map((b) => ({ value: String(b.id), label: ln(b) || `#${b.id}` })), [branches])

  const submit = async () => {
    if (!form) return
    if (from && to && from > to) {
      setError(t('hrExt.forms.badPeriod'))
      return
    }
    setError('')
    setBusy(true)
    try {
      await downloadFile({
        url: `statistics/forms/${encodeURIComponent(form.code)}/render`,
        method: 'post',
        params: {
          branch_id: branch || undefined,
          date: date || undefined,
          date_from: from || undefined,
          date_to: to || undefined,
          format,
          _no_branch_inject: true,
        },
        filename: `${form.code}-${(date || new Date().toISOString().slice(0, 10)).replace(/-/g, '')}.${format}`,
        mime: format === 'pdf' ? PDF_MIME : DOCX_MIME,
      })
      onClose()
    } catch (e) {
      const err = await unblobError(e)
      setError(errorCode(err) === 'invalid_period' ? t('hrExt.forms.badPeriod') : errorMessage(err, t('hrExt.forms.renderFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={t('hrExt.forms.renderTitle')}
      description={form?.name}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<Download size={15} />} onClick={() => void submit()} loading={busy}>
            {t('hrExt.forms.renderDownload')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <Field label={t('hrExt.forms.org')} hint={t('hrExt.forms.orgHint')}>
          <Combobox value={branch} onChange={setBranch} options={branchOptions} placeholder={t('hrExt.forms.allOrgs')} clearable />
        </Field>
        <Field label={t('hrExt.forms.date')} hint={t('hrExt.forms.dateHint')}>
          <DateInput value={date} onChange={setDate} aria-label={t('hrExt.forms.date')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('hrExt.forms.dateFrom')} hint={t('hrExt.forms.dateFromHint')}>
            <DateInput value={from} onChange={setFrom} aria-label={t('hrExt.forms.dateFrom')} />
          </Field>
          <Field label={t('hrExt.forms.dateTo')} hint={t('hrExt.forms.dateToHint')}>
            <DateInput value={to} onChange={setTo} aria-label={t('hrExt.forms.dateTo')} />
          </Field>
        </div>
        <Field label={t('hrExt.forms.format')}>
          <Segmented
            size="sm"
            value={format}
            onChange={setFormat}
            aria-label={t('hrExt.forms.format')}
            options={[
              { value: 'docx', label: 'Word (.docx)' },
              { value: 'pdf', label: 'PDF' },
            ]}
          />
        </Field>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  )
}
