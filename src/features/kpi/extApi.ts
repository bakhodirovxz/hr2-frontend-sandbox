import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
import { downloadFile, XLSX_MIME } from '@/lib/download'
import { useBranchStore } from '@/store/branchStore'
import { KPI, type KpiReportInput, type ReportGroupBy } from './api'

/*
 * KPI «Возможные расширения» of the TZ — sandbox backend v2:
 *   4.2.8 · 426  admin / support staff (`position_group=admin_support`, the
 *                setting `kpi.admin_support_categories`);
 *   K1 · 1356    duplicate name (409), import from a file, cascading;
 *   K3 · 1412    e-mail, saved templates, period comparison.
 */

// ─── 4.2.8 · 426 ──────────────────────────────────────────────────────────────

export const ADMIN_SUPPORT = 'admin_support'

export interface PositionGroup {
  code: string
  label: string
  categories: string[]
}

/** The values of the `position_group` filter (with the categories behind them). */
export function usePositionGroups(enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'position-groups'],
    queryFn: () => apiGet<PositionGroup[]>(KPI.positionGroups),
    enabled,
    staleTime: 5 * 60_000,
  })
  return q.data ?? []
}

export interface KpiSettings {
  admin_support_categories: string[]
}

/** `system/settings/kpi` — the site master admin only (others get 403). */
export function useKpiSettings(enabled: boolean) {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['kpi', 'settings'],
    queryFn: () => apiGet<KpiSettings>(KPI.settings),
    enabled,
    retry: false,
  })
  const save = useMutation({
    mutationFn: (body: KpiSettings) => apiPut<KpiSettings>(KPI.settings, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kpi'] })
    },
  })
  return { settings: q.data ?? null, loading: q.isLoading, error: q.error, save }
}

// ─── K1 · 1356 ────────────────────────────────────────────────────────────────

export interface ImportRowError {
  row: number
  name?: string | null
  field?: string | null
  code?: string | null
  message?: string | null
}

export interface ImportResult {
  dry_run: boolean
  organization_branch_id?: number | null
  total: number
  valid: number
  created: number
  created_ids: number[]
  errors: ImportRowError[]
  rows: (ImportRowError & { status: 'ok' | 'created' | 'error'; id?: number })[]
}

export const downloadImportTemplate = () =>
  downloadFile({ url: KPI.importTemplate, mime: XLSX_MIME, filename: 'kpi_import_namuna.xlsx' })

export interface CascadeResult {
  indicator_id: number
  department_ids: number[]
  added_department_ids: number[]
  entries_created: number
}

export function useIndicatorExtMutations() {
  const qc = useQueryClient()
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['kpi'] })
  }
  return {
    importFile: useMutation({
      mutationFn: ({ file, dryRun }: { file: File; dryRun: boolean }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost<ImportResult>(KPI.importIndicators, fd, {
          params: { dry_run: dryRun },
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
      onSuccess: (r) => {
        if (r && !r.dry_run && r.created) done()
      },
    }),
    cascade: useMutation({
      mutationFn: ({ id, department_id, include_descendants }: { id: number; department_id: number; include_descendants: boolean }) =>
        apiPost<CascadeResult>(KPI.indicatorCascade(id), { department_id, include_descendants }),
      onSuccess: done,
    }),
  }
}

// ─── K3 · 1412 ────────────────────────────────────────────────────────────────

export type CompareGroupBy = Exclude<ReportGroupBy, ''>

export interface CompareRow {
  key: string | number | null
  label: string | null
  a_plan: number | null
  a_fact: number | null
  a_percent: number | null
  b_plan: number | null
  b_fact: number | null
  b_percent: number | null
  delta_fact: number | null
  delta_percent: number | null
  trend: 'up' | 'down' | 'flat'
}

interface CompareInterval {
  id: number
  name: string | null
  begin_date: string
  end_date: string
}

export interface CompareResult {
  interval_a: CompareInterval
  interval_b: CompareInterval
  group_by: CompareGroupBy
  rows: CompareRow[]
  chart: { x: string; series: string[]; data: { label: string | null; a_percent: number | null; b_percent: number | null }[] }
}

export interface CompareParams {
  interval_a: number
  interval_b: number
  group_by: CompareGroupBy
  position_group?: string
}

export function useCompare(p: CompareParams | null) {
  const branch = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['kpi', 'compare', branch, p],
    queryFn: () =>
      apiGet<CompareResult>(KPI.reportsCompare, {
        interval_a: p!.interval_a,
        interval_b: p!.interval_b,
        group_by: p!.group_by,
        position_group: p!.position_group || undefined,
      }),
    enabled: !!p,
    retry: false,
  })
  return { data: q.data ?? null, loading: q.isFetching, error: q.error }
}

/** The builder's parameters a template keeps (the period itself is chosen anew). */
export type TemplateParams = Partial<Omit<KpiReportInput, 'period_start' | 'period_end'>>

export interface KpiReportTemplate {
  id: number
  name: string
  description?: string | null
  params: TemplateParams
  is_shared: boolean
  is_mine: boolean
  created_at?: string | null
}

export function useReportTemplates(enabled = true) {
  const q = useQuery({
    queryKey: ['kpi', 'report-templates'],
    queryFn: () => apiGet<KpiReportTemplate[]>(KPI.reportTemplates),
    enabled,
  })
  return { templates: q.data ?? [], loading: q.isLoading }
}

export function useReportExtMutations() {
  const qc = useQueryClient()
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['kpi', 'report-templates'] })
  }
  return {
    createTemplate: useMutation({
      mutationFn: (body: { name: string; params: TemplateParams; is_shared: boolean }) => apiPost<KpiReportTemplate>(KPI.reportTemplates, body),
      onSuccess: done,
    }),
    updateTemplate: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<{ name: string; params: TemplateParams; is_shared: boolean }> }) =>
        apiPatch<KpiReportTemplate>(KPI.reportTemplate(id), body),
      onSuccess: done,
    }),
    deleteTemplate: useMutation({ mutationFn: (id: number) => apiDelete(KPI.reportTemplate(id)), onSuccess: done }),
    send: useMutation({
      mutationFn: ({ id, emails, format }: { id: number; emails: string[]; format: 'xlsx' | 'pdf' | 'docx' }) =>
        apiPost<{ job_id: number; status: string; emails: string[] }>(KPI.reportSend(id), { emails, format }),
    }),
  }
}
