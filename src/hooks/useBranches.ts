import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/http'
import { ORGANIZATION_BRANCHES } from '@/api/endpoints'
import { toItems, type ListResponse, type OrganizationBranch } from '@/types'
import { useAuthStore } from '@/store/authStore'
import { useBranchStore } from '@/store/branchStore'
import * as roles from '@/auth/roles'
import { findExecutiveBranchId } from '@/auth/branchHelpers'

/** Loads organization branches and keeps the branch store populated. */
export function useBranches() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setBranches = useBranchStore((s) => s.setBranches)

  const query = useQuery({
    /**
     * ⚠️ ITS OWN KEY, NOT `['organization-branches']`.
     *
     * `useBranchAdmin` (the /filiallar editor) and `useTabelBranches` read the
     * SAME endpoint under that bare key and need the whole record. Sharing the
     * key would hand them these lean rows and they would edit — and save —
     * around fields that simply were not there.
     */
    queryKey: ['organization-branches', 'slim'],
    // The shell's boot request. `slim` drops `turnstile_access_lists` and the
    // settings blobs nothing in the header reads: 26.5 KB → 2.9 KB on every
    // hard load, for every user.
    queryFn: () => apiGet<ListResponse<OrganizationBranch>>(ORGANIZATION_BRANCHES, { slim: true }),
    enabled: isAuthenticated,
    staleTime: 10 * 60_000,
  })

  const branches = toItems(query.data)

  useEffect(() => {
    if (branches.length > 0) setBranches(branches)
  }, [branches, setBranches])

  return { ...query, branches }
}

/**
 * Seeds a sensible default selected branch once the user + branches are known.
 * Mirrors the v1 App.jsx effect: master/executive users may deselect to
 * "All branches"; branch-scoped users default to their first allowed branch.
 */
export function useBranchInit(branches: OrganizationBranch[]) {
  const user = useAuthStore((s) => s.user)
  const selectedBranchId = useBranchStore((s) => s.selectedBranchId)
  const setSelectedBranchId = useBranchStore((s) => s.setSelectedBranchId)
  const markBranchReady = useBranchStore((s) => s.markBranchReady)

  useEffect(() => {
    if (!user) {
      try {
        sessionStorage.removeItem('branch_initialized')
      } catch {
        /* ignore */
      }
      return
    }

    const initialized = (() => {
      try {
        return !!sessionStorage.getItem('branch_initialized')
      } catch {
        return false
      }
    })()
    const markInit = () => {
      try {
        sessionStorage.setItem('branch_initialized', 'true')
      } catch {
        /* ignore */
      }
    }

    // Global (master/ministr): branch optional. Seed only on first init.
    if (roles.isMasterAdmin(user)) {
      if (!initialized) {
        if (!selectedBranchId) setSelectedBranchId(1)
        markInit()
      }
      markBranchReady()
      return
    }

    const execBranchId = findExecutiveBranchId(branches)
    const canSwitchScope = roles.canSwitchBranchScope(user, execBranchId)

    if (initialized) {
      // "All branches" is a decision too — the queries must stop waiting.
      if (selectedBranchId || canSwitchScope) {
        markBranchReady()
        return
      }
    }

    const allowed = roles.getAllowedBranchIds(user)
    if (allowed.length > 0) {
      markInit()
      if (!selectedBranchId || !allowed.includes(selectedBranchId)) {
        setSelectedBranchId(allowed[0])
      }
      markBranchReady()
      return
    }

    // Regular employee: derive branch from department.
    const empBranchId = user.employee?.department?.organization_branch_id
    if (empBranchId && !selectedBranchId) {
      markInit()
      setSelectedBranchId(empBranchId)
    }
    // No branch could be derived — nothing more will come, so release the gate
    // rather than leaving the board blank forever.
    markBranchReady()
  }, [user, selectedBranchId, setSelectedBranchId, markBranchReady, branches])
}
