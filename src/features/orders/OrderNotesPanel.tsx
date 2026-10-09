import { wordDiff } from '@/features/orders/wordDiff'
import { Avatar } from '@/components/ui/Avatar'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { Segmented } from '@/components/ui/Segmented'
import { CenteredSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { errorMessage } from '@/api/errorMessage'
import { inTashkent } from '@/lib/format'
import { useOrderComments, useOrderHistory, useOrderMutations } from './useOrders'

/**
 * THE DECREE'S CONVERSATION AND ITS PAPER TRAIL.
 *
 * A decree travels through several desks, and until now v2 gave those desks no
 * way to say anything to each other — an approver could reject with a comment,
 * but nobody could ask a question without rejecting. The history beside it
 * answers the other recurring question, "who changed this wording?".
 */
export function OrderNotesPanel({ orderId, onDone }: { orderId: number; onDone: (m: string) => void }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<'comments' | 'history'>('comments')
  const [text, setText] = useState('')
  const mut = useOrderMutations()
  const { comments, loading, denied } = useOrderComments(orderId, tab === 'comments')
  const history = useOrderHistory(orderId, tab === 'history')

  const send = async () => {
    const body = text.trim()
    if (!body) return
    try {
      await mut.addComment.mutateAsync({ id: orderId, text: body })
      setText('')
      mut.invalidate()
      onDone(t('orders.commentAdded'))
    } catch (e) {
      onDone(errorMessage(e, t('common.actionFailed')))
    }
  }

  return (
    <Card className="mb-6 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-semibold text-fg">{t('orders.secNotes')}</h3>
        <div className="ml-auto">
          <Segmented
            value={tab}
            onChange={(v) => setTab(v as 'comments' | 'history')}
            options={[
              { value: 'comments', label: t('orders.tabComments') },
              { value: 'history', label: t('orders.tabHistory') },
            ]}
          />
        </div>
      </div>

      {tab === 'comments' ? (
        <>
          <div className="mb-3 flex items-end gap-2">
            <Textarea
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('orders.commentPlaceholder')}
              aria-label={t('orders.commentPlaceholder')}
            />
            <Button
              size="sm"
              leftIcon={<Send size={14} />}
              disabled={!text.trim()}
              loading={mut.addComment.isPending}
              onClick={() => send()}
            >
              {t('orders.commentSend')}
            </Button>
          </div>
          {loading ? (
            <CenteredSpinner />
          ) : denied || comments.length === 0 ? (
            <EmptyState icon={<MessageSquare size={20} />} title={t('orders.commentsEmpty')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {comments.map((c) => (
                <li key={c.id} className="rounded-inner bg-surface-2 px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-fg-subtle">
                    <span className="flex items-center gap-1.5 self-center font-semibold text-fg">
                      <Avatar src={c.employee?.photo_thumb_path} name={c.employee?.legal_name ?? '?'} size={20} />
                      {c.employee?.legal_name ?? '—'}
                    </span>
                    {c.created_at && (
                      <span className="ml-auto tabular-nums">
                        {inTashkent(c.created_at).format('DD.MM.YYYY HH:mm')}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{c.text}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : history.loading ? (
        <CenteredSpinner />
      ) : history.denied || history.rows.length === 0 ? (
        <EmptyState icon={<History size={20} />} title={t('orders.historyEmpty')} />
      ) : (
        <ul className="flex flex-col gap-1.5">
          {history.rows.map((r) => (
            <li key={r.id} className="rounded-inner bg-surface-2 px-3 py-2 text-[12px]">
              <div className="flex flex-wrap items-baseline gap-x-2 text-[11px] text-fg-subtle">
                <span className="font-semibold text-fg">{r.editor?.legal_name ?? '—'}</span>
                {r.field && <span>· {r.field}</span>}
                {r.created_at && (
                  <span className="ml-auto tabular-nums">
                    {inTashkent(r.created_at).format('DD.MM.YYYY HH:mm')}
                  </span>
                )}
              </div>
              {/*
                WORD-LEVEL DIFF. Printing the whole old text struck through above
                the whole new text made a one-word correction look like a full
                rewrite — the reader had to find the change by eye. Only what
                actually moved is marked now, as in v1.
              */}
              {r.old_text || r.new_text ? (
                <>
                  <div className="mt-1 flex items-center gap-3 text-[10.5px] text-fg-subtle">
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-sm bg-danger/40" />
                      {t('orders.diffRemoved')}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-sm bg-success/40" />
                      {t('orders.diffAdded')}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-fg">
                    {wordDiff(r.old_text, r.new_text).map((seg, k) =>
                      seg.kind === 'same' ? (
                        <span key={k}>{seg.text}</span>
                      ) : seg.kind === 'del' ? (
                        <span key={k} className="bg-danger/[0.15] text-danger line-through">{seg.text}</span>
                      ) : (
                        <span key={k} className="bg-success/[0.15] text-success">{seg.text}</span>
                      ),
                    )}
                  </p>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
