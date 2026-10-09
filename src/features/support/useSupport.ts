import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDebounce } from '@/hooks/useDebounce'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import { apiClient } from '@/api/client'
import {
  SUPPORT_TICKET_PARTICIPANT,
  SUPPORT_TICKET_PARTICIPANTS,
  SUPPORT_TICKET_RATINGS,
} from '@/api/endpoints'
import { useBranchStore } from '@/store/branchStore'

const SUPPORT = 'support-tickets'

/** An employee pulled into a ticket on top of its author and assignee. */
export interface TicketParticipant {
  id?: number
  employee_id?: number
  employee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  added_by_id?: number | null
}

/** One file attached when the ticket was opened. */
export interface TicketAttachment {
  id?: number
  original_filename?: string | null
  content_type?: string | null
  file_url?: string | null
}

export interface Ticket {
  id: number
  uge_number?: string | null
  room_number?: string | null
  priority?: string | null
  description?: string | null
  status?: string | null
  rating?: number | null
  created_at?: string | null
  /** Kim yaratgan — o'z murojaatingizni «qabul qilib» bo'lmasligi uchun. */
  created_by_id?: number | null
  assignee_id?: number | null
  creator?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  assignee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  taken_at?: string | null
  done_at?: string | null
  rated_at?: string | null
  rating_note?: string | null
  /** The requester's internal phone — the first thing an AKT operator dials. */
  creator_internal_number?: string | null
  /** Unread messages in the thread for THIS reader (drives the dot in the list). */
  unread_count?: number | null
  participants?: TicketParticipant[]
  attachments?: TicketAttachment[] | null
}

/**
 * The inbox list, filtered, searched, sorted and paged by the SERVER
 * (2026-09-25). It used to download the whole queue and do all four in the
 * browser; folders now come from `useTicketSummary`, and the list grows by
 * pages of 30 as it is scrolled.
 */
export function useTickets(args: { mine: boolean; status?: string; search?: string; sort?: 'recent' | 'priority'; enabled?: boolean }) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = useDebounce((args.search ?? '').trim(), 300)
  const q = useInfiniteQuery({
    enabled: args.enabled ?? true,
    queryKey: ['support', { mine: args.mine, status: args.status ?? '', term, sort: args.sort ?? 'recent', branchId }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      apiGet<{ items: Ticket[]; page: number; pages: number; total: number }>(SUPPORT, {
        mine: args.mine || undefined,
        status: args.status || undefined,
        search: term || undefined,
        sort: args.sort ?? 'recent',
        page: pageParam,
        size: 30,
      }),
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  })
  return {
    list: q.data?.pages.flatMap((p) => p.items ?? []) ?? [],
    total: q.data?.pages[0]?.total ?? 0,
    loading: q.isLoading,
    hasMore: !!q.hasNextPage,
    loadingMore: q.isFetchingNextPage,
    loadMore: () => {
      if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage()
    },
  }
}

/** Folder counts `{all, new, taken, done, unread}` — `/support-tickets/summary`. */
export function useTicketSummary(args: { mine: boolean; search?: string; enabled?: boolean }) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const term = useDebounce((args.search ?? '').trim(), 300)
  const q = useQuery({
    enabled: args.enabled ?? true,
    queryKey: ['support', 'summary', { mine: args.mine, term, branchId }],
    queryFn: () => apiGet<{ all: number; new: number; taken: number; done: number; unread: number; can_create?: boolean }>(`${SUPPORT}/summary`, {
      mine: args.mine || undefined,
      search: term || undefined,
    }),
    placeholderData: (prev) => prev,
  })
  // `can_create` is undefined on a server that predates it — treat as allowed.
  return q.data ?? { all: 0, new: 0, taken: 0, done: 0, unread: 0, can_create: undefined as boolean | undefined }
}

/** One ticket by id — the open pane when it is not among the loaded rows. */
export function useTicketById(id: number | null, enabled = true) {
  const q = useQuery({
    enabled: enabled && id != null,
    queryKey: ['support', 'one', id],
    queryFn: () => apiGet<Ticket>(`${SUPPORT}/${id}`),
  })
  return q.data ?? null
}

/** One message inside a ticket's conversation. */
interface TicketMessage {
  id: number
  ticket_id?: number | null
  author_id?: number | null
  author?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  body?: string | null
  /** A note the system wrote itself ("X was added"), shown centred and muted. */
  is_system?: boolean
  created_at?: string | null
}

export function useTicketMessages(id: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['support-messages', id],
    queryFn: () => apiGet<TicketMessage[]>(`${SUPPORT}/${id}/messages`),
    enabled: enabled && !!id,
    // The thread is a conversation: poll it while the ticket is open rather
    // than making people reload to see an answer.
    refetchInterval: 20_000,
    retry: false,
  })
  return { messages: q.data ?? [], loading: q.isLoading, denied: q.isError }
}

/**
 * The ticket on its own, used for the participant strip.
 *
 * There is no `GET .../participants` route: the server ships the list inside
 * `SupportTicketRead`, and the copy that came with the LIST goes stale the
 * moment somebody is invited. Reading the single ticket keeps the chips in
 * step with what add/remove actually did, and costs one small request per
 * opened thread.
 */
export function useTicketDetail(id: number | null, enabled = true) {
  const q = useQuery({
    queryKey: ['support-ticket', id],
    queryFn: () => apiGet<Ticket>(`${SUPPORT}/${id}`),
    enabled: enabled && !!id,
    retry: false,
  })
  return { ticket: q.data ?? null, loading: q.isLoading }
}

/**
 * The month's AKT leaderboard: how many tickets each specialist closed and what
 * the reporters thought of the work.
 *
 * Access is the SERVER's call — it narrows to the branches the caller is AKT or
 * HR for and answers 404 when there are none — so the caller renders whatever
 * comes back instead of re-deriving the rule from roles.
 */
export interface TicketRatingRow {
  assignee_id: number
  assignee?: { id?: number; legal_name?: string | null; photo_thumb_path?: string | null } | null
  completed_count: number
  rated_count: number
  avg_rating?: number | null
}

export function useTicketRatings(month: string, enabled = true) {
  const branchId = useBranchStore((s) => s.selectedBranchId)
  const q = useQuery({
    queryKey: ['support-ratings', month, branchId],
    queryFn: () => apiGet<TicketRatingRow[]>(SUPPORT_TICKET_RATINGS, { month: month || undefined }),
    enabled,
    retry: false,
  })
  return {
    rows: q.data ?? [],
    loading: q.isLoading,
    denied: q.isError,
    error: q.error,
    refetch: q.refetch,
  }
}

export function useSupportMutations() {
  const qc = useQueryClient()
  /**
   * ⚠️ The thread lives under its OWN key (`['support-messages', id]`), which
   * `['support']` does NOT prefix-match: after pressing Send the box cleared
   * and the message appeared only when the 20-second poll came round, so it
   * looked lost (measured 2026-09-22). Both keys are refreshed here.
   */
  const invalidate = () =>
    // ⚠️ This module keeps FOUR separate roots — `support`, `support-ticket`,
    // `support-messages`, `support-ratings` — and react-query matches a
    // queryKey element for element, so `['support']` reaches none of the other
    // three. Sending a message left the thread unchanged until the 20-second
    // poll (it looked lost), and a rating left the ratings tab on its old
    // numbers. One predicate covers every root of this feature.
    qc.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === 'string' && (q.queryKey[0] as string).startsWith('support'),
    })
  return {
    invalidate,
    /**
     * Opening a ticket, with the screenshots that explain it.
     *
     * The endpoint has always taken `files: List[UploadFile]` and returned the
     * saved `attachments`; v2 sent the text fields alone, so a fault report
     * could never carry a picture — and the pictures already on older tickets
     * were invisible too. The field name is `files` (plural, repeated), which
     * is what FastAPI's `List[UploadFile]` expects.
     */
    create: useMutation({
      mutationFn: ({ fields, files }: { fields: Record<string, string>; files?: File[] }) => {
        const fd = new FormData()
        for (const [k, v] of Object.entries(fields)) fd.append(k, v)
        for (const f of files ?? []) fd.append('files', f, f.name)
        return apiClient.post(SUPPORT, fd).then((r) => r.data)
      },
    }),
    take: useMutation({ mutationFn: (id: number) => apiPost(`${SUPPORT}/${id}/take`, {}) }),
    sendMessage: useMutation({
      mutationFn: ({ id, body }: { id: number; body: string }) =>
        apiPost(`${SUPPORT}/${id}/messages`, { body }),
    }),
    /** Zeroes the unread counter once the thread has actually been opened. */
    // The list row's bold state and the unread pill come from the list and
    // summary queries, which do not poll — without this an opened ticket
    // stayed "unread" until the next unrelated action or a reload.
    markRead: useMutation({
      mutationFn: (id: number) => apiPost(`${SUPPORT}/${id}/read`, {}),
      // Only the `support` root (list + summary): the open thread is fine.
      onSuccess: () => qc.invalidateQueries({ queryKey: ['support'] }),
    }),
    done: useMutation({ mutationFn: (id: number) => apiPost(`${SUPPORT}/${id}/done`, {}) }),
    /** Murojaatni tahrirlash — v2 da umuman yo'q edi, ya'ni xato yozilgan
     *  UGE raqami yoki noto'g'ri muhimlik abadiy qolardi. */
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
        apiPatch(`${SUPPORT}/${id}`, body),
    }),
    reopen: useMutation({ mutationFn: (id: number) => apiPost(`${SUPPORT}/${id}/reopen`, {}) }),
    /** ⚠️ IZOH bilan. `SupportTicketRate.note` sxemada bor va o'qiladi
     *  (`rating_note`), v2 esa faqat yulduzni yuborardi — AKT reytingi
     *  sifat tomonini butunlay yo'qotardi. */
    rate: useMutation({
      mutationFn: ({ id, rating, note }: { id: number; rating: number; note?: string }) =>
        apiPost(`${SUPPORT}/${id}/rate`, { rating, note: note || null }),
    }),
    /**
     * Pulls a third employee into the thread — the specialist who actually owns
     * the faulty printer, say. Both calls return the WHOLE ticket, so the
     * participant strip is refreshed from the server's answer rather than
     * patched locally.
     */
    addParticipant: useMutation({
      mutationFn: ({ id, employeeId }: { id: number; employeeId: number }) =>
        apiPost<Ticket>(SUPPORT_TICKET_PARTICIPANTS(id), { employee_id: employeeId }),
      onSuccess: (ticket, vars) => {
        qc.setQueryData(['support-ticket', vars.id], ticket)
        invalidate()
      },
    }),
    removeParticipant: useMutation({
      mutationFn: ({ id, employeeId }: { id: number; employeeId: number }) =>
        apiDelete<Ticket>(SUPPORT_TICKET_PARTICIPANT(id, employeeId)),
      onSuccess: (ticket, vars) => {
        qc.setQueryData(['support-ticket', vars.id], ticket)
        invalidate()
      },
    }),
    /**
     * Deleting a ticket is MASTER-ADMIN only (the server enforces it) — it takes
     * the attachments and notifications with it, which is why an ordinary
     * requester closes a ticket instead of removing it.
     */
    remove: useMutation({ mutationFn: (id: number) => apiDelete(`${SUPPORT}/${id}`), onSuccess: invalidate }),
  }
}

export function ticketStatusKey(status?: string | null): 'new' | 'taken' | 'done' | 'rated' {
  const s = (status || '').toLowerCase()
  // ⚠️ `rated` — the requester has confirmed the work — fell through to the
  // default and a CLOSED ticket was drawn as «Yangi» (info tone), with the
  // «Qabul qilish» button on it for an AKT operator, where take answers 400
  // «Murojaat allaqachon qabul qilingan». v1 shows it as «Bajarildi» + star.
  if (s === 'rated') return 'rated'
  if (['done', 'bajarilgan', 'completed'].includes(s)) return 'done'
  if (['taken', 'in_progress', 'jarayonda'].includes(s)) return 'taken'
  return 'new'
}
