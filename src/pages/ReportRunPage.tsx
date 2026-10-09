import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Download, FileSpreadsheet, Play, Printer, QrCode, Save } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { apiPost } from '@/api/http'
import { KPI_REPORTS } from '@/api/endpoints'
import { errorMessage } from '@/api/errorMessage'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Checkbox } from '@/components/ui/Checkbox'
import { EmptyState } from '@/components/ui/EmptyState'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { PageContainer, PageHeader } from '@/components/layout/Page'
import { useKpiPermissions } from '@/features/kpi/useKpiPermissions'
import { ReportParamsForm } from '@/features/reports/ReportParamsForm'
import { ReportPrefsForm } from '@/features/reports/ReportPrefsForm'
import { ReportTableView } from '@/features/reports/ReportTableView'
import { ReportTemplatesMenu } from '@/features/reports/ReportTemplatesMenu'
import { defaultParams, paramsToSearch, searchToParams } from '@/features/reports/paramsUrl'
import { reportLabel } from '@/features/reports/reportStyles'
import type { DrillRef, ReportParams, ReportPrefs, ReportTemplate } from '@/features/reports/types'
import { useReportCatalog } from '@/features/reports/useReportCatalog'
import { useReportPrefs } from '@/features/reports/useReportPrefs'
import { downloadReport, useReportRun } from '@/features/reports/useReportRun'
import i18n from '@/i18n'
import { useBranchStore } from '@/store/branchStore'
import { cn } from '@/lib/cn'

type Mode = 'params' | 'view' | 'prefs'

function currentLang(): 'uz' | 'ru' {
  return i18n.language?.startsWith('ru') ? 'ru' : 'uz'
}

/**
 * One report, three modes — Parametrlar → Ko'rish → Sozlamalar — plus Excel /
 * CSV and saved templates. The view keeps a drill-down breadcrumb (cell click
 * opens the detail report inline; the crumb pops back without a refetch).
 * Parameters live in the URL so a run can be shared or reopened.
 */
export function ReportRunPage() {
  const { code = '' } = useParams()
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const catalog = useReportCatalog()
  const defn = catalog.items.find((i) => i.code === code)
  const { prefs: savedPrefs, save: savePrefs, clear: clearPrefs } = useReportPrefs(code, !!defn)
  const runner = useReportRun(code)
  const kpiPerms = useKpiPermissions(code === 'kpi_report')

  const mode = (sp.get('mode') as Mode) || 'params'
  const setMode = (m: Mode) => {
    const next = new URLSearchParams(sp)
    next.set('mode', m)
    setSp(next, { replace: true })
  }

  // Parameters: URL → definition defaults → the branch chosen in the header
  // (a branch user should not have to pick their own branch again).
  const selectedBranchId = useBranchStore((st) => st.selectedBranchId)
  const [params, setParams] = useState<ReportParams | null>(null)
  useEffect(() => {
    if (!defn || params) return
    const fromUrl = searchToParams(defn.params, sp)
    const next = { ...defaultParams(defn.params), ...fromUrl }
    if (selectedBranchId != null) {
      const has = (n: string) => defn.params.some((p) => p.name === n)
      if (has('branch_ids') && !(next.branch_ids as unknown[] | undefined)?.length) next.branch_ids = [selectedBranchId]
      if (has('branch_id') && next.branch_id == null) next.branch_id = selectedBranchId
    }
    setParams(next)
  }, [defn, params, sp, selectedBranchId])

  // Deep link straight into the view (`?mode=view&…`): run once on arrival.
  const autoRan = useRef(false)
  useEffect(() => {
    if (autoRan.current || !defn || !params || mode !== 'view' || runner.stack.length) return
    autoRan.current = true
    void runner.generate(params, savedPrefs, currentLang(), title).catch(() => setMode('params'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defn, params, mode])

  // Preferences draft (edited on the Sozlamalar tab, applied on save).
  const [prefsDraft, setPrefsDraft] = useState<ReportPrefs | null>(null)
  useEffect(() => {
    if (savedPrefs && !prefsDraft) setPrefsDraft(savedPrefs)
  }, [savedPrefs, prefsDraft])

  const [withQr, setWithQr] = useState(true)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState<'xlsx' | 'csv' | null>(null)

  const title = defn ? reportLabel(defn.title_key, defn.code) : ''
  const requiredMissing = useMemo(() => {
    if (!defn || !params) return false
    return defn.params.some((d) => {
      if (!d.required) return false
      const v = params[d.name]
      if (d.kind === 'date_range') return !((v as { from?: string })?.from && (v as { to?: string })?.to)
      return v == null || v === '' || (Array.isArray(v) && v.length === 0)
    })
  }, [defn, params])

  const syncUrl = (p: ReportParams, m: Mode) => {
    if (!defn) return
    const next = paramsToSearch(defn.params, p, sp)
    next.set('mode', m)
    setSp(next, { replace: true })
  }

  const generate = async () => {
    if (!defn || !params) return
    try {
      await runner.generate(params, savedPrefs, currentLang(), title)
      syncUrl(params, 'view')
    } catch (e) {
      toast.error(errorMessage(e, t('reports.runFailed')))
    }
  }

  const onDrill = async (ref: DrillRef, label: string) => {
    if (!params) return
    try {
      await runner.drill(params, savedPrefs, currentLang(), ref, label)
    } catch (e) {
      toast.error(errorMessage(e, t('reports.runFailed')))
    }
  }

  const download = async (format: 'xlsx' | 'csv') => {
    if (!defn || !params) return
    setDownloading(format)
    try {
      const level = runner.current
      const target = level?.drill?.report ?? code
      await downloadReport(code, { params, prefs: savedPrefs, format, lang: currentLang(), drill: level?.drill ?? null },
        `${target}_${new Date().toISOString().slice(0, 10)}.${format}`)
      toast.ok(t('reports.exported'))
    } catch (e) {
      toast.error(errorMessage(e, t('reports.exportFailed')))
    } finally {
      setDownloading(null)
    }
  }

  const applyPrefs = async (clear = false) => {
    try {
      const next = clear ? await clearPrefs.mutateAsync() : await savePrefs.mutateAsync(prefsDraft ?? {})
      setPrefsDraft(next)
      toast.ok(t('reports.prefsSaved'))
      if (runner.stack.length && params) {
        await runner.generate(params, next, currentLang(), title)
        setMode('view')
      }
    } catch (e) {
      toast.error(errorMessage(e, t('reports.prefsFailed')))
    }
  }

  const loadTemplate = (tpl: ReportTemplate) => {
    if (!defn) return
    const next = { ...defaultParams(defn.params), ...tpl.params }
    setParams(next)
    syncUrl(next, 'params')
    toast.info(t('reports.templateLoaded', { name: tpl.name }))
  }

  /** KPI: freeze the same parameters into a stored, approvable document. */
  const qc = useQueryClient()
  const saveKpiReport = async () => {
    if (!params) return
    setSaving(true)
    try {
      const month = String(params.month ?? '')
      await apiPost(KPI_REPORTS, {
        title: `${t('reports.r.kpi_report')} ${month}`,
        month: month.length === 7 ? `${month}-01` : month,
        division_ids: (params.division_ids as number[]) ?? null,
        job_position_ids: (params.job_position_ids as number[]) ?? null,
        job_groups: (params.job_groups as string[]) ?? null,
        employee_ids: (params.employee_ids as number[]) ?? null,
        group_names: (params.group_names as string[]) ?? null,
        with_qr: withQr,
        include_draft: !!savedPrefs?.include_draft,
      }, { params: params.branch_id ? { organization_branch_id: params.branch_id } : undefined })
      // The KPI reports tab caches its list for 30 s; without this the reader
      // lands on it and does not see the report they just saved.
      qc.invalidateQueries({ queryKey: ['kpi', 'reports'] })
      toast.ok(t('kpi.reportCreated'))
      navigate('/kpi?tab=reports')
    } catch (e) {
      toast.error(errorMessage(e, t('kpi.reportFailed')))
    } finally {
      setSaving(false)
    }
  }

  if (catalog.isLoading) {
    return (
      <PageContainer>
        <Skeleton className="mb-4 h-10 w-72" />
        <Skeleton className="h-64 rounded-card" />
      </PageContainer>
    )
  }
  if (!defn) {
    return (
      <PageContainer>
        <EmptyState
          title={t('reports.notAllowedTitle')}
          description={t('reports.notAllowedHint')}
          action={<Button variant="outline" onClick={() => navigate('/reports')}>{t('reports.backToCatalog')}</Button>}
        />
      </PageContainer>
    )
  }

  const modes = [
    { value: 'params' as Mode, label: t('reports.modeParams') },
    { value: 'view' as Mode, label: t('reports.modeView') },
    ...(defn.prefs.length ? [{ value: 'prefs' as Mode, label: t('reports.modePrefs') }] : []),
  ]
  const canSaveKpi = code === 'kpi_report' && kpiPerms.can('kpi_report', 'run')

  return (
    <PageContainer>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Link to="/reports" className="rounded-full p-1 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={t('reports.backToCatalog')}>
              <ArrowLeft size={18} />
            </Link>
            {title}
          </span>
        }
        subtitle={t(`reports.desc.${code}` as never, { defaultValue: t('reports.runSubtitle') }) as string}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={mode} onChange={setMode} options={modes} size="sm" />
            <Button size="sm" leftIcon={<Play size={14} />} onClick={generate} loading={runner.isPending} disabled={!params || requiredMissing}>
              {t('reports.generate')}
            </Button>
            <Button size="sm" variant="outline" leftIcon={<FileSpreadsheet size={14} />} onClick={() => download('xlsx')} loading={downloading === 'xlsx'} disabled={!params || requiredMissing}>
              Excel
            </Button>
            <Button size="sm" variant="outline" leftIcon={<Download size={14} />} onClick={() => download('csv')} loading={downloading === 'csv'} disabled={!params || requiredMissing}>
              CSV
            </Button>
            {runner.current && mode === 'view' && (
              <Button size="sm" variant="ghost" leftIcon={<Printer size={14} />} onClick={() => { window.dispatchEvent(new Event('beforeprint')); setTimeout(() => window.print(), 250) }} title={t('reports.print')}>
                {t('reports.print')}
              </Button>
            )}
          </div>
        }
      />

      {mode === 'params' && params && (
        <Card className="p-5">
          {defn.supports_templates && (
            <div className="mb-5 border-b border-line pb-5">
              <ReportTemplatesMenu code={code} params={params} prefs={savedPrefs} onLoad={loadTemplate} />
            </div>
          )}
          <ReportParamsForm code={code} defs={defn.params} value={params} onChange={(p) => { setParams(p); syncUrl(p, 'params') }} />
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-5">
            <Button leftIcon={<Play size={15} />} onClick={generate} loading={runner.isPending} disabled={requiredMissing}>
              {t('reports.generate')}
            </Button>
            {canSaveKpi && (
              <>
                <span className="mx-1 h-6 w-px bg-line" />
                <Checkbox checked={withQr} onChange={(e) => setWithQr(e.target.checked)} label={t('reports.kpiWithQr')} />
                <Button variant="secondary" leftIcon={withQr ? <QrCode size={15} /> : <Save size={15} />} onClick={saveKpiReport} loading={saving} disabled={requiredMissing}>
                  {t('reports.kpiSaveReport')}
                </Button>
              </>
            )}
            {requiredMissing && <span className="text-[12.5px] text-fg-subtle">{t('reports.fillRequired')}</span>}
          </div>
        </Card>
      )}

      {mode === 'view' && (
        <Card className="report-print p-5">
          {runner.stack.length > 1 && (
            <nav className="mb-4 flex flex-wrap items-center gap-1 text-[13px]" aria-label={t('reports.drillPath')}>
              {runner.stack.map((lvl, i) => {
                const last = i === runner.stack.length - 1
                return (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <ChevronRight size={14} className="text-fg-subtle" />}
                    <button
                      type="button"
                      disabled={last}
                      onClick={() => runner.popTo(i)}
                      className={cn('rounded-pill px-2.5 py-1', last ? 'bg-surface-2 font-semibold text-fg' : 'text-brand-strong hover:bg-brand-soft')}
                    >
                      {lvl.label}
                    </button>
                  </span>
                )
              })}
            </nav>
          )}
          {runner.isPending && !runner.current ? (
            <CenteredSpinner />
          ) : runner.current ? (
            <div className={cn(runner.isPending && 'opacity-60')}>
              <ReportTableView table={runner.current.table} onDrill={onDrill} />
            </div>
          ) : (
            <EmptyState
              title={t('reports.notGeneratedTitle')}
              description={t('reports.notGeneratedHint')}
              action={<Button onClick={generate} leftIcon={<Play size={15} />} disabled={requiredMissing}>{t('reports.generate')}</Button>}
            />
          )}
        </Card>
      )}

      {mode === 'prefs' && (
        <Card className="p-5">
          {prefsDraft ? (
            <>
              <ReportPrefsForm defs={defn.prefs} value={prefsDraft} onChange={setPrefsDraft} />
              <div className="mt-5 flex gap-2 border-t border-line pt-5">
                <Button leftIcon={<Save size={15} />} onClick={() => applyPrefs(false)} loading={savePrefs.isPending}>{t('reports.prefsSave')}</Button>
                <Button variant="ghost" onClick={() => applyPrefs(true)} loading={clearPrefs.isPending}>{t('reports.prefsReset')}</Button>
              </div>
            </>
          ) : (
            <CenteredSpinner />
          )}
        </Card>
      )}
    </PageContainer>
  )
}
