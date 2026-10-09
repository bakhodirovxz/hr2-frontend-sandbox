import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Paperclip, Pencil, Send, Trash2, X } from 'lucide-react'
import dayjs from 'dayjs'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/data/useConfirm'
import { errorMessage } from '@/api/errorMessage'
import { useAuthStore } from '@/store/authStore'
import { Avatar } from '@/components/ui/Avatar'
import type { EmployeeBrief } from './useBoard'
import {
  useCardComments,
  useCardCommentMutations,
  mentionIdsInText,
  type CardComment,
} from './useCardComments'

/**
 * Highlight the "@Full Name" tokens that match a real mentioned member.
 *
 * The server stores the mention as a RELATION, not as markup, so the text
 * itself is plain. Rendering therefore matches names against the returned
 * `mentions` rather than against anything embedded in the string — a stray
 * "@someone" that was never resolved stays ordinary text instead of pretending
 * to be a notification that went out.
 */
function renderText(text: string, mentions: CardComment['mentions']) {
  const names = (mentions ?? [])
    .map((m) => (m.employee?.legal_name ?? '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
  if (!names.length) return text

  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const parts: (string | JSX.Element)[] = []
  const re = new RegExp(`@(${escaped.join('|')})`, 'g')
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(<span key={m.index} className="font-medium text-accent">{m[0]}</span>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

export function CardComments({ cardId, members }: { cardId: number; members: EmployeeBrief[] }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const toast = useToast()
  const myEmployeeId = useAuthStore((st) => st.user?.employee?.id)
  const { comments, loading } = useCardComments(cardId)
  const { add, edit, remove, attach } = useCardCommentMutations(cardId)

  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  // Caret position of an in-progress "@" token, or null when not mentioning.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const suggestions = useMemo(() => {
    if (mentionQuery == null) return []
    const q = mentionQuery.toLowerCase()
    return members
      .filter((m) => (m.legal_name ?? '').toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionQuery, members])

  const onChange = (value: string, caret: number) => {
    setText(value)
    // Only the token immediately before the caret counts, so an @ typed earlier
    // in the message does not reopen the picker while typing later words.
    const upto = value.slice(0, caret)
    const m = upto.match(/@([\p{L}\s]*)$/u)
    setMentionQuery(m ? m[1] : null)
  }

  const applyMention = (emp: EmployeeBrief) => {
    const caret = textRef.current?.selectionStart ?? text.length
    const upto = text.slice(0, caret).replace(/@([\p{L}\s]*)$/u, `@${emp.legal_name} `)
    setText(upto + text.slice(caret))
    setMentionQuery(null)
    textRef.current?.focus()
  }

  const submit = async () => {
    const body = text.trim()
    if (!body) return
    try {
      const created = await add.mutateAsync({ text: body, mentionIds: mentionIdsInText(body, members) })
      setText('')
      setMentionQuery(null)
      if (files.length && created?.id) {
        try {
          await attach.mutateAsync({ commentId: created.id, files })
        } catch {
          // The comment itself is saved; only the upload failed. Say so plainly
          // instead of implying the whole comment was lost.
          toast.error(t('projects.commentAttachFailed'))
        }
      }
      setFiles([])
    } catch (e) {
      toast.error(errorMessage(e, t('projects.commentError')))
    }
  }

  const saveEdit = async (c: CardComment) => {
    const body = editText.trim()
    if (!body) return
    try {
      await edit.mutateAsync({ commentId: c.id, text: body, mentionIds: mentionIdsInText(body, members) })
      setEditingId(null)
      toast.ok(t('projects.commentSaved'))
    } catch (e) {
      toast.error(errorMessage(e, t('projects.commentError')))
    }
  }

  const doDelete = async (c: CardComment) => {
    if (!(await confirm({ kind: 'delete', description: t('projects.commentDeleteConfirm') }))) return
    try {
      await remove.mutateAsync(c.id)
      toast.ok(t('projects.commentDeleted'))
    } catch (e) {
      toast.error(errorMessage(e, t('projects.commentError')))
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <h4 className="mb-2 text-sm font-semibold text-secondary">{t('projects.comments')}</h4>

      {loading ? (
        <p className="text-xs text-muted">{t('common.loading')}</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-muted">{t('projects.commentsEmpty')}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2">
              <Avatar src={c.author?.photo_thumb_path ?? c.author?.photo_path ?? null} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-secondary">
                    {c.author?.legal_name ?? `#${c.author_id ?? ''}`}
                  </span>
                  {!!c.created_at && (
                    <span className="text-[11px] text-muted">
                      {dayjs(c.created_at).format('DD.MM.YYYY HH:mm')}
                    </span>
                  )}
                  {c.is_edited && <span className="text-[11px] text-muted">({t('projects.commentEdited')})</span>}
                  {/* Only the author edits or deletes — the server enforces the
                      same rule, so the buttons simply mirror it. */}
                  {c.author_id === myEmployeeId && editingId !== c.id && (
                    <span className="ml-auto flex gap-1">
                      <button
                        type="button"
                        aria-label={t('projects.commentEdit')}
                        onClick={() => { setEditingId(c.id); setEditText(c.text ?? '') }}
                      >
                        <Pencil size={12} className="text-muted" />
                      </button>
                      <button
                        type="button"
                        aria-label={t('projects.commentDelete')}
                        onClick={() => doDelete(c)}
                      >
                        <Trash2 size={12} className="text-danger" />
                      </button>
                    </span>
                  )}
                </div>

                {editingId === c.id ? (
                  <div className="mt-1 flex items-start gap-2">
                    <textarea
                      className="min-h-[52px] flex-1 rounded-md border border-line bg-surface px-2 py-1 text-sm"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                    />
                    <Button size="sm" onClick={() => saveEdit(c)}>{t('common.save')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X size={14} />
                    </Button>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words text-sm text-fg">
                    {renderText(c.text ?? '', c.mentions)}
                  </p>
                )}

                {(c.attachments ?? []).length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {(c.attachments ?? []).map((a) => (
                      <li key={a.id}>
                        <a
                          href={a.attachment_path ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-accent underline"
                        >
                          {a.original_filename ?? '—'}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <textarea
          ref={textRef}
          className="min-h-[60px] w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm"
          placeholder={t('projects.commentPlaceholder')}
          value={text}
          onChange={(e) => onChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-64 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
            {suggestions.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="w-full px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                  onClick={() => applyMention(m)}
                >
                  {m.legal_name}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-2 flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              setFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Paperclip size={14} />}
            onClick={() => fileRef.current?.click()}
          >
            {t('projects.commentAttach')}
            {files.length > 0 && ` (${files.length})`}
          </Button>
          <span className="flex-1" />
          <Button
            size="sm"
            leftIcon={<Send size={14} />}
            disabled={!text.trim() || add.isPending}
            onClick={submit}
          >
            {t('projects.commentSend')}
          </Button>
        </div>
      </div>
    </div>
  )
}
