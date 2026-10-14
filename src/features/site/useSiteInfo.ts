import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { publicClient } from '@/api/client'
import { apiPost, apiPut } from '@/api/http'
import { toCyrillic } from '@/i18n/translit'

/**
 * Tizim egasi va aloqa ma'lumotlari (TZ 439, 442, GEN-6): shapkadagi yordam
 * telefoni, pastki paneldagi egasi/manzil, kontaktlar sahifasi va tashriflar
 * hisoblagichi. `GET /site/info` OCHIQ — login sahifasining pastki paneli ham
 * shundan o'qiydi, shuning uchun tokensiz `publicClient` bilan.
 */
export interface SiteContact {
  label: string
  /** Russian label; empty — the Uzbek one is shown. */
  label_ru?: string
  value: string
}

export interface SiteInfo {
  owner_name: string
  /** Russian form of the holder's name / address (TZ 1773 three languages). */
  owner_name_ru?: string
  owner_address: string
  owner_address_ru?: string
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

/**
 * Site text in the interface language: Russian from the `*_ru` field,
 * Uzbek Cyrillic transliterated from the Uzbek Latin value.
 */
export function siteText(lang: string, uz: string | null | undefined, ru?: string | null): string {
  const base = uz ?? ''
  if (lang === 'ru') return ru || base
  if (lang === 'uz_cyrl') return toCyrillic(base)
  return base
}
