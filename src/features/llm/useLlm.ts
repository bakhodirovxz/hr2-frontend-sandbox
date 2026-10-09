import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import * as roles from '@/auth/roles'
import type { User } from '@/types'

/**
 * AI YORDAMCHI — the chat that can read the HR database through tools.
 *
 * The whole module (18 `/llm/*` routes) existed on the server and v2
 * referenced NONE of it: the assistant was reachable only from v1.
 *
 * ⚠️ NOT FOR EVERYONE. `require_llm_access` (core/security.py:588) opens it to
 * master-admin, branch admin, and the multi-org roles hr / deputy / ministr —
 * an ordinary employee gets 403 on all 18 routes. The product decision behind
 * it: the assistant's tools return unmasked personal data (passport, JSHSHIR),
 * so the audience is the same one already allowed to see it. This mirror is
 * only for hiding the button; the server still refuses.
 */
export function canUseAssistant(user?: User | null): boolean {
  if (String(user?.type) === 'admin' || roles.isSiteMasterAdmin(user) || roles.isMasterAdmin(user)) {
    return true
  }
  return roles.isHR(user) || roles.isDeputy(user) || roles.isMinister(user)
}

const BASE = 'llm'

export interface LlmSession {
  id: number
  name: string
  system_prompt?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface LlmMessage {
  id: number
  session_id: number
  interaction_id: number
  role: 'user' | 'assistant' | 'system' | 'tool' | string
  content?: string | null
  sequence: number
  is_visible?: boolean
}

export function useLlmSessions(enabled: boolean) {
  const q = useQuery({
    queryKey: ['llm', 'sessions'],
    queryFn: () => apiGet<LlmSession[]>(`${BASE}/sessions`),
    enabled,
    retry: false,
  })
  return { sessions: q.data ?? [], loading: q.isLoading }
}

export function useLlmMessages(sessionId: number | null) {
  const q = useQuery({
    queryKey: ['llm', 'messages', sessionId],
    queryFn: () => apiGet<LlmMessage[]>(`${BASE}/sessions/${sessionId}/messages`),
    enabled: sessionId != null,
    retry: false,
  })
  /* Tool calls and system turns are part of the transcript but not of the
     CONVERSATION — the server marks what a human should see. */
  return { messages: (q.data ?? []).filter((m) => m.is_visible !== false), loading: q.isLoading }
}

export function useLlmOps() {
  const qc = useQueryClient()
  const invalidate = () => void qc.invalidateQueries({ queryKey: ['llm', 'sessions'] })
  return {
    invalidate,
    createSession: useMutation({
      mutationFn: (body: { name?: string; system_prompt?: string | null }) =>
        apiPost<LlmSession>(`${BASE}/sessions`, { name: body.name || 'New Chat', ...body }),
      onSuccess: invalidate,
    }),
    renameSession: useMutation({
      mutationFn: ({ id, name }: { id: number; name: string }) =>
        apiPatch<LlmSession>(`${BASE}/sessions/${id}`, { name }),
      onSuccess: invalidate,
    }),
    removeSession: useMutation({
      mutationFn: (id: number) => apiDelete(`${BASE}/sessions/${id}`),
      onSuccess: invalidate,
    }),
  }
}

/** Suhbat transkripti — matn fayl sifatida yuklab olish. */
export async function exportSession(id: number, fmt: 'md' | 'txt' = 'md'): Promise<string> {
  return apiGet<string>(`${BASE}/sessions/${id}/export`, { fmt })
}

/**
 * Javob ichidagi katta ro'yxatning keyingi bo'lagi.
 *
 * Assistent yuzlab qatorli javobni to'liq yubormaydi — birinchi bo'lakni
 * ko'rsatib, qolganini Redis'da qoldiradi va `list_id` beradi.
 */
export interface LargeListChunk {
  /**
   * Rows already rendered as "1. Name — dept, position" strings. The server
   * formats them (`_format_list_row`) precisely so the chat can splice them
   * into the markdown the first page already produced, instead of the client
   * inventing a second, differently-shaped rendering of the same list.
   */
  lines?: string[]
  rows?: Record<string, unknown>[]
  offset?: number
  next_offset?: number
  total?: number
  has_more?: boolean
}

export async function fetchLargeList(listId: string, offset: number, limit = 15) {
  return apiGet<LargeListChunk>(`${BASE}/large-lists/${listId}`, { offset, limit })
}
