import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  LETTER_NEXT_REG_NUMBER,
  ORGANIZATION_BRANCHES,
  ORGANIZATION_BRANCH_DETAIL,
  ORGANIZATION_BRANCH_LEADERS,
  ORGANIZATION_BRANCH_LEADER_DELETE,
  ORGANIZATION_BRANCH_STAMP_PREVIEW,
  ORGANIZATION_BRANCH_TABEL_TEMPLATE,
  ORGANIZATION_BRANCH_UPLOAD_STAMP,
} from '@/api/endpoints'
import { toItems, type ListResponse, type OrganizationBranch, type StampCoords } from '@/types'

/** Default stamp text placement (% of stamp width/height), matching the backend. */
export const DEFAULT_STAMP_COORDS: StampCoords = {
  number: [66.6, 57.8],
  day: [25.1, 83.2],
  month: [50.8, 83.2],
  year: [72.9, 83.2],
  font_pct: 19.8,
}

/** Default tabel config used when a branch has none (mirrors v1). */
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

const num = (v: unknown, d: number) => {
  const x = Number(v)
  return Number.isFinite(x) ? x : d
}
const pair = (arr: unknown, d: [number, number]): [number, number] => {
  const a = Array.isArray(arr) ? arr : []
  return [num(a[0], d[0]), num(a[1], d[1])]
}

/** Coerce coords to numbers before sending (empty/NaN → default). */
export function sanitizeStampCoords(c?: Partial<StampCoords>): StampCoords {
  return {
    number: pair(c?.number, DEFAULT_STAMP_COORDS.number),
    day: pair(c?.day, DEFAULT_STAMP_COORDS.day),
    month: pair(c?.month, DEFAULT_STAMP_COORDS.month),
    year: pair(c?.year, DEFAULT_STAMP_COORDS.year),
    font_pct: num(c?.font_pct, DEFAULT_STAMP_COORDS.font_pct),
  }
}

export interface BranchLeader {
  id?: number
  employee_id?: number | null
  leadership_role: string
  employee?: { id?: number; legal_name?: string | null; photo_path?: string | null; photo_thumb_path?: string | null; job_position?: { name?: string } | null } | null
}

interface NextRegNumber {
  next_number?: string | null
  last_number?: string | null
  detail?: string | null
}

/** All branches (with tabel_config / stamp_path) for the settings table. */
export function useTabelBranches() {
  const q = useQuery({
    queryKey: ['tabel-branches'],
    queryFn: () => apiGet<ListResponse<OrganizationBranch>>(ORGANIZATION_BRANCHES),
  })
  return { branches: toItems(q.data), loading: q.isLoading, error: q.error, refetch: q.refetch }
}

/**
 * ONE branch, in full, fetched when a screen needs more than the header carries.
 *
 * The application shell's branch list is now `?slim=true` — id, name, counts —
 * so anything that edits a branch's own settings has to ask for the record
 * itself rather than reuse the picker's copy. That was worth doing on its own
 * merit: the shell's list is cached for ten minutes, so the blank editor could
 * open on a template someone had already changed.
 */
export function useBranchDetail(branchId: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['organization-branch', branchId],
    queryFn: () => apiGet<OrganizationBranch>(ORGANIZATION_BRANCH_DETAIL(branchId!)),
    enabled: enabled && !!branchId,
  })
  return { branch: q.data ?? null, loading: q.isLoading }
}

/** Leaders of a single branch (loaded when a modal opens). */
export function useBranchLeaders(branchId: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['branch-leaders', branchId],
    queryFn: () => apiGet<BranchLeader[]>(ORGANIZATION_BRANCH_LEADERS(branchId!)),
    enabled: enabled && !!branchId,
  })
  return { leaders: q.data ?? [], loading: q.isLoading, refetch: q.refetch }
}

/** Next registration number preview for a branch. */
export function useNextRegNumber(branchId: number | null, enabled: boolean) {
  const q = useQuery({
    queryKey: ['next-reg-number', branchId],
    queryFn: () =>
      apiGet<NextRegNumber>(LETTER_NEXT_REG_NUMBER, { organization_branch_id: branchId! }),
    enabled: enabled && !!branchId,
  })
  return { info: q.data ?? null, refetch: q.refetch }
}

export function useTabelMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['tabel-branches'] })
  return {
    invalidate,
    updateBranch: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(ORGANIZATION_BRANCH_DETAIL(id), body),
    }),
    uploadStamp: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost(ORGANIZATION_BRANCH_UPLOAD_STAMP(id), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
    }),
    // The branch's own Excel tabel form. Uploaded on pick (the server opens and
    // validates it — a missing {{name}} row is reported here, not at export
    // time); both calls return the refreshed branch so the modal can show the
    // new file name without waiting for the list to refetch.
    uploadTabelTemplate: useMutation({
      mutationFn: ({ id, file }: { id: number; file: File }) => {
        const fd = new FormData()
        fd.append('file', file)
        return apiPost<OrganizationBranch>(ORGANIZATION_BRANCH_TABEL_TEMPLATE(id), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      },
    }),
    deleteTabelTemplate: useMutation({
      mutationFn: ({ id }: { id: number }) =>
        apiDelete<OrganizationBranch>(ORGANIZATION_BRANCH_TABEL_TEMPLATE(id)),
    }),
    addLeader: useMutation({
      mutationFn: ({ id, employee_id, role }: { id: number; employee_id: number; role: string }) =>
        apiPost(ORGANIZATION_BRANCH_LEADERS(id), { employee_id, leadership_role: role }),
    }),
    removeLeader: useMutation({
      mutationFn: ({ id, employee_id, role }: { id: number; employee_id: number; role: string }) =>
        apiDelete(
          `${ORGANIZATION_BRANCH_LEADER_DELETE(id, employee_id)}?role=${encodeURIComponent(role)}`,
        ),
    }),
  }
}

/** Fetch a stamp preview PNG as an object URL (or null on failure). */
export async function fetchStampPreview(
  branchId: number,
  coords: Partial<StampCoords>,
): Promise<string | null> {
  try {
    const { data } = await apiClient.post(
      ORGANIZATION_BRANCH_STAMP_PREVIEW(branchId),
      { coords: sanitizeStampCoords(coords) },
      { responseType: 'blob' },
    )
    return URL.createObjectURL(data as Blob)
  } catch {
    return null
  }
}

/**
 * The branch roles the server accepts (`schemas.organization.ALLOWED_LEADERSHIP_ROLES`).
 *
 * ⚠️ Keep this list COMPLETE. Five of them were missing until 2026-09-07 and the
 * consequence was not cosmetic: with no `nurse` entry there was no way to
 * appoint the nurse who is the only user of the daily health check, and with no
 * `transport` / `transport_approver` the fleet had no one to route its requests
 * to. A role absent here is a module nobody can switch on.
 */
export const LEADERSHIP_ROLES = [
  'director',
  'deputy',
  'chancellery',
  'accounting',
  'legal',
  'trip_approver',
  'akt',
  'transport',
  'transport_approver',
  'nurse',
  // Filial KADR'i — /me uni `hr_branch_ids` ga yig'adi va `isBranchHr` shunga
  // tayanadi; backend ro'yxatida bo'lmagani uchun uni tayinlab bo'lmasdi.
  'hr',
  'lms_manager',
  // Telefon ma'lumotnomasi muharriri — shu filial raqamlarini telefon
  // sahifasidan tuzatadi (qatordagi qalamcha serverning `can_edit` iga tayanadi).
  'phone_editor',
] as const
export type LeadershipRole = (typeof LEADERSHIP_ROLES)[number]
