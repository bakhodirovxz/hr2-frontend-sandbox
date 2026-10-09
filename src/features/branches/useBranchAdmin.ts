import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { ORGANIZATION_BRANCHES, ORGANIZATION_BRANCH_DETAIL } from '@/api/endpoints'

/**
 * Tashkilotlar (filiallar) — TZ 4.2.6 «УГЭ и все его подведомственные
 * организации, включая ООО, АО, НОУ, СП, Филиалы».
 *
 * `GET /organization-branches` (har biri bilan bo'lim/xodim soni),
 * `POST` / `DELETE` — faqat tizim administratori (`_require_manager`),
 * `PATCH /{pk}` — filial administratori faqat o'z filialini; mulkchilik
 * shakli va hudud kodlari `structure: edit` talab qiladi.
 */

export const OWNERSHIP_FORMS = ['ca', 'sp', 'ao', 'ooo', 'nou', 'filial'] as const
export type OwnershipForm = (typeof OWNERSHIP_FORMS)[number]

export interface BranchRow {
  id: number
  name: string
  region?: string | null
  address?: string | null
  ownership_form?: OwnershipForm | string | null
  region_code?: string | null
  district_code?: string | null
  created_at?: string | null
  department_count?: number | null
  employee_count?: number | null
}

export interface BranchPayload {
  name?: string
  region?: string | null
  address?: string | null
  ownership_form?: string | null
  region_code?: string | null
  district_code?: string | null
}

/** O'z kalitida: sarlavhadagi tanlagich `['organization-branches', 'slim']` ni
 *  o'qiydi — prefiks bo'yicha bekor qilish ikkalasini ham yangilaydi. */
const KEY = ['organization-branches', 'full'] as const
const NB = { _no_branch_inject: true }

export function useBranchAdmin() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => apiGet<BranchRow[]>(ORGANIZATION_BRANCHES, NB),
  })
  const done = () => qc.invalidateQueries({ queryKey: ['organization-branches'] })
  return {
    query: q,
    branches: Array.isArray(q.data) ? q.data : [],
    create: useMutation({
      mutationFn: (body: BranchPayload) => apiPost<BranchRow>(ORGANIZATION_BRANCHES, body, { params: NB }),
      onSuccess: done,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: BranchPayload }) =>
        apiPatch<BranchRow>(ORGANIZATION_BRANCH_DETAIL(id), body, { params: NB }),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(ORGANIZATION_BRANCH_DETAIL(id), { params: NB }),
      onSuccess: done,
    }),
  }
}

/** Hujjatlarda shahar sifatida ishlatiladigan matnli viloyat (v1 `UZ_REGIONS`). */
export const UZ_REGIONS = [
  "Qoraqalpog'iston Respublikasi",
  'Andijon viloyati',
  'Buxoro viloyati',
  "Farg'ona viloyati",
  'Jizzax viloyati',
  'Xorazm viloyati',
  'Namangan viloyati',
  'Navoiy viloyati',
  'Qashqadaryo viloyati',
  'Samarqand viloyati',
  'Sirdaryo viloyati',
  'Surxondaryo viloyati',
  'Toshkent viloyati',
  'Toshkent shahri',
] as const
