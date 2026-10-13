import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
import {
  STAFF_POSITIONS,
  STAFF_POSITIONS_ISSUES,
  STAFF_POSITIONS_SUMMARY,
  STAFF_POSITION_CHANGES,
  STAFF_POSITION_CLOSE,
  STAFF_POSITION_DETAIL,
  STAFF_POSITION_REOPEN,
  STAFF_POSITIONS_BULK_UPSERT,
  STAFF_POSITIONS_EXPORT_COLUMNS,
  STAFF_POSITIONS_NOTIFY_SETTINGS,
} from '@/api/endpoints'
import { canWrite, canWriteOrg } from '@/auth/permissions'
import { useBranchStore } from '@/store/branchStore'
import type { User } from '@/types'
import type { RequiredLanguage } from '@/features/vacancies/useVacancies'

/**
 * SHTAT VA VAKANSIYA — TZ 4.2.6 (штатная структура) + 4.2.10 (вакантные места).
 *
 * One register answers both: a staff row carries how many units are APPROVED,
 * how many are OCCUPIED (derived from live employees, never typed in) and
 * therefore how many are VACANT. The vacancy announcement (requirements,
 * salary band, deadline, contacts) hangs off the same row.
 */

export type StaffCategory = 'rahbar' | 'mutaxassis' | 'xizmatchi' | 'ishchi'

export const STAFF_CATEGORIES: StaffCategory[] = ['rahbar', 'mutaxassis', 'xizmatchi', 'ishchi']

export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'temporary'] as const

export interface StaffPosition {
  /** Null on a VIRTUAL row: employees exist but no approved staff line does. */
  id?: number | null
  has_staff_row: boolean
  organization_branch_id: number
  department_id: number
  job_position_id: number
  planned_units: number | string
  occupied_units: number | string
  vacant_units: number | string
  vacancy_open_date?: string | null
  is_closed: boolean
  closed_at?: string | null
  note?: string | null
  department_name?: string | null
  job_position_name?: string | null
  category?: StaffCategory | null
  razryad?: number | null
  branch_name?: string | null
  // Vakansiya e'loni (4.2.10)
  candidate_requirements?: string | null
  education_level_code?: string | null
  salary_from?: number | string | null
  salary_to?: number | string | null
  application_deadline?: string | null
  contact_person?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  publish_to_portal?: boolean
  experience_years?: number | null
  required_skills?: string | null
  work_schedule?: string | null
  employment_type?: string | null
  /** open | paused (TZ V2 1304: hidden from the public list) | closed */
  vacancy_status?: string | null
  required_languages?: RequiredLanguage[] | null
  /** TZ V1 1277 «ответственный рекрутер». */
  recruiter_employee_id?: number | null
  recruiter_name?: string | null
}

/** Announcement statuses (`StaffPositionService.VACANCY_STATUSES`). */
export const VACANCY_STATUSES = ['open', 'paused', 'closed'] as const
export type VacancyStatus = (typeof VACANCY_STATUSES)[number]

interface CategorySummary {
  category?: string | null
  planned_units: number | string
  occupied_units: number | string
  vacant_units: number | string
  over_units?: number | string
  rows: number
}

export interface StaffSummary {
  planned_units: number | string
  occupied_units: number | string
  vacant_units: number | string
  over_units?: number | string
  rows: number
  vacant_rows: number
  by_category: CategorySummary[]
}

interface IssueRow {
  id?: number | null
  name?: string | null
  detail?: string | null
  count?: number | null
}

interface IssueGroup {
  code: string
  total: number
  rows: IssueRow[]
}

/** TZ V2 «История» — one field of one change: label, old → new. */
export interface StaffChangeField {
  field: string
  label?: string | null
  old?: unknown
  new?: unknown
}

export interface StaffChange {
  id: number
  action: string
  old_planned_units?: number | string | null
  new_planned_units?: number | string | null
  reason?: string | null
  created_at?: string | null
  at?: string | null
  by?: string | null
  changed_by_name?: string | null
  fields?: StaffChangeField[]
}

/** TZ V2 «Редактирование вакансии» — HR on its own level (`vacancies = full`). */
export function canManageStaff(user: User | null | undefined): boolean {
  return canWriteOrg(user, 'vacancies', 'full')
}

/** TZ V1 «Создание вакансии» — HR, and a department head for his own units. */
export function canCreateVacancy(user: User | null | undefined): boolean {
  return canWrite(user, 'vacancies')
}

/**
 * Departments a NON-manager may open a vacancy in: the ones he heads and every
 * sub-department (TZ «своего и нижестоящего уровня»). `null` = unrestricted.
 */
export function headDepartmentIds(user: User | null | undefined): number[] | null {
  if (canManageStaff(user)) return null
  return (user?.actor?.unit_department_ids ?? user?.headed_department_ids ?? []).map(Number)
}

/** Units come back as decimals; "1.00" must read as "1" and "0.50" as "0.5". */
export function fmtUnits(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

export interface StaffQuery {
  page: number
  size: number
  search?: string
  departmentId?: string | number
  jobPositionId?: string
  category?: string
  onlyVacant?: boolean
  includeClosed?: boolean
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

/** The list query as the server reads it — shared by the table and the exports. */
export function staffListParams(q: StaffQuery): Record<string, unknown> {
  return {
    search: q.search || undefined,
    department_id: q.departmentId || undefined,
    job_position_id: q.jobPositionId || undefined,
    category: q.category || undefined,
    only_vacant: q.onlyVacant || undefined,
    include_closed: q.includeClosed || undefined,
    sort_by: q.sortBy || undefined,
    sort_dir: q.sortBy ? q.sortDir : undefined,
  }
}

export function useStaffPositions(query: StaffQuery, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['staff-positions', 'list', branchId, query],
    queryFn: () =>
      apiGet<{ items: StaffPosition[]; total: number; page: number; size: number; pages: number }>(
        STAFF_POSITIONS,
        { page: query.page, size: query.size, ...staffListParams(query) },
      ),
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

/** One staff line — the `?open={id}` deep link. */
export function useStaffPosition(id: number | null) {
  return useQuery({
    queryKey: ['staff-positions', 'detail', id],
    queryFn: () => apiGet<StaffPosition>(STAFF_POSITION_DETAIL(id as number)),
    enabled: id != null,
    retry: false,
  })
}

export function useStaffSummary() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['staff-positions', 'summary', branchId],
    queryFn: () => apiGet<StaffSummary>(STAFF_POSITIONS_SUMMARY),
    retry: false,
  })
  return { summary: q.data ?? null, failed: q.isError }
}

/**
 * The register's own defect list. Nothing here is fixed automatically — every
 * one of them is a decision the personnel office owns.
 */
export function useStaffIssues(enabled: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['staff-positions', 'issues', branchId],
    queryFn: () => apiGet<{ groups: IssueGroup[] }>(STAFF_POSITIONS_ISSUES),
    enabled,
    retry: false,
  })
  // Only the REAL problems: seven groups sitting at 0 buried the one that mattered.
  const groups = (q.data?.groups ?? []).filter((g) => g.total > 0)
  return { groups, loading: q.isLoading, error: q.error, refetch: q.refetch }
}

export function useStaffChanges(id: number | null | undefined) {
  const q = useQuery({
    queryKey: ['staff-positions', 'changes', id],
    queryFn: () => apiGet<StaffChange[]>(STAFF_POSITION_CHANGES(id as number)),
    enabled: !!id,
    retry: false,
  })
  return { changes: q.data ?? [], loading: q.isLoading }
}

export function useStaffMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['staff-positions'] })
  // Errors are shown next to the field / in the dialog — no global toast twice.
  const meta = { silent: true }
  return {
    invalidate,
    create: useMutation({
      meta,
      mutationFn: (body: Record<string, unknown>) => apiPost<StaffPosition>(STAFF_POSITIONS, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      meta,
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<StaffPosition>(STAFF_POSITION_DETAIL(id), body),
      onSuccess: invalidate,
    }),
    /** TZ V2 «Изменение статуса ... с указанием причины» — the reason is mandatory. */
    setClosed: useMutation({
      meta,
      mutationFn: ({ id, closed, reason }: { id: number; closed: boolean; reason: string }) =>
        apiPost<StaffPosition>(closed ? STAFF_POSITION_CLOSE(id) : STAFF_POSITION_REOPEN(id), { reason }),
      onSuccess: invalidate,
    }),
    /**
     * TZ V1 1277 «Копирование существующей вакансии»: a new (department ×
     * position) vacancy with the source's announcement fields. 400
     * `staff_position_duplicate` when that line already exists.
     */
    copyVacancy: useMutation({
      meta,
      mutationFn: ({ id, body }: { id: number; body: { department_id: number; job_position_id: number; planned_units?: number; reason?: string } }) =>
        apiPost<StaffPosition>(`${STAFF_POSITION_DETAIL(id)}/copy-vacancy`, body),
      onSuccess: invalidate,
    }),
    /**
     * One department's planned units in ONE request: the backend records one
     * change entry with a shared reason, instead of N scattered ones.
     */
    bulk: useMutation({
      meta,
      mutationFn: (body: {
        rows: { department_id: number; job_position_id: number; planned_units: number }[]
        reason?: string
      }) => apiPost<{ updated: number }>(STAFF_POSITIONS_BULK_UPSERT, body),
      onSuccess: invalidate,
    }),
  }
}

// ── Eksport ustunlari (TZ 4.2.10 «Настройки экспорта») ───────────────────────
export interface ExportColumn {
  key: string
  label: string
}

/** Fetched, not hard-coded, so the picker cannot drift from the server's set. */
export function useStaffExportColumns(enabled = true) {
  return useQuery({
    queryKey: ['staff-positions', 'export-columns'] as const,
    queryFn: () => apiGet<ExportColumn[]>(STAFF_POSITIONS_EXPORT_COLUMNS),
    enabled,
    staleTime: 30 * 60 * 1000,
  })
}

// ── Vakansiya xabarnomasi (TZ 4.2.10, D-D3) ──────────────────────────────────
export interface VacancyNotifySettings {
  id?: number | null
  requested_branch_id?: number | null
  is_own?: boolean
  branches?: { id: number; name: string }[]
  can_org_wide?: boolean
  recipients?: { id: number; legal_name: string | null }[]
  weekdays?: { value: number; label: string }[]
  organization_branch_id?: number | null
  frequency?: string | null
  day_of_week?: number | null
  day_of_month?: number | null
  hour?: number | null
  recipient_ids?: number[]
  notify_new?: boolean
  last_sent_at?: string | null
  frequencies?: { value: string; label: string }[]
}

/** `branch` — '' = the server's default for the caller, 'org' = organisation-wide. */
export function useVacancyNotifySettings(branch: string, enabled = true) {
  return useQuery({
    queryKey: ['staff-positions', 'notify-settings', branch] as const,
    queryFn: () =>
      apiGet<VacancyNotifySettings>(STAFF_POSITIONS_NOTIFY_SETTINGS, {
        _no_branch_inject: true,
        organization_branch_id: branch && branch !== 'org' ? Number(branch) : undefined,
      }),
    enabled,
  })
}

export function useSaveVacancyNotifySettings() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (body: Record<string, unknown>) =>
      apiPut<VacancyNotifySettings>(STAFF_POSITIONS_NOTIFY_SETTINGS, body, {
        params: { _no_branch_inject: true },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-positions', 'notify-settings'] }),
  })
}

// ── Vakansiyaga arizalar (TZ V3 / 4.2.10) ────────────────────────────────────
export interface VacancyApplication {
  id: number
  staff_position_id: number
  organization_branch_id?: number | null
  full_name: string
  phone?: string | null
  email?: string | null
  about?: string | null
  preferred_date?: string | null
  status: string
  status_label?: string | null
  interview_at?: string | null
  review_note?: string | null
  created_at?: string | null
  vacancy_title?: string | null
  job_position_name?: string | null
  department_name?: string | null
}

export function useApplicationStatuses() {
  return useQuery({
    queryKey: ['vacancy-applications', 'statuses'],
    queryFn: () => apiGet<{ value: string; label: string }[]>('vacancy-applications/statuses'),
    staleTime: 30 * 60 * 1000,
  })
}

export function useVacancyApplications(status: string, enabled: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  return useQuery({
    queryKey: ['vacancy-applications', 'list', branchId, status],
    queryFn: () =>
      apiGet<VacancyApplication[]>('vacancy-applications', { status: status || undefined }),
    enabled,
  })
}

export function useUpdateApplication() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      apiPatch<VacancyApplication>(`vacancy-applications/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vacancy-applications'] }),
  })
}

// ── Job-portallar (TZ V1 1277 «Публикация на внешних ресурсах») ─────────────
/** `auth_header` comes back as `********`; sending the mask back keeps the stored one. */
export const PORTAL_SECRET_MASK = '********'

export interface JobPortal {
  name: string
  url: string
  auth_header?: string | null
  format: 'xml' | 'json'
  enabled: boolean
}

const PORTALS_KEY = ['system-settings', 'vacancies'] as const

/** Site master admin only (`/system/settings/{key}` 403 for everyone else). */
export function useJobPortals(enabled: boolean) {
  return useQuery({
    queryKey: PORTALS_KEY,
    queryFn: () => apiGet<{ job_portals: JobPortal[] }>('system/settings/vacancies', { _no_branch_inject: true }),
    enabled,
  })
}

export function useSaveJobPortals() {
  const qc = useQueryClient()
  return useMutation({
    meta: { silent: true },
    mutationFn: (job_portals: JobPortal[]) =>
      apiPut<{ job_portals: JobPortal[] }>('system/settings/vacancies', { job_portals }, { params: { _no_branch_inject: true } }),
    onSuccess: (data) => qc.setQueryData(PORTALS_KEY, data),
  })
}

export interface PortalDelivery {
  portal?: string | null
  url?: string | null
  format?: string | null
  action?: string | null
  status_code?: number | null
  ok?: boolean
  error?: string | null
  at?: string | null
}

export interface VacancyPushJob {
  id: number
  status: string
  error?: string | null
  created_at?: string | null
  finished_at?: string | null
  result?: { staff_position_id?: number | null; deliveries?: PortalDelivery[]; action?: string | null } | null
}

/**
 * Delivery log: `background_jobs` kind `vacancy_push`. `GET /jobs` lists the
 * CALLER's own jobs (the site master admin's saves land here).
 */
export function useVacancyPushJobs(enabled: boolean, limit = 50) {
  return useQuery({
    queryKey: ['jobs', 'vacancy_push', limit],
    queryFn: () => apiGet<VacancyPushJob[]>('jobs', { kind: 'vacancy_push', limit, _no_branch_inject: true }),
    enabled,
    meta: { silent: true },
  })
}
