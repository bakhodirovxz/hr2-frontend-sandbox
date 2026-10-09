import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiPut } from '@/api/http'
import { useBranchStore } from '@/store/branchStore'

// These belong in `src/api/endpoints.ts`; they are declared here because that
// file is being edited by other work streams right now. Move them when the
// tree is quiet.
const NAMING_RULE = 'job-positions/naming/rule'
const NAMING_BULK_RENAME = 'job-positions/naming/bulk-rename'

export interface NamingToken {
  token: string
  label: string
}

export interface NamingRule {
  id?: number
  organization_branch_id?: number | null
  full_template?: string | null
  short_template?: string | null
  /** When on, a position created or edited later is named by the template
   *  automatically; when off the rule only applies through a bulk rename. */
  auto_apply?: boolean
  abbreviations?: Record<string, string>
  default_abbreviations?: Record<string, string>
  tokens?: NamingToken[]
}

export interface RenameChange {
  id: number
  old_name?: string | null
  new_name?: string | null
  new_short_name?: string | null
}

export interface RenamePreview {
  total: number
  changes?: RenameChange[]
}

/**
 * «Массовое переформирование наименований должностей» (TZ 4.2.6).
 *
 * A branch may keep its own rule; asking for a branch that has none returns the
 * SHARED rule, and saving then creates a branch row instead of overwriting the
 * shared one. That is why the branch id travels with every call — reading and
 * writing must agree on which rule is meant.
 */
export function useNamingRule(branchId: number | null, enabled = true) {
  return useQuery({
    queryKey: ['naming-rule', branchId] as const,
    queryFn: () =>
      apiGet<NamingRule>(NAMING_RULE, { organization_branch_id: branchId || undefined }),
    enabled,
  })
}

export function useNamingRuleMutations() {
  const qc = useQueryClient()
  const branchId = useBranchStore((s) => s.selectedBranchId)
  return {
    save: useMutation({
      mutationFn: (body: Partial<NamingRule>) =>
        apiPut<NamingRule>(NAMING_RULE, { organization_branch_id: branchId || undefined, ...body }),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['naming-rule'] }),
    }),

    /**
     * `dry_run` defaults to TRUE server-side and the TZ requires the result to
     * be SHOWN before anything is written — a rename touches every position of
     * a branch at once and is not undoable from the UI. So the dialog always
     * previews first and only then offers to apply.
     */
    preview: useMutation({
      mutationFn: (departmentId?: number | null) =>
        apiPost<RenamePreview>(NAMING_BULK_RENAME, {
          organization_branch_id: branchId || undefined,
          department_id: departmentId || undefined,
          dry_run: true,
        }),
    }),

    apply: useMutation({
      mutationFn: (departmentId?: number | null) =>
        apiPost<RenamePreview>(NAMING_BULK_RENAME, {
          organization_branch_id: branchId || undefined,
          department_id: departmentId || undefined,
          dry_run: false,
        }),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['structure-positions'] })
        void qc.invalidateQueries({ queryKey: ['structure-departments'] })
        // Renamed positions must show their new names in the pickers too.
        void qc.invalidateQueries({ queryKey: ['job-positions'] })
        void qc.invalidateQueries({ queryKey: ['departments'] })
      },
    }),
  }
}
