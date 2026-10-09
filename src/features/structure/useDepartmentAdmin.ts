import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { DEPARTMENTS_LIST } from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'
import { useBranchStore } from '@/store/branchStore'
import type { Department } from './useStructure'

/**
 * «Bo'limlar» boshqaruv sahifasi (TZ S1, S2, 4.2.6) uchun ma'lumot qatlami.
 *
 * Ro'yxat BUTUNLIGICHA olinadi (sahifalanmagan `GET /departments`): «Yuqori
 * bo'lim» ustuni, ota tanlagichi (sikl tekshiruvi) va «Qayta tuzish» ustasi
 * butun daraxtni bilishi kerak. Qidiruv va sahifalash mijozda.
 */

export interface DepartmentChangeLogEntry {
  at?: string | null
  by?: { user_id?: number | null; name?: string | null } | string | null
  field?: string | null
  old?: unknown
  new?: unknown
  old_label?: string | null
  new_label?: string | null
  basis_number?: string | null
  basis_date?: string | null
  change_reason?: string | null
}

export interface DepartmentExtra {
  functions?: string | null
  established_at?: string | null
  attributes?: Record<string, unknown> | null
  change_log?: DepartmentChangeLogEntry[]
}

export interface DepartmentRow extends Department {
  id: number
  parent_id?: number | null
  staff_count?: number | null
}

export interface DepartmentDetail extends DepartmentRow {
  parent_name?: string | null
  extra?: DepartmentExtra | null
  employees?: { id: number; legal_name?: string | null }[] | null
}

export interface Basis {
  number: string
  date: string
}

export const DEPT_ADMIN_KEY = 'dept-admin'

/** Butun bo'limlar ro'yxati — tanlangan filial bo'yicha. */
export function useDepartmentsAll(includeClosed: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  return useQuery({
    queryKey: [DEPT_ADMIN_KEY, 'list', branchId, includeClosed],
    queryFn: async () =>
      toItems(
        await apiGet<ListResponse<DepartmentRow>>(DEPARTMENTS_LIST, {
          organization_branch_id: branchId || undefined,
          include_closed: includeClosed || undefined,
        }),
      ),
    placeholderData: (prev) => prev,
  })
}

/** Bitta bo'lim — `extra` (funksiyalar, sana, atributlar, `change_log`) bilan. */
export function useDepartmentDetail(id: number | null) {
  return useQuery({
    queryKey: [DEPT_ADMIN_KEY, 'detail', id],
    queryFn: () => apiGet<DepartmentDetail>(`${DEPARTMENTS_LIST}/${id}`),
    enabled: id != null,
  })
}

export function useDepartmentAdminMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [DEPT_ADMIN_KEY] })
    // /structure jadvali va barcha tanlagichlar ham shu bo'limlarni o'qiydi.
    void qc.invalidateQueries({ queryKey: ['structure-departments'] })
    void qc.invalidateQueries({ queryKey: ['departments'] })
    // «Sana bo'yicha» suratlar har yozuvda yangilanadi.
    void qc.invalidateQueries({ queryKey: ['structure-history'] })
  }
  // Xato formaning o'zida (maydon yonida) ko'rsatiladi — global toast takrorlamasin.
  const meta = { silent: true }
  return {
    invalidate,
    create: useMutation({
      meta,
      mutationFn: (body: Record<string, unknown>) => apiPost<DepartmentDetail>(DEPARTMENTS_LIST, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      meta,
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<DepartmentDetail>(`${DEPARTMENTS_LIST}/${id}`, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      meta,
      mutationFn: (id: number) => apiDelete(`${DEPARTMENTS_LIST}/${id}`),
      onSuccess: invalidate,
    }),
    /** TZ 4.2.6 «Сокращение подразделений» — sabab va asos buyrug'i majburiy. */
    setClosed: useMutation({
      meta,
      mutationFn: ({ id, mode, reason, basis }: { id: number; mode: 'close' | 'reopen'; reason: string; basis: Basis }) =>
        apiPost<DepartmentDetail>(`${DEPARTMENTS_LIST}/${id}/${mode}`, {
          reason,
          basis_number: basis.number.trim(),
          basis_date: basis.date,
        }),
      onSuccess: invalidate,
    }),
    /** TZ 4.2.6 «Массовая корректировка данных при изменении структуры». */
    restructure: useMutation({
      meta,
      mutationFn: (body: {
        moves: { department_id: number; new_parent_id: number | null }[]
        renames: { department_id: number; name: string }[]
        basis_number: string
        basis_date: string
      }) => apiPost(`${DEPARTMENTS_LIST}/restructure`, body),
      onSuccess: () => {
        invalidate()
        // Lavozim nomlari qoidaga ko'ra qayta yig'iladi.
        void qc.invalidateQueries({ queryKey: ['structure-positions'] })
        void qc.invalidateQueries({ queryKey: ['job-positions'] })
      },
    }),
  }
}
