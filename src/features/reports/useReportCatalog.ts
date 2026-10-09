import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { REPORTS_CATALOG } from '@/api/endpoints'
import type { ReportCatalogItem } from './types'

interface CatalogResponse {
  items: ReportCatalogItem[]
  roles: string[]
}

/** Reports the caller may run, grouped by category (server-decided). */
export function useReportCatalog(enabled = true) {
  const q = useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: () => apiGet<CatalogResponse>(REPORTS_CATALOG),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  })
  const items = q.data?.items ?? []
  const byCategory = {
    attendance: items.filter((i) => i.category === 'attendance'),
    hr: items.filter((i) => i.category === 'hr'),
    kpi: items.filter((i) => i.category === 'kpi'),
  }
  return { ...q, items, byCategory, roles: q.data?.roles ?? [] }
}
