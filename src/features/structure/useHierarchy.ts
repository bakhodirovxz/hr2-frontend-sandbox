import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  HIERARCHIES,
  HIERARCHY,
  HIERARCHY_CONNECTION,
  HIERARCHY_CONNECTIONS,
  STRUCTURE_HISTORY_AS_OF,
} from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'

/** Which side of a card an edge leaves from or arrives at. */
export type Handle = 'top' | 'bottom' | 'left' | 'right'

export interface HierarchyConnection {
  id: number
  source_id: number
  target_id: number
  source_handle?: Handle | null
  target_handle?: Handle | null
  edge_style?: string | null
  label?: string | null
}

export interface HierarchyNode {
  id: number
  name?: string | null
  description?: string | null
  /** Hand-typed headcount. Only shown when the node is NOT linked to a real
   *  department — a linked node reports the staffing table's own numbers. */
  employee_count?: number | null
  department_id?: number | null
  department_name?: string | null
  occupied_units?: number | string | null
  planned_units?: number | string | null
  vacant_units?: number | string | null
  /** Closest department the server could guess; HR confirms it with one click. */
  suggested_department_id?: number | null
  suggested_department_name?: string | null
  organization_branch_id?: number | null
  position_x?: number | null
  position_y?: number | null
  node_type?: string | null
  accent_color?: string | null
  outgoing_connections?: HierarchyConnection[] | null
  incoming_connections?: HierarchyConnection[] | null
}

/** The org chart of the selected branch, as stored right now. */
export function useHierarchy(branchId: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['hierarchies', branchId],
    queryFn: () => apiGet<HierarchyNode[]>(HIERARCHIES, { organization_branch_id: branchId }),
    enabled: enabled && !!branchId,
  })
  return { nodes: q.data ?? [], loading: q.isLoading }
}

/** One department as it stood on the day (TZ 2029/2061). */
export interface SnapshotDepartment {
  id: number
  code?: string | null
  name?: string | null
  parent_id?: number | null
  closed_at?: string | null
  head_employee_id?: number | null
}

export interface SnapshotPosition {
  id: number
  name?: string | null
  category?: string | null
  razryad?: number | null
}

export interface SnapshotStaffPosition {
  id: number
  department_id?: number | null
  job_position_id?: number | null
  planned_units?: number | null
  closed?: boolean
}

interface SnapshotResponse {
  found: boolean
  on?: string
  taken_at?: string | null
  reason?: string | null
  departments?: SnapshotDepartment[]
  positions?: SnapshotPosition[]
  staff_positions?: SnapshotStaffPosition[]
  payload?: { nodes?: HierarchyNode[]; edges?: HierarchyConnection[] } | null
}

/**
 * The chart AS IT STOOD on a given day (TZ 4.2.6 «на заданную дату»).
 *
 * The snapshot stores nodes and edges as two flat lists, while the live
 * endpoint hangs the edges off each node. Rather than teach the chart two
 * shapes, the snapshot is folded into the live shape here — the renderer then
 * never knows which of the two it is drawing.
 */
export function useStructureSnapshot(branchId: number | null, on: string) {
  const q = useQuery({
    queryKey: ['structure-history', branchId, on],
    queryFn: () =>
      apiGet<SnapshotResponse>(STRUCTURE_HISTORY_AS_OF, { organization_branch_id: branchId, on }),
    enabled: !!branchId && !!on,
  })

  const data = q.data
  const nodes: HierarchyNode[] | null =
    data?.found && data.payload?.nodes?.length
      ? (data.payload.nodes ?? []).map((n) => ({
          ...n,
          outgoing_connections: (data.payload?.edges ?? []).filter((e) => e.source_id === n.id),
          incoming_connections: (data.payload?.edges ?? []).filter((e) => e.target_id === n.id),
        }))
      : null

  return {
    nodes,
    found: !!data?.found,
    departments: data?.found ? data.departments ?? [] : [],
    positions: data?.positions ?? [],
    staffPositions: data?.staff_positions ?? [],
    takenAt: data?.taken_at ?? null,
    /** A date was asked for but nothing was recorded then — the caller falls
     *  back to the live chart and says so, rather than showing an empty page. */
    missing: !!on && !!data && !data.found,
    loading: q.isLoading,
  }
}

export function useHierarchyMutations() {
  const qc = useQueryClient()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['hierarchies'] })
    // A write also produces a new snapshot, so the date view must not serve
    // the copy it cached before the edit.
    void qc.invalidateQueries({ queryKey: ['structure-history'] })
  }
  return {
    invalidate,
    createNode: useMutation({
      mutationFn: (body: Record<string, unknown>) =>
        apiPost<HierarchyNode>(HIERARCHIES, { ...body, organization_branch_id: branchId }),
    }),
    updateNode: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<HierarchyNode>(HIERARCHY(id), body),
    }),
    removeNode: useMutation({ mutationFn: (id: number) => apiDelete(HIERARCHY(id)) }),
    connect: useMutation({
      mutationFn: (body: {
        source_id: number
        target_id: number
        source_handle: Handle
        target_handle: Handle
      }) => apiPost<HierarchyConnection>(HIERARCHY_CONNECTIONS, body),
    }),
    disconnect: useMutation({ mutationFn: (id: number) => apiDelete(HIERARCHY_CONNECTION(id)) }),
  }
}
