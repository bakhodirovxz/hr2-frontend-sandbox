import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useBranchStore } from '@/store/branchStore'
import {
  createTemplate,
  deleteTemplate,
  fetchCatalogReport,
  fetchDashboard,
  fetchStatisticsMeta,
  fetchStatisticsReport,
  fetchTemplates,
  type CatalogResult,
  type DashboardParams,
  type ReportParams,
  type ReportTemplate,
  type StatisticsDashboard,
  type StatisticsMeta,
  type StatisticsReport,
  type TemplateInput,
} from './api'

/**
 * Statistika modulining ma'lumot qatlami.
 *
 * Hisobot so'rovi PARAMETRLAR bo'yicha keshlanadi: TZ 4.2.11 «фильтрация
 * обновляет как таблицу, так и соответствующую диаграмму» — jadval ham,
 * diagrammalar ham AYNAN shu bitta javobdan chiziladi.
 */

/** Filtrlar ro'yxati va katalog sessiya davomida o'zgarmaydi — uzoq `staleTime`. */
export function useStatisticsMeta() {
  return useQuery<StatisticsMeta>({
    queryKey: ['statistics-meta'],
    queryFn: fetchStatisticsMeta,
    staleTime: 30 * 60_000,
    // 403 = bu rol hisobot ko'ra olmaydi; qayta urinish faqat kechikish qo'shadi.
    retry: false,
  })
}

export function useStatisticsReport(params: ReportParams, enabled = true) {
  return useQuery<StatisticsReport>({
    queryKey: ['statistics-report', params],
    queryFn: () => fetchStatisticsReport(params),
    enabled,
    retry: false,
    // Filtr o'zgarganda ekran bo'shab ketmasin — eski jadval yangisi kelguncha turadi.
    placeholderData: (prev) => prev,
  })
}

/** Katalog hisoboti — faqat «Shakllantirish» bosilganda (`body` = null — hali so'ralmagan). */
export function useCatalogReport(body: Record<string, unknown> | null) {
  return useQuery<CatalogResult>({
    queryKey: ['statistics-catalog-report', body],
    queryFn: () => fetchCatalogReport(body ?? {}),
    enabled: !!body,
    retry: false,
  })
}

export function useDashboard(params: DashboardParams, enabled = true) {
  return useQuery<StatisticsDashboard>({
    queryKey: ['statistics-dashboard', params],
    queryFn: () => fetchDashboard(params),
    enabled,
    retry: false,
    placeholderData: (prev) => prev,
  })
}

/**
 * Shablonlar. `reportCode` berilsa — shu katalog hisobotiniki (server filtri
 * `?report_code=`); berilmasa — hammasi, konstruktor esa o'zinikini (kodsiz
 * yoki `requests`) mijozda ajratadi.
 */
export function useReportTemplates(reportCode?: string, enabled = true) {
  return useQuery<ReportTemplate[]>({
    queryKey: ['statistics-templates', reportCode ?? null],
    queryFn: () => fetchTemplates(reportCode),
    enabled,
    retry: false,
  })
}

/** Shablon yaratish/o'chirish — ikkalasi ham barcha shablon ro'yxatlarini qayta so'raydi. */
export function useTemplateMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['statistics-templates'] })
  return {
    save: useMutation({
      mutationFn: (data: TemplateInput) => createTemplate(data),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => deleteTemplate(id),
      onSuccess: invalidate,
    }),
  }
}

/**
 * Statistikadagi filial filtri — `branch_id` qiymati.
 *
 * `raw` — sahifadagi filial tanlovi: `''` = shapkadagi filial (sukut),
 * `'all'` = barcha (ko'lamdagi) filiallar, aks holda filial id. Shapka
 * filiali o'zgarsa, alohida tanlanmagan filtr unga ergashadi.
 */
export const ALL_BRANCHES = 'all'

export function useStatBranch(raw: string) {
  const selected = useBranchStore((s) => s.selectedBranchId)
  const branches = useBranchStore((s) => s.branches)
  const branchId: number | null = raw === ALL_BRANCHES ? null : raw ? Number(raw) : selected
  const selectValue = raw || (selected ? String(selected) : ALL_BRANCHES)
  return { branchId, selectValue, branches }
}
