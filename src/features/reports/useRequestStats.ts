import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { SERVICE_REQUEST_STATISTICS } from '@/api/endpoints'

/**
 * Murojaatlar statistikasi — TZ 4.2.11.
 *
 * Backend (sana × tur × holat → soni) YIG'MASINI qaytaradi. Jadval, uchala
 * diagramma va eksport AYNAN shu bitta to'plamdan chiziladi — aks holda filtr
 * bir ko'rinishga qo'llanib, ikkinchisida qolib ketardi («Фильтрация обновляет
 * как таблицу, так и соответствующую диаграмму»).
 */

export interface RequestStatRow {
  date: string
  service_type: string
  service_label: string
  status: string
  status_label: string
  count: number
}

interface RequestStats {
  rows: RequestStatRow[]
  service_types: { value: string; label: string }[]
  statuses: { value: string; label: string }[]
}

interface RequestStatsQuery {
  date_from?: string
  date_to?: string
  service_type?: string
  status?: string
  organization_branch_id?: number | null
}

export function useRequestStats(
  query: RequestStatsQuery,
  { enabled = true }: { enabled?: boolean } = {},
) {
  return useQuery({
    // `enabled: false` while the date range is inverted (from > to).
    enabled,
    queryKey: ['request-stats', query],
    queryFn: () =>
      apiGet<RequestStats>(SERVICE_REQUEST_STATISTICS, {
        date_from: query.date_from || undefined,
        date_to: query.date_to || undefined,
        service_type: query.service_type || undefined,
        status: query.status || undefined,
        organization_branch_id: query.organization_branch_id || undefined,
      }),
    // 403 = ko'rib chiquvchi roli emas; qayta urinish faqat kechikish qo'shadi.
    retry: false,
  })
}
