import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { fetchAllPages } from '@/api/fetchAll'
import { DEPARTMENTS_LIST, JOB_POSITIONS_LIST } from '@/api/endpoints'
import { type ListResponse } from '@/types'
import { useBranchStore } from '@/store/branchStore'

export interface Department {
  id: number
  name?: string | null
  index?: number | null
  /** TZ S1 «код подразделения» — filial ichida noyob. */
  code?: string | null
  organization_branch_id?: number | null
  navbatchilik_needs_approval?: boolean
  navbatchilik_changed_by_name?: string | null
  navbatchilik_changed_at?: string | null
  has_navbatchilik?: boolean
  is_secretariat?: boolean
  is_news_manager?: boolean
  is_ijro_manager?: boolean
  heads?: { id: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null }[] | null
  /** Set when the department was RETIRED («сокращение»), not deleted — it stays
   *  in history and is simply no longer offered for new assignments. */
  closed_at?: string | null
  closed_reason?: string | null
  /** From `ORMBase` — every read schema carries it; v1 shows it as «Yaratilgan». */
  created_at?: string | null
}

export interface JobPosition {
  id: number
  name?: string | null
  short_name?: string | null
  razryad?: number | null
  /** rahbar | mutaxassis | xizmatchi | ishchi — shtat ekrani shu bo'yicha
   *  filtrlaydi, forma esa uni hech qachon qo'ymasdi. */
  category?: string | null
  organization_branch_id?: number | null
}

interface StructurePage<T> {
  items: T[]
  total: number
  pages: number
}

function toPage<T>(res: ListResponse<T>, size: number): StructurePage<T> {
  if (Array.isArray(res)) {
    return { items: res, total: res.length, pages: Math.max(1, Math.ceil(res.length / size)) }
  }
  const items = res.items ?? []
  // The backend envelope carries `total`; the shared type still calls it `count`.
  const total = (res as { total?: number }).total ?? res.count ?? items.length
  return { items, total, pages: res.pages ?? Math.max(1, Math.ceil(total / size)) }
}

/**
 * Departments + positions for the selected branch.
 *
 * `search` goes to the SERVER, never a client filter: the old `size: 200`
 * cap meant a client filter only ever saw the first 200 rows, so a
 * department at row 201 (there are 376 in the head office, 913 positions)
 * could not be found and the page came up empty.
 *
 * Both lists use the backend page envelope (`page`/`size`).
 *
 * ⚠️ `positions` (the FULL list) IS STILL RETURNED AND MUST STAY. It feeds the
 * position dropdown in `features/kpi/KpiResultsTab.tsx`, which needs every row,
 * not a page — so the table got its own paged query (`positionsPage`) rather
 * than the shared one being narrowed. The old comment here claimed job
 * positions "come back as a bare list"; they do not, the endpoint has taken
 * `OptionalPage` for a while, which is why the table could walk 12x500 rows to
 * show 25.
 */
export function useStructure(
  search = '',
  page = 1,
  size = 25,
  includeClosed = false,
  /**
   * Also fetch EVERY position (not just the page) for a picker.
   *
   * Opt-in on purpose: the structure table needs one page, and leaving the
   * full walk on by default would keep the cost this change removes — the
   * table would page on the server and still download all 913 rows next to it.
   *
   * ⚠️ KEEP THIS FIFTH. `KpiResultsTab` passes `true` positionally, so slipping
   * a new argument in front of it silently turns "give me every position" into
   * a category filter — which is exactly what happened when `category` was
   * first added here.
   */
  allPositions = false,
  /** Position category (rahbar/mutaxassis/xizmatchi/ishchi). v1 filtered by it. */
  category = '',
) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = search.trim()
  const base = {
    organization_branch_id: branchId || undefined,
    search: term || undefined,
    // Retired departments are hidden by default (they must not be offered for
    // new assignments) but have to be reachable to be reopened.
    include_closed: includeClosed || undefined,
  }

  const departments = useQuery({
    queryKey: ['structure-departments', branchId, term, page, size, includeClosed],
    queryFn: async () =>
      toPage(await apiGet<ListResponse<Department>>(DEPARTMENTS_LIST, { ...base, page, size }), size),
    placeholderData: (prev) => prev,
  })
  /**
   * The whole list, for pickers. Walked page by page: the server rejects a page
   * bigger than 500 and a big branch holds more positions than that.
   */
  const positions = useQuery({
    queryKey: ['structure-positions', branchId, term, includeClosed],
    queryFn: async () => await fetchAllPages<JobPosition>(JOB_POSITIONS_LIST, base),
    enabled: allPositions,
    placeholderData: (prev) => prev,
    // Near-static reference data; the tab strip flips back and forth.
    staleTime: 5 * 60_000,
  })

  /** One page, for the table — the same shape the departments query returns. */
  const positionsPage = useQuery({
    queryKey: ['structure-positions', 'page', branchId, term, page, size, includeClosed, category],
    queryFn: async () =>
      toPage(
        await apiGet<ListResponse<JobPosition>>(JOB_POSITIONS_LIST, {
          ...base,
          category: category || undefined,
          page,
          size,
        }),
        size,
      ),
    placeholderData: (prev) => prev,
  })

  return {
    /** Every id the current filter matches — «select all N» of the BulkBar. */
    loadAllDepartmentIds: () =>
      fetchAllPages<Department & { id: number }>(DEPARTMENTS_LIST, base, 500, 60).then((r) => r.map((x) => x.id)),
    loadAllPositionIds: () =>
      fetchAllPages<JobPosition & { id: number }>(JOB_POSITIONS_LIST, { ...base, category: category || undefined }, 500, 60).then((r) =>
        r.map((x) => x.id),
      ),
    departments: departments.data?.items ?? [],
    refetchDepartments: departments.refetch,
    departmentsTotal: departments.data?.total ?? 0,
    departmentsPages: departments.data?.pages ?? 1,
    departmentsLoading: departments.isLoading,
    departmentsError: departments.error,
    refetchPositions: positionsPage.refetch,
    positionsPage: positionsPage.data?.items ?? [],
    positionsPageTotal: positionsPage.data?.total ?? 0,
    positionsPagePages: positionsPage.data?.pages ?? 1,
    positions: positions.data ?? [],
    positionsLoading: positionsPage.isLoading,
    positionsError: positionsPage.error,
  }
}
