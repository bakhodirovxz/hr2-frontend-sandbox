import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost } from '@/api/http'
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
import * as roles from '@/auth/roles'

/**
 * INTERAKTIV XIZMATLAR — TZ 4.2.12.
 *
 * Three services, one register. The TZ describes them as separate counters
 * (certificate, reference letter, job application) but they share one lifecycle
 * — submitted, reviewed, worked, ready, issued — so they share one table and
 * one status machine. Three tables would have meant three copies of that
 * machine and three ways for it to drift.
 */

export type ServiceType = 'work_certificate' | 'reference_letter' | 'job_application'
export type ServiceStatus =
  | 'accepted'
  | 'in_review'
  | 'in_progress'
  | 'ready'
  | 'issued'
  | 'rejected'
  | 'cancelled'

/**
 * The transitions the backend allows, mirrored so the UI only ever offers a
 * move that will be accepted. There is NO way back: the status history is the
 * document's official trail, and "fixing" it would break the audit — a mistake
 * is corrected by moving forward with a comment.
 */
export const TRANSITIONS: Record<ServiceStatus, ServiceStatus[]> = {
  accepted: ['in_review', 'rejected'],
  in_review: ['in_progress', 'rejected'],
  in_progress: ['ready', 'rejected'],
  ready: ['issued', 'rejected'],
  issued: [],
  rejected: [],
  cancelled: [],
}

/** The chain drawn as a progress rail on the detail view. */
export const STATUS_CHAIN: ServiceStatus[] = [
  'accepted',
  'in_review',
  'in_progress',
  'ready',
  'issued',
]

interface ServiceEvent {
  id: number
  actor_name?: string | null
  from_status?: string | null
  to_status: string
  comment?: string | null
  created_at?: string | null
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
  created_at?: string | null
}

interface ServiceRequestDetail extends ServiceRequestRow {
  events: ServiceEvent[]
}

export interface ServiceCatalogItem {
  type: ServiceType
  label: string
  available: boolean
  reason?: string | null
}

/** Reviewers are the personnel office and the administrators. */
export function canReviewServices(user: User | null | undefined): boolean {
  // Server `can_manage` = `org_structure_scope is not DENY` — "ministr is not a manager here".
  return roles.isHR(user) || roles.isSiteMasterAdmin(user)
}

export function useServiceCatalog() {
  const q = useQuery({
    queryKey: ['services', 'catalog'],
    queryFn: () => apiGet<ServiceCatalogItem[]>(SERVICE_REQUESTS_CATALOG),
    staleTime: 10 * 60_000,
  })
  return { catalog: q.data ?? [], loading: q.isLoading }
}

export function useMyServiceRequests(status: string, page: number, size: number) {
  const q = useQuery({
    queryKey: ['services', 'mine', status, page, size],
    queryFn: () =>
      apiGet<Page<ServiceRequestRow>>(SERVICE_REQUESTS_MY, {
        status: status || undefined,
        page,
        size,
      }),
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

export function useServiceInbox(
  args: { status: string; serviceType: string; search: string; page: number; size: number },
  enabled: boolean,
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['services', 'inbox', branchId, args],
    queryFn: () =>
      apiGet<Page<ServiceRequestRow>>(SERVICE_REQUESTS, {
        organization_branch_id: branchId || undefined,
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
    denied: q.isError,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useServiceRequest(id: number | null) {
  const q = useQuery({
    queryKey: ['services', 'detail', id],
    queryFn: () => apiGet<ServiceRequestDetail>(SERVICE_REQUEST(id as number)),
    enabled: !!id,
  })
  return { request: q.data ?? null, loading: q.isLoading }
}

export function useServiceMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['services'] })
  return {
    invalidate,
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiPost<ServiceRequestDetail>(SERVICE_REQUESTS, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<ServiceRequestDetail>(SERVICE_REQUEST(id), body),
      onSuccess: invalidate,
    }),
    cancel: useMutation({
      mutationFn: ({ id, comment }: { id: number; comment?: string }) =>
        apiPost<ServiceRequestDetail>(SERVICE_REQUEST_CANCEL(id), { comment: comment || null }),
      onSuccess: invalidate,
    }),
    changeStatus: useMutation({
      mutationFn: ({
        id,
        toStatus,
        comment,
      }: {
        id: number
        toStatus: ServiceStatus
        comment?: string
      }) =>
        apiPost<ServiceRequestDetail>(SERVICE_REQUEST_STATUS(id), {
          to_status: toStatus,
          comment: comment || null,
        }),
      onSuccess: invalidate,
    }),
    buildDocument: useMutation({
      mutationFn: (id: number) => apiPost<ServiceRequestDetail>(SERVICE_REQUEST_DOCUMENT(id), {}),
      onSuccess: invalidate,
    }),
  }
}

/** Signed URL for the generated document — asked for only when clicked. */
export async function fetchServiceDocumentUrl(id: number): Promise<string> {
  const { url } = await apiGet<{ url: string }>(SERVICE_REQUEST_DOCUMENT(id))
  return url
}
