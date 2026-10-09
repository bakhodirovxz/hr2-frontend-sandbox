import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiPost } from '@/api/http'

/**
 * KPI STANDART MA'LUMOTLARI — the one-off reference-data seeders.
 *
 * These three routes exist because the KPI module ships with a Verifix
 * catalogue that has to reach the database ONCE, when a system is first stood
 * up: the key-result types a goal can be measured with, the bonus operation
 * types, and the role × screen × action grant matrix that every permission
 * check reads from. They are not day-to-day operations, and nothing else in the
 * product writes those tables wholesale.
 *
 * All three are idempotent on the server — an existing row is skipped, never
 * duplicated — with ONE exception: `seed-role-permissions?reset=true` deletes
 * the whole matrix first and rebuilds it from the defaults, which throws away
 * any grant an administrator set by hand. That is why the reset lives behind
 * its own, differently worded confirmation in the panel.
 *
 * ⚠️ PATHS ARE INLINED HERE, not added to `@/api/endpoints`: that file is
 * being edited by another change in flight and a second writer would clobber
 * it. Promote them (as `KPI_SEED_KR_TYPES`, `KPI_SEED_BONUS_OPER_TYPES`,
 * `KPI_SEED_ROLE_PERMISSIONS` — the names web v1 already uses in
 * `shared/utils/urls.js`) once the tree is quiet.
 */
const KPI_SEED_KR_TYPES = 'kpi/seed-key-result-types'
const KPI_SEED_BONUS_OPER_TYPES = 'kpi/seed-bonus-oper-types'
const KPI_SEED_ROLE_PERMISSIONS = 'kpi/seed-role-permissions'

/**
 * What a seeder answers with. The three routes agree on `created` and differ
 * after that: the key-result seeder also names the branches it wrote to, and
 * the permission seeder echoes whether it ran as a reset. Both extras are
 * optional here so one panel can report all three the same way.
 */
export interface KpiSeedResult {
  created?: number
  branches?: number[]
  reset?: boolean
}

/**
 * The three seeders as mutations.
 *
 * Every one of them invalidates the whole `['kpi']` cache rather than a
 * targeted key: seeding writes catalogue rows that half the module reads
 * (goal forms offer key-result types, the bonus screen offers operation types,
 * every permission check consults the grant matrix), and a partial
 * invalidation here is how a freshly seeded catalogue stays invisible until
 * the next full reload.
 */
export function useKpiSeedMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['kpi'] })

  return {
    invalidate,
    seedKrTypes: useMutation({
      mutationFn: () => apiPost<KpiSeedResult>(KPI_SEED_KR_TYPES, {}),
      onSuccess: invalidate,
    }),
    seedBonusOperTypes: useMutation({
      mutationFn: () => apiPost<KpiSeedResult>(KPI_SEED_BONUS_OPER_TYPES, {}),
      onSuccess: invalidate,
    }),
    /* `reset` is a QUERY param on the server (`?reset=true`), not a body
       field — sending it in the body silently seeded without resetting. */
    seedRolePermissions: useMutation({
      mutationFn: (reset: boolean) =>
        apiPost<KpiSeedResult>(KPI_SEED_ROLE_PERMISSIONS, {}, { params: { reset } }),
      onSuccess: invalidate,
    }),
  }
}
