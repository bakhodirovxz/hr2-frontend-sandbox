import { create } from 'zustand'
import type { OrganizationBranch } from '@/types'

const BRANCH_KEY = 'selected_branch_id'

function readSavedBranch(): number | null {
  try {
    const saved = localStorage.getItem(BRANCH_KEY)
    return saved ? Number(saved) : null
  } catch {
    return null
  }
}

interface BranchState {
  branches: OrganizationBranch[]
  selectedBranchId: number | null
  /**
   * Has the branch been DECIDED yet?
   *
   * ⚠️ NOT "is a branch selected" — for a master admin "all branches" (null) is
   * a legitimate answer, so the two states cannot be told apart by the id
   * alone. `useBranchInit` settles it in an effect, i.e. AFTER the first
   * render, and every branch-scoped query that fired in the meantime went out
   * with no branch and then refetched when one appeared.
   *
   * Measured on the dashboard before this flag: 70 requests / 3.31 MB, of
   * which ~35 were the same calls twice — including `employees-by-category`
   * unscoped, which returns the WHOLE organisation at 2.5 MB.
   */
  branchReady: boolean
  setBranches: (branches: OrganizationBranch[]) => void
  setSelectedBranchId: (id: number | null) => void
  markBranchReady: () => void
}

export const useBranchStore = create<BranchState>((set) => ({
  branches: [],
  selectedBranchId: readSavedBranch(),
  // A branch remembered from a previous session is already an answer.
  branchReady: readSavedBranch() != null,
  markBranchReady: () => set({ branchReady: true }),
  setBranches: (branches) => set({ branches }),
  setSelectedBranchId: (id) => {
    const prev = useBranchStore.getState().selectedBranchId
    try {
      if (id == null) localStorage.removeItem(BRANCH_KEY)
      else localStorage.setItem(BRANCH_KEY, String(id))
    } catch {
      /* ignore */
    }
    set({ selectedBranchId: id, branchReady: true })
    // The axios interceptor adds `organization_branch_id` to every request,
    // but a query whose KEY does not carry the branch never refetches when
    // the header changes: leave requests, registrations, turnstiles and the
    // phone directory kept showing the previous branch's rows under the new
    // branch's name (measured 2026-09-21, 18 of 43 pages). Refetching every
    // live query on a switch is the one rule that covers all of them; the
    // switch is rare and global reference lists are cheap.
    if (prev !== id) {
      void import('@/api/queryClient').then(({ queryClient }) => {
        void queryClient.invalidateQueries({ predicate: (q) => !String(q.queryKey[0]).startsWith('auth') })
      })
    }
  },
}))

/** Non-reactive read for the axios interceptor. */
export function getSelectedBranchId(): number | null {
  return useBranchStore.getState().selectedBranchId
}
