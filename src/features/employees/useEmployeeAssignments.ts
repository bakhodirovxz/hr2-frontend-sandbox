import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/api/http'
import {
  EMPLOYEE_ASSIGNMENT,
  EMPLOYEE_ASSIGNMENTS,
  EMPLOYEE_ASSIGNMENT_CLOSE,
  EMPLOYEE_LOOKUP,
  EMPLOYEE_TRANSFER,
  EMPLOYEE_TRANSFER_ACCEPT,
  EMPLOYEE_TRANSFER_REJECT,
} from '@/api/endpoints'

/**
 * O'RINDOSHLIK (совместительство) — bitta shaxs, bir nechta lavozim.
 *
 * Nega kerak: JSHSHIR tizimda shaxs kaliti (turniket hodisasi → xodim,
 * HikCentral personCode, OneID login), shuning uchun bir odamga ikkinchi xodim
 * kartochkasi ochib bo'lmaydi — «JSHSHIR allaqachon mavjud» aynan shundan
 * chiqardi. Ikkinchi lavozim shu yerdan, alohida "ish o'rni" sifatida
 * yoziladi.
 */

export type EmploymentType = 'main' | 'internal_concurrent' | 'external_concurrent'

export interface AssignmentSummary {
  id: number
  organization_branch_id: number | null
  organization_branch_name: string | null
  department_name: string | null
  job_position_name: string | null
  employment_type: EmploymentType
  stavka: number | null
  start_date: string | null
}

export interface EmployeeLookupResult {
  found: boolean
  employee_id?: number | null
  legal_name?: string | null
  photo_thumb_path?: string | null
  is_archived?: boolean | null
  account_is_active?: boolean | null
  primary_branch_id?: number | null
  primary_branch_name?: string | null
  primary_department_name?: string | null
  primary_job_position_name?: string | null
  assignments?: AssignmentSummary[]
  already_in_my_scope?: boolean
  can_attach?: boolean
  reason?: 'forbidden' | 'archived' | 'already_attached' | null
}

export interface Assignment {
  id: number
  employee_id: number
  organization_branch_id: number | null
  department_id: number | null
  job_position_id: number | null
  employment_type: EmploymentType
  stavka: number | null
  /**
   * Agreed hours instead of days, for a post worked by arrangement.
   * `EmployeeAssignmentRead` returns both; the type had neither, so the edit
   * form could not read back what the create form had written.
   */
  hours_norm: number | null
  hours_period: string | null
  start_date: string | null
  end_date: string | null
  order_reference: string | null
  tabel_number: string | null
  note: string | null
  is_open: boolean | null
  organization_branch?: { id: number; name?: string | null } | null
  department?: { id: number; name?: string | null } | null
  job_position?: { id: number; name?: string | null } | null
}

/** JSHSHIR bo'yicha qidiruv — forma maydonidan chaqiriladi, shuning uchun
 * `enabled` bilan boshqariladigan so'rov emas, oddiy funksiya. */
export async function lookupByPinfl(pinfl: string): Promise<EmployeeLookupResult> {
  return apiGet<EmployeeLookupResult>(EMPLOYEE_LOOKUP, { pinfl })
}

export function useEmployeeAssignments(employeeId: number | null | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ['employee-assignments', employeeId],
    queryFn: () => apiGet<Assignment[]>(EMPLOYEE_ASSIGNMENTS(employeeId as number)),
    enabled: !!employeeId && enabled,
    staleTime: 60_000,
  })
  return { ...query, items: query.data ?? [] }
}

export function useAssignmentMutations() {
  const qc = useQueryClient()

  const invalidate = (employeeId?: number) => {
    void qc.invalidateQueries({ queryKey: ['employee-assignments', employeeId] })
    // Ro'yxat va shtat jadvali ikkalasi ham o'zgaradi: xodim yangi filial
    // ro'yxatida paydo bo'ladi, o'sha (bo'lim, lavozim) bandligi ortadi.
    void qc.invalidateQueries({ queryKey: ['employees'] })
    void qc.invalidateQueries({ queryKey: ['employee-kpi'] })
    void qc.invalidateQueries({ queryKey: ['staff-positions'] })
  }

  const create = useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: number; body: Record<string, unknown> }) =>
      apiPost<Assignment>(EMPLOYEE_ASSIGNMENTS(employeeId), body),
    onSuccess: (_data, { employeeId }) => invalidate(employeeId),
  })

  /**
   * Correct an existing concurrent post in place.
   *
   * ⚠️ `EMPLOYEE_ASSIGNMENT` (the PATCH route) sat in `endpoints.ts` with no
   * caller, so a post entered with the wrong stavka, hour norm or order
   * reference could only be CLOSED and re-created — which loses its start date
   * and leaves a closed row behind for what was really a typo.
   */
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; employeeId?: number; body: Record<string, unknown> }) =>
      apiPatch<Assignment>(EMPLOYEE_ASSIGNMENT(id), body),
    onSuccess: (_data, { employeeId }) => invalidate(employeeId),
  })

  const close = useMutation({
    mutationFn: ({ id, body }: { id: number; employeeId?: number; body?: Record<string, unknown> }) =>
      apiPost<Assignment>(EMPLOYEE_ASSIGNMENT_CLOSE(id), body ?? {}),
    onSuccess: (_data, { employeeId }) => invalidate(employeeId),
  })

  return { create, update, close, invalidate }
}


/**
 * FILIALDAN FILIALGA O'TKAZISH — o'rindoshlikdan boshqa amal.
 *
 * O'rindoshlikda odam ikkala filialda ishlaydi; o'tkazishda uning ASOSIY ish
 * joyi almashadi va u eski filial ro'yxatidan chiqadi. O'tkazish DARHOL
 * kuchga kiradi (qabul qiluvchi kadr kutmaydi), eski filial esa uni o'z
 * ARXIVIDA ko'radi va qabul qiladi yoki rad etadi — rad etilsa hamma narsa
 * avvalgi holiga qaytariladi.
 */
export interface PendingTransferRef {
  id: number
  status: 'applied' | 'accepted' | 'rejected'
  from_branch_id?: number | null
  from_branch_name?: string | null
  to_branch_id?: number | null
  to_branch_name?: string | null
  transfer_date?: string | null
  order_reference?: string | null
  /** Ko'rayotgan kadr qaror qabul qila oladimi (u ESKI filial kadrimi). */
  can_decide: boolean
}

export function useTransferMutations() {
  const qc = useQueryClient()

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['employees'] })
    void qc.invalidateQueries({ queryKey: ['employee-kpi'] })
    void qc.invalidateQueries({ queryKey: ['employees-archived'] })
    void qc.invalidateQueries({ queryKey: ['employee-assignments'] })
    void qc.invalidateQueries({ queryKey: ['staff-positions'] })
  }

  const transfer = useMutation({
    mutationFn: ({ employeeId, body }: { employeeId: number; body: Record<string, unknown> }) =>
      apiPost(EMPLOYEE_TRANSFER(employeeId), body),
    onSuccess: invalidate,
  })

  const accept = useMutation({
    mutationFn: (id: number) => apiPost(EMPLOYEE_TRANSFER_ACCEPT(id), {}),
    onSuccess: invalidate,
  })

  const reject = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) =>
      apiPost(EMPLOYEE_TRANSFER_REJECT(id), { note: note || null }),
    onSuccess: invalidate,
  })

  return { transfer, accept, reject, invalidate }
}
