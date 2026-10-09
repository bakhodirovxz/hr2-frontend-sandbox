import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/api/http'
import {
  CARD_COMMENTS,
  CARD_COMMENT_ATTACHMENTS,
  CARD_COMMENT_DETAIL,
} from '@/api/endpoints'
import type { EmployeeBrief } from './useBoard'

export interface CardCommentAttachment {
  id?: number
  comment_id?: number
  original_filename?: string | null
  content_type?: string | null
  /** Ready-to-open presigned URL — the server signs it, the client never builds one. */
  attachment_path?: string | null
}

export interface CardCommentMention {
  id?: number
  employee_id?: number
  employee?: EmployeeBrief | null
}

export interface CardComment {
  id: number
  card_id?: number
  author_id?: number
  text?: string | null
  is_edited?: boolean
  created_at?: string
  updated_at?: string
  author?: EmployeeBrief | null
  mentions?: CardCommentMention[]
  attachments?: CardCommentAttachment[]
}

const key = (cardId: number) => ['cards', cardId, 'comments'] as const

/**
 * Comments of ONE card.
 *
 * They are deliberately NOT part of the card payload: a busy card accumulates
 * far more comment text than the board ever needs, and the board fetches every
 * card at once. Keeping them behind their own request means opening a task
 * costs one small call instead of making every board load carry the whole
 * discussion of every card.
 */
export function useCardComments(cardId: number | null | undefined, enabled = true) {
  const q = useQuery({
    queryKey: key(cardId ?? 0),
    queryFn: () => apiGet<CardComment[]>(CARD_COMMENTS(cardId as number)),
    enabled: !!cardId && enabled,
  })
  return { comments: q.data ?? [], loading: q.isLoading, error: q.error }
}

export function useCardCommentMutations(cardId: number | null | undefined) {
  const qc = useQueryClient()
  const invalidate = () => {
    if (cardId) void qc.invalidateQueries({ queryKey: key(cardId) })
  }

  return {
    invalidate,

    /**
     * `mention_ids` carries the employees named with an @-token in the text.
     * The server notifies exactly those people, so the list must be derived
     * from what SURVIVED in the final text — a name typed and then deleted
     * would otherwise still ping that person.
     */
    add: useMutation({
      mutationFn: ({ text, mentionIds }: { text: string; mentionIds: number[] }) =>
        apiPost<CardComment>(CARD_COMMENTS(cardId as number), {
          text,
          mention_ids: mentionIds,
        }),
      onSuccess: invalidate,
    }),

    edit: useMutation({
      mutationFn: ({ commentId, text, mentionIds }: { commentId: number; text: string; mentionIds: number[] }) =>
        apiPatch<CardComment>(CARD_COMMENT_DETAIL(commentId), {
          text,
          mention_ids: mentionIds,
        }),
      onSuccess: invalidate,
    }),

    remove: useMutation({
      mutationFn: (commentId: number) => apiDelete(CARD_COMMENT_DETAIL(commentId)),
      onSuccess: invalidate,
    }),

    /**
     * Attachments ride on their own multipart request AFTER the comment exists,
     * because the comment id is part of the upload URL. A failed upload
     * therefore leaves the comment itself intact — the caller surfaces the
     * failure rather than losing the text the user just wrote.
     */
    attach: useMutation({
      mutationFn: async ({ commentId, files }: { commentId: number; files: File[] }) => {
        const fd = new FormData()
        files.forEach((f) => fd.append('files', f))
        const { data } = await apiClient.post(CARD_COMMENT_ATTACHMENTS(commentId), fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        return data
      },
      onSuccess: invalidate,
    }),
  }
}

/**
 * Employees whose "@Full Name" token still appears in the text.
 *
 * Mirrors the web's CommentPanel: mention ids are recomputed from the FINAL
 * text on every submit, so removing a name from the draft also removes the
 * notification, and re-typing it restores one.
 */
export function mentionIdsInText(text: string, members: EmployeeBrief[]): number[] {
  return members
    .filter((m) => !!m.legal_name && text.includes(`@${m.legal_name}`))
    .map((m) => m.id)
}
