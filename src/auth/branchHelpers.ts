import type { OrganizationBranch, User } from '@/types'
import { ownBranchIds } from './permissions'

/** «O'zbekgidroenergo» AJ — Ijro apparati (bosh tashkilot). Qatordagi
 *  `is_head_office` bayrog'idan; bo'lmasa nom bo'yicha, oxirgi chora — `1`. */
export function findExecutiveBranchId(branches?: OrganizationBranch[] | null): number {
  const flagged = (branches || []).find((b) => b.is_head_office)
  if (flagged) return flagged.id
  const norm = (s: string) =>
    (s || '')
      .toLowerCase()
      .replace(/[‘’`']/g, '')
      .replace(/[«»"”“]/g, '')
  const match = (branches || []).find((b) => {
    const n = norm(b.name)
    return /\bozbekgidroenergo\b/.test(n) && !n.includes('filial')
  })
  return match?.id ?? 1
}

/**
 * Foydalanuvchi tanlay oladigan filiallar — backend o'qish ko'lami
 * (`/auth/me` → `actor.own_branch_ids`; `null` = global). Oddiy xodim va
 * filial xodimi faqat o'z filialini ko'radi; tanlagich u holda statik yorliq.
 */
export function visibleBranches(
  branches: OrganizationBranch[],
  user: User | null | undefined,
): OrganizationBranch[] {
  const own = ownBranchIds(user)
  if (own === null) return branches
  return branches.filter((b) => own.includes(Number(b.id)))
}
