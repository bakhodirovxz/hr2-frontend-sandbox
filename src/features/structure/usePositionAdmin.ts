import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import i18n from 'i18next'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { fetchAllPages } from '@/api/fetchAll'
import { JOB_POSITIONS_LIST, STAFF_POSITIONS } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import { useBranchStore } from '@/store/branchStore'
import { useDictionaryOptions, type DictionaryEntry } from '@/features/dictionaries/useDictionaries'
import { toCyrillic } from '@/i18n/translit'
import type { SelectOption } from '@/components/ui/Select'
import type { JobPosition } from './useStructure'
import type { DepartmentChangeLogEntry } from './useDepartmentAdmin'

/**
 * «Lavozimlar» boshqaruv sahifasi (TZ 4.2.6 · 2043–2058) uchun ma'lumot qatlami.
 *
 * `GET /job-positions` sahifalanmagan massiv qaytaradi; saralash va filtr
 * (`sort`, `order`, `category`, `department_id`, `search`) SERVERDA, sahifalash
 * mijozda. Kalit `structure-positions` bilan boshlanadi — «Nom qoidalari»
 * ommaviy qo'llashi (`useNamingRule`) shu kalitni yangilaydi.
 */

export interface PositionRow extends JobPosition {
  id: number
  base_name?: string | null
  extra?: { attributes?: Record<string, unknown> | null; change_log?: DepartmentChangeLogEntry[] } | null
}

export type PositionSort = 'name' | 'category' | 'grade' | 'department'

export interface OccupancyRow {
  employee?: { id: number; name?: string | null } | null
  job_position?: { id: number; name?: string | null } | null
  department?: { id: number; name?: string | null } | null
  from?: string | null
  to?: string | null
  basis?: string | { label?: string | null; number?: string | null } | null
}

const POS_KEY = 'structure-positions'

export function usePositionsList(params: {
  search: string
  category: string
  departmentId: string
  sort: PositionSort
  order: 'asc' | 'desc'
}) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  return useQuery({
    queryKey: [POS_KEY, 'admin', branchId, params],
    queryFn: async () =>
      toItems(
        await apiGet<ListResponse<PositionRow>>(JOB_POSITIONS_LIST, {
          organization_branch_id: branchId || undefined,
          search: params.search.trim() || undefined,
          category: params.category || undefined,
          department_id: params.departmentId || undefined,
          sort: params.sort,
          order: params.order,
        }),
      ),
    placeholderData: (prev) => prev,
  })
}

export function usePositionDetail(id: number | null) {
  return useQuery({
    queryKey: [POS_KEY, 'detail', id],
    queryFn: () => apiGet<PositionRow>(`${JOB_POSITIONS_LIST}/${id}`),
    enabled: id != null,
  })
}

/** TZ 2058 «Egallash tarixi» — kim, qachondan qachongacha, qaysi asosda. */
export function useOccupancyHistory(id: number | null) {
  return useQuery({
    queryKey: [POS_KEY, 'occupancy', id],
    queryFn: async () =>
      toItems(await apiGet<ListResponse<OccupancyRow>>(`${JOB_POSITIONS_LIST}/${id}/occupancy-history`)),
    enabled: id != null,
  })
}

/**
 * Lavozim → u shtatga kiritilgan bo'limlar (shtat jadvalidan) — v1 dagi
 * «Bo'lim» ustuni. Lavozim yozuvining o'zida bo'lim yo'q.
 */
export function usePositionDepartments() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['staff-positions', 'pos-admin-map', branchId],
    queryFn: () =>
      fetchAllPages<{ job_position_id?: number | null; department_id?: number | null; department_name?: string | null }>(
        STAFF_POSITIONS,
        { organization_branch_id: branchId || undefined },
      ),
    staleTime: 5 * 60_000,
  })
  return useMemo(() => {
    const map = new Map<number, Map<number, string>>()
    for (const r of q.data ?? []) {
      if (!r.job_position_id || !r.department_id) continue
      if (!map.has(r.job_position_id)) map.set(r.job_position_id, new Map())
      map.get(r.job_position_id)!.set(r.department_id, r.department_name || `#${r.department_id}`)
    }
    return map
  }, [q.data])
}

export function usePositionAdminMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [POS_KEY] })
    void qc.invalidateQueries({ queryKey: ['job-positions'] })
    void qc.invalidateQueries({ queryKey: ['structure-history'] })
  }
  const meta = { silent: true }
  return {
    create: useMutation({
      meta,
      mutationFn: (body: Record<string, unknown>) => apiPost<PositionRow>(JOB_POSITIONS_LIST, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      meta,
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<PositionRow>(`${JOB_POSITIONS_LIST}/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      meta,
      mutationFn: (id: number) => apiDelete(`${JOB_POSITIONS_LIST}/${id}`),
      onSuccess: invalidate,
    }),
  }
}

/** Ma'lumotnoma yozuvining joriy tildagi nomi. */
export function entryLabel(e: Pick<DictionaryEntry, 'name' | 'name_ru' | 'code'>): string {
  const lang = i18n.language
  if (lang === 'ru' && e.name_ru) return e.name_ru
  if (lang === 'uz_cyrl') return toCyrillic(e.name || e.code)
  return e.name || e.code
}

const FALLBACK_CATEGORIES = ['rahbar', 'mutaxassis', 'xizmatchi', 'ishchi'] as const

/**
 * Lavozim toifalari — «Lavozim toifalari» (`position_categories`)
 * ma'lumotnomasidan; u bo'sh bo'lsa avvalgi to'rt toifa. Joriy qiymat
 * ro'yxatda bo'lmasa ham ko'rinib turadi.
 */
export function usePositionCategories(current?: string | null) {
  const { t } = useTranslation()
  const { options: entries } = useDictionaryOptions('position_categories')
  return useMemo(() => {
    const base: SelectOption[] = entries.length
      ? entries.map((e) => ({ value: e.code, label: entryLabel(e) }))
      : FALLBACK_CATEGORIES.map((c) => ({ value: c, label: t(`staff.cat_${c}`) }))
    const options =
      current && !base.some((o) => o.value === current) ? [...base, { value: current, label: current }] : base
    const labelOf = (code?: string | null) => (code ? options.find((o) => o.value === code)?.label ?? code : '')
    return { options, labelOf }
  }, [entries, current, t])
}
