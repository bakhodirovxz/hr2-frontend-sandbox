import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { USER_INFO } from '@/api/endpoints'
import { useAuthStore } from '@/store/authStore'
import { isBranchAdmin, isGuest, isSiteMasterAdmin } from '@/auth/permissions'
import type { TFunction } from 'i18next'
import type { User } from '@/types'

/**
 * «Shaxsiy kabinet» (TZ 4.2.4, L1–L2) — hisob va o'z xodim kartasi.
 *
 * Ma'lumot manbalari:
 *   • hisob — `GET /auth/me` (F.I.Sh., login, pochta, rol, ro'yxatdan o'tgan
 *     sana, oxirgi kirish, 2FA holati);
 *   • xodim kartasi — `GET /employees/{o'zi}` (L1: modul darajasidan qat'i
 *     nazar o'z kartasi doim ochiq).
 */

/** `/auth/me` dagi, umumiy `User` tipida bo'lmagan maydonlar. */
export type MeUser = User & { created_at?: string | null }

interface Named {
  id?: number
  name?: string | null
}

export interface WorkExperienceRow {
  id?: number
  company_name?: string | null
  position?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
}

export interface EducationRow {
  id?: number
  institution_name?: string | null
  faculty_name?: string | null
  degree_name?: string | null
  start_date?: string | null
  end_date?: string | null
  is_current?: boolean | null
}

/** `GET /employees/{pk}` (`EmployeeReadFull`) — kabinetda ishlatiladigan qismi. */
export interface MyEmployee {
  id: number
  /** TZ C3 1062: sent back as `expected_updated_at`. */
  updated_at?: string | null
  legal_name?: string | null
  photo_path?: string | null
  photo_thumb_path?: string | null
  email?: string | null
  phone_number?: string | null
  internal_phone_number?: string | null
  birth_date?: string | null
  gender?: number | null
  nationality?: string | null
  maritial_status?: string | null
  address?: string | null
  residence_address?: string | null
  pasport_series?: string | null
  pasport_number?: string | null
  pasport_individual_number?: string | null
  pasport_issue_by?: string | null
  personal_identification_number?: string | null
  taxpayer_identification_number?: string | null
  individual_accumulative_pension_account_number?: string | null
  job_acceptance_date?: string | null
  working_days?: number[] | null
  working_hours_start?: string | null
  working_hours_end?: string | null
  lunch_start_time?: string | null
  lunch_end_time?: string | null
  department?: (Named & { organization_branch?: Named | null }) | null
  job_position?: Named | null
  supervisor?: { id?: number; legal_name?: string | null } | null
  organization_branches?: Named[] | null
  work_experiences?: WorkExperienceRow[] | null
  educations?: EducationRow[] | null
}

export const myEmployeeKey = (id: number | null | undefined) => ['employee', id] as const

/** O'z xodim kartasi (kartasiz hisobda so'rov yuborilmaydi). */
export function useMyEmployee(id: number | null | undefined) {
  return useQuery({
    queryKey: myEmployeeKey(id),
    queryFn: () => apiGet<MyEmployee>(`employees/${id}`),
    enabled: !!id,
    retry: false,
  })
}

/** Saqlashdan keyin: `/auth/me` ni qayta o'qib do'konga yozadi, kartani yangilaydi. */
export function useRefreshAccount() {
  const qc = useQueryClient()
  return async (employeeId?: number | null) => {
    try {
      const me = await apiGet<User>(USER_INFO)
      useAuthStore.getState().setUser(me)
      qc.setQueryData(['auth', 'me'], me)
    } catch {
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    }
    if (employeeId) void qc.invalidateQueries({ queryKey: myEmployeeKey(employeeId) })
  }
}

/** Hisob pochtasi: hisobning o'zi, administrator profili yoki xodim kartasi. */
export function accountEmail(user: User | null | undefined): string {
  const master = user?.master_admin as { email?: string | null } | null | undefined
  return user?.email || user?.admin?.email || master?.email || (user?.employee as { email?: string | null } | null | undefined)?.email || ''
}

/** Rol nomi: `role.name`, bo'lmasa hisob turidan. */
export function roleLabel(user: User | null | undefined, t: TFunction): string {
  if (user?.role?.name) return user.role.name
  if (isGuest(user)) return t('account.roleGuest')
  if (isSiteMasterAdmin(user)) return t('account.roleAdmin')
  if (isBranchAdmin(user)) return t('account.roleBranchAdmin')
  return t('account.roleEmployee')
}

/** Rasm faylini base64 ga (data: prefiksisiz) o'giradi. */
export function readImage(file: File): Promise<{ preview: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => {
      const preview = String(fr.result || '')
      resolve({ preview, base64: preview.split(',')[1] ?? '' })
    }
    fr.onerror = reject
    fr.readAsDataURL(file)
  })
}

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024
