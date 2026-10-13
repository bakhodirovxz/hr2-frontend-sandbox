import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, GitBranch, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Checkbox'
import { Combobox } from '@/components/ui/Combobox'
import { Field } from '@/components/ui/Field'
import { FormError } from '@/components/ui/FormError'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { TD, TH } from '@/components/data/tableStyles'
import { useServerText } from '@/features/statistics/serverText'
import { errorCode, errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import type { KpiIndicator } from './api'
import { downloadImportTemplate, useIndicatorExtMutations, type ImportResult } from './extApi'

/** Import column keys → the label of the template's header. */
const FIELD_KEY: Record<string, string> = {
  name: 'kpi.colName',
  value_type: 'kpi.valueType',
  measure: 'kpi.colUnit',
  target_value: 'kpi.target',
  threshold_low: 'kpi.thresholdLow',
  threshold_high: 'kpi.thresholdHigh',
  weight: 'kpi.weight',
  max_percent: 'kpi.maxPoints',
  direction: 'kpi.colDirection',
  period_type: 'kpi.periodType',
  group_name: 'kpi.groupLabel',
  department: 'kpi.colDepartment',
  department_id: 'kpi.colDepartment',
}

/**
 * K1 · 1356 «Импорт KPI из файла»: download the template, upload the filled
 * .xlsx, check it first (`dry_run=true` — every row with its problem), then
 * import: rows without errors are created, the rest stay listed.
 */
export function IndicatorImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const mut = useIndicatorExtMutations()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [check, setCheck] = useState<ImportResult | null>(null)
  const [done, setDone] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open) return
    setFile(null)
    setCheck(null)
    setDone(null)
    setError('')
  }, [open])

  const run = async (dryRun: boolean) => {
    if (!file) return setError(t('kpiExt.importPickFile'))
    if (!file.name.toLowerCase().endsWith('.xlsx')) return setError(t('kpiExt.importOnlyXlsx'))
    setError('')
    try {
      const r = await mut.importFile.mutateAsync({ file, dryRun })
      if (dryRun) setCheck(r)
      else {
        setDone(r)
        if (r.created) toast.ok(t('kpiExt.importCreated', { count: r.created }))
      }
    } catch (e) {
      setError(errorCode(e) === 'invalid_import_file' ? `${t('kpiExt.importInvalidFile')} ${errorMessage(e, '')}`.trim() : errorMessage(e, t('common.actionFailed')))
    }
  }

  const result = done ?? check
  const fieldLabel = (f?: string | null) => (f && FIELD_KEY[f] ? t(FIELD_KEY[f] as never) : f || '—')

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={t('kpiExt.importTitle')}
      description={t('kpiExt.importHint')}
      footer={
        <div className="flex w-full flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {done ? t('common.close') : t('common.cancel')}
          </Button>
          {!done && (
            <>
              <Button variant="secondary" loading={mut.importFile.isPending && mut.importFile.variables?.dryRun} disabled={!file} onClick={() => run(true)}>
                {t('kpiExt.importCheck')}
              </Button>
              <Button
                leftIcon={<Upload size={14} />}
                loading={mut.importFile.isPending && !mut.importFile.variables?.dryRun}
                disabled={!file || !check || check.valid === 0}
                onClick={() => run(false)}
              >
                {check && check.errors.length ? t('kpiExt.importValidOnly', { count: check.valid }) : t('kpiExt.importRun')}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ol className="flex flex-col gap-3 text-[13px] text-fg">
          <li className="flex flex-wrap items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-strong">1</span>
            <span>{t('kpiExt.importStep1')}</span>
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Download size={14} />}
              loading={downloading}
              onClick={async () => {
                setDownloading(true)
                try {
                  await downloadImportTemplate()
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                } finally {
                  setDownloading(false)
                }
              }}
            >
              {t('kpiExt.importTemplate')}
            </Button>
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-strong">2</span>
            <span>{t('kpiExt.importStep2')}</span>
            <input
              ref={input}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              aria-label={t('kpiExt.importPickFile')}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null)
                setCheck(null)
                setDone(null)
                setError('')
                e.target.value = ''
              }}
            />
            <Button size="sm" variant="secondary" leftIcon={<FileSpreadsheet size={14} />} onClick={() => input.current?.click()} disabled={!!done}>
              {file ? t('kpiExt.importChangeFile') : t('kpiExt.importPickFile')}
            </Button>
            {file && <span className="max-w-[16rem] truncate text-[12.5px] text-fg-muted">{file.name}</span>}
          </li>
          <li className="flex flex-wrap items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand-strong">3</span>
            <span>{t('kpiExt.importStep3')}</span>
          </li>
        </ol>

        <FormError className="text-xs">{error}</FormError>

        {result && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <Badge tone="neutral">{t('kpiExt.importTotal', { count: result.total })}</Badge>
              {done ? (
                <Badge tone="success">{t('kpiExt.importCreatedBadge', { count: done.created })}</Badge>
              ) : (
                <Badge tone="success">{t('kpiExt.importValidBadge', { count: result.valid })}</Badge>
              )}
              {result.errors.length > 0 && <Badge tone="danger">{t('kpiExt.importErrorsBadge', { count: result.errors.length })}</Badge>}
              {!done && result.errors.length === 0 && result.valid > 0 && (
                <span className="inline-flex items-center gap-1 text-success">
                  <CheckCircle2 size={14} /> {t('kpiExt.importAllValid')}
                </span>
              )}
            </div>
            {result.rows.length > 0 && (
              <div className="scroll-thin max-h-[340px] overflow-auto rounded-xl border border-line">
                <table className="w-full border-collapse text-left text-[12.5px]" style={{ minWidth: 560 }}>
                  <thead className="sticky top-0 z-10 bg-surface shadow-[0_1px_0_rgb(var(--border))]">
                    <tr>
                      <th className={cn(TH, 'w-16')}>{t('kpiExt.importRow')}</th>
                      <th className={TH}>{t('kpi.colName')}</th>
                      <th className={TH}>{t('kpiExt.importField')}</th>
                      <th className={TH}>{t('kpiExt.importResult')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <tr key={`${r.row}-${i}`} className={cn('border-b border-line last:border-0', r.status === 'error' && 'bg-danger-soft/40')}>
                        <td className={cn(TD, 'tabular-nums text-fg-muted')}>{r.row}</td>
                        <td className={cn(TD, 'max-w-[18rem]')}>
                          <span className="line-clamp-2 text-fg">{sx(r.name) || '—'}</span>
                        </td>
                        <td className={cn(TD, 'text-fg-muted')}>{r.status === 'error' ? fieldLabel(r.field) : ''}</td>
                        <td className={TD}>
                          {r.status === 'error' ? (
                            <span className="inline-flex items-start gap-1 text-danger">
                              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                              <span>{r.code === 'kpi_name_exists' ? t('kpiExt.nameExists') : sx(r.message) || t('common.actionFailed')}</span>
                            </span>
                          ) : r.status === 'created' ? (
                            <span className="text-success">{t('kpiExt.importRowCreated')}</span>
                          ) : (
                            <span className="text-success">{t('kpiExt.importRowOk')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

const CASCADE_ERRORS: Record<string, string> = {
  kpi_cascade_global: 'kpiExt.cascadeGlobal',
  kpi_cascade_unassigned: 'kpiExt.cascadeUnassigned',
  kpi_cascade_branch_mismatch: 'kpiExt.cascadeBranchMismatch',
}

/**
 * K1 · 1356 «Каскадирование KPI»: the indicator goes to the chosen
 * department and its sub-departments (the whole subtree, or only the direct
 * children); their employees get this period's entries at once.
 */
export function CascadeModal({
  indicator,
  departments,
  onClose,
}: {
  indicator: KpiIndicator | null
  departments: { value: string; label: string }[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const sx = useServerText()
  const toast = useToast()
  const mut = useIndicatorExtMutations()
  const [dept, setDept] = useState('')
  const [deep, setDeep] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!indicator) return
    setDept(indicator.department_id ? String(indicator.department_id) : '')
    setDeep(true)
    setError('')
  }, [indicator])

  const submit = async () => {
    if (!indicator) return
    if (!dept) return setError(t('kpi.departmentRequired'))
    setError('')
    try {
      const r = await mut.cascade.mutateAsync({ id: indicator.id, department_id: Number(dept), include_descendants: deep })
      toast.ok(t('kpiExt.cascadeDone', { departments: r.added_department_ids.length, entries: r.entries_created }))
      onClose()
    } catch (e) {
      const key = CASCADE_ERRORS[errorCode(e) ?? '']
      setError(key ? t(key as never) : errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Modal
      open={!!indicator}
      onClose={onClose}
      size="md"
      title={t('kpiExt.cascadeTitle')}
      description={sx(indicator?.name)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button leftIcon={<GitBranch size={14} />} loading={mut.cascade.isPending} onClick={submit}>
            {t('kpiExt.cascadeRun')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12.5px] text-fg-muted">{t('kpiExt.cascadeHint')}</p>
        <Field label={t('kpi.colDepartment')} required>
          <Combobox value={dept} onChange={setDept} options={departments} placeholder={t('kpi.pickDepartment')} invalid={!!error && !dept} />
        </Field>
        <Checkbox label={t('kpiExt.cascadeDeep')} checked={deep} onChange={(e) => setDeep(e.target.checked)} />
        <FormError className="text-xs">{error}</FormError>
      </div>
    </Modal>
  )
}
