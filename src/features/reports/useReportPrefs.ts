import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost, apiPut } from '@/api/http'
import { REPORT_OPTIONS, REPORT_PREFS, REPORT_TEMPLATE, REPORT_TEMPLATES } from '@/api/endpoints'
import type { ReportOption, ReportParams, ReportPrefs, ReportTemplate } from './types'

export function useReportPrefs(code: string, enabled = true) {
  const qc = useQueryClient()
  const key = ['reports', code, 'prefs']
  const q = useQuery({
    queryKey: key,
    queryFn: () => apiGet<{ prefs: ReportPrefs }>(REPORT_PREFS(code)).then((r) => r.prefs),
    enabled,
    retry: false,
  })
  const save = useMutation({
    mutationFn: (prefs: ReportPrefs) => apiPut<{ prefs: ReportPrefs }>(REPORT_PREFS(code), { prefs }).then((r) => r.prefs),
    onSuccess: (prefs) => qc.setQueryData(key, prefs),
  })
  const clear = useMutation({
    mutationFn: () => apiDelete<{ prefs: ReportPrefs }>(REPORT_PREFS(code)).then((r) => r.prefs),
    onSuccess: (prefs) => qc.setQueryData(key, prefs),
  })
  return { prefs: q.data ?? null, isLoading: q.isLoading, save, clear }
}

export function useReportTemplates(code: string, enabled = true) {
  const qc = useQueryClient()
  const key = ['reports', code, 'templates']
  const q = useQuery({
    queryKey: key,
    queryFn: () => apiGet<ReportTemplate[]>(REPORT_TEMPLATES(code)),
    enabled,
    retry: false,
  })
  const save = useMutation({
    mutationFn: (body: { name: string; params: ReportParams; prefs?: ReportPrefs | null }) =>
      apiPost<ReportTemplate>(REPORT_TEMPLATES(code), body),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  const remove = useMutation({
    mutationFn: (id: number) => apiDelete(REPORT_TEMPLATE(code, id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  return { templates: q.data ?? [], isLoading: q.isLoading, save, remove }
}

/** Options for one select-like parameter; `deps` narrows (e.g. branch ids). */
export function useReportOptions(
  code: string,
  param: string | null,
  deps: { branch_ids?: (number | string)[]; q?: string; ids?: (number | string)[]; limit?: number } = {},
  enabled = true,
) {
  const branch = (deps.branch_ids ?? []).map(String).join(',')
  const ids = (deps.ids ?? []).map(String).join(',')
  return useQuery({
    queryKey: ['reports', code, 'options', param, branch, deps.q ?? '', ids, deps.limit ?? null],
    queryFn: () =>
      apiGet<ReportOption[]>(REPORT_OPTIONS(code, param as string), {
        branch_ids: branch || undefined,
        q: deps.q || undefined,
        ids: ids || undefined,
        limit: deps.limit,
      }),
    placeholderData: (prev) => prev,
    enabled: enabled && !!param,
    staleTime: 60_000,
    retry: false,
  })
}
