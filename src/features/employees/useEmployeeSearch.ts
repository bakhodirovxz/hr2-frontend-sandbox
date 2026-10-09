import { useInfiniteQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { EMPLOYEE_PICKER_OPTIONS } from '@/api/endpoints'
import { useDebounce } from '@/hooks/useDebounce'
import type { Page } from './useEmployees'
import type { SelectOption } from '@/components/ui/Select'

/** One row of `/employees/options` — PII'siz yengil tanlagich qatori. */
export type GuestEmployeeOption = {
  id: number
  legal_name?: string | null
  photo_path?: string | null
  job_position_name?: string | null
  department_name?: string | null
  organization_branch_id?: number | null
  /** Filial nomi — mehmon kartasidagi "Tashkilot". */
  organization_name?: string | null
}

/** One page of results is plenty for a picker; the query narrows it. */
const PAGE = 50

/**
 * Mehmon formasi uchun xodim tanlagichi — SERVER tomonida qidiriladi va
 * BARCHA filiallarni qamraydi.
 *
 * NEGA `/employees` EMAS (foydalanuvchi xabari 2026-08-22 — "mehmon qo'shishda
 * filial to'silib qolibdi"): xodimlar ro'yxati ataylab filial bo'yicha
 * cheklangan (PII), shu bois oddiy xodim boshqa filialni tanlaganda ro'yxat
 * deyarli bo'sh kelardi — holbuki modulning maqsadi aynan boshqa filialdan
 * kelgan hamkasbni mehmon qilib rasmiylashtirish. `/employees/options`
 * PII bermaydi (telefon ham yo'q — uni server mehmon yozuviga o'zi ko'chiradi).
 *
 * `branchId === null` — "barcha filiallar": kalit yuborilmaydi, shu bois axios
 * interceptori global tanlangan filialni ham qo'shmaydi.
 */
export function useEmployeeSearch(branchId: number | null, enabled: boolean, search: string) {
  const debounced = useDebounce(search, 250)

  // Paged (2026-09-25): the picker held the first 50 of ~2 300 people and
  // stopped — nobody past «Abd…» could be found without typing. Scrolling to
  // the end of the list now fetches the next page.
  const q = useInfiniteQuery({
    queryKey: ['guest-employee-search', branchId, debounced],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      apiGet<Page<GuestEmployeeOption>>(
        EMPLOYEE_PICKER_OPTIONS,
        {
          organization_branch_id: branchId || undefined,
          search: debounced || undefined,
          size: PAGE,
          page: pageParam,
        },
        { signal },
      ),
    getNextPageParam: (last) => (last.page != null && last.pages != null && last.page < last.pages ? last.page + 1 : undefined),
    enabled,
    placeholderData: (prev) => prev,
  })

  const employees = q.data?.pages.flatMap((p) => p.items ?? []) ?? []
  const options: SelectOption[] = employees.map((emp) => ({
    value: String(emp.id),
    label: emp.legal_name ?? '',
    photo: emp.photo_path ?? undefined,
    subLabel: [emp.job_position_name, emp.organization_name].filter(Boolean).join(' · '),
  }))

  return {
    options,
    employees,
    loading: q.isFetching,
    hasMore: !!q.hasNextPage,
    loadMore: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage()
    },
  }
}
