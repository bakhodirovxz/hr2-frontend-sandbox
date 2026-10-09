import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/data/ConfirmDialog'
import { errorMessage } from '@/api/errorMessage'
import { cn } from '@/lib/cn'
import { ChatComposer } from './ChatComposer'
import { ChatMessageBubble } from './ChatMessageBubble'
import { streamSessionChat } from './streamChat'
import { exportSession, useLlmMessages, useLlmOps, useLlmSessions, type LlmSession } from './useLlm'

/**
 * AI YORDAMCHI paneli — suhbatlar ro'yxati va oqimli javob.
 *
 * v1 dagi `ChatbotSidebar` ning ma'nosi, v2 chizig'ida. Panel ochilmaguncha
 * hech narsa so'ralmaydi: `enabled` bayrog'i so'rovlarni ham, `react-markdown`
 * chunkini ham kechiktiradi.
 */
export function AssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const toast = useToast()
  const ops = useLlmOps()
  const { sessions, loading } = useLlmSessions(open)
  const [activeId, setActiveId] = useState<number | null>(null)
  const { messages } = useLlmMessages(open ? activeId : null)

  /** Oqib kelayotgan javob — hali serverda saqlanmagan. */
  const [draft, setDraft] = useState('')
  /** Yuborilgan, lekin javobi kelmagan savol. */
  const [pendingAsk, setPendingAsk] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [renaming, setRenaming] = useState<LlmSession | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleting, setDeleting] = useState<LlmSession | null>(null)

  // Ochilganda oxirgi suhbatni tanlaymiz — odam qayerda to'xtaganini qidirmasin.
  useEffect(() => {
    if (!open || activeId != null || sessions.length === 0) return
    setActiveId(sessions[0].id)
  }, [open, activeId, sessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, draft])

  // Panel yopilsa oqimni to'xtatamiz — aks holda javob bo'shlikka yozilardi.
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      setBusy(false)
      setDraft('')
      setPendingAsk(null)
    }
  }, [open])

  const newChat = async () => {
    try {
      const s = await ops.createSession.mutateAsync({ name: t('assistant.newChat') })
      setActiveId(s.id)
    } catch (e) {
      toast.error(errorMessage(e, t('common.actionFailed')))
    }
  }

  const send = async (text: string) => {
    let sid = activeId
    if (sid == null) {
      try {
        const s = await ops.createSession.mutateAsync({ name: text.slice(0, 40) })
        sid = s.id
        setActiveId(s.id)
      } catch (e) {
        toast.error(errorMessage(e, t('common.actionFailed')))
        return
      }
    }
    setPendingAsk(text)
    setDraft('')
    setBusy(true)
    const ac = new AbortController()
    abortRef.current = ac
    await streamSessionChat(sid, text, {
      signal: ac.signal,
      onChunk: (chunk) => setDraft((prev) => prev + chunk),
      onError: (e) => toast.error(errorMessage(e, t('assistant.failed'))),
      onDone: () => {
        /* Serverda saqlangan xabarlarni qayta o'qiymiz: qoralama o'chadi va
           uning o'rniga haqiqiy yozuv keladi (id, tartib raqami bilan). */
        setBusy(false)
        setDraft('')
        setPendingAsk(null)
        ops.invalidate()
        void refetchMessages()
      },
    })
    setBusy(false)
  }

  const refetchMessages = async () => {
    // `useLlmMessages` o'z kalitiga bog'langan; invalidatsiya yetarli.
    ops.invalidate()
  }

  // Escape closes the drawer like every other dialog in the app; without
  // this the backdrop click was the only way out (measured 2026-09-17).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/30"
        role="presentation"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-label={t('assistant.title')}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(46rem,100vw)] flex-col bg-surface shadow-2xl sm:flex-row"
      >
        {/* Suhbatlar */}
        <div className="flex max-h-40 shrink-0 flex-col border-b border-line sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="text-[13px] font-semibold text-fg">{t('assistant.title')}</span>
            <IconButton size="sm" className="ml-auto" label={t('assistant.newChat')} onClick={newChat}>
              <MessageSquarePlus size={15} />
            </IconButton>
          </div>
          <ul className="scroll-thin flex-1 overflow-y-auto p-1.5">
            {loading ? (
              <li className="px-2 py-3 text-[12px] text-fg-subtle">{t('common.loading')}</li>
            ) : sessions.length === 0 ? (
              <li className="px-2 py-3 text-[12px] text-fg-subtle">{t('assistant.noChats')}</li>
            ) : (
              sessions.map((s) => (
                <li key={s.id} className="group/row flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    className={cn(
                      'min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-left text-[12.5px]',
                      activeId === s.id ? 'bg-brand-soft text-fg' : 'text-fg-muted hover:bg-surface-2',
                    )}
                  >
                    {s.name}
                  </button>
                  <span className="flex shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                    <IconButton
                      size="sm"
                      label={t('common.edit')}
                      onClick={() => { setRenameValue(s.name); setRenaming(s) }}
                    >
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton size="sm" label={t('common.delete')} onClick={() => setDeleting(s)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* Suhbat */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">
              {sessions.find((s) => s.id === activeId)?.name ?? t('assistant.title')}
            </span>
            {activeId != null && (
              <IconButton
                size="sm"
                label={t('assistant.download')}
                onClick={async () => {
                  try {
                    const text = await exportSession(activeId)
                    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url
                    a.download = `chat-${activeId}.md`
                    a.click()
                    URL.revokeObjectURL(url)
                  } catch (e) {
                    toast.error(errorMessage(e, t('common.actionFailed')))
                  }
                }}
              >
                <Download size={15} />
              </IconButton>
            )}
            <Button size="sm" variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          </div>

          <div className="scroll-thin flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {messages.length === 0 && !pendingAsk ? (
              <EmptyState title={t('assistant.emptyTitle')} description={t('assistant.emptyHint')} />
            ) : (
              messages.map((m) => (
                <ChatMessageBubble key={m.id} role={m.role} content={m.content ?? ''} />
              ))
            )}
            {pendingAsk && <ChatMessageBubble role="user" content={pendingAsk} />}
            {(draft || busy) && <ChatMessageBubble role="assistant" content={draft} pending={busy} />}
            <div ref={bottomRef} />
          </div>

          <ChatComposer
            onSend={send}
            onStop={() => { abortRef.current?.abort(); setBusy(false) }}
            busy={busy}
          />
        </div>
      </aside>

      <Modal
        open={!!renaming}
        onClose={() => setRenaming(null)}
        title={t('assistant.renameTitle')}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenaming(null)}>{t('common.cancel')}</Button>
            <Button
              disabled={!renameValue.trim()}
              onClick={async () => {
                const s = renaming
                setRenaming(null)
                if (!s) return
                try {
                  await ops.renameSession.mutateAsync({ id: s.id, name: renameValue.trim() })
                } catch (e) {
                  toast.error(errorMessage(e, t('common.actionFailed')))
                }
              }}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const s = deleting
          setDeleting(null)
          if (!s) return
          try {
            await ops.removeSession.mutateAsync(s.id)
            if (activeId === s.id) setActiveId(null)
          } catch (e) {
            toast.error(errorMessage(e, t('common.actionFailed')))
          }
        }}
        danger
        title={t('assistant.deleteTitle')}
        description={deleting?.name ?? ''}
        confirmLabel={t('common.delete')}
      />
    </>
  )
}
