import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { publicClient } from '@/api/client'
import { apiPost, apiPut } from '@/api/http'

/**
 * Tizim egasi va aloqa ma'lumotlari (TZ 439, 442, GEN-6): shapkadagi yordam
 * telefoni, pastki paneldagi egasi/manzil, kontaktlar sahifasi va tashriflar
 * hisoblagichi. `GET /site/info` OCHIQ — login sahifasining pastki paneli ham
 * shundan o'qiydi, shuning uchun tokensiz `publicClient` bilan.
 */
export interface SiteContact {
  label: string
  value: string
}

export interface SiteInfo {
  owner_name: string
  owner_address: string
  support_phone: string
  support_email: string
  contacts: SiteContact[]
  /** Muvaffaqiyatli kirishlar soni: bugun / jami. */
  visits?: { today: number; total: number }
}

const KEY = ['site-info'] as const

export function useSiteInfo() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => publicClient.get<SiteInfo>('site/info').then((r) => r.data),
    staleTime: 5 * 60_000,
    retry: 1,
    meta: { silent: true },
  })
}

/** Faqat butun tizim administratori (`PUT /site/info`). */
export function useUpdateSiteInfo() {
  const qc = useQueryClient()
  return useMutation({
    // Butun tizim ma'lumoti — shapkadagi filial unga qo'shilmaydi.
    mutationFn: (body: Omit<SiteInfo, 'visits'>) =>
      apiPut<SiteInfo>('site/info', body, { params: { _no_branch_inject: true } }),
    // Xatoni chaqiruvchi shaklda ko'rsatadi (kontaktlar sahifasi).
    meta: { silent: true },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  })
}

/** «Qayta aloqa» (TZ 439) — administratorga bildirishnoma bo'lib boradi. */
export function useSendFeedback() {
  return useMutation({
    mutationFn: (body: { subject?: string; message: string; page?: string }) =>
      apiPost<{ ok?: boolean }>('feedback', body),
  })
}

/** `tel:` havolasi uchun: raqamdan bo'shliq, qavs va chiziqcha olib tashlanadi. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
