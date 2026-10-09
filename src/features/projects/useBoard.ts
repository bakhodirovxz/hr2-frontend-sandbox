import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { CARDS_LIST, COLUMNS_LIST, WORKSPACES_LIST } from '@/api/endpoints'
import { apiClient } from '@/api/client'
import { useBranchStore } from '@/store/branchStore'
import { toItems, type ListResponse } from '@/types'

interface Workspace {
  id: number
  name?: string | null
  description?: string | null
  /** The project's owner — the one employee the server lets restructure it. */
  created_by_id?: number | null
}
export interface EmployeeBrief {
  id: number
  legal_name?: string | null
  photo_thumb_path?: string | null
  photo_path?: string | null
}
export interface Label {
  id: number
  name?: string | null
  color?: string | null
  workspace_id?: number | null
}
export interface CardMember {
  id: number
  member_id?: number | null
  member?: EmployeeBrief | null
}
export interface CardAttachment {
  id: number
  original_filename?: string | null
  content_type?: string | null
  attachment_path?: string | null
}
/** One step inside a task — shown as «2/5» on the row and ticked in the panel. */
export interface ChecklistItem {
  id: number
  card_id?: number | null
  title?: string | null
  is_done?: boolean | null
  position?: number | null
}
/** 1 urgent · 2 high · 3 normal · 4 low; null = not set (backend `cards.priority`). */
export type Priority = 1 | 2 | 3 | 4
export interface Card {
  id: number
  title?: string | null
  description?: string | null
  start_date?: string | null
  end_date?: string | null
  column_id?: number | null
  position?: number | null
  priority?: Priority | null
  is_completed?: boolean | null
  completed_at?: string | null
  rejected_at?: string | null
  created_by_id?: number | null
  /** The API nests the label one level down: `{ label: {...} }`. */
  labels?: { label?: Label | null }[] | null
  members?: CardMember[] | null
  attachments?: CardAttachment[] | null
  checklist?: ChecklistItem[] | null
  created_by?: EmployeeBrief | null
}
export interface Column {
  id: number
  name?: string | null
  workspace_id?: number | null
  color?: string | null
  cards?: Card[] | null
}

/** The user's projects (workspaces they belong to). */
export function useWorkspaces() {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['workspaces', 'mine', branchId],
    queryFn: () => apiGet<ListResponse<Workspace>>(WORKSPACES_LIST, { only_member: true }),
  })
  return { workspaces: toItems(q.data), loading: q.isLoading }
}

/**
 * One project with its members and labels — the two lists every picker on the
 * board needs. `/workspaces` (the list route) carries neither in full, so the
 * detail route is fetched once per project rather than per card.
 */
export function useWorkspaceDetail(workspaceId: number | null) {
  const q = useQuery({
    enabled: !!workspaceId,
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiGet<{ members?: { member?: EmployeeBrief | null }[]; labels?: Label[] }>(`${WORKSPACES_LIST}/${workspaceId}`),
  })
  const members = (q.data?.members ?? []).map((m) => m.member).filter((m): m is EmployeeBrief => !!m)
  return { members, labels: q.data?.labels ?? [], loading: q.isLoading }
}

/**
 * A board = its columns plus its cards, fetched as two requests.
 *
 * ⚠️ `GET /columns` returns `ColumnRead`, which has NO `cards` field — reading
 * `column.cards` gave an empty board no matter how many tasks existed. Cards
 * come from `GET /cards?workspace_id=`, the only route that also carries
 * labels, assignees and attachments (`CardReadFull`).
 */
export function useBoard(workspaceId: number | null) {
  const cols = useQuery({
    queryKey: ['board', 'columns', workspaceId],
    queryFn: () => apiGet<Column[]>(COLUMNS_LIST, { workspace_id: workspaceId! }),
    enabled: !!workspaceId,
  })
  const cards = useQuery({
    queryKey: ['board', 'cards', workspaceId],
    queryFn: () => apiGet<Card[]>(CARDS_LIST, { workspace_id: workspaceId! }),
    enabled: !!workspaceId,
  })
  const columns = toItems(cols.data).map((c) => ({
    ...c,
    cards: toItems(cards.data).filter((k) => k.column_id === c.id),
  }))
  return { columns, loading: cols.isLoading || cards.isLoading }
}

/**
 * Projects themselves. Any EMPLOYEE may create one — the server asks for
 * nothing else (`WorkspaceService._validate_user`) — and v2 simply had no UI
 * for it, so a person could be shown a board they could never start.
 */
export function useWorkspaceMutations() {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['workspaces'] })
    qc.invalidateQueries({ queryKey: ['workspace'] })
  }
  return {
    invalidate,
    create: useMutation({
      // `description` is REQUIRED by the schema (a plain `str`), so an empty
      // one still has to be sent as "".
      mutationFn: (body: { name: string; description?: string }) =>
        apiPost<Workspace>(WORKSPACES_LIST, { name: body.name, description: body.description ?? '' }),
    }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch<Workspace>(`${WORKSPACES_LIST}/${id}`, body),
    }),
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${WORKSPACES_LIST}/${id}`) }),
    addMember: useMutation({
      mutationFn: ({ id, memberId }: { id: number; memberId: number }) =>
        apiPost(`${WORKSPACES_LIST}/${id}/members/${memberId}`, {}),
    }),
    removeMember: useMutation({
      mutationFn: ({ id, memberId }: { id: number; memberId: number }) =>
        apiDelete(`${WORKSPACES_LIST}/${id}/members/${memberId}`),
    }),
  }
}

export function useBoardMutations(workspaceId: number | null) {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['board'] })
  return {
    invalidate,
    createColumn: useMutation({
      mutationFn: (name: string) => apiPost(COLUMNS_LIST, { name, workspace_id: workspaceId }),
    }),
    /**
     * A column could be created but never renamed or removed, so one typo stood
     * on the board for good. The backend has had PATCH/DELETE all along.
     */
    /** Nom VA rang — doska `col.color` ni allaqachon chizadi, lekin v2 da
     *  hech narsa uni qo'ya olmasdi. */
    renameColumn: useMutation({
      mutationFn: ({ id, name, color }: { id: number; name: string; color?: string | null }) =>
        apiPatch(`${COLUMNS_LIST}/${id}`, { name, ...(color === undefined ? {} : { color }) }),
    }),
    removeColumn: useMutation({ mutationFn: (id: number) => apiDelete(`${COLUMNS_LIST}/${id}`) }),
    createCard: useMutation({ mutationFn: (body: Record<string, unknown>) => apiPost(CARDS_LIST, body) }),
    updateCard: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${CARDS_LIST}/${id}`, body),
    }),
    /** `position` — FLOAT: ikki qo'shni orasidagi o'rtacha qiymat qo'yiladi,
     *  ya'ni qayta tartiblash uchun bitta PATCH yetarli. Berilmasa ustun
     *  o'zgaradi, tartib esa serverdagicha qoladi (eski xatti-harakat). */
    moveCard: useMutation({
      mutationFn: ({ id, columnId, position }: { id: number; columnId: number; position?: number }) =>
        apiPatch(`${CARDS_LIST}/${id}`, {
          column_id: columnId,
          ...(position == null ? {} : { position }),
        }),
    }),
    completeCard: useMutation({
      mutationFn: ({ id, done }: { id: number; done: boolean }) =>
        apiPost(`${CARDS_LIST}/${id}/${done ? 'complete' : 'uncomplete'}`, {}),
    }),
    /**
     * A card sent back rather than finished. The endpoint has always existed;
     * the board only ever offered "done", so a rejected task had nowhere to go.
     */
    rejectCard: useMutation({ mutationFn: (id: number) => apiPost(`${CARDS_LIST}/${id}/reject`, {}) }),
    /** Assignees. `member_id` is an EMPLOYEE id, not a user id. */
    addMember: useMutation({
      mutationFn: ({ cardId, memberId }: { cardId: number; memberId: number }) =>
        apiPost(`${CARDS_LIST}/${cardId}/members/${memberId}`, {}),
    }),
    removeMember: useMutation({
      mutationFn: ({ cardId, memberId }: { cardId: number; memberId: number }) =>
        apiDelete(`${CARDS_LIST}/${cardId}/members/${memberId}`),
    }),
    addLabel: useMutation({
      mutationFn: ({ cardId, labelId }: { cardId: number; labelId: number }) =>
        apiPost(`${CARDS_LIST}/${cardId}/labels/${labelId}`, {}),
    }),
    removeLabel: useMutation({
      mutationFn: ({ cardId, labelId }: { cardId: number; labelId: number }) =>
        apiDelete(`${CARDS_LIST}/${cardId}/labels/${labelId}`),
    }),
    createLabel: useMutation({
      mutationFn: (body: { name: string; color: string }) =>
        apiPost<Label>('labels', { ...body, workspace_id: workspaceId }),
    }),
    /** Multipart — the field name `attachment_file` is what the route declares. */
    addAttachment: useMutation({
      mutationFn: ({ cardId, file }: { cardId: number; file: File }) => {
        const fd = new FormData()
        fd.append('attachment_file', file)
        return apiClient.post(`${CARDS_LIST}/${cardId}/attachments`, fd).then((r) => r.data)
      },
    }),
    removeAttachment: useMutation({ mutationFn: (id: number) => apiDelete(`${CARDS_LIST}/attachments/${id}`) }),
    /** Priority is card CONTENT on the server (owner-only), like the title. */
    setPriority: useMutation({
      mutationFn: ({ id, priority }: { id: number; priority: Priority | null }) =>
        apiPatch(`${CARDS_LIST}/${id}`, { priority }),
    }),
    /** Checklist steps follow the ASSIGNEE rule (creator or a card member). */
    addChecklistItem: useMutation({
      mutationFn: ({ cardId, title }: { cardId: number; title: string }) =>
        apiPost<ChecklistItem>(`${CARDS_LIST}/${cardId}/checklist`, { title }),
    }),
    updateChecklistItem: useMutation({
      mutationFn: ({ id, body }: { id: number; body: { title?: string; is_done?: boolean; position?: number } }) =>
        apiPatch<ChecklistItem>(`${CARDS_LIST}/checklist/${id}`, body),
    }),
    removeChecklistItem: useMutation({ mutationFn: (id: number) => apiDelete(`${CARDS_LIST}/checklist/${id}`) }),
    deleteCard: useMutation({ mutationFn: (id: number) => apiDelete(`${CARDS_LIST}/${id}`) }),
  }
}
