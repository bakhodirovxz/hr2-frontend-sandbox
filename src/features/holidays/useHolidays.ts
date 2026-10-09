import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs, { type Dayjs } from 'dayjs'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { HOLIDAYS_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import { toItems, type ListResponse } from '@/types'

/**
 * Bayram (TZ I2) — hr-backend-sandbox'da `work_schedule_days` yozuvi
 * (`schedule_type='holiday'`): nom, oraliq, har yilgi takror va ko'lam —
 * bitta tashkilot (`organization_branch_id`) yoki butun tizim (`null`).
 */
export interface Holiday {
  id: number
  name: string
  date_from: string
  date_to: string
  is_repeatable: boolean
  organization_branch_id?: number | null
}

/**
 * `GET /holidays` — SAHIFALANMAGAN ro'yxat: o'z tashkiloti(lari) va umumiy
 * bayramlar. `organization_branch_id` berilsa server FAQAT shu filialnikini
 * qaytaradi (umumiylarini emas), shuning uchun filial ichida kesish shu yerda.
 */
function useAllHolidays() {
  const q = useQuery({
    queryKey: ['holidays', 'all'],
    queryFn: () => apiGet<ListResponse<Holiday>>(HOLIDAYS_LIST, { _no_branch_inject: true }),
    staleTime: 5 * 60_000,
  })
  return { all: useMemo(() => toItems(q.data), [q.data]), query: q }
}

/** Ko'lam bo'yicha: filial tanlangan bo'lsa — uning va umumiy bayramlar. */
export function holidaysForBranch(list: Holiday[], branchId: number | null | undefined): Holiday[] {
  if (!branchId) return list
  return list.filter((h) => h.organization_branch_id == null || Number(h.organization_branch_id) === Number(branchId))
}

/** Bayramlar ro'yxati sahifasi uchun (tanlangan filial ko'lamida). */
export function useHolidayList() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const { all, query } = useAllHolidays()
  const rows = useMemo(
    () => [...holidaysForBranch(all, branchId)].sort((a, b) => (a.date_from < b.date_from ? 1 : a.date_from > b.date_from ? -1 : 0)),
    [all, branchId],
  )
  return { rows, loading: query.isLoading, error: query.error, refetch: query.refetch }
}

/**
 * Kalendar kataklarini belgilash uchun. `forBranchId` — xodimning O'Z
 * filiali (shaxsiy kalendar), aks holda tanlangan filial. Oraliq server
 * tomonda kesilmaydi; `holidayOn` sanani o'zi solishtiradi.
 */
export function useHolidayRange(_from?: string, _to?: string, forBranchId?: number | null) {
  const selected = useBranchStore((s) => s.selectedBranchId)
  const { all } = useAllHolidays()
  const branchId = forBranchId ?? selected
  return useMemo(() => holidaysForBranch(all, branchId), [all, branchId])
}

/**
 * `day` ga to'g'ri keladigan bayram. Har yili takrorlanadigani (Navro'z)
 * oy+kun bo'yicha solishtiriladi — u bitta yil bilan saqlanadi.
 */
export function holidayOn(holidays: Holiday[], day: Dayjs): Holiday | undefined {
  const iso = day.format('YYYY-MM-DD')
  return holidays.find((h) => {
    if (!h.date_from || !h.date_to) return false
    const from = dayjs(h.date_from)
    const to = dayjs(h.date_to)
    if (h.is_repeatable) {
      const md = (d: Dayjs) => d.month() * 100 + d.date()
      const cell = md(day)
      const a = md(from)
      const b = md(to)
      // Yil oxiridan o'tadigan oraliq (30.12–02.01) ikkala tomonda ham mos.
      return a <= b ? cell >= a && cell <= b : cell >= a || cell <= b
    }
    return iso >= from.format('YYYY-MM-DD') && iso <= to.format('YYYY-MM-DD')
  })
}

export function useHolidayMutations() {
  const qc = useQueryClient()
  // Bayram tabelni ham o'zgartiradi (kelmadi/kechikish sanalmaydi).
  const done = () => {
    qc.invalidateQueries({ queryKey: ['holidays'] })
    qc.invalidateQueries({ queryKey: ['attendance'] })
  }
  return {
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost<Holiday>(HOLIDAYS_LIST, body), onSuccess: done }),
    // Tahrir — PATCH (PUT sandboxda 405). Tanada `organization_branch_id`
    // bo'lmasa server bayramning ko'lamini saqlaydi.
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<Holiday>(`${HOLIDAYS_LIST}/${id}`, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${HOLIDAYS_LIST}/${id}`), onSuccess: done }),
  }
}
