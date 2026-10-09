import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  ORGANIZATION_BRANCHES,
  ORGANIZATION_BRANCH_DETAIL,
  ORGANIZATION_BRANCH_LEADERS,
  ORGANIZATION_BRANCH_LEADER_DELETE,
  ORGANIZATION_BRANCH_LOGO,
  ORGANIZATION_BRANCH_UPLOAD_LOGO,
} from '@/api/endpoints'
import { toItems, type ListResponse, type OrganizationBranch } from '@/types'

/**
 * TABEL SOZLAMALARI (TZ I2 «Yakuniy tabel») — hr-backend-sandbox
 * `organization-branches`: hujjat sarlavhasi va imzolari (`tabel_config`),
 * filial logosi va filial rahbarlari (direktor / o'rinbosar).
 */

/** Filialda sozlama bo'lmasa ko'rsatiladigan standart (v1 bilan bir xil). */
export const DEFAULT_TABEL_CONFIG = {
  approver: {
    org: '"Ўзбекгидроэнерго" акциядорлик жамияти',
    title: 'Бошқарув раиси ўринбосари',
    name: 'Ф. Нуруллаев',
  },
  title_prefix: '"Ўзбекгидроэнерго" АЖ ижро аппарати ходимларининг',
  signers: [
    { position: 'Бош ҳисобчи', name: '' },
    { position: 'Иқтисодий таҳлил, режалаштириш ва хавфларни баҳолаш департаменти бошлиғи', name: '' },
    { position: 'Инсон ресурслари бошқармаси бош мутахассиси', name: '' },
  ],
}

/** Server qabul qiladigan rahbar rollari (`schemas.organization.ALLOWED_LEADERSHIP_ROLES`). */
export const LEADERSHIP_ROLES = ['director', 'deputy'] as const
export type LeadershipRole = (typeof LEADERSHIP_ROLES)[number]

export interface BranchLeader {
  branch_id?: number | null
  employee_id?: number | null
  leadership_role: string
  employee?: {
    id?: number
    legal_name?: string | null
    photo_path?: string | null
    photo_thumb_path?: string | null
    job_position?: { name?: string | null } | null
  } | null
}

/** Barcha filiallar (`tabel_config`, `logo_path` bilan) — sozlamalar jadvali. */
export function useTabelBranches() {
  const q = useQuery({
    queryKey: ['tabel-branches'],
    queryFn: () => apiGet<ListResponse<OrganizationBranch>>(ORGANIZATION_BRANCHES),
  })
  return { branches: toItems(q.data), loading: q.isLoading, error: q.error, refetch: q.refetch }
}

/** Bitta filial to'liq (buyruq blanki sozlamasi ham shundan o'qiydi). */
export function useBranchDetail(branchId: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['organization-branch', branchId],
    queryFn: () => apiGet<OrganizationBranch>(ORGANIZATION_BRANCH_DETAIL(branchId!)),
    enabled: enabled && !!branchId,
  })
  return { branch: q.data ?? null, loading: q.isLoading }
}

const NO_LEADERS: BranchLeader[] = []

/** Filial rahbarlari — (xodim, rol) juftligi bitta qator. */
export function useBranchLeaders(branchId: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['branch-leaders', branchId],
    queryFn: () => apiGet<BranchLeader[]>(ORGANIZATION_BRANCH_LEADERS(branchId!)),
    enabled: enabled && !!branchId,
  })
  // Barqaror bo'sh massiv: har renderda yangi `[]` effektlarni cheksiz aylantirardi.
  return { leaders: q.data ?? NO_LEADERS, loading: q.isLoading, refetch: q.refetch }
}

export function useTabelMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['tabel-branches'] })
    qc.invalidateQueries({ queryKey: ['organization-branch'] })
    qc.invalidateQueries({ queryKey: ['branch-leaders'] })
  }
  return {
    invalidate,
    updateBranch: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<OrganizationBranch>(ORGANIZATION_BRANCH_DETAIL(id), body),
    }),
    uploadLogo: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost<OrganizationBranch>(ORGANIZATION_BRANCH_UPLOAD_LOGO(id), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
    }),
    deleteLogo: useMutation({
      mutationFn: (id: number) => apiDelete<OrganizationBranch>(ORGANIZATION_BRANCH_LOGO(id)),
    }),
    addLeader: useMutation({
      mutationFn: ({ id, employee_id, role }: { id: number; employee_id: number; role: string }) =>
        apiPost(ORGANIZATION_BRANCH_LEADERS(id), { employee_id, leadership_role: role }),
    }),
    // `?role=` — faqat shu rol olinadi; xodimning boshqa rollari qoladi.
    removeLeader: useMutation({
      mutationFn: ({ id, employee_id, role }: { id: number; employee_id: number; role: string }) =>
        apiDelete(`${ORGANIZATION_BRANCH_LEADER_DELETE(id, employee_id)}?role=${encodeURIComponent(role)}`),
    }),
  }
}
