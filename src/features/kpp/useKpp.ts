import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { VISITORS_LIST, VISITOR_TURNSTILE_ATTENDANCE } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import type { Guest } from '@/features/guests/useGuests'
import { todayIso } from '@/lib/today'

/** Bitta mehmon o'tishi (turniket hodisasi). */
export interface VisitorEvent {
  id?: number
  event_id?: number | string
  visitor_id?: number
  happen_time?: string
  direction_type?: string
  organization_branch_id?: number
  visitor?: {
    id?: number
    legal_name?: string | null
    photo_path?: string | null
    /** 32px avatar — see Visitor.photo_thumb_path on the server. */
    photo_thumb_path?: string | null
  } | null
  turnstile?: { display_name?: string | null; acs_dev_name?: string | null } | null
  /** Faqat jonli lentadan kelgan yozuvda bo'ladi. */
  is_live?: boolean
}

/**
 * KPP post ro'yxati — server uni KPP ning BIRIKTIRILGAN filiallari bo'yicha
 * o'zi cheklaydi, mijoz filial parametrini yubormaydi.
 */
export function useKppVisitors(search: string, visit?: string, branchId?: number | null) {
  const q = useQuery({
    queryKey: ['kpp', 'visitors', search, visit ?? '', branchId ?? null],
    queryFn: async () =>
      toItems(
        await apiGet<ListResponse<Guest>>(VISITORS_LIST, {
          search: search || undefined,
          // today | yesterday | never — filtered on the server (2026-09-26).
          visit: visit || undefined,
          // Only among the post's own branches; the server scopes anyway.
          organization_branch_id: branchId || undefined,
          size: 200,
        }),
      ),
    placeholderData: (prev) => prev,
  })
  return { visitors: q.data ?? [], loading: q.isLoading, refetch: q.refetch }
}

/** Bugungi mehmon o'tishlari (tanlangan mehmon bo'lsa — faqat uniki). */
export function useVisitorEvents(day: string, visitorId: number | null) {
  const q = useQuery({
    queryKey: ['kpp', 'events', day, visitorId],
    queryFn: async () =>
      toItems(
        await apiGet<ListResponse<VisitorEvent>>(VISITOR_TURNSTILE_ATTENDANCE, {
          date_from: day,
          date_to: day,
          visitor_id: visitorId || undefined,
        }),
      ),
    placeholderData: (prev) => prev,
  })
  return { events: q.data ?? [], loading: q.isLoading }
}

/**
 * BUGUNGI SANA, o'zi yangilanadigan.
 *
 * KPP ekrani sutkalab ochiq turadi. Sanani bir marta hisoblab qo'yish tunni
 * o'tkazgan kioskda kechagi hodisalarni ko'rsatib turardi (v1 da aynan shu
 * xato bo'lgan va `useCurrentDay` shuning uchun paydo bo'lgan).
 */
export function useCurrentDay(): string {
  const q = useQuery({
    queryKey: ['kpp', 'today'],
    queryFn: async () => todayIso(),
    // Yarim tunni o'tkazib yubormaslik uchun daqiqada bir marta tekshiramiz.
    refetchInterval: 60_000,
    initialData: () => todayIso(),
  })
  return q.data
}
