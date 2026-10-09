import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
import {
  SERVICE_REQUEST,
  SERVICE_REQUESTS,
  SERVICE_REQUESTS_CATALOG,
  SERVICE_REQUESTS_MY,
  SERVICE_REQUEST_CANCEL,
  SERVICE_REQUEST_DOCUMENT,
  SERVICE_REQUEST_STATUS,
} from '@/api/endpoints'
import type { Page } from '@/features/employees/useEmployees'
import { useBranchStore } from '@/store/branchStore'
import type { User } from '@/types'
import { canWriteOrg, isGuest } from '@/auth/permissions'

/**
 * INTERAKTIV XIZMATLAR — TZ 4.2.12 (+ TZ I1 katalog va ilovalar).
 *
 * Uchta xizmat (ma'lumotnoma, tavsifnoma, nomzodlik arizasi) — bitta reestr
 * va bitta holat mashinasi: accepted → in_review → in_progress → ready,
 * istalgan bosqichda rejected; cancelled — faqat egasi, «Qabul qilindi» da.
 * Ruxsat qoidasi BACKENDDA (`/service-requests/catalog` qaysi xizmat ochiqligini
 * va nega yopiqligini aytadi) — bu yerda takrorlanmaydi.
 */

export type ServiceType = 'work_certificate' | 'reference_letter' | 'job_application'
export type ServiceStatus = 'accepted' | 'in_review' | 'in_progress' | 'ready' | 'rejected' | 'cancelled'

export const JOB_APPLICATION: ServiceType = 'job_application'

/** Backend `TRANSITIONS` (ko'rib chiquvchi tomoni) — mos kelmasa 409. */
export const TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  accepted: ['in_review', 'rejected'],
  in_review: ['in_progress', 'rejected'],
  in_progress: ['ready', 'rejected'],
  ready: [],
  rejected: [],
  cancelled: [],
}

/** Ro'yxat filtri va tafsilot zanjiri uchun. */
export const ALL_STATUSES: ServiceStatus[] = ['accepted', 'in_review', 'in_progress', 'ready', 'rejected', 'cancelled']
export const STATUS_CHAIN: ServiceStatus[] = ['accepted', 'in_review', 'in_progress', 'ready']

/** Faqat shu holatda egasi tahrirlaydi, bekor qiladi, hujjat biriktiradi. */
export const EDITABLE_STATUS: ServiceStatus = 'accepted'

/** Hujjat «Bajarilmoqda» holatidan boshlab shakllantiriladi (ariza uchun emas). */
export const DOCUMENT_STATUSES: ServiceStatus[] = ['in_progress', 'ready']

export interface ServiceEvent {
  id: number
  actor_name?: string | null
  from_status?: string | null
  to_status: string
  comment?: string | null
  created_at?: string | null
}

export interface ServiceAttachment {
  id: string
  name: string
  size: number
  content_type?: string | null
  uploaded_at?: string | null
}

export interface ServiceRequestRow {
  id: number
  number: string
  service_type: string
  status: ServiceStatus
  purpose?: string | null
  payload?: Record<string, unknown> | null
  organization_branch_id?: number | null
  employee_id?: number | null
  applicant_name?: string | null
  applicant_photo_thumb_path?: string | null
  assignee_id?: number | null
  assignee_name?: string | null
  submitted_at?: string | null
  due_date?: string | null
  closed_at?: string | null
  resolution?: string | null
  has_document: boolean
  attachments_count?: number
  created_at?: string | null
}

export interface ServiceRequestDetail extends ServiceRequestRow {
  events: ServiceEvent[]
  attachments: ServiceAttachment[]
}

export interface ServiceCatalogItem {
  type: ServiceType
  label: string
  available: boolean
  reason?: string | null
  category?: string | null
  category_label?: string | null
  description?: string | null
}

/**
 * So'rovlarni ko'rib chiquvchi — so'rovchi tashkilotining kadrlar xizmati
 * (backend `write_scope(services, full)`; v1 `canWriteOrg(user,'services','full')`).
 */
export function canReviewServices(user: User | null | undefined): boolean {
  return canWriteOrg(user, 'services', 'full')
}

/**
 * Ochilgan so'rov shu foydalanuvchinikimi. Mehmon faqat o'z arizasini ochadi
 * (xodim kartasi yo'q — `employee_id` bo'sh), xodim — o'z kartasi orqali.
 */
export function isOwnRequest(user: User | null | undefined, r: ServiceRequestRow | null): boolean {
  if (!user || !r) return false
  if (isGuest(user)) return true
  const empId = user.employee?.id
  return empId != null && r.employee_id === empId
}

export function useServiceCatalog() {
  const q = useQuery({
    queryKey: ['services', 'catalog'],
    queryFn: () => apiGet<ServiceCatalogItem[]>(SERVICE_REQUESTS_CATALOG),
    staleTime: 10 * 60_000,
  })
  return { catalog: q.data ?? [], loading: q.isLoading }
}

/**
 * Ariza qaysi tashkilotga — ro'yxatdan o'tish formasining OCHIQ ro'yxati
 * (mehmonga `/organization-branches` yopiq).
 */
export function useApplicationBranches(enabled: boolean) {
  const q = useQuery({
    queryKey: ['services', 'register-options'],
    queryFn: () => apiGet<{ branches?: { id: number; name: string }[] }>('auth/register/options'),
    staleTime: 30 * 60_000,
    enabled,
  })
  return Array.isArray(q.data?.branches) ? q.data!.branches : []
}

export function useMyServiceRequests(status: string, page: number, size: number, enabled = true) {
  const q = useQuery({
    queryKey: ['services', 'mine', status, page, size],
    queryFn: () =>
      apiGet<Page<ServiceRequestRow>>(SERVICE_REQUESTS_MY, {
        status: status || undefined,
        page,
        size,
        // «Mening so'rovlarim» — filial tanloviga bog'liq emas.
        organization_branch_id: null,
      }),
    placeholderData: (prev) => prev,
    enabled,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useServiceInbox(
  args: { status: string; serviceType: string; search: string; page: number; size: number },
  enabled: boolean,
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['services', 'inbox', branchId, args],
    queryFn: () =>
      apiGet<Page<ServiceRequestRow>>(SERVICE_REQUESTS, {
        organization_branch_id: branchId || null,
        status: args.status || undefined,
        service_type: args.serviceType || undefined,
        search: args.search || undefined,
        page: args.page,
        size: args.size,
      }),
    enabled,
    placeholderData: (prev) => prev,
  })
  return {
    rows: q.data?.items ?? [],
    total: q.data?.total ?? 0,
    pages: q.data?.pages ?? 1,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useServiceRequest(id: number | null) {
  const q = useQuery({
    queryKey: ['services', 'detail', id],
    queryFn: () => apiGet<ServiceRequestDetail>(SERVICE_REQUEST(id as number)),
    enabled: !!id,
    retry: false,
  })
  return { request: q.data ?? null, loading: q.isLoading, error: q.error, refetch: q.refetch }
}

export function useServiceMutations() {
  const qc = useQueryClient()
  /** Javob — yangilangan tafsilot: keshga yozamiz, ro'yxatlar qayta so'raladi. */
  const settle = (d?: ServiceRequestDetail) => {
    if (d && d.id) qc.setQueryData(['services', 'detail', d.id], d)
    qc.invalidateQueries({ queryKey: ['services', 'mine'] })
    qc.invalidateQueries({ queryKey: ['services', 'inbox'] })
  }
  return {
    settle,
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<ServiceRequestDetail>(SERVICE_REQUESTS, body),
      onSuccess: settle,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<ServiceRequestDetail>(SERVICE_REQUEST(id), body),
      onSuccess: settle,
    }),
    cancel: useMutation({
      mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
        apiPost<ServiceRequestDetail>(SERVICE_REQUEST_CANCEL(id), { comment: comment || null }),
      onSuccess: settle,
    }),
    changeStatus: useMutation({
      mutationFn: ({
        id,
        toStatus,
        comment,
        payload,
      }: {
        id: number
        toStatus: ServiceStatus
        comment?: string
        payload?: Record<string, unknown> | null
      }) =>
        apiPost<ServiceRequestDetail>(SERVICE_REQUEST_STATUS(id), {
          to_status: toStatus,
          comment: comment?.trim() || null,
          ...(payload ? { payload } : {}),
        }),
      onSuccess: settle,
    }),
    buildDocument: useMutation({
      mutationFn: (id: number) => apiPost<ServiceRequestDetail>(SERVICE_REQUEST_DOCUMENT(id), {}),
      onSuccess: settle,
    }),
    removeAttachment: useMutation({
      mutationFn: ({ id, attachmentId }: { id: number; attachmentId: string }) =>
        apiDelete<ServiceRequestDetail>(`${SERVICE_REQUEST(id)}/attachments/${attachmentId}`),
      onSuccess: settle,
    }),
  }
}

/**
 * TZ I1 1597 — bitta faylni so'rovga biriktiradi (multipart `file`).
 * `onProgress` 0…100; javob — yangilangan tafsilot.
 */
export async function uploadServiceAttachment(
  id: number,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ServiceRequestDetail> {
  const fd = new FormData()
  fd.append('file', file)
  const { data } = await apiClient.post<ServiceRequestDetail>(`${SERVICE_REQUEST(id)}/attachments`, fd, {
    timeout: 300_000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.min(100, Math.round((e.loaded / e.total) * 100)))
    },
  })
  return data
}

/** Biriktirilgan hujjatning qisqa muddatli havolasi — bosilgandagina so'raladi. */
export async function fetchServiceAttachmentUrl(id: number, attachmentId: string): Promise<string> {
  const { url } = await apiGet<{ url: string }>(`${SERVICE_REQUEST(id)}/attachments/${attachmentId}`)
  return url
}

/** Shakllantirilgan hujjatning havolasi — bosilgandagina so'raladi. */
export async function fetchServiceDocumentUrl(id: number): Promise<string> {
  const { url } = await apiGet<{ url: string }>(SERVICE_REQUEST_DOCUMENT(id))
  return url
}

// ── TZ 4.2.12 · 2304–2305: hujjat shablonlari ─────────────────────────────

export interface TemplateDraft {
  title: string
  body: string
  signature?: string | null
  updated_by?: string | null
  updated_at?: string | null
}

export interface ServiceTemplate {
  service_type: string
  label: string
  title: string
  body: string
  signature?: string | null
  is_default: boolean
  approved_by?: string | null
  approved_at?: string | null
  draft?: TemplateDraft | null
}

export interface TemplatesResponse {
  items: ServiceTemplate[]
  placeholders: { key: string; label: string }[]
}

const TEMPLATES = 'service-requests/templates'

export function useServiceTemplates(enabled: boolean) {
  const qc = useQueryClient()
  const key = ['services', 'templates']
  const q = useQuery({
    queryKey: key,
    queryFn: () => apiGet<TemplatesResponse>(TEMPLATES),
    enabled,
  })
  const put = (d: TemplatesResponse) => qc.setQueryData(key, d)
  return {
    data: q.data ?? null,
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    save: useMutation({
      mutationFn: ({ type, body }: { type: string; body: { title: string; body: string; signature: string | null } }) =>
        apiPut<TemplatesResponse>(`${TEMPLATES}/${type}`, body),
      onSuccess: put,
    }),
    approve: useMutation({
      mutationFn: (type: string) => apiPost<TemplatesResponse>(`${TEMPLATES}/${type}/approve`),
      onSuccess: put,
    }),
  }
}
