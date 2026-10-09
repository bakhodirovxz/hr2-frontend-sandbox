import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/api/http'
import { MOBILE_CHECKINS, MOBILE_CHECKIN_CANCEL } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from '@/features/employees/useEmployees'
import type { Employee } from '@/types'

/**
 * TELEFONDAN «KELDIM» (2026-10-06).
 *
 * Face ID terminali yo'q filial/GESga xizmat safariga borgan xodim telefonidan
 * rasm, vaqt va joylashuv bilan belgi qo'yadi; belgi davomatga oddiy turniket
 * o'tishi bo'lib tushadi («Mobil ilova» qurilmasi). Belgini FAQAT kadr
 * vaqtinchalik buyruqdan qo'ygan xizmat safari ochadi. Manzildan uzoqdagi
 * belgi rad etilmaydi — `is_far` bilan ko'rsatiladi, kadr bekor qiladi.
 */

/** Hodisaga biriktirilgan qismi (jonli lenta, day-board, WS). */
export interface EventMobileCheckin {
  id: number
  status: 'active' | 'cancelled'
  latitude: number
  longitude: number
  accuracy_m?: number | null
  /** Manzil nuqtasigacha, metr; manzil koordinatasi bo'lmasa null. */
  distance_m?: number | null
  is_far: boolean
  map_url: string
  received_at?: string | null
  work_leave_id?: number | null
  destination_branch?: { id: number; name?: string | null } | null
  /** Masofa o'lchangan nuqta: safar manzilining yoki (manzilsiz safarda) barcha filial/GES nuqtalarining eng yaqini. */
  nearest_location?: { id: number; name?: string | null; organization_branch?: { id: number; name?: string | null } | null } | null
}

/** «GES-28 (O'rta Chirchiq…)» — where the mark was measured to. */
export function placeLabel(m: Pick<EventMobileCheckin, 'nearest_location' | 'destination_branch'>): string | null {
  const loc = m.nearest_location
  if (loc?.name) {
    const branch = loc.organization_branch?.name
    return branch && branch !== loc.name ? `${loc.name} · ${branch}` : loc.name
  }
  return m.destination_branch?.name ?? null
}

export interface MobileCheckin extends EventMobileCheckin {
  employee_id: number
  employee?: Employee | null
  direction_type: 'entrance' | 'exit' | string
  happen_time: string
  cancelled_at?: string | null
  cancel_reason?: string | null
  cancelled_by?: { id: number; legal_name?: string | null } | null
  event_id?: number | null
  photo_path?: string | null
  photo_thumb_path?: string | null
}

export type CheckinStatusFilter = '' | 'active' | 'cancelled'

/** Bekor qilingan belgining hodisasi jonli lentadan (soket nusxasi ham) olib tashlansin. */
export const CHECKIN_CANCELLED_EVENT = 'hrm:mobile-checkin-cancelled'

/** 38 → «38 m», 1240 → «1,2 km». */
export function formatDistance(m?: number | null): string | null {
  if (m == null) return null
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`
}

export function useMobileCheckins(params: {
  search?: string
  from?: string
  to?: string
  status?: CheckinStatusFilter
  farOnly?: boolean
  page: number
  size: number
}, { enabled = true }: { enabled?: boolean } = {}) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    enabled,
    queryKey: [MOBILE_CHECKINS, { ...params, branchId }],
    queryFn: () =>
      apiGet<Page<MobileCheckin>>(MOBILE_CHECKINS, {
        page: params.page,
        size: params.size,
        organization_branch_id: branchId || undefined,
        search: params.search || undefined,
        date_from: params.from || undefined,
        date_to: params.to || undefined,
        status: params.status || undefined,
        far_only: params.farOnly || undefined,
      }),
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useCancelCheckin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiPost<MobileCheckin>(MOBILE_CHECKIN_CANCEL(id), { reason }),
    onSuccess: (_row, vars) => {
      qc.invalidateQueries({ queryKey: [MOBILE_CHECKINS] })
      // Hodisa o'chdi — doska va tabel qayta hisoblansin.
      qc.invalidateQueries({ queryKey: ['dashboard', 'day-board'] })
      qc.invalidateQueries({ queryKey: ['attendance'] })
      window.dispatchEvent(new CustomEvent(CHECKIN_CANCELLED_EVENT, { detail: { checkinId: vars.id } }))
    },
  })
}
