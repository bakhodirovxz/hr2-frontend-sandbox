import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTemplate,
  deleteTemplate,
  fetchStatisticsMeta,
  fetchStatisticsReport,
  fetchTemplates,
  type ReportParams,
  type ReportTemplate,
  type StatisticsMeta,
  type StatisticsReport,
  type TemplateInput,
} from './api'

/**
 * Konstruktorning ma'lumot qatlami.
 *
 * Hisobot so'rovi PARAMETRLAR bo'yicha keshlanadi: TZ 4.2.11 «фильтрация
 * обновляет как таблицу, так и соответствующую диаграмму» — jadval ham,
 * ikkala diagramma ham AYNAN shu bitta javobdan chiziladi. Agar ular alohida
 * so'rov qilsa, filtr biriga qo'llanib ikkinchisida eskisi qolib ketardi.
 */

/** Filtrlar ro'yxati sessiya davomida o'zgarmaydi — uzoq `staleTime`. */
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
    // Filtr o'zgarganda ekran bo'shab ketmasin — eski jadval yangisi kelguncha
    // turadi, tepada esa yuklanish holati ko'rinadi.
    placeholderData: (prev) => prev,
  })
}

export function useReportTemplates() {
  return useQuery<ReportTemplate[]>({
    queryKey: ['statistics-templates'],
    queryFn: fetchTemplates,
    retry: false,
  })
}

/** Shablon yaratish/o'chirish — ikkalasi ham ro'yxatni qayta so'raydi. */
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
