import { memo, useState } from 'react'
import Markdown from 'react-markdown'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/api/errorMessage'
import { fetchLargeList } from './useLlm'

/**
 * The answer carries a paged list; the rest of it is parked in Redis.
 *
 * ⚠️ THE BACKEND HAS ALWAYS SENT THIS AND NOTHING EVER READ IT. When a tool
 * returns more rows than fit in an answer, `_load_more_marker` appends
 * `[[LOAD_MORE:<list_id>:<shown>:<total>]]`, and its docstring says outright:
 * "The chat frontend turns it into a 'Yana 15 tasini ko'rsatish' button." v2
 * had no such button and did not strip the marker either, so a long answer was
 * silently cut off with the remainder unreachable — the assistant looked like
 * it simply could not count past fifteen.
 */
const LOAD_MORE_RE = /\[\[LOAD_MORE:([^:\]]+):(\d+):(\d+)\]\]/

/**
 * Also drop a HALF-ARRIVED marker. The answer streams in token by token, so
 * without this the reader watches "[[LOAD_MO" appear and then vanish.
 */
const PARTIAL_MARKER_RE = /\[\[[A-Z_]*:?[^\]]*$/

export const ChatMessageBubble = memo(function ChatMessageBubble({
  role,
  content,
  pending,
}: {
  role: string
  content: string
  /** Javob hali oqib kelmoqda — kursor ko'rsatiladi. */
  pending?: boolean
}) {
  const { t } = useTranslation()
  const mine = role === 'user'

  const match = content.match(LOAD_MORE_RE)
  const listId = match?.[1] ?? null
  const shown = match ? Number(match[2]) : 0
  const total = match ? Number(match[3]) : 0

  /** Chunks the reader has pulled in, already formatted by the server. */
  const [extra, setExtra] = useState<string[]>([])
  const [offset, setOffset] = useState(shown)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)

  let body = content.replace(LOAD_MORE_RE, '')
  if (pending) body = body.replace(PARTIAL_MARKER_RE, '')
  if (extra.length) body = `${body.trimEnd()}\n${extra.join('\n')}`

  const remaining = total - offset
  const canLoadMore = !!listId && !pending && remaining > 0

  async function loadMore() {
    if (!listId) return
    setBusy(true)
    setFailed(null)
    try {
      const chunk = await fetchLargeList(listId, offset)
      setExtra((prev) => [...prev, ...(chunk.lines ?? [])])
      setOffset(chunk.next_offset ?? offset + (chunk.lines?.length ?? 0))
    } catch (err) {
      // The list lives in Redis with a TTL — an expired one 404s, and the
      // server's own sentence ("Ro'yxat muddati tugagan…") is the useful text.
      setFailed(errorMessage(err, t('assistant.loadMoreFailed')))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('flex w-full', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
          mine ? 'bg-brand text-white' : 'bg-surface-2 text-fg',
        )}
      >
        {mine ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <div
            className={cn(
              'break-words',
              '[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5',
              '[&_code]:rounded [&_code]:bg-fg/[0.08] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
              '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-fg/[0.06] [&_pre]:p-2.5',
              '[&_a]:text-brand-strong [&_a]:underline',
              '[&_table]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1',
              '[&_th]:border [&_td]:border [&_th]:border-line [&_td]:border-line [&_th]:text-left',
            )}
          >
            <Markdown>{body}</Markdown>
            {pending && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-fg-muted align-middle" />}
            {canLoadMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={busy}
                className="mt-2 rounded-pill border border-line bg-surface px-3 py-1 text-[12px] font-medium text-brand-strong transition-colors hover:bg-brand-soft disabled:opacity-60"
              >
                {busy ? t('common.loading') : t('assistant.loadMore', { count: remaining })}
              </button>
            )}
            {failed && <p className="mt-2 text-[12px] text-danger">{failed}</p>}
          </div>
        )}
      </div>
    </div>
  )
})
