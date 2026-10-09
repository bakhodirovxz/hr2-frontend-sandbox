import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/api/http'
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
import { useBranchStore } from '@/store/branchStore'
import type { User } from '@/types'
import * as roles from '@/auth/roles'

/**
 * SHTAT VA VAKANSIYA — TZ 4.2.6 (штатная структура) + 4.2.10 (вакантные места).
 *
 * One register answers both: a staff row carries how many units are APPROVED,
 * how many are OCCUPIED (derived from live employees, never typed in) and
 * therefore how many are VACANT. The vacancy announcement (requirements,
 * salary band, deadline, contacts) hangs off the same row, because a vacancy
 * that is not a staff line is a promise nobody has budgeted for.
 */

export type StaffCategory = 'rahbar' | 'mutaxassis' | 'xizmatchi' | 'ishchi'

export const STAFF_CATEGORIES: StaffCategory[] = [
  'rahbar',
  'mutaxassis',
  'xizmatchi',
  'ishchi',
]

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
  branch_regions?: string[]
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
  /** What the candidate must bring, and what the post offers in return. */
  experience_years?: number | null
  required_skills?: string | null
  work_schedule?: string | null
  employment_type?: string | null
  /** open | paused | closed */
  vacancy_status?: string | null
}

interface CategorySummary {
  category?: string | null
  planned_units: number | string
  occupied_units: number | string
  vacant_units: number | string
  rows: number
}

interface StaffSummary {
  planned_units: number | string
  occupied_units: number | string
  vacant_units: number | string
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

interface StaffChange {
  id: number
  action: string
  old_planned_units?: number | string | null
  new_planned_units?: number | string | null
  reason?: string | null
  created_at?: string | null
  changed_by_name?: string | null
}

/** Same set the backend's structure-manager guard accepts. */
export function canManageStaff(user: User | null | undefined): boolean {
  // Server `require_structure_manager` → `org_structure_scope`, which DENIES a ministr (measured 403).
  return roles.isSiteMasterAdmin(user) || roles.isHR(user)
}

/** Units come back as decimals; "1.00" must read as "1" and "0.50" as "0.5". */
export function fmtUnits(value: number | string | null | undefined): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)))
}

interface StaffQuery {
  page: number
  size: number
  search?: string
  departmentId?: string
  jobPositionId?: string
  category?: string
  onlyVacant?: boolean
  includeClosed?: boolean
  sortBy?: string
  sortDir?: 'asc' | 'desc'
}

export function useStaffPositions(query: StaffQuery, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['staff-positions', 'list', branchId, query],
    queryFn: () =>
      apiGet<{ items: StaffPosition[]; total: number; page: number; size: number; pages: number }>(
        STAFF_POSITIONS,
        {
          organization_branch_id: branchId || undefined,
          page: query.page,
          size: query.size,
          search: query.search || undefined,
          department_id: query.departmentId || undefined,
          job_position_id: query.jobPositionId || undefined,
          category: query.category || undefined,
          only_vacant: query.onlyVacant || undefined,
          include_closed: query.includeClosed || undefined,
          sort_by: query.sortBy || undefined,
          sort_dir: query.sortDir || undefined,
        },
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
    denied: q.isError,
  }
}

export function useStaffSummary() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['staff-positions', 'summary', branchId],
    queryFn: () =>
      apiGet<StaffSummary>(STAFF_POSITIONS_SUMMARY, {
        organization_branch_id: branchId || undefined,
      }),
    retry: false,
  })
  return { summary: q.data ?? null, loading: q.isLoading, failed: q.isError }
}

/**
 * The register's own defect list: employees with no department, positions with
 * no category, spelling duplicates, over-staffed rows. Nothing here is fixed
 * automatically — every one of them is a decision the personnel office owns.
 */
export function useStaffIssues(enabled: boolean) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['staff-positions', 'issues', branchId],
    queryFn: () =>
      apiGet<{ groups: IssueGroup[] }>(STAFF_POSITIONS_ISSUES, {
        organization_branch_id: branchId || undefined,
      }),
    enabled,
    retry: false,
  })
  const groups = q.data?.groups ?? []
  return {
    groups,
    total: groups.reduce((s, g) => s + (g.total || 0), 0),
    loading: q.isLoading,
    error: q.error,
    refetch: q.refetch,
    // A 403 must read as "not for you", never as "nothing wrong here".
    denied: q.isError,
  }
}

export function useStaffChanges(id: number | null | undefined) {
  const q = useQuery({
    queryKey: ['staff-positions', 'changes', id],
    queryFn: () => apiGet<StaffChange[]>(STAFF_POSITION_CHANGES(id as number)),
    enabled: !!id,
  })
  return { changes: q.data ?? [], loading: q.isLoading }
}

export function useStaffMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['staff-positions'] })
  return {
    invalidate,
    create: useMutation({
      mutationFn: (body: Record<string, unknown>) => apiPost<StaffPosition>(STAFF_POSITIONS, body),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<StaffPosition>(STAFF_POSITION_DETAIL(id), body),
      onSuccess: invalidate,
    }),
    close: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
        apiPost<StaffPosition>(STAFF_POSITION_CLOSE(id), null, { params: { reason } }),
      onSuccess: invalidate,
    }),
    reopen: useMutation({
      mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
        apiPost<StaffPosition>(STAFF_POSITION_REOPEN(id), null, { params: { reason } }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: number) => apiDelete(STAFF_POSITION_DETAIL(id)),
      onSuccess: invalidate,
    }),
  }
}

// ── Ommaviy shtat tahriri (TZ 4.2.10) ────────────────────────────────────────
/**
 * One department's planned units, edited as a block and saved in ONE request.
 *
 * WHY a bulk route rather than N PATCHes: a department is planned as a whole —
 * moving two units from one position to another is a single decision, and the
 * backend records ONE change entry with a shared reason for it. Saving row by
 * row would scatter that decision across N history entries and leave the table
 * half-applied if a later row failed.
 *
 * Only genuinely changed rows are sent (web v1 ShtatPage does the same), so an
 * accidental "save" with nothing edited is a no-op rather than a bogus history
 * line on every position of the department.
 */
export interface StaffBulkRow {
  department_id: number
  job_position_id: number
  planned_units: number
}

export function useStaffBulkUpsert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { rows: StaffBulkRow[]; reason?: string }) =>
      apiPost<{ updated: number }>(STAFF_POSITIONS_BULK_UPSERT, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-positions'] }),
  })
}

// ── Eksport ustunlari (TZ 4.2.10 «Настройки экспорта») ───────────────────────
export interface ExportColumn {
  key: string
  label: string
}

/**
 * The column set the Excel export understands. Fetched rather than hard-coded
 * so the picker cannot drift from `StaffPositionService.EXPORT_COLUMNS`: a
 * column renamed on the server would otherwise silently produce an export
 * missing that column, with no error anywhere.
 */
export function useStaffExportColumns(enabled = true) {
  return useQuery({
    queryKey: ['staff-positions', 'export-columns'] as const,
    queryFn: () => apiGet<ExportColumn[]>(STAFF_POSITIONS_EXPORT_COLUMNS),
    enabled,
    staleTime: 30 * 60 * 1000,
  })
}

// ── Vakansiya xabarnomasi (TZ 4.2.10 «Получение отчетов о вакантных местах») ─
export interface VacancyNotifySettings {
  id?: number | null
  organization_branch_id?: number | null
  frequency?: string | null
  frequency_label?: string | null
  day_of_week?: number | null
  day_of_month?: number | null
  hour?: number | null
  /** Empty for a caller whose org-structure scope is DENY — the server hides
   *  the recipient list rather than refusing the whole request. */
  recipient_ids?: number[]
  last_sent_at?: string | null
  frequencies?: { value: string; label: string }[]
}

export function useVacancyNotifySettings(branchId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['staff-positions', 'notify-settings', branchId] as const,
    queryFn: () =>
      apiGet<VacancyNotifySettings>(STAFF_POSITIONS_NOTIFY_SETTINGS, {
        organization_branch_id: branchId || undefined,
      }),
    enabled,
  })
}

export function useSaveVacancyNotifySettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<VacancyNotifySettings>) =>
      apiPut<VacancyNotifySettings>(STAFF_POSITIONS_NOTIFY_SETTINGS, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-positions', 'notify-settings'] }),
  })
}
