import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'

const URL = 'module-responsibles'

/**
 * WHO RUNS A MODULE — News and Ijro, as a department, a job position or a
 * named person.
 *
 * Falling into ANY of the rows makes someone a manager of that module, which is
 * why the three scopes sit in one list rather than three settings: a department
 * head, everyone holding a position, and one hand-picked employee are the same
 * question asked three ways.
 *
 * The `driver` module uses this same table but is edited in the fleet screen
 * (Avtopark → Haydovchilar), because there it also decides who may be assigned
 * a car and who the nurse examines.
 */
export type ResponsibleModule = 'ijro' | 'news'

export interface Responsible {
  id: number
  module?: string | null
  /** department | job_position | employee */
  scope_type?: string | null
  scope_id?: number | null
  label?: string | null
  sub_label?: string | null
}

export function useResponsibles(module: ResponsibleModule) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: [URL, module, branchId],
    queryFn: () =>
      apiGet<Responsible[]>(URL, { module, organization_branch_id: branchId || undefined }),
  })
  return { rows: q.data ?? [], loading: q.isLoading }
}

export function useResponsibleMutations() {
  const qc = useQueryClient()
  const done = () => qc.invalidateQueries({ queryKey: [URL] })
  return {
    add: useMutation({
      mutationFn: (body: { module: string; scope_type: string; scope_id: number }) =>
        apiPost<Responsible>(URL, body),
      onSuccess: done,
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${URL}/${id}`), onSuccess: done }),
  }
}
