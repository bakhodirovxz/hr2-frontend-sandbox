import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
import { DEPARTMENTS_LIST } from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'
import type { Page } from '@/features/employees/useEmployees'

const GROUPS = 'navbatchilik-groups'
const DAYS = 'work-schedule-days'

export interface Shift {
  name: string
  start: string
  end: string
}
export interface DutyGroup {
  id: number
  name: string
  organization_branch_id?: number | null
  weekdays: number[]
  shifts: Shift[]
  is_active: boolean
  employees?: { id: number; legal_name?: string | null }[]
  /**
   * VIEWERS see the roster and never write to it — deliberately separate from
   * members: a viewer is given no shift and duty is not counted in their
   * attendance. Typically the head who has to see the schedule.
   */
  viewers?: { id: number; legal_name?: string | null }[]
  departments?: { id: number; name?: string | null }[]
  effective_member_count?: number | null
  /** Set on `/my` rows: the caller only watches this group, never writes to it. */
  is_viewer_only?: boolean | null
  /** Off = only HR fills this roster; members read it. */
  members_can_edit?: boolean | null
}

/** One cell of the roster: a `WorkScheduleDay` row as the API returns it. */
export interface ScheduleDay {
  id: number
  employee_id: number
  schedule_date: string
  schedule_type?: string | null
  working_hours_start?: string | null
  working_hours_end?: string | null
  lunch_start_time?: string | null
  lunch_end_time?: string | null
  is_day_off?: boolean | null
}

export interface DutyMember {
  id: number
  legal_name?: string | null
  phone_number?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
}

export function useDutyGroups() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['duty-groups', branchId],
    queryFn: async () => {
      // ⚠️ 100 — endpointning QAT'IY chegarasi (fastapi-pagination `le=100`).
      // 200 so'ralganda 422 qaytardi va sahifa BO'SH chiqardi: xato emas,
      // "navbatchilik guruhi yo'q" bo'lib ko'rinardi.
      const res = await apiGet<Page<DutyGroup> | DutyGroup[]>(GROUPS, { size: 100 })
      return Array.isArray(res) ? res : res.items
    },
  })
  /* The comment above records what a failed request already cost this page
   * once: it read as "there are no duty groups". Carry the error out so the
   * screen can say which of the two it is. */
  return { groups: q.data ?? [], loading: q.isLoading, error: q.isError ? q.error : null, refetch: q.refetch }
}

/**
 * Groups the current user belongs to (or only watches). `/my` is the employee's
 * own view — a member sees their group's whole roster, a viewer sees it
 * read-only (`is_viewer_only`).
 */
export function useMyDutyGroups(enabled = true) {
  const q = useQuery({
    enabled,
    queryKey: ['duty-groups', 'my'],
    queryFn: () => apiGet<DutyGroup[]>(`${GROUPS}/my`),
  })
  return { groups: q.data ?? [], loading: q.isLoading, error: q.isError ? q.error : null, refetch: q.refetch }
}

/** Every employee of one group — the roster's rows in group mode. */
export function useDutyGroupMembers(groupId: number | null) {
  const q = useQuery({
    enabled: !!groupId,
    queryKey: ['duty-members', groupId],
    queryFn: () => apiGet<DutyMember[]>(`${GROUPS}/${groupId}/members`),
  })
  return { members: q.data ?? [], loading: q.isLoading }
}

/**
 * A month of roster rows.
 *
 * Group and department each have their OWN batch route; the per-employee
 * fallback is a last resort, because a 40-person department otherwise costs 40
 * requests for one screen.
 */
export function useScheduleDays(
  scope: { groupId?: number | null; departmentId?: number | null },
  from: string,
  to: string,
) {
  const key = scope.groupId ? `g${scope.groupId}` : scope.departmentId ? `d${scope.departmentId}` : ''
  const q = useQuery({
    enabled: !!key,
    queryKey: ['duty-days', key, from, to],
    queryFn: () => {
      const url = scope.groupId ? `${DAYS}/group/${scope.groupId}` : `${DAYS}/department/${scope.departmentId}`
      return apiGet<ScheduleDay[]>(url, { date_from: from, date_to: to })
    },
  })
  const map: Record<string, ScheduleDay> = {}
  for (const d of q.data ?? []) map[`${d.employee_id}_${d.schedule_date}`] = d
  return { map, loading: q.isLoading, refetch: q.refetch }
}

export function useScheduleMutations() {
  const qc = useQueryClient()
  return {
    invalidate: () => qc.invalidateQueries({ queryKey: ['duty-days'] }),
    /**
     * `notify_navbatchilik=true` is what tells the employee they were put on
     * duty (push + in-app). Clearing a cell must NOT notify, so the flag rides
     * on the write only.
     */
    create: useMutation({
      mutationFn: ({ body, notify }: { body: Record<string, unknown>; notify?: boolean }) =>
        apiPost<ScheduleDay>(notify ? `${DAYS}?notify_navbatchilik=true` : DAYS, body),
    }),
    update: useMutation({
      mutationFn: ({ id, body, notify }: { id: number; body: Record<string, unknown>; notify?: boolean }) =>
        apiPut<ScheduleDay>(notify ? `${DAYS}/${id}?notify_navbatchilik=true` : `${DAYS}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${DAYS}/${id}`) }),
    bulk: useMutation({
      mutationFn: (rows: Record<string, unknown>[]) => apiPost<{ count: number }>(`${DAYS}/bulk`, rows),
    }),
  }
}

export function useDutyMutations() {
  const qc = useQueryClient()
  return {

    /**
     * NAVBATCHILIK YURITADIGAN BO'LIMLAR.
     *
     * `has_navbatchilik` bo'lim TUZILMASINING bir qismi: u kimning ish
     * jadvalini kim tahrirlashini ham hal qiladi, shu bois darvozasi
     * `_require_structure_manager` + `assert_structure_access`. v2 da bu ikki
     * marshrutga umuman murojaat yo'q edi — ya'ni bo'limni navbatchilikka
     * yoqib ham, rahbar tasdig'ini berib ham bo'lmasdi.
     */
    toggleDeptDuty: useMutation({
      mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
        apiPatch(`${DEPARTMENTS_LIST}/${id}/navbatchilik`, {}, { params: { enabled } }),
    }),
    approveDeptDuty: useMutation({
      mutationFn: (id: number) => apiPatch(`${DEPARTMENTS_LIST}/${id}/navbatchilik/approve`, {}),
    }),
    // Group edits change the roster rows (`duty-members`) and generating
    // writes days (`duty-days`); invalidating only the groups left the roster
    // tab on the old schedule and members.
    invalidate: () => {
      void qc.invalidateQueries({ queryKey: ['duty-members'] })
      void qc.invalidateQueries({ queryKey: ['duty-days'] })
      return qc.invalidateQueries({ queryKey: ['duty-groups'] })
    },
    create: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(GROUPS, body) }),
    // Backend bu resursda FAQAT PUT beradi (navbatchilik_group.py:86) — PATCH
    // 405 qaytarardi, ya'ni v2'da guruh tahriri umuman ishlamasdi.
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPut(`${GROUPS}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${GROUPS}/${id}`) }),
    generate: useMutation({
      mutationFn: ({ id, from, to }: { id: number; from: string; to: string }) =>
        apiPost<{ count: number }>(`${GROUPS}/${id}/generate?date_from=${from}&date_to=${to}`, {}),
    }),
  }
}
