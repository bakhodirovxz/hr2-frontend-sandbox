import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EMPLOYEE_QUERY_KEYS } from '@/features/employees/useEmployees'
import { publicClient } from '@/api/client'
import { apiGet, apiPost } from '@/api/http'
import {
  REGISTER,
  REGISTER_OPTIONS,
  REGISTRATION_APPROVE,
  REGISTRATION_ME,
  REGISTRATION_REJECT,
  REGISTRATIONS,
} from '@/api/endpoints'

/**
 * Ro'yxatdan o'tish moduli — TZ 4.2.2.
 *
 * Ikki tomon bor va ular BOSHQA mijozdan yuradi:
 *   • ochiq forma (`/auth/register`, `/auth/register/options`) — `publicClient`,
 *     chunki arizachi hali tizimga kirmagan;
 *   • administrator ro'yxati va tasdiqlash — odatdagi `apiClient`.
 */

export interface RegistrationOption {
  id: number
  name: string
  /** Bo'lim va lavozim uchun — qaysi filialga tegishli. */
  parent_id?: number | null
}

interface RegistrationOptions {
  /** TZ 4.2.2: o'z-o'zini ro'yxatdan o'tkazish faqat jismoniy shaxs uchun. */
  user_type?: string
  countries: RegistrationOption[]
  nationalities: RegistrationOption[]
  citizenships: RegistrationOption[]
  branches: RegistrationOption[]
  departments: RegistrationOption[]
  job_positions: RegistrationOption[]
  /** TZ 4.2.2 · 1894 — sign-in methods to choose from (`password` | `qr`). */
  auth_methods?: AuthMethodOption[]
}

/** `qr` has `requires_password` — the password is still set (the phone signs in with it once). */
export interface AuthMethodOption {
  code: string
  label?: string
  note?: string
  requires_password?: boolean
}

export type AuthMethod = 'password' | 'qr'

export interface RegistrationRow {
  id: number
  status: string
  user_type?: string | null
  created_at?: string | null
  full_name?: string | null
  last_name?: string | null
  first_name?: string | null
  middle_name?: string | null
  email?: string | null
  phone_number?: string | null
  birth_date?: string | null
  gender?: number | null
  birth_place?: string | null
  address?: string | null
  pinfl?: string | null
  inn?: string | null
  passport_number?: string | null
  passport_issued_by?: string | null
  passport_issue_date?: string | null
  passport_expiry_date?: string | null
  birth_country_name?: string | null
  nationality_name?: string | null
  citizenship_name?: string | null
  is_uge_employee: boolean
  claimed_branch_id?: number | null
  claimed_department_id?: number | null
  claimed_job_position_id?: number | null
  claimed_branch_name?: string | null
  claimed_department_name?: string | null
  claimed_job_position_name?: string | null
  photo_url?: string | null
  reject_reason?: string | null
  reviewed_at?: string | null
  reviewed_by_name?: string | null
  created_employee_id?: number | null
  username?: string | null
  /** TZ 4.2.2 · 1894 — the sign-in method chosen at registration. */
  auth_method?: string | null
}

export interface RegistrationPayload {
  username: string
  password: string
  email: string
  last_name: string
  first_name: string
  middle_name: string | null
  pinfl: string | null
  inn: string | null
  passport_number: string | null
  passport_issued_by: string | null
  passport_issue_date: string | null
  passport_expiry_date: string | null
  birth_date: string | null
  gender: number | null
  address: string | null
  birth_place: string | null
  birth_country_id: number | null
  nationality_id: number | null
  citizenship_id: number | null
  phone_number: string | null
  photo_base64: string | null
  is_uge_employee: boolean
  claimed_branch_id: number | null
  claimed_department_id: number | null
  claimed_job_position_id: number | null
  auth_method: AuthMethod
}

/** Ochiq forma uchun tanlov ro'yxatlari (autentifikatsiyasiz). */
/**
 * `branchId` — units and positions are served only for the chosen
 * organisation (the public endpoint no longer lists the whole structure).
 */
export function useRegisterOptions(branchId?: string | number | null) {
  const branch = branchId ? String(branchId) : ''
  return useQuery({
    queryKey: ['register-options', branch],
    queryFn: async () => {
      const { data } = await publicClient.get<RegistrationOptions>(`/${REGISTER_OPTIONS}`, {
        params: branch ? { branch_id: branch } : undefined,
      })
      return data
    },
    placeholderData: keepPreviousData,
    staleTime: 30 * 60_000,
    retry: 1,
  })
}

export function useSubmitRegistration() {
  return useMutation({
    mutationFn: async (payload: RegistrationPayload) => {
      const { data } = await publicClient.post<{ id: number; status: string; message: string }>(
        `/${REGISTER}`,
        payload,
      )
      return data
    },
  })
}

/** Arizachining O'Z arizasi va holati («Мониторинг статуса», TZ 4.2.2). */
export function useMyRegistration(enabled = true) {
  return useQuery({
    queryKey: ['registration-me'],
    queryFn: () => apiGet<RegistrationRow>(REGISTRATION_ME),
    enabled,
    // 404 = ariza yo'q (masalan oddiy xodim) — qayta urinish ma'nosiz.
    retry: false,
  })
}

interface RegistrationQuery {
  status?: string
  search?: string
  page: number
  size: number
}

export function useRegistrations(query: RegistrationQuery, enabled = true) {
  return useQuery({
    queryKey: ['registrations', query],
    queryFn: () =>
      apiGet<{ items: RegistrationRow[]; total: number; page: number; size: number; pages: number }>(
        REGISTRATIONS,
        {
          // The page's "Barchasi" option is `all`; the API only knows the three
          // real statuses (`^(pending|approved|rejected)$`) and answered 422 —
          // the tab showed an error instead of the whole list. No status = all.
          status: query.status && query.status !== 'all' ? query.status : undefined,
          search: query.search || undefined,
          page: query.page,
          size: query.size,
        },
      ),
    enabled,
    retry: false,
  })
}

export function useRegistrationOps() {
  const qc = useQueryClient()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['registrations'] })
    void qc.invalidateQueries({ queryKey: ['menu-badges'] })
    // Approving creates an employee — the roster and its stat tiles.
    for (const key of EMPLOYEE_QUERY_KEYS) void qc.invalidateQueries({ queryKey: key })
  }

  const approve = useMutation({
    mutationFn: (args: {
      id: number
      organization_branch_id: number
      department_id: number | null
      job_position_id: number | null
      /** Tayinlanadigan rol; berilmasa tashkilot turiga mos tizim roli. */
      role_id: number | null
    }) =>
      apiPost<RegistrationRow>(REGISTRATION_APPROVE(args.id), {
        organization_branch_id: args.organization_branch_id,
        department_id: args.department_id,
        job_position_id: args.job_position_id,
        ...(args.role_id ? { role_id: args.role_id } : {}),
      }),
    onSuccess: invalidate,
  })

  const reject = useMutation({
    mutationFn: (args: { id: number; reason: string }) =>
      apiPost<RegistrationRow>(REGISTRATION_REJECT(args.id), { reason: args.reason }),
    onSuccess: invalidate,
  })

  return { approve, reject }
}

/**
 * Kiritish maskalari — ortiqcha belgini KIRITISH PAYTIDA kesib tashlaydi,
 * to'liqligini esa yuborishdan oldingi tekshiruv talab qiladi.
 */
export const MASKS = {
  passport_number: (v: string) =>
    v.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() + v.replace(/[^0-9]/g, '').slice(0, 7),
  inn: (v: string) => v.replace(/[^0-9]/g, '').slice(0, 9),
  pinfl: (v: string) => v.replace(/[^0-9]/g, '').slice(0, 14),
  phone_number: (v: string) => v.replace(/[^0-9+\s()-]/g, '').slice(0, 20),
} as const

/** Bo'sh bo'lmagan hujjat maydonlari SHAKLINI tekshiradi. */
export const DOC_RULES: [keyof typeof MASKS | 'pinfl', RegExp, string][] = [
  ['passport_number', /^[A-Z]{2}\d{7}$/, 'register.errPassport'],
  ['inn', /^\d{9}$/, 'register.errInn'],
  ['pinfl', /^\d{14}$/, 'register.errPinfl'],
]

/**
 * 409 sabablari — backend ba'zilarini INGLIZCHA qaytaradi
 * ("User with this username already exists"), foydalanuvchi esa o'z tilida
 * javob kutadi. Kod bo'yicha moslashtiramiz; noma'lum kod bo'lsa backend
 * matni ko'rsatiladi.
 */
export const CONFLICT_KEYS: Record<string, string> = {
  user_username_exists: 'register.errUsernameTaken',
  email_already_taken: 'register.errEmailTaken',
  pinfl_already_registered: 'register.errPinflRegistered',
  registration_already_submitted: 'register.errAlreadySubmitted',
}
