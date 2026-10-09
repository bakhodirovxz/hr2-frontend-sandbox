/* Auto-inject organization_branch_id into request params based on the globally
 * selected branch. Ported from the v1 frontend's mergeOrganizationBranchId so the
 * backend scoping behaves identically. */

type Params = Record<string, unknown>

function pathOf(url: string): string {
  return String(url).split('?')[0].replace(/^\/+/, '')
}

function isAuthApiUrl(url: string): boolean {
  return pathOf(url).startsWith('auth/')
}

/** CRUD endpoints under /visitors (not dashboard/turnstile routes). */
function isVisitorsApiUrl(url: string): boolean {
  const path = pathOf(url)
  return (
    path === 'visitors' ||
    path.startsWith('visitors/') ||
    path === 'turnstile-attendance-events/visitors'
  )
}

/** GET turnstile-attendance-events/normalized (+ subpaths). */
function isTurnstileNormalizedAttendanceUrl(url: string): boolean {
  const path = pathOf(url)
  return (
    path === 'turnstile-attendance-events/normalized' ||
    path.startsWith('turnstile-attendance-events/normalized/')
  )
}

/**
 * Merge organization_branch_id into params.
 *  - Pass organization_branch_id: null to opt out (sends no param).
 *  - Pass _no_branch_inject: true to fully block injection.
 */
export function mergeOrganizationBranchId(
  url: string,
  params: Params = {},
  selectedBranchId: number | null,
): Params {
  const merged: Params = { ...params }

  if (merged._no_branch_inject === true) {
    return merged
  }

  if ('organization_branch_id' in merged) {
    if (merged.organization_branch_id == null) {
      delete merged.organization_branch_id
    }
    return merged
  }

  if (!selectedBranchId) return merged

  const shouldInject =
    !isAuthApiUrl(url) &&
    (isTurnstileNormalizedAttendanceUrl(url) || !isVisitorsApiUrl(url))

  if (shouldInject) {
    merged.organization_branch_id = selectedBranchId
  }
  return merged
}
