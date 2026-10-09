import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  ADMIN,
  ADMINS,
  ADMIN_SEND_PASSWORD,
  EMPLOYEE_ACTIVATE,
  EMPLOYEE_DEACTIVATE,
  EMPLOYEES_LIST,
} from '@/api/endpoints'
import { toItems, type ListResponse } from '@/types'

/**
 * Foydalanuvchilar — TZ 4.2.1 («Управление пользователями», «Возможность
 * активации/деактивации пользователя»).
 *
 * Tizimda IKKI xil hisob bor va ular boshqa jadvallarda yashaydi:
 *   • xodim hisobi — xodim kartochkasiga bog'langan (`/employees`);
 *   • administrator hisobi — kartochkasiz, filialga biriktirilgan (`/admins`).
 * Shu sababli sahifada ikkita tab bor, bitta «foydalanuvchilar» ro'yxati emas.
 *
 * «Ruxsat guruhlari» (permission groups) 2026-09-25 da OLIB TASHLANDI: server
 * ularni hech qayerda tekshirmaydi (na scoping, na require_*), ya'ni guruh
 * berish hech kimga huquq bermasdi — faqat berganday ko'rinardi. Haqiqiy
 * huquq `user.type` + ko'p filialli rol + core/scoping dan keladi.
 */

export interface AdminRow {
  id: number
  email?: string | null
  organization_branch_id?: number | null
  photo_path?: string | null
  photo_thumb_path?: string | null
}

export interface EmployeeAccountRow {
  id: number
  legal_name?: string | null
  email?: string | null
  photo_thumb_path?: string | null
  department?: { id: number; name?: string | null } | null
  job_position?: { id: number; name?: string | null } | null
  multi_org_employee_role?: string | null
  is_multi_org_user?: boolean | null
  is_archived?: boolean | null
  /** `users.is_active`; `null` = xodimda hisob yo'q. */
  account_is_active?: boolean | null
}

export function useAdmins(enabled = true) {
  return useQuery({
    queryKey: ['admins'],
    queryFn: () => apiGet<ListResponse<AdminRow>>(ADMINS, { page: 1, size: 200 }),
    enabled,
    retry: false,
  })
}

interface AccountQuery {
  search?: string
  page: number
  size: number
  organization_branch_id?: number | null
}

/** Xodim HISOBLARI ro'yxati — rol va faollik shu yerdan boshqariladi. */
export function useEmployeeAccounts(query: AccountQuery, enabled = true) {
  return useQuery({
    queryKey: ['employee-accounts', query],
    queryFn: () =>
      apiGet<ListResponse<EmployeeAccountRow>>(EMPLOYEES_LIST, {
        search: query.search || undefined,
        page: query.page,
        size: query.size,
        organization_branch_id: query.organization_branch_id || undefined,
      }),
    enabled,
    retry: false,
  })
}

export function useUserOps() {
  const qc = useQueryClient()
  const invalidateAccounts = () => {
    void qc.invalidateQueries({ queryKey: ['employee-accounts'] })
    void qc.invalidateQueries({ queryKey: ['employee-kpi'] })
    void qc.invalidateQueries({ queryKey: ['employees'] })
  }
  const invalidateAdmins = () => void qc.invalidateQueries({ queryKey: ['admins'] })

  return {
    setEmployeeActive: useMutation({
      mutationFn: (args: { id: number; active: boolean }) =>
        apiPost(args.active ? EMPLOYEE_ACTIVATE(args.id) : EMPLOYEE_DEACTIVATE(args.id)),
      onSuccess: invalidateAccounts,
    }),

    createAdmin: useMutation({
      mutationFn: (body: {
        email: string
        password: string | null
        organization_branch_id: number | null
      }) => apiPost<AdminRow>(ADMINS, body),
      onSuccess: invalidateAdmins,
    }),
    updateAdmin: useMutation({
      mutationFn: (args: { id: number; body: Record<string, unknown> }) =>
        apiPatch<AdminRow>(ADMIN(args.id), args.body),
      onSuccess: invalidateAdmins,
    }),
    deleteAdmin: useMutation({
      mutationFn: (id: number) => apiDelete(ADMIN(id)),
      onSuccess: invalidateAdmins,
    }),
    sendAdminPassword: useMutation({
      mutationFn: (id: number) => apiPost(ADMIN_SEND_PASSWORD(id)),
    }),
  }
}

export { toItems }
