import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
import { MODULES, PERMISSION_LEVELS, type ModuleCode, type PermissionLevel } from '@/auth/permissions'

/**
 * Foydalanuvchilar (TZ A3) va rollar (TZ A1/A2) — `hr-backend-sandbox`
 * `/users` va `/permission-groups` shartnomasi.
 *
 * Darvozalar (backend): `admin` moduli — o'qish `view`, yozish `edit`,
 * o'chirish `full`. Filial administratori faqat o'z filiali hisoblari va
 * rollarini boshqaradi; tizim rollarini (`is_system`) faqat bosh
 * administrator o'zgartiradi (`system_role_master_only`).
 *
 * ⚠️ `_no_branch_inject`: rollar ro'yxati `organization_branch_id` ni FILTR
 * deb o'qiydi — tanlangan filial yuborilsa, bosh administrator umumiy
 * rollarni ko'rmay qolardi (v1 ham shunday chetlab o'tadi).
 */

export type PermissionMap = Partial<Record<ModuleCode, PermissionLevel>>

export interface UserAdminRow {
  id: number
  username: string
  full_name?: string | null
  email?: string | null
  type: string
  is_active: boolean
  role?: { id?: number | null; code?: string | null; name?: string | null } | null
  organization_branch?: { id: number; name?: string | null } | null
  employee_id?: number | null
  department_id?: number | null
  job_position_id?: number | null
  /** Foydalanuvchiga ALOHIDA berilgan darajalar (rol o'rnini bosadi). */
  permissions?: Record<string, string>
  /** Rol + rahbarlik grantlari + shaxsiy darajalar — har modul. */
  effective_permissions?: Record<string, string>
  created_at?: string | null
  last_login_at?: string | null
  /** TZ U1 772 — ketma-ket noto'g'ri urinishlar va blok muddati. */
  failed_login_count?: number
  locked_until?: string | null
  /** TZ C4: archived card — `username` is a technical sentinel. */
  archived?: boolean
  archived_username?: string | null
}

/** Xato urinishlar sababli hozir bloklanganmi (muddat hali o'tmagan). */
export function isLocked(u: Pick<UserAdminRow, 'locked_until'>): boolean {
  return !!u.locked_until && new Date(u.locked_until).getTime() > Date.now()
}

/** TZ U2 789 — foydalanuvchi sessiyasi (qurilma, IP, oxirgi faollik). */
export interface UserSessionRow {
  id: number
  device_name?: string | null
  device_type?: string | null
  ip_address?: string | null
  user_agent?: string | null
  last_active?: string | null
  created_at?: string | null
}

/** TZ U1/U2 — xavfsizlik siyosati (`/system/settings/security`). */
export interface SecurityPolicy {
  lockout_max_failures: number
  lockout_minutes: number
  idle_timeout_minutes: number
}

export interface RoleRow {
  id: number
  name: string
  code?: string | null
  description?: string | null
  is_system?: boolean | null
  permissions?: Record<string, unknown> | null
  organization_branch_id?: number | null
  users_count?: number | null
  /** TZ A2 869: may the signed-in administrator hand this role out. */
  assignable?: boolean | null
}

const SYSTEM_ROLE_CODES = [
  'system_admin', 'management', 'hr_central', 'hr_branch', 'ca_staff', 'subsidiary_staff', 'branch_staff', 'guest',
] as const

/**
 * Display name of a role: the seven TZ system roles (+ the organisation HR
 * variant) are translated by code; a custom role keeps the name its author
 * gave it.
 */
export function roleDisplayName(
  role: { code?: string | null; name?: string | null } | null | undefined,
  t: (key: string) => string,
): string {
  const code = role?.code ?? ''
  if ((SYSTEM_ROLE_CODES as readonly string[]).includes(code)) return t(`roleAdmin.sysName.${code}`)
  return role?.name ?? ''
}

/** System role → the organisation kind it belongs to (null = any). */
export function roleOrgKind(code?: string | null): 'ca' | 'filial' | 'subsidiary' | 'nonca' | null {
  switch (code) {
    case 'ca_staff':
    case 'hr_central':
      return 'ca'
    case 'branch_staff':
      return 'filial'
    case 'subsidiary_staff':
      return 'subsidiary'
    case 'hr_branch':
      return 'nonca'
    default:
      return null
  }
}

interface Page<T> {
  items: T[]
  total: number
  page: number
  size: number
  pages: number
}

const USERS = 'users'
const ROLES = 'permission-groups'
const NO_INJECT = { _no_branch_inject: true }
const NO_INJECT_CFG = { params: NO_INJECT }

/** `{modul: daraja}` — faqat ma'lum modul va darajalar (eski shakllar tashlanadi). */
export function normalizePerms(raw: unknown): PermissionMap {
  const out: PermissionMap = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (
      (MODULES as readonly string[]).includes(k) &&
      typeof v === 'string' &&
      (PERMISSION_LEVELS as readonly string[]).includes(v)
    ) {
      out[k as ModuleCode] = v as PermissionLevel
    }
  }
  return out
}

// ── Foydalanuvchilar ───────────────────────────────────────────────────────

export interface UserListParams {
  page: number
  size: number
  search?: string
  roleId?: string
  active?: string
  branchId?: string | number | null
}

export function useUserList(p: UserListParams) {
  return useQuery({
    queryKey: [USERS, 'list', p],
    queryFn: () =>
      apiGet<Page<UserAdminRow>>(USERS, {
        ...NO_INJECT,
        page: p.page,
        size: p.size,
        search: p.search?.trim() || undefined,
        role_id: p.roleId || undefined,
        is_active: p.active === 'yes' ? true : p.active === 'no' ? false : undefined,
        branch_id: p.branchId || undefined,
      }),
    placeholderData: keepPreviousData,
  })
}

/** «Foydalanuvchi ruxsatlari» tabidagi qidiruv (kamida 2 belgi). */
export function useUserSearch(term: string) {
  const q = term.trim()
  return useQuery({
    queryKey: [USERS, 'search', q],
    queryFn: () => apiGet<Page<UserAdminRow>>(USERS, { ...NO_INJECT, search: q, size: 10 }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  })
}

export function useUserDetail(id: number | null) {
  return useQuery({
    queryKey: [USERS, 'one', id],
    queryFn: () => apiGet<UserAdminRow>(`${USERS}/${id}`, NO_INJECT),
    enabled: !!id,
  })
}

export interface UserPayload {
  username: string
  full_name: string
  email: string
  role_id: number
  organization_branch_id: number | null
  department_id: number | null
  job_position_id: number | null
  is_active: boolean
  password?: string
}

/**
 * Yozuv amallari. `silent`: xatoni chaqiruvchi ko'rsatadi — login/pochta
 * bandligi maydon ostida, qolgani toast bilan; umumiy toast ikki marta
 * chiqmasin.
 */
export function useUserMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [USERS] })
  const meta = { silent: true }
  return {
    save: useMutation({
      meta,
      mutationFn: ({ id, body }: { id?: number; body: UserPayload }) =>
        id
          ? apiPatch<UserAdminRow>(`${USERS}/${id}`, body, NO_INJECT_CFG)
          : apiPost<UserAdminRow>(USERS, body, NO_INJECT_CFG),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      meta,
      mutationFn: ({ id, active }: { id: number; active: boolean }) =>
        apiPost<UserAdminRow>(`${USERS}/${id}/${active ? 'activate' : 'deactivate'}`, undefined, NO_INJECT_CFG),
      onSuccess: invalidate,
    }),
    setPassword: useMutation({
      meta,
      mutationFn: ({ id, password }: { id: number; password: string }) =>
        apiPost(`${USERS}/${id}/set-password`, { password }, NO_INJECT_CFG),
    }),
    remove: useMutation({
      meta,
      mutationFn: (id: number) => apiDelete(`${USERS}/${id}`, NO_INJECT_CFG),
      onSuccess: invalidate,
    }),
    unlock: useMutation({
      meta,
      mutationFn: (id: number) => apiPost<UserAdminRow>(`${USERS}/${id}/unlock`, undefined, NO_INJECT_CFG),
      onSuccess: invalidate,
    }),
    revokeSessions: useMutation({
      meta,
      mutationFn: ({ id, sessionId }: { id: number; sessionId?: number }) =>
        apiPost<{ revoked: number }>(`${USERS}/${id}/sessions/revoke`, undefined, {
          ...NO_INJECT_CFG,
          params: { ...(NO_INJECT_CFG.params ?? {}), session_id: sessionId },
        }),
      onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [USERS, 'sessions', v.id] }),
    }),
    /** TZ A2 869: `force` — save despite a `permission_conflict` (409). */
    setPermissions: useMutation({
      meta,
      mutationFn: ({ id, permissions, force }: { id: number; permissions: PermissionMap; force?: boolean }) =>
        apiPatch<UserAdminRow>(`${USERS}/${id}`, { permissions }, {
          params: { ...NO_INJECT, force: force || undefined },
        }),
      onSuccess: invalidate,
    }),
  }
}

// ── Rollar ─────────────────────────────────────────────────────────────────

/** Barcha ko'rinadigan rollar (tanlagichlar, qayta biriktirish). */
export function useRoles(search = '') {
  const q = search.trim()
  return useQuery({
    queryKey: [ROLES, q],
    queryFn: () => apiGet<RoleRow[]>(ROLES, { ...NO_INJECT, search: q || undefined }),
    placeholderData: keepPreviousData,
  })
}

/**
 * Matritsa modullari va darajalari — `GET /permission-groups/registry/all`.
 * Kelmasa, `auth/permissions.ts` dagi shartnoma ro'yxati ishlatiladi.
 */
export function usePermissionRegistry() {
  const q = useQuery({
    queryKey: [ROLES, 'registry'],
    queryFn: () =>
      apiGet<{ modules?: { code: string; label?: string }[]; levels?: string[] }>(
        `${ROLES}/registry/all`,
        NO_INJECT,
      ),
    staleTime: Infinity,
    meta: { silent: true },
  })
  const codes = (q.data?.modules ?? [])
    .map((m) => m.code)
    .filter((c): c is ModuleCode => (MODULES as readonly string[]).includes(c))
  const levels = (q.data?.levels ?? []).filter((l): l is PermissionLevel =>
    (PERMISSION_LEVELS as readonly string[]).includes(l),
  )
  return {
    modules: codes.length ? codes : [...MODULES],
    levels: levels.length ? levels : [...PERMISSION_LEVELS],
  }
}

export interface RolePayload {
  name: string
  description: string | null
  permissions: PermissionMap
  code?: string | null
}

export function useRoleMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [ROLES] })
    qc.invalidateQueries({ queryKey: [USERS] })
  }
  const meta = { silent: true }
  return {
    save: useMutation({
      meta,
      // TZ A2 869: `force` — save the matrix despite a `permission_conflict` (409).
      mutationFn: ({ id, body, force }: { id?: number; body: RolePayload; force?: boolean }) => {
        const cfg = { params: { ...NO_INJECT, force: force || undefined } }
        return id ? apiPatch<RoleRow>(`${ROLES}/${id}`, body, cfg) : apiPost<RoleRow>(ROLES, body, cfg)
      },
      onSuccess: invalidate,
    }),
    remove: useMutation({
      meta,
      mutationFn: ({ id, reassignTo }: { id: number; reassignTo?: number }) =>
        apiDelete(`${ROLES}/${id}`, { params: { ...NO_INJECT, reassign_to: reassignTo || undefined } }),
      onSuccess: invalidate,
    }),
  }
}

/** TZ U2 789 — foydalanuvchining faol sessiyalari (administrator uchun). */
export function useUserSessions(id: number | null) {
  return useQuery({
    queryKey: [USERS, 'sessions', id],
    queryFn: () => apiGet<UserSessionRow[]>(`${USERS}/${id}/sessions`, NO_INJECT),
    enabled: id != null,
  })
}

const SECURITY = 'system/settings/security'

/** TZ U1/U2 — bloklash chegarasi va harakatsizlik tayм-auti (bosh administrator). */
export function useSecurityPolicy(enabled: boolean) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['system-settings', 'security'],
    queryFn: () => apiGet<SecurityPolicy>(SECURITY),
    enabled,
  })
  const save = useMutation({
    meta: { silent: true },
    mutationFn: (body: SecurityPolicy) => apiPut<SecurityPolicy>(SECURITY, body),
    onSuccess: (data) => {
      qc.setQueryData(['system-settings', 'security'], data)
      // `/auth/me` dagi idle_timeout_minutes ham yangilansin.
      qc.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
  return { query, save }
}
